import "./helpers.js";
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import request from "supertest";
import { buildApp, otherPrivateKey, signSessionToken, testSigningKey } from "./helpers.js";

let app;
before(async () => {
  app = await buildApp();
});

describe("public routes", () => {
  it("GET /health → 200 envelope", async () => {
    const res = await request(app).get("/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, "healthy");
  });

  it("unknown route → 404 NOT_FOUND envelope", async () => {
    const res = await request(app).get("/api/v1/does-not-exist");
    assert.equal(res.status, 404);
    assert.deepEqual(res.body.success, false);
    assert.equal(res.body.error.code, "NOT_FOUND");
  });
});

describe("auth guard", () => {
  // Every route that reads or writes user data must be here. A missing entry is how a finance
  // endpoint quietly ships without `protect`.
  for (const [method, path] of [
    ["get", "/api/v1/auth/me"],
    ["post", "/api/v1/auth/sync"],
    ["patch", "/api/v1/users/me"],
    ["delete", "/api/v1/users/me"],
    ["put", "/api/v1/users/me/onboarding"],
    ["get", "/api/v1/admin/users"],
    ["post", "/api/v1/ai/chat"],

    // Money
    ["get", "/api/v1/finance/summary"],
    ["get", "/api/v1/finance/series"],
    ["get", "/api/v1/finance/transactions"],
    ["post", "/api/v1/finance/transactions"],
    ["patch", "/api/v1/finance/transactions/000000000000000000000000"],
    ["delete", "/api/v1/finance/transactions/000000000000000000000000"],
    ["get", "/api/v1/finance/accounts"],
    ["post", "/api/v1/finance/accounts"],
    ["patch", "/api/v1/finance/accounts/000000000000000000000000"],
    ["delete", "/api/v1/finance/accounts/000000000000000000000000"],
    ["get", "/api/v1/finance/budgets"],
    ["put", "/api/v1/finance/budgets"],
    ["post", "/api/v1/finance/budgets/copy-previous"],
    ["delete", "/api/v1/finance/budgets/food"],
    ["get", "/api/v1/finance/goals"],
    ["post", "/api/v1/finance/goals"],
    ["patch", "/api/v1/finance/goals/000000000000000000000000"],
    ["post", "/api/v1/finance/goals/000000000000000000000000/contribute"],
    ["delete", "/api/v1/finance/goals/000000000000000000000000"],

    // Voice capture
    ["get", "/api/v1/finance/voice/capabilities"],
    ["post", "/api/v1/finance/voice"],
    ["post", "/api/v1/finance/parse"],

    // Linked accounts (provider-generic)
    ["get", "/api/v1/integrations"],
    ["get", "/api/v1/integrations/zerodha"],
    ["get", "/api/v1/integrations/zerodha/login-url"],
    ["delete", "/api/v1/integrations/zerodha"],
    ["get", "/api/v1/integrations/upstox"],
    ["get", "/api/v1/integrations/upstox/login-url"],
    ["delete", "/api/v1/integrations/upstox"],
  ]) {
    it(`${method.toUpperCase()} ${path} without a token → 401`, async () => {
      const res = await request(app)[method](path);
      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, "UNAUTHORIZED");
    });
  }

  it("rejects a malformed bearer token → 401", async () => {
    const res = await request(app).get("/api/v1/auth/me").set("Authorization", "Bearer not-a-jwt");
    assert.equal(res.status, 401);
  });

  it("rejects a JWT signed by a different key → 401", async () => {
    const token = signSessionToken(otherPrivateKey);
    const res = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 401);
  });

  it("rejects an expired JWT → 401", async () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    const token = signSessionToken(testSigningKey, { iat: past - 60, nbf: past - 60, exp: past });
    const res = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 401);
  });
});

describe("request parsing", () => {
  it("malformed JSON → 400", async () => {
    const res = await request(app)
      .post("/api/v1/ai/chat")
      .set("Content-Type", "application/json")
      .send("{not json");
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "BAD_REQUEST");
  });
});

describe("broker callback", () => {
  // Public on purpose — the broker's browser redirect carries no Clerk session. Authenticity comes
  // from the signed `state`, so a request without one must not be trusted, and must still land the
  // user back in the app rather than on an error page.
  it("is reachable without a session", async () => {
    const res = await request(app).get("/api/v1/integrations/zerodha/callback");
    assert.notEqual(res.status, 401);
  });

  it("redirects into the app instead of erroring when the state is missing or forged", async () => {
    for (const path of [
      "/api/v1/integrations/zerodha/callback?request_token=abc&state=forged.signature",
      "/api/v1/integrations/upstox/callback?code=abc&state=forged.signature",
      "/api/v1/integrations/upstox/callback",
    ]) {
      const res = await request(app).get(path);
      assert.equal(res.status, 302);
      assert.match(res.headers.location, /^wariku:\/\/broker-callback\?/);
      assert.match(res.headers.location, /status=(link_expired|cancelled)/);
    }
  });

  it("redirects an unknown provider back into the app too", async () => {
    const res = await request(app).get("/api/v1/integrations/robinhood/callback?state=x");
    assert.equal(res.status, 302);
    assert.match(res.headers.location, /^wariku:\/\/broker-callback\?/);
  });
});

describe("clerk webhook", () => {
  it("rejects unsigned payloads → 400", async () => {
    const res = await request(app)
      .post("/api/v1/webhooks/clerk")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ type: "user.created", data: { id: "user_1" } }));
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "BAD_SIGNATURE");
  });
});

describe("missing Clerk config", () => {
  it("API routes → 503 instead of crashing", async () => {
    const { config } = await import("../config/index.js");
    const saved = { ...config.clerk };
    config.clerk.secretKey = undefined;
    try {
      const unconfigured = await buildApp();
      const res = await request(unconfigured).get("/api/v1/auth/me");
      assert.equal(res.status, 503);
      assert.equal(res.body.error.code, "SERVICE_UNAVAILABLE");
      assert.equal((await request(unconfigured).get("/health")).status, 200);
    } finally {
      Object.assign(config.clerk, saved);
    }
  });
});
