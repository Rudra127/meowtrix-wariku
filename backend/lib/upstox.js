// @file backend/lib/upstox.js
// Upstox API v2 client — the only file that talks to api.upstox.com.
// Docs: https://upstox.com/developer/api-documentation/
//
// Unlike Zerodha, Upstox is FREE and uses a textbook OAuth 2.0 authorization-code flow:
//   1. send the user to  https://api.upstox.com/v2/login/authorization/dialog?...&state=<signed>
//   2. Upstox redirects back with `?code=<one-time>&state=<signed>`
//   3. POST /login/authorization/token with the code + client_id + client_secret → `access_token`
//
// Like Kite, there is no refresh token in this flow and every access token expires at 03:30 IST the
// next day — so the same daily-reconnect handling applies. This file implements the same uniform
// interface as lib/kite.js so services/brokerage-service.js can drive either provider.
import { config, isUpstoxConfigured } from "../config/index.js";
import { ReauthRequiredError, ServiceUnavailableError, UpstreamError } from "../utils/index.js";

const API_BASE = "https://api.upstox.com/v2";
const LOGIN_DIALOG = "https://api.upstox.com/v2/login/authorization/dialog";

export const provider = "upstox";
export const label = "Upstox";
export const currency = "INR";
export const isConfigured = isUpstoxConfigured;

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const requireConfig = () => {
  const { apiKey, apiSecret, redirectUrl } = config.upstox;
  if (!apiKey || !apiSecret || !redirectUrl) throw new ServiceUnavailableError("Upstox is not set up on this server yet");
  return { apiKey, apiSecret, redirectUrl };
};

/** Where to send the user to sign in. Upstox supports a real `state` param (no smuggling needed). */
export const buildLoginUrl = ({ state } = {}) => {
  const { apiKey, redirectUrl } = requireConfig();
  const url = new URL(LOGIN_DIALOG);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", apiKey);
  url.searchParams.set("redirect_uri", redirectUrl);
  if (state) url.searchParams.set("state", state);
  return url.toString();
};

/** Upstox redirects with `?error=...` when the user denies or login fails. */
export const isCancellation = (query = {}) => Boolean(query.error) || (!query.code && !query.error);

/** Shared handling: Upstox answers `{ status, data }` or `{ status:"error", errors:[{message}] }`. */
const handleResponse = async (response, what) => {
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  if (!response.ok || json?.status === "error") {
    const message = json?.errors?.[0]?.message || json?.message || `Upstox returned ${response.status}`;
    console.error(`[upstox] ${what} ${response.status} ${message}`);
    if (response.status === 401 || response.status === 403) {
      throw new ReauthRequiredError("Your Upstox session has expired — reconnect to see your holdings.", {
        provider,
      });
    }
    if (response.status === 429) throw new UpstreamError("Upstox is rate limiting us — try again shortly");
    if (response.status >= 500) throw new UpstreamError("Upstox is having trouble right now");
    throw new UpstreamError(message);
  }
  return json?.data ?? null;
};

/**
 * Exchanges the callback `code` for an access token.
 * @param {{ query: object, fetchImpl?: typeof fetch, timeoutMs?: number }} args
 */
export const exchangeToken = async ({ query = {}, fetchImpl = fetch, timeoutMs = 20_000 } = {}) => {
  const { apiKey, apiSecret, redirectUrl } = requireConfig();
  if (!query.code) throw new UpstreamError("Upstox did not return an authorization code");

  let response;
  try {
    response = await fetchImpl(`${API_BASE}/login/authorization/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        code: query.code,
        client_id: apiKey,
        client_secret: apiSecret,
        redirect_uri: redirectUrl,
        grant_type: "authorization_code",
      }).toString(),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new UpstreamError(err?.name === "TimeoutError" ? "Upstox timed out" : "Upstox is unreachable");
  }

  // The token response is flat (access_token + profile at the top level), not under `data`.
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  if (!response.ok || json?.status === "error" || !json?.access_token) {
    const message = json?.errors?.[0]?.message || json?.message || `Upstox token exchange failed (${response.status})`;
    console.error(`[upstox] POST /token ${response.status} ${message}`);
    throw new UpstreamError(message);
  }

  return {
    accessToken: json.access_token,
    externalUserId: json.user_id ?? "",
    externalUserName: json.user_name ?? "",
    expiresAt: accessTokenExpiry(),
  };
};

const request = async (path, { accessToken, fetchImpl = fetch, timeoutMs = 20_000 }) => {
  let response;
  try {
    response = await fetchImpl(`${API_BASE}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new UpstreamError(err?.name === "TimeoutError" ? "Upstox timed out" : "Upstox is unreachable");
  }
  return handleResponse(response, `GET ${path}`);
};

export const getHoldings = (options) => request("/portfolio/long-term-holdings", options);
export const getPositions = (options) => request("/portfolio/short-term-positions", options);

/** Best-effort logout. Never throws — local disconnect must succeed regardless. */
export const invalidateSession = async ({ accessToken, fetchImpl = fetch } = {}) => {
  try {
    await fetchImpl(`${API_BASE}/logout`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    return true;
  } catch {
    return false;
  }
};

/** Upstox invalidates every access token at 03:30 IST daily, regardless of when it was issued. */
export const accessTokenExpiry = (now = new Date()) => {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  // 03:30 IST = 03:30 wall clock in IST.
  const cutoffToday = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 3, 30) - IST_OFFSET_MS;
  return new Date(now.getTime() < cutoffToday ? cutoffToday : cutoffToday + 24 * 60 * 60 * 1000);
};

/** Upstox long-term holdings → the normalised shape shared across providers. Rupee floats. */
export const normaliseHoldings = (raw) => {
  const rows = Array.isArray(raw) ? raw : [];
  const holdings = rows
    .map((h) => {
      const quantity = Number(h.quantity) || 0;
      const averagePrice = Number(h.average_price) || 0;
      const lastPrice = Number(h.last_price) || 0;
      const invested = quantity * averagePrice;
      const current = quantity * lastPrice;
      return {
        symbol: h.trading_symbol ?? h.tradingsymbol ?? "",
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

/** Upstox short-term positions (`data: [...]`) → normalised shape. */
export const normalisePositions = (raw) => {
  const rows = Array.isArray(raw) ? raw : [];
  const positions = rows
    .filter((p) => (Number(p.quantity) || 0) !== 0)
    .map((p) => ({
      symbol: p.trading_symbol ?? p.tradingsymbol ?? "",
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
