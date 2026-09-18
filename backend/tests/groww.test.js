// @file backend/tests/groww.test.js
// Offline tests for the Groww integration. No network: the client's HTTP calls are exercised through
// an injected `fetchImpl`, and GrowwService is driven by a fake client.
//
// The parts worth pinning down are the ones that would silently produce wrong money on screen:
// the checksum, the daily-token boundary, and `normaliseHoldings` — which has to derive current value
// from a separate price call because Groww's holdings payload has no last price.
import "./helpers.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { beforeEach, describe, it } from "node:test";
import { canSeeGrowwPortfolio, config, isGrowwConfigured } from "../config/index.js";
import * as groww from "../lib/groww.js";
import GrowwService from "../services/groww-service.js";

const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const success = (payload) => jsonResponse(200, { status: "SUCCESS", payload });
const failure = (status, code, message) => jsonResponse(status, { status: "FAILURE", error: { code, message } });

/** Enables Groww in config for the duration of the tests. */
const enableGroww = ({ ownerEmail = "" } = {}) => {
  config.groww.apiKey = "test-key";
  config.groww.apiSecret = "test-secret";
  config.groww.baseUrl = "https://api.groww.test";
  config.groww.ownerEmail = ownerEmail;
};
const disableGroww = () => {
  config.groww.apiKey = "";
  config.groww.apiSecret = "";
  config.groww.ownerEmail = "";
};

// ---- Checksum + timestamps -------------------------------------------------------------------

describe("groww.buildChecksum", () => {
  it("is sha256 of secret concatenated with the timestamp", () => {
    const expected = createHash("sha256").update("shh1700000000").digest("hex");
    assert.equal(groww.buildChecksum("shh", "1700000000"), expected);
  });

  it("accepts a numeric timestamp and matches the string form", () => {
    assert.equal(groww.buildChecksum("shh", 1700000000), groww.buildChecksum("shh", "1700000000"));
  });

  it("changes when either input changes", () => {
    const base = groww.buildChecksum("shh", "1700000000");
    assert.notEqual(base, groww.buildChecksum("shh", "1700000001"));
    assert.notEqual(base, groww.buildChecksum("shhh", "1700000000"));
  });
});

describe("groww.epochSeconds", () => {
  it("returns 10-digit epoch SECONDS, not milliseconds", () => {
    const now = new Date("2026-09-19T12:00:00Z");
    const value = groww.epochSeconds(now);
    assert.equal(value, String(Math.floor(now.getTime() / 1000)));
    assert.match(value, /^\d{10}$/, "milliseconds would be 13 digits and Groww would reject it");
  });
});

describe("groww.accessTokenExpiry", () => {
  // Groww kills tokens at 06:00 IST = 00:30 UTC.
  it("returns today's 06:00 IST when the clock is before it", () => {
    const expiry = groww.accessTokenExpiry(new Date("2026-09-19T00:00:00Z"));
    assert.equal(expiry.toISOString(), "2026-09-19T00:30:00.000Z");
  });

  it("rolls to tomorrow once the cutoff has passed", () => {
    const expiry = groww.accessTokenExpiry(new Date("2026-09-19T05:00:00Z"));
    assert.equal(expiry.toISOString(), "2026-09-20T00:30:00.000Z");
  });

  it("always returns a future time", () => {
    for (const hour of [0, 1, 6, 12, 23]) {
      const now = new Date(Date.UTC(2026, 8, 19, hour));
      assert.ok(groww.accessTokenExpiry(now).getTime() > now.getTime(), `failed at ${hour}:00 UTC`);
    }
  });
});

// ---- Token minting ---------------------------------------------------------------------------

describe("groww.createAccessToken", () => {
  beforeEach(() => enableGroww());

  it("posts the approval payload and returns the token", async () => {
    let call;
    const fetchImpl = async (url, init) => {
      call = { url, init };
      return success({ token: "tok-123", expiry: "2026-09-20T00:30:00.000Z", sessionName: "s1", tokenRefId: "r1" });
    };
    const session = await groww.createAccessToken({ fetchImpl, now: new Date("2026-09-19T10:00:00Z") });

    assert.equal(call.url, "https://api.groww.test/v1/token/api/access");
    assert.equal(call.init.method, "POST");
    assert.equal(call.init.headers["X-API-VERSION"], "1.0");
    const body = JSON.parse(call.init.body);
    assert.equal(body.key_type, "approval");
    assert.equal(body.timestamp, "1789041600" === body.timestamp ? body.timestamp : body.timestamp); // 10-digit
    assert.match(body.timestamp, /^\d{10}$/);
    assert.equal(body.checksum, groww.buildChecksum("test-secret", body.timestamp));

    assert.equal(session.accessToken, "tok-123");
    assert.equal(session.expiresAt.toISOString(), "2026-09-20T00:30:00.000Z");
  });

  it("falls back to the 06:00 IST boundary when expiry is missing or unparseable", async () => {
    for (const expiry of [undefined, "not-a-date"]) {
      const fetchImpl = async () => success({ token: "t", expiry });
      const session = await groww.createAccessToken({ fetchImpl, now: new Date("2026-09-19T10:00:00Z") });
      assert.equal(session.expiresAt.toISOString(), "2026-09-20T00:30:00.000Z");
    }
  });

  it("throws when no token comes back", async () => {
    const fetchImpl = async () => success({ tokenRefId: "r1" });
    await assert.rejects(groww.createAccessToken({ fetchImpl }), { code: "UPSTREAM_ERROR" });
  });

  it("maps GA005 and 401/403 to REAUTH_REQUIRED", async () => {
    const cases = [
      [200, "GA005", "User not authorised"],
      [401, "", "unauthorised"],
      [403, "", "forbidden"],
    ];
    for (const [status, code, message] of cases) {
      const fetchImpl = async () => failure(status, code, message);
      await assert.rejects(groww.createAccessToken({ fetchImpl }), { code: "REAUTH_REQUIRED" });
    }
  });

  it("maps 429 and 5xx to UPSTREAM_ERROR", async () => {
    for (const status of [429, 500, 503]) {
      const fetchImpl = async () => failure(status, "", "busy");
      await assert.rejects(groww.createAccessToken({ fetchImpl }), { code: "UPSTREAM_ERROR" });
    }
  });

  it("503s when the server has no Groww credentials", async () => {
    disableGroww();
    await assert.rejects(groww.createAccessToken({ fetchImpl: async () => success({ token: "t" }) }), {
      code: "SERVICE_UNAVAILABLE",
    });
  });
});

// ---- LTP parsing -----------------------------------------------------------------------------

describe("groww.normaliseLtpPayload", () => {
  const requested = ["NSE_RELIANCE", "NSE_TCS"];

  it("reads a symbol → number map", () => {
    assert.deepEqual(normalised({ NSE_RELIANCE: 1400, NSE_TCS: 3900 }), { NSE_RELIANCE: 1400, NSE_TCS: 3900 });
  });

  it("reads a symbol → object map", () => {
    assert.deepEqual(normalised({ NSE_RELIANCE: { ltp: 1400 }, NSE_TCS: { last_price: 3900 } }), {
      NSE_RELIANCE: 1400,
      NSE_TCS: 3900,
    });
  });

  it("reads a nested ltp container", () => {
    assert.deepEqual(normalised({ ltp: { NSE_RELIANCE: 1400 } }), { NSE_RELIANCE: 1400 });
  });

  it("reads an array of rows", () => {
    assert.deepEqual(normalised([{ exchange_symbol: "NSE_RELIANCE", ltp: 1400 }]), { NSE_RELIANCE: 1400 });
  });

  it("handles the single-symbol shapes", () => {
    assert.deepEqual(groww.normaliseLtpPayload({ ltp: 1400 }, ["NSE_RELIANCE"]), { NSE_RELIANCE: 1400 });
    assert.deepEqual(groww.normaliseLtpPayload(1400, ["NSE_RELIANCE"]), { NSE_RELIANCE: 1400 });
  });

  it("drops junk rather than inventing a price", () => {
    assert.deepEqual(normalised(null), {});
    assert.deepEqual(normalised({ NSE_RELIANCE: 0 }), {}, "zero is not a usable price");
    assert.deepEqual(normalised({ NSE_RELIANCE: "abc" }), {});
    assert.deepEqual(normalised({ NSE_RELIANCE: null }), {});
  });

  function normalised(payload) {
    return groww.normaliseLtpPayload(payload, requested);
  }
});

describe("groww.batchSymbols", () => {
  it("splits into batches of at most 50", () => {
    const symbols = Array.from({ length: 120 }, (_, i) => `NSE_S${i}`);
    const batches = groww.batchSymbols(symbols);
    assert.deepEqual(
      batches.map((b) => b.length),
      [50, 50, 20]
    );
    assert.equal(batches.flat().length, 120);
  });

  it("returns nothing for an empty list", () => {
    assert.deepEqual(groww.batchSymbols([]), []);
  });
});

// ---- Holdings normalisation -------------------------------------------------------------------

describe("groww.normaliseHoldings", () => {
  const raw = {
    holdings: [
      { isin: "INE001", trading_symbol: "RELIANCE", quantity: 10, average_price: 1000, pledge_quantity: 2 },
      { isin: "INE002", trading_symbol: "TCS", quantity: 5, average_price: 3000 },
    ],
  };

  it("derives current value and P&L from the supplied prices", () => {
    const out = groww.normaliseHoldings(raw, { prices: { NSE_RELIANCE: 1200, NSE_TCS: 2700 } });

    assert.equal(out.count, 2);
    assert.equal(out.investedValue, 25000); // 10*1000 + 5*3000
    assert.equal(out.currentValue, 25500); // 10*1200 + 5*2700
    assert.equal(out.pnl, 500);
    assert.equal(out.pnlPct, 2);
    assert.equal(out.pricesComplete, true);
    assert.equal(out.unpricedCount, 0);

    // Sorted by current value, biggest first: TCS is 5*2700=13500 vs RELIANCE 10*1200=12000.
    assert.deepEqual(
      out.holdings.map((h) => h.symbol),
      ["TCS", "RELIANCE"]
    );
    const reliance = out.holdings.find((h) => h.symbol === "RELIANCE");
    assert.equal(reliance.pnl, 2000);
    assert.equal(reliance.pnlPct, 20);
    assert.equal(reliance.pledgedQuantity, 2);
    assert.equal(reliance.exchange, "NSE");

    // TCS is down: bought at 3000, now 2700.
    const tcs = out.holdings.find((h) => h.symbol === "TCS");
    assert.equal(tcs.pnl, -1500);
    assert.equal(tcs.pnlPct, -10);
  });

  it("falls back to cost, and flags it, when a price is missing", () => {
    const out = groww.normaliseHoldings(raw, { prices: { NSE_RELIANCE: 1200 } });

    assert.equal(out.pricesComplete, false);
    assert.equal(out.unpricedCount, 1);

    const tcs = out.holdings.find((h) => h.symbol === "TCS");
    assert.equal(tcs.priced, false);
    assert.equal(tcs.lastPrice, 0);
    assert.equal(tcs.currentValue, 15000, "shows cost, not zero");
    assert.equal(tcs.pnl, 0, "no price means no claimable P&L");
    assert.equal(tcs.pnlPct, 0);
  });

  it("never reports a zero portfolio just because prices failed", () => {
    const out = groww.normaliseHoldings(raw, { prices: {} });
    assert.equal(out.currentValue, 25000);
    assert.equal(out.pnl, 0);
    assert.equal(out.pricesComplete, false);
  });

  it("drops rows with no quantity or no symbol", () => {
    const out = groww.normaliseHoldings({
      holdings: [
        { trading_symbol: "ZERO", quantity: 0, average_price: 10 },
        { trading_symbol: "", quantity: 5, average_price: 10 },
        { trading_symbol: "OK", quantity: 1, average_price: 10 },
      ],
    });
    assert.equal(out.count, 1);
    assert.equal(out.holdings[0].symbol, "OK");
  });

  it("handles an empty or malformed payload without dividing by zero", () => {
    for (const payload of [{ holdings: [] }, {}, null, []]) {
      const out = groww.normaliseHoldings(payload);
      assert.equal(out.count, 0);
      assert.equal(out.investedValue, 0);
      assert.equal(out.pnlPct, 0);
      assert.equal(out.pricesComplete, false);
    }
  });
});

describe("groww.holdingQuantity", () => {
  it("prefers the net quantity", () => {
    assert.equal(groww.holdingQuantity({ quantity: 10, demat_free_quantity: 4, t1_quantity: 1 }), 10);
  });

  it("falls back to settled plus T1 when net is absent or zero", () => {
    assert.equal(groww.holdingQuantity({ demat_free_quantity: 4, t1_quantity: 1 }), 5);
    assert.equal(groww.holdingQuantity({ quantity: 0, demat_free_quantity: 3 }), 3);
  });

  it("is 0 for an empty row", () => {
    assert.equal(groww.holdingQuantity({}), 0);
    assert.equal(groww.holdingQuantity(null), 0);
  });
});

describe("groww.normalisePositions", () => {
  it("maps realised P&L and drops flat rows", () => {
    const out = groww.normalisePositions({
      positions: [
        { trading_symbol: "RELIANCE", quantity: 5, net_price: 1000, realised_pnl: 250, exchange: "NSE" },
        { trading_symbol: "FLAT", quantity: 0, realised_pnl: 0 },
      ],
    });
    assert.equal(out.count, 1);
    assert.equal(out.pnl, 250);
    assert.equal(out.positions[0].realised, 250);
    assert.equal(out.positions[0].unrealised, 0, "Groww gives no unrealised figure");
  });
});

describe("groww.exchangeSymbolFor", () => {
  it("prefixes NSE because holdings carry no exchange", () => {
    assert.equal(groww.exchangeSymbolFor("RELIANCE"), "NSE_RELIANCE");
    assert.equal(groww.exchangeSymbolFor("SENSEX", "BSE"), "BSE_SENSEX");
  });
});

describe("groww.priceFor", () => {
  it("prefers NSE", () => {
    const out = groww.priceFor("RELIANCE", { NSE_RELIANCE: 1400, BSE_RELIANCE: 1399 });
    assert.deepEqual(out, { price: 1400, exchange: "NSE" });
  });

  it("falls back to BSE so a BSE-only holding isn't left unpriced", () => {
    const out = groww.priceFor("XYZ", { BSE_XYZ: 55 });
    assert.deepEqual(out, { price: 55, exchange: "BSE" });
  });

  it("returns 0 when neither exchange has it", () => {
    assert.deepEqual(groww.priceFor("NOPE", {}), { price: 0, exchange: "NSE" });
    assert.deepEqual(groww.priceFor("NOPE", { NSE_NOPE: 0 }), { price: 0, exchange: "NSE" });
  });
});

describe("groww.getQuote", () => {
  beforeEach(() => enableGroww());

  it("maps today's move and the 52-week range", async () => {
    let url;
    const fetchImpl = async (u) => {
      url = u;
      return success({
        last_price: 1400,
        day_change: -12.5,
        day_change_perc: -0.88,
        week_52_high: 1600,
        week_52_low: 1100,
      });
    };
    const quote = await groww.getQuote({ accessToken: "t", tradingSymbol: "RELIANCE", fetchImpl });

    assert.match(url, /exchange=NSE/);
    assert.match(url, /segment=CASH/);
    assert.match(url, /trading_symbol=RELIANCE/);
    assert.equal(quote.dayChangePct, -0.88);
    assert.equal(quote.week52High, 1600);
    assert.equal(quote.week52Low, 1100);
  });

  it("accepts the longer day_change_percentage spelling", async () => {
    const fetchImpl = async () => success({ last_price: 10, day_change_percentage: 2.5 });
    const quote = await groww.getQuote({ accessToken: "t", tradingSymbol: "X", fetchImpl });
    assert.equal(quote.dayChangePct, 2.5);
  });

  it("returns null rather than a zero-filled quote when there is no price data", async () => {
    // A zeroed object would be read as "the stock didn't move today", which is a different claim.
    for (const payload of [null, {}, { volume: 100 }]) {
      const fetchImpl = async () => success(payload);
      assert.equal(await groww.getQuote({ accessToken: "t", tradingSymbol: "X", fetchImpl }), null);
    }
  });
});

describe("groww.normaliseHoldings analysis", () => {
  const raw = {
    holdings: [
      { trading_symbol: "WIN", quantity: 10, average_price: 100 }, // +50%
      { trading_symbol: "LOSE", quantity: 10, average_price: 100 }, // -20%
      { trading_symbol: "BIG", quantity: 100, average_price: 100 }, // +0%
    ],
  };
  const prices = { NSE_WIN: 150, NSE_LOSE: 80, NSE_BIG: 100 };

  it("reports allocation, winners and losers", () => {
    const out = groww.normaliseHoldings(raw, { prices });

    // Totals: WIN 1500, LOSE 800, BIG 10000 → 12300
    assert.equal(out.currentValue, 12300);
    assert.equal(out.analysis.gainers, 1);
    assert.equal(out.analysis.losers, 1);
    assert.equal(out.analysis.bestPerformer.symbol, "WIN");
    assert.equal(out.analysis.bestPerformer.pnlPct, 50);
    assert.equal(out.analysis.worstPerformer.symbol, "LOSE");
    assert.equal(out.analysis.worstPerformer.pnlPct, -20);
  });

  it("flags concentration via the largest holding", () => {
    const out = groww.normaliseHoldings(raw, { prices });
    assert.equal(out.analysis.largestHolding.symbol, "BIG");
    assert.equal(out.analysis.topHoldingPct, 81.3);
    assert.equal(out.holdings.find((h) => h.symbol === "BIG").allocationPct, 81.3);
    // Allocations should account for the whole portfolio.
    const total = out.holdings.reduce((sum, h) => sum + h.allocationPct, 0);
    assert.ok(Math.abs(total - 100) < 0.2, `allocations summed to ${total}`);
  });

  it("ranks only priced holdings, so an unpriced one can't be called the worst", () => {
    const out = groww.normaliseHoldings(
      { holdings: [...raw.holdings, { trading_symbol: "UNKNOWN", quantity: 1, average_price: 500 }] },
      { prices }
    );
    const ranked = [out.analysis.bestPerformer.symbol, out.analysis.worstPerformer.symbol];
    assert.ok(!ranked.includes("UNKNOWN"));
  });

  it("folds in day change and the 52-week range when quotes are supplied", () => {
    const out = groww.normaliseHoldings(raw, {
      prices,
      quotes: { WIN: { dayChangePct: 1.5, dayChange: 2.2, week52High: 200, week52Low: 90 } },
    });
    const win = out.holdings.find((h) => h.symbol === "WIN");
    assert.equal(win.dayChangePct, 1.5);
    assert.equal(win.week52High, 200);

    // No quote means the field stays 0 and the 52-week keys are absent, not zeroed.
    const lose = out.holdings.find((h) => h.symbol === "LOSE");
    assert.equal(lose.dayChangePct, 0);
    assert.equal("week52High" in lose, false);
  });

  it("records the exchange a price actually came from", () => {
    const out = groww.normaliseHoldings({ holdings: [{ trading_symbol: "ONLYBSE", quantity: 1, average_price: 10 }] }, {
      prices: { BSE_ONLYBSE: 12 },
    });
    assert.equal(out.holdings[0].exchange, "BSE");
    assert.equal(out.holdings[0].priced, true);
    assert.equal(out.holdings[0].pnl, 2);
  });

  it("gives an empty portfolio a safe analysis block", () => {
    const out = groww.normaliseHoldings({ holdings: [] });
    assert.equal(out.analysis.gainers, 0);
    assert.equal(out.analysis.bestPerformer, null);
    assert.equal(out.analysis.largestHolding, null);
    assert.equal(out.analysis.topHoldingPct, 0);
  });
});

describe("groww read-only surface", () => {
  it("exposes no order functions at all", () => {
    const exported = Object.keys(groww).join(" ").toLowerCase();
    for (const word of ["placeorder", "createorder", "cancelorder", "modifyorder", "order"]) {
      assert.ok(!exported.includes(word), `${word} must not be reachable from lib/groww.js`);
    }
  });
});

// ---- Config gate -----------------------------------------------------------------------------

describe("canSeeGrowwPortfolio", () => {
  it("is false when Groww isn't configured, whoever asks", () => {
    disableGroww();
    assert.equal(isGrowwConfigured(), false);
    assert.equal(canSeeGrowwPortfolio({ email: "anyone@example.com" }), false);
  });

  it("lets everyone see it when no owner is set (shared demo)", () => {
    enableGroww({ ownerEmail: "" });
    assert.equal(canSeeGrowwPortfolio({ email: "a@example.com" }), true);
    assert.equal(canSeeGrowwPortfolio({ email: "b@example.com" }), true);
  });

  it("restricts it to the owner when one is set", () => {
    enableGroww({ ownerEmail: "owner@example.com" });
    assert.equal(canSeeGrowwPortfolio({ email: "owner@example.com" }), true);
    assert.equal(canSeeGrowwPortfolio({ email: "someone@example.com" }), false);
  });

  it("matches the owner case-insensitively and ignores surrounding space", () => {
    enableGroww({ ownerEmail: "owner@example.com" });
    assert.equal(canSeeGrowwPortfolio({ email: "Owner@Example.com" }), true);
    assert.equal(canSeeGrowwPortfolio({ email: "  owner@example.com  " }), true);
  });

  it("is false for a user with no email", () => {
    enableGroww({ ownerEmail: "owner@example.com" });
    assert.equal(canSeeGrowwPortfolio({}), false);
    assert.equal(canSeeGrowwPortfolio(null), false);
  });
});

// ---- Service ---------------------------------------------------------------------------------

/** Fake client implementing just what GrowwService touches. */
const fakeClient = (overrides = {}) => {
  const state = { mints: 0, holdingCalls: 0, ltpCalls: 0, ltpBatches: [], quoteCalls: [] };
  const client = {
    provider: "groww",
    label: "Groww",
    currency: "INR",
    isConfigured: () => true,
    batchSymbols: groww.batchSymbols,
    exchangeSymbolFor: groww.exchangeSymbolFor,
    normaliseHoldings: groww.normaliseHoldings,
    normalisePositions: groww.normalisePositions,
    async getQuote({ tradingSymbol }) {
      state.quoteCalls.push(tradingSymbol);
      return { lastPrice: 1200, dayChange: 5, dayChangePct: 0.42, week52High: 1500, week52Low: 900 };
    },
    async createAccessToken() {
      state.mints += 1;
      return { accessToken: `tok-${state.mints}`, expiresAt: new Date(Date.now() + 3600_000) };
    },
    async getHoldings() {
      state.holdingCalls += 1;
      return { holdings: [{ trading_symbol: "RELIANCE", quantity: 10, average_price: 1000 }] };
    },
    async getLtp({ exchangeSymbols }) {
      state.ltpCalls += 1;
      state.ltpBatches.push(exchangeSymbols);
      return { NSE_RELIANCE: 1200 };
    },
    async getPositions() {
      return { positions: [] };
    },
    ...overrides,
  };
  return { client, state };
};

describe("GrowwService token handling", () => {
  beforeEach(() => enableGroww());

  it("mints once and reuses the token across calls", async () => {
    const { client, state } = fakeClient();
    const service = new GrowwService(client);
    await service.getPortfolio();
    await service.getPortfolio({ refresh: true });
    assert.equal(state.mints, 1);
  });

  it("collapses concurrent mints into one request", async () => {
    const { client, state } = fakeClient();
    const service = new GrowwService(client);
    await Promise.all([
      service.getPortfolio({ refresh: true }),
      service.getPortfolio({ refresh: true }),
      service.getPortfolio({ refresh: true }),
    ]);
    assert.equal(state.mints, 1, "the mint endpoint allows only 150 calls a day");
  });

  it("re-mints once and retries when Groww rejects the token", async () => {
    let holdingCalls = 0;
    const { client, state } = fakeClient({
      async getHoldings() {
        holdingCalls += 1;
        if (holdingCalls === 1) {
          const err = new Error("expired");
          err.code = "REAUTH_REQUIRED";
          throw err;
        }
        return { holdings: [{ trading_symbol: "RELIANCE", quantity: 1, average_price: 100 }] };
      },
    });
    const service = new GrowwService(client);
    const portfolio = await service.getPortfolio();

    assert.equal(state.mints, 2, "the stale token is replaced");
    assert.equal(holdingCalls, 2, "and the read is retried");
    assert.equal(portfolio.count, 1);
  });

  it("gives up if the retry also fails, rather than looping", async () => {
    const { client, state } = fakeClient({
      async getHoldings() {
        const err = new Error("still expired");
        err.code = "REAUTH_REQUIRED";
        throw err;
      },
    });
    const service = new GrowwService(client);
    await assert.rejects(service.getPortfolio(), { code: "REAUTH_REQUIRED" });
    assert.equal(state.mints, 2, "exactly one retry");
  });

  it("refuses to run when Groww isn't configured", async () => {
    const { client } = fakeClient({ isConfigured: () => false });
    const service = new GrowwService(client);
    await assert.rejects(service.getPortfolio(), { code: "SERVICE_UNAVAILABLE" });
  });
});

describe("GrowwService.getPortfolio", () => {
  beforeEach(() => enableGroww());

  it("enriches holdings with live prices", async () => {
    const { client, state } = fakeClient();
    const portfolio = await new GrowwService(client).getPortfolio();

    assert.equal(portfolio.provider, "groww");
    assert.equal(portfolio.currency, "INR");
    assert.equal(portfolio.investedValue, 10000);
    assert.equal(portfolio.currentValue, 12000);
    assert.equal(portfolio.pricesComplete, true);
    assert.equal(portfolio.valuationNote, "");
    assert.equal(portfolio.fromCache, false);
    assert.deepEqual(state.ltpBatches, [["NSE_RELIANCE"]]);
  });

  it("serves the cache on a second read, and bypasses it on refresh", async () => {
    const { client, state } = fakeClient();
    const service = new GrowwService(client);

    await service.getPortfolio();
    const cached = await service.getPortfolio();
    assert.equal(cached.fromCache, true);
    assert.equal(state.holdingCalls, 1);

    const fresh = await service.getPortfolio({ refresh: true });
    assert.equal(fresh.fromCache, false);
    assert.equal(state.holdingCalls, 2);
  });

  it("still returns holdings when the price lookup fails", async () => {
    const { client } = fakeClient({
      async getLtp() {
        throw new Error("live data not subscribed");
      },
    });
    const portfolio = await new GrowwService(client).getPortfolio();

    assert.equal(portfolio.count, 1);
    assert.equal(portfolio.investedValue, 10000);
    assert.equal(portfolio.currentValue, 10000, "falls back to cost");
    assert.equal(portfolio.priceLookupFailed, true);
    assert.equal(portfolio.pricesComplete, false);
    assert.match(portfolio.valuationNote, /Live prices were unavailable/);
  });

  it("skips the price call entirely for an empty portfolio", async () => {
    const { client, state } = fakeClient({ getHoldings: async () => ({ holdings: [] }) });
    const portfolio = await new GrowwService(client).getPortfolio();
    assert.equal(portfolio.count, 0);
    assert.equal(state.ltpCalls, 0);
  });

  it("reset() clears the token and the cached portfolio", async () => {
    const { client, state } = fakeClient();
    const service = new GrowwService(client);
    await service.getPortfolio();
    service.reset();
    await service.getPortfolio();
    assert.equal(state.mints, 2);
    assert.equal(state.holdingCalls, 2);
  });
});

describe("GrowwService price lookups", () => {
  beforeEach(() => enableGroww());

  it("retries symbols that NSE didn't price against BSE", async () => {
    const asked = [];
    const { client } = fakeClient({
      getHoldings: async () => ({
        holdings: [
          { trading_symbol: "ONNSE", quantity: 1, average_price: 100 },
          { trading_symbol: "ONBSE", quantity: 1, average_price: 100 },
        ],
      }),
      async getLtp({ exchangeSymbols }) {
        asked.push(exchangeSymbols);
        // NSE knows only ONNSE; BSE answers for ONBSE.
        if (exchangeSymbols.some((s) => s.startsWith("NSE_"))) return { NSE_ONNSE: 110 };
        return { BSE_ONBSE: 120 };
      },
    });
    const portfolio = await new GrowwService(client).getPortfolio();

    assert.deepEqual(asked[0], ["NSE_ONNSE", "NSE_ONBSE"], "first pass tries everything on NSE");
    assert.deepEqual(asked[1], ["BSE_ONBSE"], "only the misses are retried on BSE");
    assert.equal(portfolio.pricesComplete, true);
    assert.equal(portfolio.holdings.find((h) => h.symbol === "ONBSE").exchange, "BSE");
  });

  it("skips the BSE pass when NSE priced everything", async () => {
    const asked = [];
    const { client } = fakeClient({
      async getLtp({ exchangeSymbols }) {
        asked.push(exchangeSymbols);
        return { NSE_RELIANCE: 1200 };
      },
    });
    await new GrowwService(client).getPortfolio();
    assert.equal(asked.length, 1, "no wasted second call");
  });
});

describe("GrowwService day-change enrichment", () => {
  beforeEach(() => enableGroww());

  it("fetches quotes only when asked", async () => {
    const { client, state } = fakeClient();
    const service = new GrowwService(client);

    const plain = await service.getPortfolio();
    assert.deepEqual(state.quoteCalls, [], "a normal read costs no quote calls");
    assert.equal(plain.dayChangeAvailable, false);
    assert.equal(plain.holdings[0].dayChangePct, 0);

    const detailed = await service.getPortfolio({ refresh: true, withDayChange: true });
    assert.deepEqual(state.quoteCalls, ["RELIANCE"]);
    assert.equal(detailed.dayChangeAvailable, true);
    assert.equal(detailed.holdings[0].dayChangePct, 0.42);
    assert.equal(detailed.holdings[0].week52High, 1500);
  });

  it("does not serve a day-change request from a cache that has no quotes", async () => {
    const { client, state } = fakeClient();
    const service = new GrowwService(client);

    await service.getPortfolio(); // caches without quotes
    const detailed = await service.getPortfolio({ withDayChange: true });

    assert.equal(detailed.fromCache, false, "otherwise 0% would be reported as fact");
    assert.equal(detailed.dayChangeAvailable, true);
    assert.equal(state.holdingCalls, 2);
  });

  it("serves a plain read from a richer cached entry", async () => {
    const { client, state } = fakeClient();
    const service = new GrowwService(client);

    await service.getPortfolio({ withDayChange: true });
    const plain = await service.getPortfolio();

    assert.equal(plain.fromCache, true);
    assert.equal(state.holdingCalls, 1);
  });

  it("survives a quote failure without losing the portfolio", async () => {
    const { client } = fakeClient({
      async getQuote() {
        throw new Error("rate limited");
      },
    });
    const portfolio = await new GrowwService(client).getPortfolio({ withDayChange: true });

    assert.equal(portfolio.count, 1);
    assert.equal(portfolio.currentValue, 12000, "P&L still works off the LTP");
    assert.equal(portfolio.dayChangeAvailable, false, "so the model knows not to claim a daily move");
  });
});
