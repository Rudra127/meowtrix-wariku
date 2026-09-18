import "./helpers.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { decryptSecret, encryptSecret, signState, verifyState } from "../lib/crypto.js";
import { accessTokenExpiry, buildLoginUrl, createSession, getHoldings, sessionChecksum } from "../lib/kite.js";
import * as kite from "../lib/kite.js";
import * as upstox from "../lib/upstox.js";
import BrokerageService from "../services/brokerage-service.js";
import { PROVIDERS, brokerageFor, brokerages } from "../services/brokerages.js";

const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const user = { _id: "507f1f77bcf86cd799439011", currency: "INR", timezone: "Asia/Kolkata" };

/** In-memory IntegrationRepository. */
const fakeRepo = (initial = null) => {
  let doc = initial;
  return {
    get doc() {
      return doc;
    },
    async find() {
      return doc;
    },
    async upsert(_userId, provider, fields) {
      doc = { userId: _userId, provider, cache: {}, ...fields };
      return doc;
    },
    async update(_userId, _provider, updates) {
      doc = { ...(doc ?? {}), ...updates };
      return doc;
    },
    async markExpired(_userId, _provider, reason) {
      doc = { ...(doc ?? {}), status: "expired", accessToken: "", lastError: reason, cache: {} };
      return doc;
    },
    async cacheResponse(_userId, _provider, key, payload) {
      doc = { ...doc, cache: { ...doc.cache, [key]: { payload, at: new Date() } } };
      return doc;
    },
    async remove() {
      doc = null;
      return { ok: 1 };
    },
    async deleteAllForUser() {
      doc = null;
      return 1;
    },
  };
};

describe("token encryption at rest", () => {
  it("round-trips a secret", () => {
    const token = "kite_access_token_abc123";
    const sealed = encryptSecret(token);
    assert.notEqual(sealed, token);
    assert.ok(!sealed.includes(token), "plaintext must not be recoverable by eye");
    assert.equal(decryptSecret(sealed), token);
  });

  it("produces a different ciphertext every time (random nonce)", () => {
    const a = encryptSecret("same-secret");
    const b = encryptSecret("same-secret");
    assert.notEqual(a, b);
    assert.equal(decryptSecret(a), decryptSecret(b));
  });

  it("is versioned so the scheme can be rotated later", () => {
    assert.ok(encryptSecret("x").startsWith("v1."));
  });

  it("returns null rather than throwing on tampered or unreadable input", () => {
    const sealed = encryptSecret("secret");
    const [version, iv, tag, ct] = sealed.split(".");
    for (const bad of [
      "",
      "not-a-token",
      `${version}.${iv}.${tag}`, // truncated
      `v2.${iv}.${tag}.${ct}`, // unknown version
      `${version}.${iv}.${tag}.${Buffer.from("tampered").toString("base64url")}`, // bad ciphertext
      null,
      undefined,
    ]) {
      assert.equal(decryptSecret(bad), null, `${bad} should not decrypt`);
    }
  });

  it("detects a flipped authentication tag", () => {
    const [version, iv, , ct] = encryptSecret("secret").split(".");
    const forgedTag = Buffer.alloc(16, 7).toString("base64url");
    assert.equal(decryptSecret(`${version}.${iv}.${forgedTag}.${ct}`), null);
  });
});

describe("signed OAuth state", () => {
  it("round-trips a payload", () => {
    const token = signState({ uid: "user1", p: "zerodha" });
    const payload = verifyState(token);
    assert.equal(payload.uid, "user1");
    assert.equal(payload.p, "zerodha");
  });

  it("rejects a forged signature", () => {
    const [body] = signState({ uid: "user1" }).split(".");
    assert.equal(verifyState(`${body}.deadbeef`), null);
  });

  it("rejects a tampered payload", () => {
    const token = signState({ uid: "victim" });
    const [, signature] = token.split(".");
    const swapped = Buffer.from(JSON.stringify({ uid: "attacker", exp: 9_999_999_999 })).toString("base64url");
    assert.equal(verifyState(`${swapped}.${signature}`), null);
  });

  it("rejects an expired token", () => {
    assert.equal(verifyState(signState({ uid: "user1" }, -1)), null);
  });

  it("rejects malformed input", () => {
    for (const bad of ["", "nodot", null, undefined, 42]) assert.equal(verifyState(bad), null);
  });
});

describe("Kite Connect client", () => {
  it("computes the checksum Zerodha expects", () => {
    const expected = createHash("sha256").update("apikeyrequesttokenapisecret").digest("hex");
    assert.equal(sessionChecksum("apikey", "requesttoken", "apisecret"), expected);
  });

  it("builds a v3 login URL carrying our state in redirect_params", () => {
    const url = new URL(buildLoginUrl({ apiKey: "abc", state: "signed.state" }));
    assert.equal(url.origin + url.pathname, "https://kite.zerodha.com/connect/login");
    assert.equal(url.searchParams.get("v"), "3");
    assert.equal(url.searchParams.get("api_key"), "abc");
    // Kite has no `state` parameter; it appends redirect_params to the registered redirect URL.
    assert.equal(new URLSearchParams(url.searchParams.get("redirect_params")).get("state"), "signed.state");
  });

  it("exchanges a request token with a form-encoded, checksummed POST", async () => {
    let call;
    const fetchImpl = async (url, init) => {
      call = { url, init };
      return jsonResponse(200, {
        status: "success",
        data: { access_token: "at_123", public_token: "pt_123", user_id: "AB1234", user_name: "Asha" },
      });
    };
    const session = await createSession({ requestToken: "rt_abc", fetchImpl });

    assert.equal(call.url, "https://api.kite.trade/session/token");
    assert.equal(call.init.headers["X-Kite-Version"], "3");
    const body = new URLSearchParams(call.init.body);
    assert.equal(body.get("request_token"), "rt_abc");
    assert.equal(body.get("checksum"), sessionChecksum("kite_test_key", "rt_abc", "kite_test_secret"));
    assert.equal(session.accessToken, "at_123");
    assert.equal(session.userId, "AB1234");
  });

  it("sends the token-scoped Authorization header on reads", async () => {
    let headers;
    const fetchImpl = async (_url, init) => {
      headers = init.headers;
      return jsonResponse(200, { status: "success", data: [] });
    };
    await getHoldings({ accessToken: "at_123", fetchImpl });
    assert.equal(headers.Authorization, "token kite_test_key:at_123");
  });

  it("maps a TokenException to REAUTH_REQUIRED, not a generic failure", async () => {
    const fetchImpl = async () =>
      jsonResponse(403, { status: "error", message: "Invalid access token", error_type: "TokenException" });
    await assert.rejects(getHoldings({ accessToken: "stale", fetchImpl }), {
      code: "REAUTH_REQUIRED",
      statusCode: 409,
    });
  });

  it("maps rate limiting and outages to upstream errors", async () => {
    for (const [status, code] of [
      [429, "UPSTREAM_ERROR"],
      [500, "UPSTREAM_ERROR"],
    ]) {
      const fetchImpl = async () => jsonResponse(status, { status: "error", message: "nope" });
      await assert.rejects(getHoldings({ accessToken: "at", fetchImpl }), { code });
    }
  });

  it("treats a 200 with status:error as a failure", async () => {
    const fetchImpl = async () => jsonResponse(200, { status: "error", message: "Something broke" });
    await assert.rejects(getHoldings({ accessToken: "at", fetchImpl }), { code: "UPSTREAM_ERROR" });
  });

  it("expires the access token at the next 06:00 IST", () => {
    // 10:00 IST on 18 Sep → 06:00 IST on 19 Sep
    const afterSix = accessTokenExpiry(new Date("2026-09-18T04:30:00Z"));
    assert.equal(afterSix.toISOString(), "2026-09-19T00:30:00.000Z");

    // 03:00 IST on 18 Sep (before the cutoff) → 06:00 IST the SAME day
    const beforeSix = accessTokenExpiry(new Date("2026-09-17T21:30:00Z"));
    assert.equal(beforeSix.toISOString(), "2026-09-18T00:30:00.000Z");
  });
});

describe("Upstox client (uniform interface)", () => {
  it("builds a standard OAuth login URL with a real state param", () => {
    const url = new URL(upstox.buildLoginUrl({ state: "signed.state" }));
    assert.equal(url.origin + url.pathname, "https://api.upstox.com/v2/login/authorization/dialog");
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("client_id"), "upstox_test_key");
    assert.equal(url.searchParams.get("state"), "signed.state");
  });

  it("treats a redirect with `error` (or no code) as a cancellation", () => {
    assert.equal(upstox.isCancellation({ error: "access_denied" }), true);
    assert.equal(upstox.isCancellation({}), true);
    assert.equal(upstox.isCancellation({ code: "abc" }), false);
  });

  it("exchanges the code for a token via a form POST, reading the flat access_token", async () => {
    let call;
    const fetchImpl = async (url, init) => {
      call = { url, init };
      return jsonResponse(200, { access_token: "up_at_1", user_id: "UP123", user_name: "Asha", email: "a@b.com" });
    };
    const session = await upstox.exchangeToken({ query: { code: "code_abc" }, fetchImpl });

    assert.equal(call.url, "https://api.upstox.com/v2/login/authorization/token");
    const body = new URLSearchParams(call.init.body);
    assert.equal(body.get("code"), "code_abc");
    assert.equal(body.get("client_id"), "upstox_test_key");
    assert.equal(body.get("client_secret"), "upstox_test_secret");
    assert.equal(body.get("grant_type"), "authorization_code");
    assert.equal(session.accessToken, "up_at_1");
    assert.equal(session.externalUserId, "UP123");
  });

  it("maps a 401 on reads to REAUTH_REQUIRED", async () => {
    const fetchImpl = async () => jsonResponse(401, { status: "error", errors: [{ message: "Invalid token" }] });
    await assert.rejects(upstox.getHoldings({ accessToken: "stale", fetchImpl }), {
      code: "REAUTH_REQUIRED",
      statusCode: 409,
    });
  });

  it("normalises holdings and drops sold-out rows", () => {
    const data = upstox.normaliseHoldings([
      { trading_symbol: "INFY", exchange: "NSE", quantity: 10, average_price: 1_500, last_price: 1_650, pnl: 1_500 },
      { trading_symbol: "TCS", exchange: "NSE", quantity: 0, average_price: 100, last_price: 120 },
    ]);
    assert.equal(data.count, 1);
    assert.equal(data.holdings[0].symbol, "INFY");
    assert.equal(data.investedValue, 15_000);
    assert.equal(data.currentValue, 16_500);
    assert.equal(data.pnlPct, 10);
  });

  it("expires the access token at the next 03:30 IST", () => {
    // 10:00 IST 18 Sep → 03:30 IST 19 Sep (03:30 IST = 22:00 UTC prev day)
    const after = upstox.accessTokenExpiry(new Date("2026-09-18T04:30:00Z"));
    assert.equal(after.toISOString(), "2026-09-18T22:00:00.000Z");
  });
});

// The generic service, exercised through a fake client that follows the uniform contract but
// delegates normalisation to the REAL kite functions — so this covers both layers at once.
describe("BrokerageService (generic)", () => {
  const client = (overrides = {}) => ({
    provider: "zerodha",
    label: "Zerodha",
    currency: "INR",
    isConfigured: () => true,
    buildLoginUrl: ({ state }) => `https://kite.zerodha.com/connect/login?v=3&api_key=k&redirect_params=state%3D${state}`,
    isCancellation: (q) => q.status === "error" || (!q.request_token && !q.code && !q.status),
    exchangeToken: async () => ({
      accessToken: "at_1",
      externalUserId: "AB1234",
      externalUserName: "Asha",
      expiresAt: new Date(Date.now() + 3_600_000),
    }),
    getHoldings: async () => [
      { tradingsymbol: "INFY", exchange: "NSE", quantity: 10, average_price: 1_500, last_price: 1_650, pnl: 1_500 },
      { tradingsymbol: "SOLD", exchange: "NSE", quantity: 0, average_price: 100, last_price: 120 },
    ],
    getPositions: async () => ({ net: [] }),
    normaliseHoldings: kite.normaliseHoldings,
    normalisePositions: kite.normalisePositions,
    invalidateSession: async () => true,
    ...overrides,
  });

  const service = (repo, overrides) => new BrokerageService(client(overrides), { repository: repo });

  const connected = () => ({
    userId: user._id,
    provider: "zerodha",
    status: "connected",
    externalUserId: "AB1234",
    externalUserName: "Asha",
    accessToken: encryptSecret("at_1"),
    expiresAt: new Date(Date.now() + 3_600_000),
    cache: {},
  });

  it("reports not-connected for a fresh user", async () => {
    const status = await service(fakeRepo(null)).getStatus(user);
    assert.equal(status.connected, false);
    assert.equal(status.needsReauth, false);
    assert.equal(status.configured, true);
    assert.equal(status.provider, "zerodha");
  });

  it("never leaks the access token in the status shape", async () => {
    const status = await service(fakeRepo(connected())).getStatus(user);
    assert.equal(status.connected, true);
    assert.equal(status.brokerUserId, "AB1234");
    assert.ok(!JSON.stringify(status).includes("at_1"));
    assert.equal(status.accessToken, undefined);
  });

  it("reports needsReauth once the token is past its expiry", async () => {
    const stale = { ...connected(), expiresAt: new Date(Date.now() - 1000) };
    const status = await service(fakeRepo(stale)).getStatus(user);
    assert.equal(status.connected, false);
    assert.equal(status.needsReauth, true);
  });

  it("stores the access token encrypted after a successful callback", async () => {
    const repo = fakeRepo(null);
    const state = signState({ uid: user._id.toString(), p: "zerodha" });

    const result = await service(repo).handleCallback({ request_token: "rt_1", state });

    assert.equal(result.ok, true);
    assert.match(result.redirect, /^wariku:\/\/broker-callback\?/);
    assert.match(result.redirect, /provider=zerodha/);
    assert.match(result.redirect, /status=connected/);
    assert.notEqual(repo.doc.accessToken, "at_1");
    assert.equal(decryptSecret(repo.doc.accessToken), "at_1");
    assert.equal(repo.doc.status, "connected");
  });

  it("refuses a callback whose state is forged, and stores nothing", async () => {
    const repo = fakeRepo(null);
    const result = await service(repo).handleCallback({ request_token: "rt_1", state: "forged.sig" });
    assert.equal(result.ok, false);
    assert.match(result.redirect, /status=link_expired/);
    assert.equal(repo.doc, null);
  });

  it("refuses a callback whose state has expired", async () => {
    const expired = signState({ uid: user._id.toString(), p: "zerodha" }, -1);
    const result = await service(fakeRepo(null)).handleCallback({ request_token: "rt_1", state: expired });
    assert.equal(result.ok, false);
    assert.match(result.redirect, /status=link_expired/);
  });

  it("handles the user cancelling at the broker", async () => {
    const state = signState({ uid: user._id.toString(), p: "zerodha" });
    const result = await service(fakeRepo(connected())).handleCallback({ state, status: "error" });
    assert.equal(result.ok, false);
    assert.match(result.redirect, /status=cancelled/);
  });

  it("reports a failed token exchange without throwing", async () => {
    const state = signState({ uid: user._id.toString(), p: "zerodha" });
    const failing = {
      exchangeToken: async () => {
        const { UpstreamError } = await import("../utils/index.js");
        throw new UpstreamError("Invalid checksum");
      },
    };
    const result = await service(fakeRepo(null), failing).handleCallback({ request_token: "rt", state });
    assert.equal(result.ok, false);
    assert.match(result.redirect, /status=failed/);
  });

  it("normalises holdings with totals and drops sold-out rows", async () => {
    const data = await service(fakeRepo(connected())).getHoldings(user);
    assert.equal(data.provider, "zerodha");
    assert.equal(data.count, 1);
    assert.equal(data.holdings[0].symbol, "INFY");
    assert.equal(data.investedValue, 15_000);
    assert.equal(data.currentValue, 16_500);
    assert.equal(data.pnl, 1_500);
    assert.equal(data.pnlPct, 10);
    assert.equal(data.currency, "INR");
  });

  it("asks the user to connect when no link exists", async () => {
    await assert.rejects(service(fakeRepo(null)).getHoldings(user), { code: "BAD_REQUEST" });
  });

  it("asks the user to reconnect when the token has expired, and clears it", async () => {
    const repo = fakeRepo({ ...connected(), expiresAt: new Date(Date.now() - 1000) });
    await assert.rejects(service(repo).getHoldings(user), { code: "REAUTH_REQUIRED" });
    assert.equal(repo.doc.status, "expired");
    assert.equal(repo.doc.accessToken, "");
  });

  it("asks the user to reconnect when the stored token can't be decrypted (key rotated)", async () => {
    const repo = fakeRepo({ ...connected(), accessToken: "v1.aaaa.bbbb.cccc" });
    await assert.rejects(service(repo).getHoldings(user), { code: "REAUTH_REQUIRED" });
    assert.equal(repo.doc.status, "expired");
  });

  it("serves the second identical request from cache", async () => {
    let calls = 0;
    const repo = fakeRepo(connected());
    const svc = service(repo, {
      getHoldings: async () => {
        calls += 1;
        return [];
      },
    });
    const first = await svc.getHoldings(user);
    const second = await svc.getHoldings(user);
    assert.equal(calls, 1, "a chat follow-up must not re-hit the broker");
    assert.equal(first.fromCache, false);
    assert.equal(second.fromCache, true);
  });

  it("bypasses the cache when asked to refresh", async () => {
    let calls = 0;
    const svc = service(fakeRepo(connected()), {
      getHoldings: async () => {
        calls += 1;
        return [];
      },
    });
    await svc.getHoldings(user);
    await svc.getHoldings(user, { refresh: true });
    assert.equal(calls, 2);
  });

  it("marks the link expired when the broker rejects the token mid-session", async () => {
    const repo = fakeRepo(connected());
    const svc = service(repo, {
      getHoldings: async () => {
        const { ReauthRequiredError } = await import("../utils/index.js");
        throw new ReauthRequiredError("expired");
      },
    });
    await assert.rejects(svc.getHoldings(user), { code: "REAUTH_REQUIRED" });
    assert.equal(repo.doc.status, "expired");
  });

  it("clears the link on disconnect, and is a no-op when nothing is linked", async () => {
    const repo = fakeRepo(connected());
    assert.equal((await service(repo).disconnect(user)).disconnected, true);
    assert.equal(repo.doc, null);
    assert.equal((await service(fakeRepo(null)).disconnect(user)).disconnected, true);
  });
});

describe("brokerages registry", () => {
  it("lists Upstox (free) first, then Zerodha", () => {
    assert.deepEqual(PROVIDERS, ["upstox", "zerodha"]);
    assert.equal(brokerages[0].provider, "upstox");
  });

  it("resolves a provider id to its service, and null for the unknown", () => {
    assert.equal(brokerageFor("upstox").label, "Upstox");
    assert.equal(brokerageFor("zerodha").label, "Zerodha");
    assert.equal(brokerageFor("robinhood"), null);
  });
});
