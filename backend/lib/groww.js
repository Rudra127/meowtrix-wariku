// @file backend/lib/groww.js
// Groww Trading API client — the only file that talks to api.groww.in.
// Docs: https://groww.in/trade-api/docs/curl
//
// READ-ONLY BY DESIGN. This file deliberately implements holdings, positions and prices, and
// nothing else. Groww's order endpoints (/v1/order/*, /v1/order-advance/*) are intentionally absent
// so a bug here can never place, modify or cancel a trade.
//
// How it differs from lib/upstox.js and lib/kite.js, which both do OAuth:
//
//   Groww has NO authorization-code flow and no redirect URI. You mint a token yourself from an API
//   key + secret:
//     timestamp = epoch seconds
//     checksum  = sha256(apiSecret + timestamp)
//     POST /v1/token/api/access  { key_type: "approval", checksum, timestamp }
//   The token expires daily (Groww documents 06:00 AM), so it is re-minted on demand.
//
//   The consequence: a key pair belongs to one Groww account. There is no way to authenticate a
//   different user, so this client can only ever read the portfolio of whoever owns the credentials.
//
// Two shape gotchas worth knowing before reading `normaliseHoldings`:
//   1. Holdings carry NO last price and NO P&L — only `average_price`. Current value has to be
//      derived from a separate /live-data/ltp call, which is why `normaliseHoldings` takes prices.
//   2. Holdings carry NO exchange either, just `trading_symbol` + `isin`. LTP lookups need an
//      `NSE_`/`BSE_` prefix, so we assume NSE (correct for the vast majority of equity holdings).
import { createHash } from "node:crypto";
import { config, isGrowwConfigured } from "../config/index.js";
import { ReauthRequiredError, ServiceUnavailableError, UpstreamError } from "../utils/index.js";

export const provider = "groww";
export const label = "Groww";
export const currency = "INR";
export const isConfigured = isGrowwConfigured;

/** Groww accepts at most 50 instruments per live-data call. */
export const LTP_BATCH_SIZE = 50;
/** Exchange assumed for price lookups, since holdings don't say which one. */
const DEFAULT_EXCHANGE = "NSE";
/** Price lookup order. Most equity is on NSE; BSE catches the rest instead of leaving it unpriced. */
export const PRICE_EXCHANGES = ["NSE", "BSE"];

const API_VERSION = "1.0";
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const requireConfig = () => {
  const { apiKey, apiSecret } = config.groww;
  if (!apiKey || !apiSecret) throw new ServiceUnavailableError("Groww is not set up on this server yet");
  return { apiKey, apiSecret, baseUrl: config.groww.baseUrl.replace(/\/$/, "") };
};

/**
 * SHA256 of the secret concatenated with the timestamp, as Groww's "How to generate a checksum"
 * section specifies. The timestamp is valid for 10 minutes, so it must be minted fresh per request.
 *
 * @param {string} apiSecret
 * @param {string|number} timestamp epoch SECONDS (10 digits), not milliseconds
 * @returns {string} lowercase hex digest
 */
export const buildChecksum = (apiSecret, timestamp) =>
  createHash("sha256").update(`${apiSecret}${timestamp}`).digest("hex");

/** Epoch seconds as a string, which is the format Groww wants in the body. */
export const epochSeconds = (now = new Date()) => String(Math.floor(now.getTime() / 1000));

/**
 * Groww expires access tokens daily at 06:00 IST. Used as a fallback when the token response has no
 * parseable `expiry`, and to avoid handing out a token that is about to die mid-request.
 */
export const accessTokenExpiry = (now = new Date()) => {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const cutoffToday = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 6, 0) - IST_OFFSET_MS;
  return new Date(now.getTime() < cutoffToday ? cutoffToday : cutoffToday + 24 * 60 * 60 * 1000);
};

/**
 * Groww answers `{ status: "SUCCESS", payload }` or `{ status: "FAILURE", error }`.
 * Error codes are documented as GA000..GA007; GA005 is "not authorised".
 */
const handleResponse = async (response, what) => {
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  const failed = !response.ok || json?.status === "FAILURE";
  if (failed) {
    const error = json?.error ?? {};
    const code = error.code ?? json?.code ?? "";
    const message = error.message ?? json?.message ?? `Groww returned ${response.status}`;
    console.error(`[groww] ${what} ${response.status} ${code} ${message}`);

    // 401/403, or Groww's own "not authorised" code, means the token died or the key needs its
    // daily approval on the Groww Cloud page. Either way the fix is re-minting, not retrying.
    if (response.status === 401 || response.status === 403 || code === "GA005") {
      throw new ReauthRequiredError(
        "Groww rejected our access token. It may have expired, or the API key needs its daily approval on the Groww site.",
        { provider }
      );
    }
    if (response.status === 429) throw new UpstreamError("Groww is rate limiting us — try again shortly");
    if (response.status >= 500 || code === "GA000" || code === "GA003") {
      throw new UpstreamError("Groww is having trouble right now");
    }
    throw new UpstreamError(message);
  }

  return json?.payload ?? json ?? null;
};

/**
 * Mints a daily access token from the API key + secret ("approval" flow).
 *
 * Note on the Authorization header: Groww's docs describe it only as "User API Key". Live testing
 * showed the bearer form works, and `GROWW_RAW_AUTH_HEADER=1` switches to sending the bare key if a
 * future API version wants that instead. `npm run groww:check` reports which form succeeded.
 *
 * @returns {Promise<{ accessToken: string, expiresAt: Date, sessionName: string, tokenRefId: string }>}
 */
export const createAccessToken = async ({ fetchImpl = fetch, timeoutMs = 20_000, now = new Date() } = {}) => {
  const { apiKey, apiSecret, baseUrl } = requireConfig();
  const timestamp = epochSeconds(now);
  const checksum = buildChecksum(apiSecret, timestamp);
  const authHeader = process.env.GROWW_RAW_AUTH_HEADER === "1" ? apiKey : `Bearer ${apiKey}`;

  let response;
  try {
    response = await fetchImpl(`${baseUrl}/v1/token/api/access`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-API-VERSION": API_VERSION,
      },
      body: JSON.stringify({ key_type: "approval", checksum, timestamp }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new UpstreamError(err?.name === "TimeoutError" ? "Groww timed out" : "Groww is unreachable");
  }

  const payload = await handleResponse(response, "POST /v1/token/api/access");
  const token = payload?.token ?? payload?.access_token ?? "";
  if (!token) throw new UpstreamError("Groww did not return an access token");

  const parsed = payload?.expiry ? new Date(payload.expiry) : null;
  const expiresAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : accessTokenExpiry(now);

  return {
    accessToken: token,
    expiresAt,
    sessionName: payload?.sessionName ?? "",
    tokenRefId: payload?.tokenRefId ?? "",
  };
};

const get = async (path, { accessToken, query, fetchImpl = fetch, timeoutMs = 20_000 }) => {
  const { baseUrl } = requireConfig();
  const url = new URL(`${baseUrl}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }

  let response;
  try {
    response = await fetchImpl(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "X-API-VERSION": API_VERSION,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new UpstreamError(err?.name === "TimeoutError" ? "Groww timed out" : "Groww is unreachable");
  }
  return handleResponse(response, `GET ${path}`);
};

export const getHoldings = (options) => get("/v1/holdings/user", options);

/**
 * Full snapshot for ONE instrument: today's move, the 52-week range, volume and more.
 * Heavier than /live-data/ltp (one call per symbol, 10/s) so it is only used when the extra context
 * is actually wanted — see GrowwService.getPortfolio({ withDayChange: true }).
 *
 * @returns {Promise<{ lastPrice, dayChange, dayChangePct, week52High, week52Low } | null>}
 */
export const getQuote = async ({ tradingSymbol, exchange = DEFAULT_EXCHANGE, ...options }) => {
  const payload = await get("/v1/live-data/quote", {
    ...options,
    query: { exchange, segment: "CASH", trading_symbol: tradingSymbol },
  });
  // Return null rather than a zero-filled object: callers treat a missing quote as "unknown", and a
  // dayChangePct of 0 would be read as "the stock didn't move today".
  if (!payload || typeof payload !== "object") return null;
  const hasQuoteFields = ["last_price", "day_change", "day_change_perc", "day_change_percentage"].some(
    (key) => payload[key] !== undefined
  );
  if (!hasQuoteFields) return null;

  return {
    lastPrice: Number(payload.last_price) || 0,
    dayChange: Number(payload.day_change) || 0,
    // Groww spells it `day_change_perc`; accept the longer spelling too in case it changes.
    dayChangePct: Number(payload.day_change_perc ?? payload.day_change_percentage) || 0,
    week52High: Number(payload.week_52_high) || 0,
    week52Low: Number(payload.week_52_low) || 0,
  };
};

export const getPositions = (options) => get("/v1/positions/user", { ...options, query: { segment: "CASH" } });

/**
 * Last traded prices for up to `LTP_BATCH_SIZE` symbols.
 * @param {{ exchangeSymbols: string[] }} args symbols already prefixed, e.g. ["NSE_RELIANCE"]
 * @returns {Promise<Record<string, number>>} keyed by the symbol as passed in
 */
export const getLtp = async ({ exchangeSymbols = [], ...options }) => {
  if (!exchangeSymbols.length) return {};
  const payload = await get("/v1/live-data/ltp", {
    ...options,
    query: { segment: "CASH", exchange_symbols: exchangeSymbols.join(",") },
  });
  return normaliseLtpPayload(payload, exchangeSymbols);
};

/**
 * The LTP response shape isn't pinned down in the docs for the multi-symbol case (the schema shown
 * is the single-symbol one), so accept the plausible variants: a symbol→number map, a symbol→object
 * map, an array of rows, or a bare number when exactly one symbol was requested.
 */
export const normaliseLtpPayload = (payload, requested = []) => {
  const prices = {};
  const put = (key, value) => {
    const price = Number(value);
    if (key && Number.isFinite(price) && price > 0) prices[key] = price;
  };

  if (typeof payload === "number") {
    if (requested.length === 1) put(requested[0], payload);
    return prices;
  }
  if (Array.isArray(payload)) {
    for (const row of payload) {
      put(row?.exchange_symbol ?? row?.symbol ?? row?.trading_symbol, row?.ltp ?? row?.last_price ?? row?.price);
    }
    return prices;
  }
  if (payload && typeof payload === "object") {
    // `{ ltp: 123 }` for a single symbol.
    if (requested.length === 1 && (typeof payload.ltp === "number" || typeof payload.last_price === "number")) {
      put(requested[0], payload.ltp ?? payload.last_price);
      return prices;
    }
    const container = payload.ltp && typeof payload.ltp === "object" ? payload.ltp : payload;
    for (const [key, value] of Object.entries(container)) {
      if (value === null || value === undefined) continue;
      put(key, typeof value === "object" ? (value.ltp ?? value.last_price ?? value.price) : value);
    }
  }
  return prices;
};

/** Splits symbols into batches Groww will accept. */
export const batchSymbols = (symbols, size = LTP_BATCH_SIZE) => {
  const batches = [];
  for (let i = 0; i < symbols.length; i += size) batches.push(symbols.slice(i, i + size));
  return batches;
};

/** Holdings have no exchange field, so prices are looked up on NSE. */
export const exchangeSymbolFor = (tradingSymbol, exchange = DEFAULT_EXCHANGE) => `${exchange}_${tradingSymbol}`;

/**
 * The tradable quantity Groww reports, summing the buckets that make up a holding. `quantity` is
 * documented as the net quantity, so it is preferred; the T1 (not yet settled) quantity is added
 * because those shares are owned even though they haven't landed in the demat account yet.
 */
export const holdingQuantity = (raw) => {
  const net = Number(raw?.quantity);
  if (Number.isFinite(net) && net > 0) return net;
  const demat = Number(raw?.demat_free_quantity) || 0;
  const t1 = Number(raw?.t1_quantity) || 0;
  return demat + t1;
};

/**
 * Finds a live price for a symbol. Holdings don't say which exchange they're on, so try NSE first
 * (where most equity sits) and fall back to BSE rather than treating a BSE-only holding as unpriced.
 *
 * @returns {{ price: number, exchange: string }} price 0 when nothing matched
 */
export const priceFor = (symbol, prices = {}) => {
  for (const exchange of PRICE_EXCHANGES) {
    const price = Number(prices[exchangeSymbolFor(symbol, exchange)]);
    if (Number.isFinite(price) && price > 0) return { price, exchange };
  }
  return { price: 0, exchange: DEFAULT_EXCHANGE };
};

/**
 * Groww holdings → the normalised shape every broker client returns, so
 * services/brokerage-service.js and the AI tools don't care which broker answered.
 *
 * Groww gives cost basis only, so everything about profit and loss here is derived from `prices`
 * (from /live-data/ltp) and, when asked for, `quotes` (from /live-data/quote, which adds today's
 * move and the 52-week range).
 *
 * @param {object} raw raw `{ holdings: [...] }` from /v1/holdings/user
 * @param {{ prices?: Record<string, number>, quotes?: Record<string, object> }} [options]
 *   `prices` keyed "NSE_SYMBOL"/"BSE_SYMBOL"; `quotes` keyed by plain trading symbol.
 */
export const normaliseHoldings = (raw, { prices = {}, quotes = {} } = {}) => {
  const rows = Array.isArray(raw?.holdings) ? raw.holdings : Array.isArray(raw) ? raw : [];

  const holdings = rows
    .map((h) => {
      const symbol = h.trading_symbol ?? "";
      const quantity = holdingQuantity(h);
      const averagePrice = Number(h.average_price) || 0;
      const { price: lastPrice, exchange } = priceFor(symbol, prices);
      const invested = quantity * averagePrice;
      // No price means no current value. Fall back to cost so totals stay sane rather than
      // collapsing the portfolio to zero, and flag it via `priced` so callers can say so.
      const priced = lastPrice > 0;
      const current = priced ? quantity * lastPrice : invested;
      const quote = quotes[symbol] ?? null;

      return {
        symbol,
        isin: h.isin ?? "",
        exchange,
        quantity,
        averagePrice: round2(averagePrice),
        lastPrice: round2(lastPrice),
        investedValue: round2(invested),
        currentValue: round2(current),
        pnl: priced ? round2(current - invested) : 0,
        pnlPct: priced && invested > 0 ? round2(((current - invested) / invested) * 100) : 0,
        // Today's move needs the heavier quote endpoint; 0 when it wasn't requested or didn't answer.
        dayChangePct: round2(quote?.dayChangePct ?? 0),
        dayChange: round2(quote?.dayChange ?? 0),
        ...(quote?.week52High ? { week52High: round2(quote.week52High) } : {}),
        ...(quote?.week52Low ? { week52Low: round2(quote.week52Low) } : {}),
        // Filled in below, once the portfolio total is known.
        allocationPct: 0,
        priced,
        pledgedQuantity: Number(h.pledge_quantity) || 0,
      };
    })
    .filter((h) => h.quantity > 0 && h.symbol)
    .sort((a, b) => b.currentValue - a.currentValue);

  const investedValue = round2(holdings.reduce((sum, h) => sum + h.investedValue, 0));
  const currentValue = round2(holdings.reduce((sum, h) => sum + h.currentValue, 0));
  const unpriced = holdings.filter((h) => !h.priced).length;

  // Share of the portfolio each holding represents — the number concentration questions need.
  for (const h of holdings) {
    h.allocationPct = currentValue > 0 ? round2((h.currentValue / currentValue) * 100) : 0;
  }

  // Only priced holdings can honestly be ranked by performance.
  const ranked = holdings.filter((h) => h.priced && h.investedValue > 0).sort((a, b) => b.pnlPct - a.pnlPct);
  const brief = (h) => (h ? { symbol: h.symbol, pnl: h.pnl, pnlPct: h.pnlPct } : null);

  return {
    count: holdings.length,
    investedValue,
    currentValue,
    pnl: round2(currentValue - investedValue),
    pnlPct: investedValue > 0 ? round2(((currentValue - investedValue) / investedValue) * 100) : 0,
    // True only when every holding got a live price, so the assistant can caveat the total honestly.
    pricesComplete: holdings.length > 0 && unpriced === 0,
    unpricedCount: unpriced,

    // Pre-computed analysis, so the model reads numbers instead of doing arithmetic on a list.
    analysis: {
      gainers: ranked.filter((h) => h.pnl > 0).length,
      losers: ranked.filter((h) => h.pnl < 0).length,
      bestPerformer: brief(ranked[0]),
      worstPerformer: brief(ranked.at(-1)),
      largestHolding: holdings[0] ? { symbol: holdings[0].symbol, allocationPct: holdings[0].allocationPct } : null,
      // A single name dominating the portfolio is the most common risk worth naming.
      topHoldingPct: holdings[0]?.allocationPct ?? 0,
      top3Pct: round2(holdings.slice(0, 3).reduce((sum, h) => sum + h.allocationPct, 0)),
    },

    holdings,
  };
};

/** Groww positions → normalised shape. Groww reports realised P&L only, no unrealised figure. */
export const normalisePositions = (raw) => {
  const rows = Array.isArray(raw?.positions) ? raw.positions : Array.isArray(raw) ? raw : [];
  const positions = rows
    .map((p) => ({
      symbol: p.trading_symbol ?? "",
      exchange: p.exchange ?? "",
      product: p.product ?? "",
      quantity: Number(p.quantity) || 0,
      averagePrice: round2(p.net_price ?? p.credit_price),
      lastPrice: 0, // Groww's positions payload carries no live price
      pnl: round2(p.realised_pnl),
      unrealised: 0,
      realised: round2(p.realised_pnl),
    }))
    .filter((p) => p.quantity !== 0 && p.symbol);

  return { count: positions.length, pnl: round2(positions.reduce((sum, p) => sum + p.pnl, 0)), positions };
};

/** Groww has no logout endpoint for API-key sessions; tokens simply expire. Here for interface parity. */
export const invalidateSession = async () => false;
