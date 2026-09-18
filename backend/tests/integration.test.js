// End-to-end through real Clerk token verification (networkless, via CLERK_JWT_KEY) and a real MongoDB.
// Skipped unless TEST_MONGODB_URI is set, e.g.:
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/wariku_test npm test
import "./helpers.js";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import mongoose from "mongoose";
import request from "supertest";
import User from "../database/models/user.js";
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
