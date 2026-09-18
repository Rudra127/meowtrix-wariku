// @file backend/lib/kite.js
// Zerodha Kite Connect v3 client — the only file that talks to api.kite.trade.
// Docs: https://kite.trade/docs/connect/v3/
//
// Auth model (NOT OAuth2, despite looking similar):
//   1. send the user to  kite.zerodha.com/connect/login?v=3&api_key=…
//   2. Zerodha redirects back to the app's registered redirect URL with `request_token`
//   3. POST /session/token with checksum = SHA256(api_key + request_token + api_secret)
//      → `access_token`, valid until ~06:00 IST the following morning, then dead
//
// There is no refresh token. Daily expiry is normal, not an error: callers surface a "Reconnect"
// prompt rather than retrying.
import { createHash } from "node:crypto";
import { config, isZerodhaConfigured } from "../config/index.js";
import { ReauthRequiredError, ServiceUnavailableError, UpstreamError } from "../utils/index.js";

const API_BASE = "https://api.kite.trade";
const LOGIN_BASE = "https://kite.zerodha.com/connect/login";
const KITE_VERSION = "3";

// ---- Uniform brokerage-client interface (see services/brokerage-service.js) ---------------
// BrokerageService talks to every provider through these exports; Kite-specific quirks stay here.
export const provider = "zerodha";
export const label = "Zerodha";
export const currency = "INR";
export const isConfigured = isZerodhaConfigured;

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** Kite error_types that mean "this access token is no longer usable". */
const REAUTH_ERROR_TYPES = new Set(["TokenException", "PermissionException"]);

const requireConfig = () => {
  const { apiKey, apiSecret } = config.zerodha;
  if (!apiKey || !apiSecret) {
    throw new ServiceUnavailableError("Zerodha is not set up on this server yet");
  }
  return { apiKey, apiSecret };
};

/**
 * Where to send the user to sign in.
 * @param {{ apiKey?: string, state?: string, redirectParams?: Record<string,string> }} [options]
 */
export const buildLoginUrl = ({ apiKey = config.zerodha.apiKey, state, redirectParams } = {}) => {
  if (!apiKey) throw new ServiceUnavailableError("Zerodha is not set up on this server yet");
  const url = new URL(LOGIN_BASE);
  url.searchParams.set("v", KITE_VERSION);
  url.searchParams.set("api_key", apiKey);

  // Kite appends `redirect_params` (itself a query string) to the registered redirect URL. This is
  // how we get our signed state back — Kite has no `state` parameter of its own.
  const extras = new URLSearchParams({ ...(state && { state }), ...redirectParams });
  if ([...extras.keys()].length) url.searchParams.set("redirect_params", extras.toString());
  return url.toString();
};

/** SHA-256(api_key + request_token + api_secret) — Kite's proof that the exchange is ours. */
export const sessionChecksum = (apiKey, requestToken, apiSecret) =>
  createHash("sha256").update(`${apiKey}${requestToken}${apiSecret}`).digest("hex");

/** Shared response handling: Kite always answers `{ status, data }` or `{ status, message, error_type }`. */
const handleResponse = async (response, what) => {
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok || json?.status === "error") {
    const message = json?.message || `Zerodha returned ${response.status}`;
    const errorType = json?.error_type;
    console.error(`[kite] ${what} ${response.status} ${errorType ?? ""} ${message}`.trim());

    if (response.status === 403 || REAUTH_ERROR_TYPES.has(errorType)) {
      throw new ReauthRequiredError("Your Zerodha session has expired — reconnect to see your holdings.", {
        provider: "zerodha",
      });
    }
    if (response.status === 429) throw new UpstreamError("Zerodha is rate limiting us — try again shortly");
    if (response.status >= 500) throw new UpstreamError("Zerodha is having trouble right now");
    throw new UpstreamError(message);
  }
  return json?.data ?? null;
};

const request = async (path, { accessToken, apiKey = config.zerodha.apiKey, fetchImpl = fetch, timeoutMs = 20_000 }) => {
  let response;
  try {
    response = await fetchImpl(`${API_BASE}${path}`, {
      method: "GET",
      headers: {
        "X-Kite-Version": KITE_VERSION,
        Authorization: `token ${apiKey}:${accessToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new UpstreamError(err?.name === "TimeoutError" ? "Zerodha timed out" : "Zerodha is unreachable");
  }
  return handleResponse(response, `GET ${path}`);
};

/**
 * Exchanges a `request_token` for an access token.
 * @returns {Promise<{ accessToken: string, publicToken: string, userId: string, userName: string,
 *                     email: string, loginTime: string | null }>}
 */
export const createSession = async ({ requestToken, fetchImpl = fetch, timeoutMs = 20_000 } = {}) => {
  const { apiKey, apiSecret } = requireConfig();
  if (!requestToken) throw new UpstreamError("Zerodha did not return a request token");

  let response;
  try {
    response = await fetchImpl(`${API_BASE}/session/token`, {
      method: "POST",
      headers: {
        "X-Kite-Version": KITE_VERSION,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        api_key: apiKey,
        request_token: requestToken,
        checksum: sessionChecksum(apiKey, requestToken, apiSecret),
      }).toString(),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new UpstreamError(err?.name === "TimeoutError" ? "Zerodha timed out" : "Zerodha is unreachable");
  }

  const data = await handleResponse(response, "POST /session/token");
  if (!data?.access_token) throw new UpstreamError("Zerodha did not return an access token");
  return {
    accessToken: data.access_token,
    publicToken: data.public_token ?? "",
    userId: data.user_id ?? "",
    userName: data.user_name ?? "",
    email: data.email ?? "",
    loginTime: data.login_time ?? null,
  };
};

/** Long-term equity/MF holdings. Amounts are rupees (floats), as Kite reports them. */
export const getHoldings = (options) => request("/portfolio/holdings", options);

/** Intraday and F&O positions: `{ net: [...], day: [...] }`. */
export const getPositions = (options) => request("/portfolio/positions", options);

/** Available cash/margins per segment: `{ equity: {...}, commodity: {...} }`. */
export const getMargins = (options) => request("/user/margins", options);

export const getProfile = (options) => request("/user/profile", options);

/** Best-effort logout at Zerodha's end. Never throws — local disconnect must succeed regardless. */
export const invalidateSession = async ({ accessToken, apiKey = config.zerodha.apiKey, fetchImpl = fetch } = {}) => {
  try {
    const query = new URLSearchParams({ api_key: apiKey, access_token: accessToken });
    await fetchImpl(`${API_BASE}/session/token?${query}`, {
      method: "DELETE",
      headers: { "X-Kite-Version": KITE_VERSION, Authorization: `token ${apiKey}:${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    return true;
  } catch {
    return false;
  }
};

/**
 * When the current access token dies: 06:00 IST on the next calendar day.
 * Kite invalidates every token each morning regardless of when it was issued.
 */
export const accessTokenExpiry = (now = new Date()) => {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const sixAmIstToday = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 6) - IST_OFFSET_MS;
  // Logging in before 06:00 IST still only buys you until 06:00 IST today.
  return new Date(now.getTime() < sixAmIstToday ? sixAmIstToday : sixAmIstToday + 24 * 60 * 60 * 1000);
};

// ---- Uniform interface implementation -----------------------------------------------------

/** Kite signals a failed/cancelled login with `status=error` in the redirect query. */
export const isCancellation = (query = {}) => query.status === "error" || (!query.request_token && !query.status);

/**
 * Exchanges the callback's `request_token` for an access token, in the shape BrokerageService wants.
 * @param {{ query: object, fetchImpl?: typeof fetch }} args
 */
export const exchangeToken = async ({ query = {}, fetchImpl = fetch } = {}) => {
  const session = await createSession({ requestToken: query.request_token, fetchImpl });
  return {
    accessToken: session.accessToken,
    externalUserId: session.userId,
    externalUserName: session.userName,
    expiresAt: accessTokenExpiry(),
  };
};

/** Kite holdings → the normalised shape shared across providers. Amounts are rupee floats. */
export const normaliseHoldings = (raw) => {
  const rows = Array.isArray(raw) ? raw : [];
  const holdings = rows
    .map((h) => {
      const quantity = (Number(h.quantity) || 0) + (Number(h.t1_quantity) || 0);
      const averagePrice = Number(h.average_price) || 0;
      const lastPrice = Number(h.last_price) || 0;
      const invested = quantity * averagePrice;
      const current = quantity * lastPrice;
      return {
        symbol: h.tradingsymbol ?? "",
        exchange: h.exchange ?? "",
        quantity,
        averagePrice: round2(averagePrice),
        lastPrice: round2(lastPrice),
        investedValue: round2(invested),
        currentValue: round2(current),
        pnl: round2(h.pnl ?? current - invested),
        pnlPct: invested > 0 ? round2(((current - invested) / invested) * 100) : 0,
        dayChangePct: round2(h.day_change_percentage ?? 0),
      };
    })
    .filter((h) => h.quantity > 0)
    .sort((a, b) => b.currentValue - a.currentValue);

  const investedValue = round2(holdings.reduce((sum, h) => sum + h.investedValue, 0));
  const currentValue = round2(holdings.reduce((sum, h) => sum + h.currentValue, 0));
  return {
    count: holdings.length,
    investedValue,
    currentValue,
    pnl: round2(currentValue - investedValue),
    pnlPct: investedValue > 0 ? round2(((currentValue - investedValue) / investedValue) * 100) : 0,
    holdings,
  };
};

/** Kite positions (`{ net: [...] }`) → normalised shape. */
export const normalisePositions = (raw) => {
  const net = Array.isArray(raw?.net) ? raw.net : [];
  const positions = net
    .filter((p) => (Number(p.quantity) || 0) !== 0)
    .map((p) => ({
      symbol: p.tradingsymbol ?? "",
      exchange: p.exchange ?? "",
      product: p.product ?? "",
      quantity: Number(p.quantity) || 0,
      averagePrice: round2(p.average_price),
      lastPrice: round2(p.last_price),
      pnl: round2(p.pnl),
      unrealised: round2(p.unrealised),
      realised: round2(p.realised),
    }));
  return { count: positions.length, pnl: round2(positions.reduce((sum, p) => sum + p.pnl, 0)), positions };
};
