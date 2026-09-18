// @file backend/services/groww-service.js
// Read-only Groww portfolio for the Ask AI assistant.
//
// Why this is NOT a BrokerageService like Upstox/Zerodha: those are per-user OAuth connections whose
// tokens are encrypted per user in Mongo. Groww has no OAuth, so there is exactly one account here,
// belonging to whoever owns GROWW_API_KEY. Nothing is stored per user, and nothing is written to the
// database at all — the credentials live in the environment and the daily token lives in memory.
//
// Token lifecycle:
//   Groww tokens expire daily (06:00 IST) and the mint endpoint is capped at 150 calls / 24h, so the
//   token is minted once, cached, and shared. Concurrent callers await the same in-flight mint rather
//   than each firing their own request.
//
// Prices:
//   Groww's holdings payload has no last price, so current value comes from /live-data/ltp in
//   batches of 50. Price lookups are best-effort: outside market hours, or if live data is not on the
//   subscription, holdings still return with cost basis and `pricesComplete: false` so the assistant
//   can say so instead of reporting a wrong total.
import * as growwClient from "../lib/groww.js";
import { ServiceUnavailableError } from "../utils/index.js";

/** Re-mint slightly before the real expiry so a request can't die mid-flight. */
const TOKEN_SAFETY_MS = 60 * 1000;
/** Holdings move with the market, but a single chat turn can ask several questions. */
const PORTFOLIO_TTL_MS = 5 * 60 * 1000;

export default class GrowwService {
  /** @param {typeof growwClient} [client] Injected in tests; defaults to the real lib/groww.js. */
  constructor(client = growwClient) {
    this.client = client;
    this.provider = client.provider;
    this.label = client.label;

    /** @type {{ accessToken: string, expiresAt: Date } | null} */
    this.token = null;
    /** @type {Promise<{accessToken: string, expiresAt: Date}> | null} in-flight mint, shared. */
    this.pendingToken = null;
    /** @type {{ at: Date, data: object } | null} */
    this.cache = null;
  }

  isConfigured() {
    return this.client.isConfigured();
  }

  #requireConfigured() {
    if (!this.client.isConfigured()) {
      throw new ServiceUnavailableError("Groww isn't set up on this server yet");
    }
  }

  // ---- Token -------------------------------------------------------------------------------

  #tokenIsUsable(now = Date.now()) {
    return Boolean(this.token?.accessToken && this.token.expiresAt.getTime() - TOKEN_SAFETY_MS > now);
  }

  /** Returns a usable access token, minting one only when the cached one is missing or stale. */
  async #accessToken({ force = false } = {}) {
    this.#requireConfigured();
    if (!force && this.#tokenIsUsable()) return this.token.accessToken;

    // Collapse concurrent mints into one request — the mint endpoint allows only 150 calls a day.
    if (!this.pendingToken) {
      this.pendingToken = this.client
        .createAccessToken()
        .then((session) => {
          this.token = { accessToken: session.accessToken, expiresAt: session.expiresAt };
          return this.token;
        })
        .finally(() => {
          this.pendingToken = null;
        });
    }
    const token = await this.pendingToken;
    return token.accessToken;
  }

  /**
   * Runs a client call with a fresh token, retrying once if Groww rejects the token.
   * The retry is what makes the 06:00 daily rollover invisible: the first call after expiry fails,
   * we mint a new token, and the second succeeds.
   */
  async #withToken(fn) {
    const accessToken = await this.#accessToken();
    try {
      return await fn(accessToken);
    } catch (err) {
      if (err?.code !== "REAUTH_REQUIRED") throw err;
      this.token = null;
      const fresh = await this.#accessToken({ force: true });
      return fn(fresh);
    }
  }

  // ---- Prices ------------------------------------------------------------------------------

  /**
   * Last traded prices for the given trading symbols. Best-effort: a failure returns whatever was
   * collected so far rather than sinking the whole portfolio read.
   *
   * @returns {Promise<{ prices: Record<string, number>, failed: boolean }>}
   */
  async #fetchPrices(symbols, accessToken) {
    const exchangeSymbols = [...new Set(symbols)].map((s) => this.client.exchangeSymbolFor(s));
    if (!exchangeSymbols.length) return { prices: {}, failed: false };

    const prices = {};
    let failed = false;
    for (const batch of this.client.batchSymbols(exchangeSymbols)) {
      try {
        Object.assign(prices, await this.client.getLtp({ accessToken, exchangeSymbols: batch }));
      } catch (err) {
        // Common and not fatal: live data may not be on the subscription, or the market is closed.
        failed = true;
        console.warn(`[groww] price lookup failed for ${batch.length} symbols: ${err?.message}`);
      }
    }
    return { prices, failed };
  }

  // ---- Portfolio ---------------------------------------------------------------------------

  /**
   * Holdings with totals, shaped like every other broker's output so the AI tools are identical.
   * Amounts are RUPEES (floats) — pass-through broker data is never stored, so the minor-unit rule
   * for our own ledger doesn't apply here.
   *
   * @param {{ refresh?: boolean }} [options]
   */
  async getPortfolio({ refresh = false } = {}) {
    this.#requireConfigured();

    if (!refresh && this.cache && Date.now() - this.cache.at.getTime() < PORTFOLIO_TTL_MS) {
      return { ...this.cache.data, asOf: this.cache.at, fromCache: true };
    }

    const data = await this.#withToken(async (accessToken) => {
      const raw = await this.client.getHoldings({ accessToken });
      const rows = Array.isArray(raw?.holdings) ? raw.holdings : [];
      const symbols = rows.map((h) => h.trading_symbol).filter(Boolean);

      const { prices, failed } = await this.#fetchPrices(symbols, accessToken);
      const normalised = this.client.normaliseHoldings(raw, { prices });

      return {
        provider: this.provider,
        label: this.label,
        currency: this.client.currency,
        ...normalised,
        // When prices are missing, `currentValue` falls back to cost. Say so rather than letting the
        // assistant present cost basis as market value.
        priceLookupFailed: failed,
        valuationNote: normalised.pricesComplete
          ? ""
          : "Live prices were unavailable for some holdings, so their current value shows the amount invested instead.",
      };
    });

    const at = new Date();
    this.cache = { at, data };
    return { ...data, asOf: at, fromCache: false };
  }

  /** Open positions (CASH segment). Groww reports realised P&L only. */
  async getPositions({ refresh = false } = {}) {
    this.#requireConfigured();
    void refresh; // positions are cheap and change fast; always read through
    const raw = await this.#withToken((accessToken) => this.client.getPositions({ accessToken }));
    return {
      provider: this.provider,
      label: this.label,
      currency: this.client.currency,
      asOf: new Date(),
      ...this.client.normalisePositions(raw),
    };
  }

  /** Drops the cached token and portfolio. Used by tests and the check script. */
  reset() {
    this.token = null;
    this.pendingToken = null;
    this.cache = null;
  }
}

/** Shared instance: the token and portfolio cache are per-process, not per-request. */
export const growwService = new GrowwService();
