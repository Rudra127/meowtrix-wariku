// @file backend/tests/learn-http.test.js
// End-to-end HTTP tests for the Learn feature against real MongoDB and real Clerk-token
// verification (networkless via CLERK_JWT_KEY). Skipped unless TEST_MONGODB_URI is set:
//   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/wariku_test npm test
import "./helpers.js";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import mongoose from "mongoose";
import request from "supertest";
import LearnerStats from "../database/models/learner-stats.js";
import Lesson from "../database/models/lesson.js";
import LessonProgress from "../database/models/lesson-progress.js";
import Unit from "../database/models/unit.js";
import User from "../database/models/user.js";
import { LESSONS, UNITS } from "../database/seed/learn-content.js";
import { buildApp, signSessionToken, testMongoUri, testSigningKey } from "./helpers.js";

const uri = testMongoUri("learn");

describe("Learn HTTP (MongoDB)", { skip: !uri && "TEST_MONGODB_URI not set" }, () => {
  let app;
  const clerkId = "user_learn_test";
  const auth = () => ({ Authorization: `Bearer ${signSessionToken(testSigningKey, { sub: clerkId })}` });

  before(async () => {
    await mongoose.connect(uri);
    await Promise.all([
      User.deleteMany({}),
      Unit.deleteMany({}),
      Lesson.deleteMany({}),
      LessonProgress.deleteMany({}),
      LearnerStats.deleteMany({}),
    ]);
    await User.create({ clerkId, email: "asha@example.com", firstName: "Asha", goal: "budgeting" });

    // Seed content directly (same shape as `npm run seed:learn`).
    const unitIdBySlug = new Map();
    for (const u of UNITS) {
      const doc = await Unit.create(u);
      unitIdBySlug.set(doc.slug, doc._id);
    }
    for (const l of LESSONS) {
      const { unitSlug, ...rest } = l;
      await Lesson.create({ ...rest, unitId: unitIdBySlug.get(unitSlug) });
    }
    app = await buildApp();
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it("GET /learn/path returns units in the recommended-first order with fresh stats", async () => {
    const res = await request(app).get("/api/v1/learn/path").set(auth());
    assert.equal(res.status, 200);
    const { units, stats } = res.body.data;
    // user.goal = "budgeting" → u1 (already first, so order is unchanged).
    assert.deepEqual(units.map((u) => u.id), ["u1", "u2", "u3", "u4"]);
    // First lesson is `current`, everything else `locked` until we submit.
    assert.equal(units[0].lessons[0].id, "l1");
    assert.equal(units[0].lessons[0].status, "current");
    assert.equal(units[0].lessons[1].status, "locked");
    // Fresh stats.
    assert.equal(stats.xp, 0);
    assert.equal(stats.streakDays, 0);
    assert.equal(stats.lessonsDone, 0);
  });

  it("GET /learn/lessons/:slug returns exercises without answers or explanations", async () => {
    const res = await request(app).get("/api/v1/learn/lessons/l1").set(auth());
    assert.equal(res.status, 200);
    const { lesson, status } = res.body.data;
    assert.equal(lesson.id, "l1");
    assert.equal(status, "current");
    for (const ex of lesson.exercises) {
      assert.equal("answer" in ex, false, "answer must not leak to the client");
      assert.equal("explanation" in ex, false);
    }
    // Multiple-choice options still travel across.
    const mc = lesson.exercises.find((e) => e.type === "multiple_choice");
    assert.ok(Array.isArray(mc.options) && mc.options.length > 0);
  });

  it("GET /learn/lessons/:slug on a locked lesson returns 403", async () => {
    const res = await request(app).get("/api/v1/learn/lessons/l3").set(auth());
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, "FORBIDDEN");
  });

  it("GET /learn/lessons/:slug on an unknown slug returns 404", async () => {
    const res = await request(app).get("/api/v1/learn/lessons/nope").set(auth());
    assert.equal(res.status, 404);
  });

  it("POST /learn/lessons/l1/submit grades server-side, awards XP, advances the path", async () => {
    // Fetch the lesson to know its shape, then submit correct answers derived from the seed.
    const seed = LESSONS.find((l) => l.slug === "l1");
    const answers = seed.exercises.map((ex) => ex.answer);
    const res = await request(app).post("/api/v1/learn/lessons/l1/submit").set(auth()).send({ answers });
    assert.equal(res.status, 200);
    const { score, passed, xpEarned, stats } = res.body.data;
    assert.equal(score, 1);
    assert.equal(passed, true);
    assert.equal(xpEarned, seed.xp);
    assert.equal(stats.xp, seed.xp);
    assert.equal(stats.lessonsDone, 1);
    assert.equal(stats.streakDays, 1);

    // Path now shows l1 as done and l2 as current.
    const pathRes = await request(app).get("/api/v1/learn/path").set(auth());
    assert.equal(pathRes.body.data.units[0].lessons[0].status, "done");
    assert.equal(pathRes.body.data.units[0].lessons[1].status, "current");
  });

  it("POST /learn/lessons/:slug/check gives instant feedback without storing anything", async () => {
    const res = await request(app).post("/api/v1/learn/lessons/l1/check").set(auth()).send({ index: 0, answer: -1 });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.isCorrect, false);
    assert.ok("correctAnswer" in res.body.data);
    const locked = await request(app).post("/api/v1/learn/lessons/l14/check").set(auth()).send({ index: 0, answer: 0 });
    assert.equal(locked.status, 403);
    const noAuth = await request(app).post("/api/v1/learn/lessons/l1/check").send({ index: 0, answer: 0 });
    assert.equal(noAuth.status, 401);
  });

  it("POST /learn/lessons/:slug/submit rejects when answers length is wrong", async () => {
    const res = await request(app).post("/api/v1/learn/lessons/l2/submit").set(auth()).send({ answers: [] });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "VALIDATION_ERROR");
  });

  it("DELETE /users/me cascades: learn data is cleaned up", async () => {
    // Sanity check: user has stats + at least one progress row from the earlier submit.
    const user = await User.findOne({ clerkId });
    assert.ok(user);
    assert.equal(await LearnerStats.countDocuments({ userId: user._id }), 1);
    assert.ok((await LessonProgress.countDocuments({ userId: user._id })) > 0);

    // We can't actually call DELETE /users/me here (would try to delete via Clerk's real API).
    // Instead exercise the same cascade path used by the Clerk delete webhook.
    const UserServiceModule = await import("../services/user-service.js");
    const service = new UserServiceModule.default();
    await service.handleClerkUserDeleted({ id: clerkId });

    assert.equal(await User.countDocuments({ clerkId }), 0);
    assert.equal(await LearnerStats.countDocuments({ userId: user._id }), 0);
    assert.equal(await LessonProgress.countDocuments({ userId: user._id }), 0);
  });
});
