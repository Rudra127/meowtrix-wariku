// @file backend/services/brokerage-service.js
// One service, any brokerage. Driven entirely through the uniform client interface that lib/kite.js
// and lib/upstox.js both implement, so adding a broker means writing a client — not touching this.
//
// Scope: read-only. Nothing here places orders, and holdings are never copied into the user's own
// ledger — they exist only to answer questions in the Ask AI tab.
//
// Connect flow (see the client for the protocol):
//   app → GET  /integrations/:provider/login-url   → signed `state` embedded in the broker login URL
//   browser → broker login → broker redirects to
//         GET  /integrations/:provider/callback?…&state=…   (no Clerk session here!)
//   backend verifies `state`, exchanges the code/token, stores it encrypted, then 302s back into the
//   app via the `wariku://broker-callback` deep link so the UI can refresh.
import { config } from "../config/index.js";
import { decryptSecret, encryptSecret, signState, verifyState } from "../lib/crypto.js";
import IntegrationRepository from "../database/repository/integration-repository.js";
import { BadRequestError, ReauthRequiredError, ServiceUnavailableError } from "../utils/index.js";

/** Holdings move with the market but not second-to-second; a chat turn can ask several questions. */
const CACHE_TTL_MS = { holdings: 5 * 60 * 1000, positions: 60 * 1000 };
/** The signed state in the login URL is single-use and short-lived. */
const STATE_TTL_SECONDS = 600;

export default class BrokerageService {
  /**
   * @param {object} client  A lib/<broker>.js module implementing the uniform interface.
   * @param {{ repository?: IntegrationRepository }} [deps]
   */
  constructor(client, { repository = new IntegrationRepository() } = {}) {
    this.client = client;
    this.provider = client.provider;
    this.label = client.label;
    this.repository = repository;
  }

  isConfigured() {
    return this.client.isConfigured();
  }

  // ---- Status ------------------------------------------------------------------------------

  /** Public, token-free shape for the Profile screen. Never leaks ciphertext. */
  async getStatus(user) {
    const configured = this.client.isConfigured();
    const integration = await this.repository.find(user._id, this.provider);

    if (!integration || integration.status === "disconnected") {
      return this.#status({ configured, connected: false, status: integration?.status ?? "disconnected" });
    }
    const expired = this.#isExpired(integration);
    return this.#status({
      configured,
      // "Connected" means we hold a usable token. An expired token is linked-but-unusable, shown as
      // "Reconnect" rather than "Connect".
      connected: !expired,
      status: expired ? "expired" : integration.status,
      needsReauth: expired,
      brokerUserId: integration.externalUserId,
      brokerUserName: integration.externalUserName,
      connectedAt: integration.connectedAt,
      expiresAt: integration.expiresAt,
      lastError: integration.lastError || "",
    });
  }

  #status({
    configured,
    connected,
    status,
    needsReauth = false,
    brokerUserId = "",
    brokerUserName = "",
    connectedAt = null,
    expiresAt = null,
    lastError = "",
  }) {
    return {
      provider: this.provider,
      label: this.label,
      configured,
      connected,
      status,
      needsReauth,
      brokerUserId,
      brokerUserName,
      connectedAt,
      expiresAt,
      lastError,
    };
  }

  // ---- Connect -----------------------------------------------------------------------------

  /** Builds the broker login URL carrying a signed `state` that identifies this user on the way back. */
  async getLoginUrl(user) {
    this.#requireConfigured();
    const state = signState({ uid: user._id.toString(), p: this.provider }, STATE_TTL_SECONDS);
    return {
      url: this.client.buildLoginUrl({ state }),
      expiresInSeconds: STATE_TTL_SECONDS,
      redirectUrl: config[this.provider]?.redirectUrl,
    };
  }

  /**
   * Handles the broker's browser redirect. Runs WITHOUT a Clerk session — the signed `state` is the
   * only thing proving which user this belongs to, which is why it's HMAC'd and time-limited.
   *
   * @returns {Promise<{ ok: boolean, redirect: string, message: string }>} always a redirect target.
   */
  async handleCallback(query = {}) {
    const payload = verifyState(query.state);
    if (!payload?.uid || payload.p !== this.provider) {
      // Forged, replayed or simply stale (the user left the tab open). Not worth a 500.
      return this.#callbackResult(false, "link_expired", "That connection link expired. Try connecting again.");
    }

    if (this.client.isCancellation(query)) {
      const message = query.error_description || query.message || "Sign-in was cancelled.";
      await this.repository.update(payload.uid, this.provider, { lastError: String(message).slice(0, 200) });
      return this.#callbackResult(false, "cancelled", message);
    }

    try {
      const session = await this.client.exchangeToken({ query });
      await this.repository.upsert(payload.uid, this.provider, {
        status: "connected",
        externalUserId: session.externalUserId,
        externalUserName: session.externalUserName,
        accessToken: encryptSecret(session.accessToken),
        publicToken: session.publicToken ? encryptSecret(session.publicToken) : "",
        connectedAt: new Date(),
        expiresAt: session.expiresAt,
        lastError: "",
        cache: { holdings: {}, positions: {} },
      });
      return this.#callbackResult(true, "connected", `${this.label} connected.`);
    } catch (err) {
      await this.repository.update(payload.uid, this.provider, {
        lastError: (err?.message || "Connection failed").slice(0, 200),
      });
      return this.#callbackResult(false, "failed", err?.message || `Could not connect to ${this.label}.`);
    }
  }

  /** Deep link back into the app. The UI reads `provider`/`status` to show a toast and refetch. */
  #callbackResult(ok, status, message) {
    const params = new URLSearchParams({ provider: this.provider, status, ...(ok ? {} : { message }) });
    return { ok, message, redirect: `${config.appScheme}://broker-callback?${params}` };
  }

  async disconnect(user) {
    const integration = await this.repository.find(user._id, this.provider);
    if (!integration) return { disconnected: true };

    // Tell the broker too, but never let their outage block the user from unlinking.
    const token = integration.accessToken ? decryptSecret(integration.accessToken) : null;
    if (token) await this.client.invalidateSession({ accessToken: token });

    await this.repository.remove(user._id, this.provider);
    return { disconnected: true };
  }

  // ---- Portfolio ---------------------------------------------------------------------------

  /**
   * Holdings with totals, shaped for the assistant to read aloud. Amounts are RUPEES (floats) —
   * the minor-unit rule is for our own ledger, not pass-through broker data that is never stored.
   */
  async getHoldings(user, { refresh = false } = {}) {
    const { payload, at, fromCache } = await this.#fetchCached(user, "holdings", "getHoldings", refresh);
    return {
      provider: this.provider,
      currency: this.client.currency,
      asOf: at,
      fromCache,
      ...this.client.normaliseHoldings(payload),
    };
  }

  async getPositions(user, { refresh = false } = {}) {
    const { payload, at, fromCache } = await this.#fetchCached(user, "positions", "getPositions", refresh);
    return {
      provider: this.provider,
      currency: this.client.currency,
      asOf: at,
      fromCache,
      ...this.client.normalisePositions(payload),
    };
  }

  /**
   * Serves a cached response when fresh, otherwise calls the broker with the decrypted token.
   * Centralises the token lifecycle so every portfolio call handles daily expiry identically.
   */
  async #fetchCached(user, key, method, refresh) {
    this.#requireConfigured();
    const integration = await this.repository.find(user._id, this.provider);
    if (!integration || integration.status === "disconnected" || !integration.accessToken) {
      throw new BadRequestError(`Connect your ${this.label} account first (Profile → Connected accounts).`);
    }

    const cached = integration.cache?.[key];
    if (!refresh && cached?.at && Date.now() - new Date(cached.at).getTime() < CACHE_TTL_MS[key]) {
      return { payload: cached.payload, at: cached.at, fromCache: true };
    }

    if (this.#isExpired(integration)) {
      await this.repository.markExpired(user._id, this.provider, "Access token expired");
      throw new ReauthRequiredError(`Your ${this.label} session expired — reconnect to see your holdings.`, {
        provider: this.provider,
      });
    }

    const accessToken = decryptSecret(integration.accessToken);
    if (!accessToken) {
      // Only happens if ENCRYPTION_KEY changed under us. Treat as a lost connection, not a crash.
      await this.repository.markExpired(user._id, this.provider, "Stored token could not be read");
      throw new ReauthRequiredError(`We lost access to your ${this.label} connection — please reconnect.`, {
        provider: this.provider,
      });
    }

    try {
      const payload = await this.client[method]({ accessToken });
      const at = new Date();
      await this.repository.cacheResponse(user._id, this.provider, key, payload);
      return { payload, at, fromCache: false };
    } catch (err) {
      if (err?.code === "REAUTH_REQUIRED") {
        await this.repository.markExpired(user._id, this.provider, err.message);
      } else if (err?.message) {
        await this.repository.update(user._id, this.provider, { lastError: err.message.slice(0, 200) });
      }
      throw err;
    }
  }

  // ---- Shared ------------------------------------------------------------------------------

  #requireConfigured() {
    if (!this.client.isConfigured()) {
      throw new ServiceUnavailableError(`${this.label} isn't set up on this server yet`);
    }
  }

  #isExpired(integration) {
    if (integration.status === "expired") return true;
    return !!integration.expiresAt && new Date(integration.expiresAt).getTime() <= Date.now();
  }

  /** Called from UserService.deleteMe (via the integration repository, which covers all providers). */
  async deleteAllForUser(userId) {
    return this.repository.deleteAllForUser(userId);
  }
}
