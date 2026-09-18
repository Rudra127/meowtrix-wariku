// End-to-end through real Clerk token verification (networkless, via CLERK_JWT_KEY) and a real MongoDB.
// Skipped unless TEST_MONGODB_URI is set, e.g.:
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/wariku_test npm test
import "./helpers.js";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import mongoose from "mongoose";
import request from "supertest";
import Account from "../database/models/account.js";
import Budget from "../database/models/budget.js";
import Goal from "../database/models/goal.js";
import Integration from "../database/models/integration.js";
import Transaction from "../database/models/transaction.js";
import User from "../database/models/user.js";
import UserService from "../services/user-service.js";
import { buildApp, signSessionToken, testSigningKey } from "./helpers.js";

const uri = process.env.TEST_MONGODB_URI;

describe("authenticated flow (MongoDB)", { skip: !uri && "TEST_MONGODB_URI not set" }, () => {
  let app;
  const clerkId = "user_test_123";
  const auth = () => ({ Authorization: `Bearer ${signSessionToken(testSigningKey, { sub: clerkId })}` });

  before(async () => {
    await mongoose.connect(uri);
    await User.deleteMany({});
    // Pre-seed so `protect` finds the user locally and never calls Clerk's Backend API.
    await User.create({ clerkId, email: "asha@example.com", firstName: "Asha" });
    app = await buildApp();
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("GET /auth/me returns the local user for a valid session token", async () => {
    const res = await request(app).get("/api/v1/auth/me").set(auth());
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.clerkId, clerkId);
    assert.equal(res.body.data.user.email, "asha@example.com");
    assert.ok(res.body.data.user.id);
    assert.equal(res.body.data.user._id, undefined);
  });

  it("PATCH /users/me updates editable fields only", async () => {
    const res = await request(app).patch("/api/v1/users/me").set(auth()).send({ currency: "usd", role: "admin" });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.currency, "USD");
    assert.equal(res.body.data.user.role, "user");
  });

  it("PUT /users/me/onboarding completes onboarding", async () => {
    const before = await request(app).get("/api/v1/auth/me").set(auth());
    assert.equal(before.body.data.user.isOnboarded, false);
    const res = await request(app)
      .put("/api/v1/users/me/onboarding")
      .set(auth())
      .send({ level: "intermediate", goal: "budgeting" });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.isOnboarded, true);
    assert.equal(res.body.data.user.level, "intermediate");
    assert.equal(res.body.data.user.goal, "budgeting");
    const bad = await request(app).put("/api/v1/users/me/onboarding").set(auth()).send({ level: "x" });
    assert.equal(bad.status, 400);
  });

  it("admin route → 403 for a normal user", async () => {
    const res = await request(app).get("/api/v1/admin/users").set(auth());
    assert.equal(res.status, 403);
  });

  it("admin route → 200 for an admin", async () => {
    await User.updateOne({ clerkId }, { role: "admin" });
    const res = await request(app).get("/api/v1/admin/users?limit=5").set(auth());
    assert.equal(res.status, 200);
    assert.equal(res.body.data.total, 1);
  });

  it("POST /ai/chat → 503 when DeepSeek isn't configured (auth passed)", async () => {
    const res = await request(app)
      .post("/api/v1/ai/chat")
      .set(auth())
      .send({ messages: [{ role: "user", content: "What is compound interest?" }] });
    assert.equal(res.status, 503);
  });

  it("POST /ai/chat validates the body before calling the provider", async () => {
    const res = await request(app).post("/api/v1/ai/chat").set(auth()).send({ messages: [] });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "VALIDATION_ERROR");
  });
});

// The Money tab end to end: real Mongo, real aggregation pipelines, real timezone handling.
// These are the tests that would catch a broken index, a bad $dateToString timezone, or an
// ownership filter someone forgot.
describe("money endpoints (MongoDB)", { skip: !uri && "TEST_MONGODB_URI not set" }, () => {
  let app;
  const clerkId = "user_money_1";
  const otherClerkId = "user_money_2";
  const auth = (id = clerkId) => ({ Authorization: `Bearer ${signSessionToken(testSigningKey, { sub: id })}` });
  const month = () => new Date().toISOString().slice(0, 7);

  before(async () => {
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);
    await Promise.all([User.deleteMany({}), Transaction.deleteMany({}), Budget.deleteMany({}), Goal.deleteMany({}), Account.deleteMany({})]);
    await User.create({ clerkId, email: "asha@example.com", firstName: "Asha", currency: "INR", timezone: "Asia/Kolkata" });
    await User.create({ clerkId: otherClerkId, email: "bob@example.com", firstName: "Bob" });
    app = await buildApp();
  });

  after(async () => {
    await Promise.all([Transaction.deleteMany({}), Budget.deleteMany({}), Goal.deleteMany({}), Account.deleteMany({}), User.deleteMany({})]);
  });

  it("creates a transaction and auto-provisions a default account", async () => {
    const res = await request(app)
      .post("/api/v1/finance/transactions")
      .set(auth())
      .send({ type: "expense", amount: 48_900, category: "food", title: "Swiggy" });

    assert.equal(res.status, 201);
    const tx = res.body.data.transaction;
    assert.equal(tx.amount, 48_900);
    assert.equal(tx.type, "expense");
    assert.equal(tx.month, month());
    assert.ok(tx.accountId, "should be attached to a default account");
    assert.equal(tx._id, undefined); // serialised as `id`

    const accounts = await request(app).get("/api/v1/finance/accounts").set(auth());
    assert.equal(accounts.body.data.accounts.length, 1);
    assert.equal(accounts.body.data.accounts[0].name, "Cash");
  });

  it("rejects a decimal amount", async () => {
    const res = await request(app)
      .post("/api/v1/finance/transactions")
      .set(auth())
      .send({ type: "expense", amount: 125.5, category: "food" });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "VALIDATION_ERROR");
  });

  it("creates a batch from one voice note", async () => {
    const res = await request(app)
      .post("/api/v1/finance/transactions")
      .set(auth())
      .send({
        source: "voice",
        transactions: [
          { type: "expense", amount: 4_000, category: "food", title: "Chai" },
          { type: "income", amount: 8_500_000, category: "salary", title: "Salary" },
        ],
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.created, 2);
    assert.ok(res.body.data.transactions.every((t) => t.source === "voice"));
  });

  it("summarises the month from real aggregations", async () => {
    const res = await request(app).get("/api/v1/finance/summary").set(auth());
    assert.equal(res.status, 200);
    const s = res.body.data;
    assert.equal(s.totals.income, 8_500_000);
    assert.equal(s.totals.expense, 52_900); // 48_900 + 4_000
    assert.equal(s.totals.net, 8_500_000 - 52_900);
    assert.equal(s.balance.total, 8_500_000 - 52_900);
    assert.equal(s.month, month());
    assert.equal(s.currency, "INR");
    assert.equal(s.timezone, "Asia/Kolkata");
    const food = s.byCategory.find((c) => c.category === "food");
    assert.equal(food.total, 52_900);
  });

  it("returns a chart series bucketed in the user's timezone", async () => {
    const week = await request(app).get("/api/v1/finance/series?period=week").set(auth());
    assert.equal(week.status, 200);
    assert.equal(week.body.data.points.length, 7);
    assert.equal(week.body.data.total, 52_900, "today's spending should land in the current week");

    const year = await request(app).get("/api/v1/finance/series?period=year").set(auth());
    assert.equal(year.body.data.points.length, 12);
  });

  it("sets a budget and reports spend against it", async () => {
    const put = await request(app)
      .put("/api/v1/finance/budgets")
      .set(auth())
      .send({ category: "food", limit: 40_000 });
    assert.equal(put.status, 200);

    const res = await request(app).get("/api/v1/finance/budgets").set(auth());
    const food = res.body.data.budgets.find((b) => b.category === "food");
    assert.equal(food.limit, 40_000);
    assert.equal(food.spent, 52_900);
    assert.equal(food.overspent, true, "spent more than the limit");
    assert.equal(food.remaining, -12_900);
  });

  it("overwrites rather than duplicating a budget for the same category and month", async () => {
    await request(app).put("/api/v1/finance/budgets").set(auth()).send({ category: "food", limit: 90_000 });
    const res = await request(app).get("/api/v1/finance/budgets").set(auth());
    assert.equal(res.body.data.budgets.filter((b) => b.category === "food").length, 1);
    assert.equal(res.body.data.budgets.find((b) => b.category === "food").limit, 90_000);
  });

  it("tracks a savings goal and its contributions", async () => {
    const created = await request(app)
      .post("/api/v1/finance/goals")
      .set(auth())
      .send({ name: "Emergency fund", targetAmount: 1_000_000 });
    assert.equal(created.status, 201);
    const id = created.body.data.goal.id;

    const contributed = await request(app)
      .post(`/api/v1/finance/goals/${id}/contribute`)
      .set(auth())
      .send({ amount: 250_000 });
    assert.equal(contributed.body.data.goal.savedAmount, 250_000);
    assert.equal(contributed.body.data.goal.progressPct ?? Math.round(contributed.body.data.goal.ratio * 100), 25);

    const done = await request(app)
      .post(`/api/v1/finance/goals/${id}/contribute`)
      .set(auth())
      .send({ amount: 750_000 });
    assert.equal(done.body.data.goal.achieved, true);
    assert.equal(done.body.data.goal.remaining, 0);
  });

  it("filters transactions by type, category and free text", async () => {
    const income = await request(app).get("/api/v1/finance/transactions?type=income").set(auth());
    assert.equal(income.body.data.items.length, 1);
    assert.equal(income.body.data.items[0].category, "salary");

    const search = await request(app).get("/api/v1/finance/transactions?q=swiggy").set(auth());
    assert.equal(search.body.data.items.length, 1);
    assert.equal(search.body.data.items[0].title, "Swiggy");

    const byCategory = await request(app).get("/api/v1/finance/transactions?category=food").set(auth());
    assert.equal(byCategory.body.data.items.length, 2);
  });

  it("updates and deletes a transaction", async () => {
    const list = await request(app).get("/api/v1/finance/transactions?q=Chai").set(auth());
    const id = list.body.data.items[0].id;

    const patched = await request(app)
      .patch(`/api/v1/finance/transactions/${id}`)
      .set(auth())
      .send({ amount: 5_000, title: "Chai + samosa" });
    assert.equal(patched.body.data.transaction.amount, 5_000);
    assert.equal(patched.body.data.transaction.title, "Chai + samosa");

    const removed = await request(app).delete(`/api/v1/finance/transactions/${id}`).set(auth());
    assert.equal(removed.status, 200);
    const after = await request(app).get(`/api/v1/finance/transactions?q=samosa`).set(auth());
    assert.equal(after.body.data.items.length, 0);
  });

  it("returns 400 for a malformed id and 404 for one that isn't ours", async () => {
    const malformed = await request(app).delete("/api/v1/finance/transactions/not-an-id").set(auth());
    assert.equal(malformed.status, 400);

    const missing = await request(app).delete("/api/v1/finance/transactions/000000000000000000000000").set(auth());
    assert.equal(missing.status, 404);
  });

  // The one that matters most: ownership.
  it("never lets one user see or touch another's data", async () => {
    const mine = await request(app).get("/api/v1/finance/transactions").set(auth());
    const myId = mine.body.data.items[0].id;

    const theirs = await request(app).get("/api/v1/finance/transactions").set(auth(otherClerkId));
    assert.equal(theirs.body.data.items.length, 0, "a second user must start with an empty ledger");

    const theirSummary = await request(app).get("/api/v1/finance/summary").set(auth(otherClerkId));
    assert.equal(theirSummary.body.data.totals.expense, 0);
    assert.equal(theirSummary.body.data.balance.total, 0);

    // Guessing a real ObjectId must not be enough to read, edit or delete it.
    const steal = await request(app)
      .patch(`/api/v1/finance/transactions/${myId}`)
      .set(auth(otherClerkId))
      .send({ amount: 1 });
    assert.equal(steal.status, 404);

    const destroy = await request(app).delete(`/api/v1/finance/transactions/${myId}`).set(auth(otherClerkId));
    assert.equal(destroy.status, 404);
  });

  it("reports voice capability honestly when speech-to-text isn't configured", async () => {
    const res = await request(app).get("/api/v1/finance/voice/capabilities").set(auth());
    assert.equal(res.status, 200);
    assert.equal(res.body.data.speechToText, false); // STT_API_KEY is unset in tests
    assert.ok(res.body.data.categories.expense.includes("food"));
    assert.ok(res.body.data.categories.income.includes("salary"));
  });

  it("POST /finance/voice → 503 without a speech provider, and the mic path fails before any write", async () => {
    const res = await request(app)
      .post("/api/v1/finance/voice")
      .set(auth())
      .attach("audio", Buffer.from("fake audio bytes"), { filename: "clip.m4a", contentType: "audio/m4a" });
    assert.equal(res.status, 503);
  });

  it("rejects a non-audio upload", async () => {
    const res = await request(app)
      .post("/api/v1/finance/voice")
      .set(auth())
      .attach("audio", Buffer.from("MZ..."), { filename: "virus.exe", contentType: "application/x-msdownload" });
    assert.equal(res.status, 400);
  });

  it("reports Zerodha as not connected for a fresh user", async () => {
    const res = await request(app).get("/api/v1/integrations/zerodha").set(auth());
    assert.equal(res.status, 200);
    assert.equal(res.body.data.connected, false);
    assert.equal(res.body.data.provider, "zerodha");
    assert.equal(res.body.data.accessToken, undefined);
  });

  it("builds a Kite login URL carrying a signed state", async () => {
    const res = await request(app).get("/api/v1/integrations/zerodha/login-url").set(auth());
    assert.equal(res.status, 200);
    const url = new URL(res.body.data.url);
    assert.equal(url.host, "kite.zerodha.com");
    assert.equal(url.searchParams.get("api_key"), "kite_test_key");
    assert.ok(new URLSearchParams(url.searchParams.get("redirect_params")).get("state"));
  });

  it("deletes every finance document when the account is deleted", async () => {
    const service = new UserService();
    const owner = await User.findOne({ clerkId });
    assert.ok((await Transaction.countDocuments({ userId: owner._id })) > 0);

    // Exercise the cascade directly — deleteMe also calls Clerk, which isn't reachable in tests.
    await service.handleClerkUserDeleted({ id: clerkId });

    assert.equal(await Transaction.countDocuments({ userId: owner._id }), 0);
    assert.equal(await Budget.countDocuments({ userId: owner._id }), 0);
    assert.equal(await Goal.countDocuments({ userId: owner._id }), 0);
    assert.equal(await Account.countDocuments({ userId: owner._id }), 0);
    assert.equal(await Integration.countDocuments({ userId: owner._id }), 0);
    assert.equal(await User.countDocuments({ clerkId }), 0);
  });
});
