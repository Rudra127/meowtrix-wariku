// @file backend/tests/learn.test.js
// Offline unit tests for the Learn service. Uses an in-memory FakeLearnRepository so
// nothing here needs Mongo, Clerk or the network. HTTP-level tests live in
// tests/learn-http.test.js and are gated on TEST_MONGODB_URI.
import "./helpers.js";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import LearnService, {
  GOAL_TO_UNIT_SLUG,
  PASS_THRESHOLD,
  applyStreakOnSubmit,
  daysBetween,
  formatStats,
  gradeAnswer,
  gradeLesson,
  refreshDailyCounters,
  shapePath,
  utcMidnight,
} from "../services/learn-service.js";

// ---- Test doubles ----------------------------------------------------------------------

class FakeLearnRepository {
  constructor({ units = [], lessons = [] } = {}) {
    this.units = units;
    this.lessons = lessons;
    this.progress = new Map(); // key `${userId}:${lessonId}`
    this.stats = new Map(); // key `${userId}`
  }
  async listUnits() {
    return this.units.slice().sort((a, b) => a.order - b.order);
  }
  async listLessons() {
    return this.lessons.slice();
  }
  async findLessonBySlug(slug) {
    return this.lessons.find((l) => l.slug === slug) ?? null;
  }
  async listProgressForUser(userId) {
    const prefix = `${userId}:`;
    return [...this.progress.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v);
  }
  async findProgress(userId, lessonId) {
    return this.progress.get(`${userId}:${lessonId}`) ?? null;
  }
  async upsertProgress(userId, lessonId, updates) {
    const existing = this.progress.get(`${userId}:${lessonId}`);
    const next = { userId, lessonId, ...(existing ?? {}), ...updates };
    this.progress.set(`${userId}:${lessonId}`, next);
    return next;
  }
  async deleteAllProgressForUser(userId) {
    for (const key of [...this.progress.keys()]) {
      if (key.startsWith(`${userId}:`)) this.progress.delete(key);
    }
  }
  async getOrCreateStats(userId) {
    const key = String(userId);
    let s = this.stats.get(key);
    if (!s) {
      s = {
        userId,
        xp: 0,
        currentStreak: 0,
        longestStreak: 0,
        lastActiveDate: null,
        todayDate: null,
        todayXp: 0,
        dailyGoalXp: 50,
        lessonsDone: 0,
        totalAnswers: 0,
        correctAnswers: 0,
        badges: 0,
        save: async () => {},
      };
      this.stats.set(key, s);
    }
    return s;
  }
  async findStats(userId) {
    return this.stats.get(String(userId)) ?? null;
  }
  async deleteStatsForUser(userId) {
    this.stats.delete(String(userId));
  }
}

// Builds units/lessons in the shape the service expects from Mongo (._id fields, etc).
const buildFixture = () => {
  const units = [
    { _id: "u1id", slug: "u1", title: "Budgeting basics", description: "", order: 0, icon: "pie-chart" },
    { _id: "u2id", slug: "u2", title: "Saving", description: "", order: 1, icon: "shield-checkmark" },
    { _id: "u3id", slug: "u3", title: "Debt", description: "", order: 2, icon: "card" },
  ];
  const lessons = [
    {
      _id: "l1id",
      slug: "l1",
      unitId: "u1id",
      order: 0,
      title: "What is a budget?",
      summary: "s",
      xp: 20,
      estimatedMinutes: 3,
      icon: "wallet",
      exercises: [
        { type: "multiple_choice", prompt: "?", options: ["a", "b"], answer: 0, explanation: "e1" },
        { type: "true_false", prompt: "?", answer: true, explanation: "e2" },
      ],
    },
    {
      _id: "l2id",
      slug: "l2",
      unitId: "u1id",
      order: 1,
      title: "Needs vs wants",
      summary: "s",
      xp: 30,
      estimatedMinutes: 4,
      icon: "cart",
      exercises: [
        { type: "fill_number", prompt: "?", answer: 5000, tolerance: 0, explanation: "e" },
        { type: "order_steps", prompt: "?", options: ["a", "b", "c"], answer: [0, 1, 2], explanation: "e" },
      ],
    },
    {
      _id: "l3id",
      slug: "l3",
      unitId: "u2id",
      order: 0,
      title: "Save first",
      summary: "s",
      xp: 20,
      estimatedMinutes: 3,
      icon: "shield-checkmark",
      exercises: [
        { type: "multiple_choice", prompt: "?", options: ["a", "b"], answer: 1, explanation: "e" },
      ],
    },
  ];
  return { units, lessons };
};

// ---- Constants -------------------------------------------------------------------------

describe("GOAL_TO_UNIT_SLUG covers every LEVELS/GOALS enum value", () => {
  it("maps every mobile goal to a slug", () => {
    for (const goal of ["budgeting", "saving", "debt", "investing", "learning"]) {
      assert.ok(GOAL_TO_UNIT_SLUG[goal], `no mapping for ${goal}`);
    }
  });
});

// ---- Date helpers ----------------------------------------------------------------------

describe("utcMidnight / daysBetween", () => {
  it("normalises to UTC-midnight regardless of local offset", () => {
    const d = new Date("2026-09-18T23:59:00Z");
    const m = utcMidnight(d);
    assert.equal(m.toISOString(), "2026-09-18T00:00:00.000Z");
  });
  it("counts whole UTC days", () => {
    assert.equal(daysBetween(new Date("2026-09-18T05:00:00Z"), new Date("2026-09-19T22:00:00Z")), 1);
    assert.equal(daysBetween(new Date("2026-09-18T05:00:00Z"), new Date("2026-09-18T23:00:00Z")), 0);
    assert.equal(daysBetween(new Date("2026-09-18T05:00:00Z"), new Date("2026-09-25T23:00:00Z")), 7);
  });
});

// ---- gradeAnswer -----------------------------------------------------------------------

describe("gradeAnswer", () => {
  it("multiple_choice matches by exact index", () => {
    const ex = { type: "multiple_choice", options: ["a", "b", "c"], answer: 1 };
    assert.equal(gradeAnswer(ex, 1), true);
    assert.equal(gradeAnswer(ex, 0), false);
    assert.equal(gradeAnswer(ex, "1"), false);
    assert.equal(gradeAnswer(ex, null), false);
  });
  it("true_false requires a strict boolean", () => {
    const ex = { type: "true_false", answer: true };
    assert.equal(gradeAnswer(ex, true), true);
    assert.equal(gradeAnswer(ex, false), false);
    assert.equal(gradeAnswer(ex, "true"), false);
    assert.equal(gradeAnswer(ex, 1), false);
  });
  it("fill_number honours tolerance", () => {
    const ex = { type: "fill_number", answer: 100, tolerance: 5 };
    assert.equal(gradeAnswer(ex, 100), true);
    assert.equal(gradeAnswer(ex, 105), true);
    assert.equal(gradeAnswer(ex, 95), true);
    assert.equal(gradeAnswer(ex, 106), false);
    assert.equal(gradeAnswer(ex, "100"), false);
    assert.equal(gradeAnswer(ex, NaN), false);
  });
  it("order_steps requires exact index sequence", () => {
    const ex = { type: "order_steps", answer: [0, 1, 2] };
    assert.equal(gradeAnswer(ex, [0, 1, 2]), true);
    assert.equal(gradeAnswer(ex, [0, 2, 1]), false);
    assert.equal(gradeAnswer(ex, [0, 1]), false);
    assert.equal(gradeAnswer(ex, "012"), false);
  });
  it("returns false for unknown types", () => {
    assert.equal(gradeAnswer({ type: "wat", answer: 1 }, 1), false);
  });
});

// ---- gradeLesson -----------------------------------------------------------------------

describe("gradeLesson", () => {
  const lesson = {
    exercises: [
      { type: "multiple_choice", options: ["a", "b"], answer: 0, explanation: "e0" },
      { type: "true_false", answer: true, explanation: "e1" },
      { type: "fill_number", answer: 10, tolerance: 0, explanation: "e2" },
    ],
  };

  it("throws when answers is not an array", () => {
    assert.throws(() => gradeLesson(lesson, undefined), { code: "VALIDATION_ERROR" });
    assert.throws(() => gradeLesson(lesson, "abc"), { code: "VALIDATION_ERROR" });
  });
  it("throws on length mismatch", () => {
    assert.throws(() => gradeLesson(lesson, [0]), { code: "VALIDATION_ERROR" });
  });
  it("returns per-exercise results with correctAnswer and explanation", () => {
    const g = gradeLesson(lesson, [0, false, 10]);
    assert.equal(g.total, 3);
    assert.equal(g.correct, 2);
    assert.equal(g.score, 2 / 3);
    assert.equal(g.passed, (2 / 3) >= PASS_THRESHOLD);
    assert.deepEqual(g.results[0], { index: 0, isCorrect: true, correctAnswer: 0, explanation: "e0" });
    assert.equal(g.results[1].isCorrect, false);
    assert.equal(g.results[2].isCorrect, true);
  });
  it("passed=false when score below threshold", () => {
    const g = gradeLesson(lesson, [1, false, 99]);
    assert.equal(g.correct, 0);
    assert.equal(g.passed, false);
  });
});

// ---- applyStreakOnSubmit ---------------------------------------------------------------

describe("applyStreakOnSubmit", () => {
  const day = (s) => new Date(`${s}T12:00:00Z`);

  it("first-ever activity sets streak to 1", () => {
    const stats = { currentStreak: 0, longestStreak: 0, lastActiveDate: null };
    applyStreakOnSubmit(stats, day("2026-09-18"));
    assert.equal(stats.currentStreak, 1);
    assert.equal(stats.longestStreak, 1);
    assert.equal(utcMidnight(stats.lastActiveDate).toISOString(), "2026-09-18T00:00:00.000Z");
  });
  it("same UTC day keeps the streak", () => {
    const stats = { currentStreak: 3, longestStreak: 3, lastActiveDate: day("2026-09-18") };
    applyStreakOnSubmit(stats, day("2026-09-18"));
    assert.equal(stats.currentStreak, 3);
  });
  it("consecutive day increments the streak", () => {
    const stats = { currentStreak: 3, longestStreak: 3, lastActiveDate: day("2026-09-17") };
    applyStreakOnSubmit(stats, day("2026-09-18"));
    assert.equal(stats.currentStreak, 4);
    assert.equal(stats.longestStreak, 4);
  });
  it("gap > 1 day resets to 1 but preserves longest", () => {
    const stats = { currentStreak: 7, longestStreak: 10, lastActiveDate: day("2026-09-14") };
    applyStreakOnSubmit(stats, day("2026-09-18"));
    assert.equal(stats.currentStreak, 1);
    assert.equal(stats.longestStreak, 10);
  });
});

// ---- refreshDailyCounters --------------------------------------------------------------

describe("refreshDailyCounters", () => {
  it("resets todayXp when the day rolls over", () => {
    const stats = { todayDate: new Date("2026-09-17T00:00:00Z"), todayXp: 30, currentStreak: 5, lastActiveDate: new Date("2026-09-17T12:00:00Z") };
    refreshDailyCounters(stats, new Date("2026-09-18T09:00:00Z"));
    assert.equal(stats.todayXp, 0);
    assert.equal(utcMidnight(stats.todayDate).toISOString(), "2026-09-18T00:00:00.000Z");
    assert.equal(stats.currentStreak, 5, "yesterday-active streak stays intact on refresh");
  });
  it("clears currentStreak when lastActiveDate is > 1 day behind today", () => {
    const stats = { todayDate: null, todayXp: 0, currentStreak: 4, lastActiveDate: new Date("2026-09-15T12:00:00Z") };
    refreshDailyCounters(stats, new Date("2026-09-18T09:00:00Z"));
    assert.equal(stats.currentStreak, 0);
  });
  it("leaves everything alone when nothing changed", () => {
    const today = new Date("2026-09-18T00:00:00Z");
    const stats = { todayDate: today, todayXp: 25, currentStreak: 3, lastActiveDate: today };
    refreshDailyCounters(stats, new Date("2026-09-18T20:00:00Z"));
    assert.equal(stats.todayXp, 25);
    assert.equal(stats.currentStreak, 3);
  });
});

// ---- formatStats -----------------------------------------------------------------------

describe("formatStats", () => {
  it("accuracy is 0 when no answers yet", () => {
    const out = formatStats({ xp: 0, currentStreak: 0, longestStreak: 0, dailyGoalXp: 50, todayXp: 0, lessonsDone: 0, totalAnswers: 0, correctAnswers: 0, badges: 0 });
    assert.equal(out.accuracy, 0);
  });
  it("computes accuracy as correct/total", () => {
    const out = formatStats({ xp: 100, currentStreak: 2, longestStreak: 5, dailyGoalXp: 50, todayXp: 10, lessonsDone: 3, totalAnswers: 20, correctAnswers: 17, badges: 1 });
    assert.equal(out.accuracy, 17 / 20);
    assert.equal(out.streakDays, 2);
    assert.equal(out.xp, 100);
  });
});

// ---- shapePath -------------------------------------------------------------------------

describe("shapePath", () => {
  const { units, lessons } = buildFixture();

  it("keeps original order when no personalisation is set", () => {
    const shaped = shapePath(units, lessons, new Map(), null);
    assert.deepEqual(shaped.map((u) => u.id), ["u1", "u2", "u3"]);
    assert.deepEqual(shaped.map((u) => u.index), [1, 2, 3]);
  });
  it("puts the recommended unit first and reindexes", () => {
    const shaped = shapePath(units, lessons, new Map(), "u2");
    assert.deepEqual(shaped.map((u) => u.id), ["u2", "u1", "u3"]);
    assert.deepEqual(shaped.map((u) => u.index), [1, 2, 3]);
  });
  it("marks the first non-passed lesson as `current` and the rest as `locked`", () => {
    const shaped = shapePath(units, lessons, new Map(), null);
    const statuses = shaped.flatMap((u) => u.lessons.map((l) => l.status));
    // Fixture has 3 lessons (l1, l2 in u1; l3 in u2). u3 has none.
    assert.deepEqual(statuses, ["current", "locked", "locked"]);
  });
  it("passed lessons become `done`, next unfinished becomes `current`", () => {
    const progress = new Map([["l1id", { lessonId: "l1id", passed: true }]]);
    const shaped = shapePath(units, lessons, progress, null);
    const statuses = shaped.flatMap((u) => u.lessons.map((l) => l.status));
    assert.deepEqual(statuses, ["done", "current", "locked"]);
  });
  it("current lesson moves into the recommended unit after reorder", () => {
    // Nothing passed. Recommended = u2, so its l3 should be `current`, l1/l2 locked.
    const shaped = shapePath(units, lessons, new Map(), "u2");
    const first = shaped[0];
    assert.equal(first.id, "u2");
    assert.equal(first.lessons[0].status, "current");
  });
  it("strips answers from the shaped output (no `answer` fields leak)", () => {
    const shaped = shapePath(units, lessons, new Map(), null);
    for (const u of shaped) {
      for (const l of u.lessons) {
        assert.equal("answer" in l, false);
        assert.equal("exercises" in l, false);
      }
    }
  });
});

// ---- LearnService.submitLesson (with fake repo) ----------------------------------------

describe("LearnService.submitLesson", () => {
  let service;
  let repo;
  const user = { _id: "user1", goal: "budgeting" };

  beforeEach(() => {
    repo = new FakeLearnRepository(buildFixture());
    service = new LearnService(repo);
  });

  it("locked lessons cannot be submitted (403)", async () => {
    // l2 is locked until l1 is passed.
    await assert.rejects(service.submitLesson(user, "l2", { answers: [5000, [0, 1, 2]] }), {
      code: "FORBIDDEN",
    });
  });

  it("grades a fully correct lesson and awards full XP", async () => {
    const res = await service.submitLesson(user, "l1", { answers: [0, true] });
    assert.equal(res.correct, 2);
    assert.equal(res.total, 2);
    assert.equal(res.score, 1);
    assert.equal(res.passed, true);
    assert.equal(res.xpEarned, 20); // full lesson xp
    assert.equal(res.totalXpForLesson, 20);
    assert.equal(res.stats.lessonsDone, 1);
    assert.equal(res.stats.streakDays, 1);
    // Correct answer + explanation reach the client for the "instant feedback" screen.
    assert.equal(res.results[0].correctAnswer, 0);
    assert.equal(res.results[0].explanation, "e1"); // matches fixture: l1 exercise 0 → "e1"
  });

  it("failed submission awards partial XP but does not mark lesson passed", async () => {
    const res = await service.submitLesson(user, "l1", { answers: [1, true] });
    assert.equal(res.correct, 1);
    assert.equal(res.passed, false); // 50% < 60%
    assert.equal(res.xpEarned, 10); // 0.5 * 20 = 10
    // Not counted as a completion, but stats do track accuracy.
    assert.equal(res.stats.lessonsDone, 0);
    assert.equal(res.stats.streakDays, 1); // any submit still counts as active
  });

  it("retrying a lesson only awards the XP delta and doesn't double-count lessonsDone", async () => {
    await service.submitLesson(user, "l1", { answers: [0, false] }); // 50% → 10 xp, not passed
    const second = await service.submitLesson(user, "l1", { answers: [0, true] }); // 100% → passes
    assert.equal(second.xpEarned, 10); // only the 20 - 10 delta
    assert.equal(second.totalXpForLesson, 20);
    assert.equal(second.passed, true);
    assert.equal(second.stats.lessonsDone, 1);
    // Retrying a already-passed lesson gives no extra XP.
    const third = await service.submitLesson(user, "l1", { answers: [0, true] });
    assert.equal(third.xpEarned, 0);
    assert.equal(third.stats.lessonsDone, 1);
  });

  it("unlocks the next lesson after passing", async () => {
    await service.submitLesson(user, "l1", { answers: [0, true] });
    // l2 should now be unlocked.
    const { lesson, status } = await service.getLesson(user, "l2");
    assert.equal(status, "current");
    assert.equal(lesson.id, "l2");
  });

  it("personalisation moves the current lesson to the recommended unit", async () => {
    const savingUser = { _id: "user2", goal: "saving" };
    const { units } = await service.getPath(savingUser);
    assert.equal(units[0].id, "u2");
    assert.equal(units[0].lessons[0].status, "current");
  });

  it("validation error when answers length doesn't match", async () => {
    await assert.rejects(service.submitLesson(user, "l1", { answers: [0] }), { code: "VALIDATION_ERROR" });
  });
});

// ---- LearnService.getLesson ------------------------------------------------------------

describe("LearnService.getLesson", () => {
  let service;
  beforeEach(() => {
    service = new LearnService(new FakeLearnRepository(buildFixture()));
  });

  it("strips `answer`, `explanation` and `tolerance` from exercises", async () => {
    const { lesson } = await service.getLesson({ _id: "user1" }, "l1");
    for (const ex of lesson.exercises) {
      assert.equal("answer" in ex, false);
      assert.equal("explanation" in ex, false);
      assert.equal("tolerance" in ex, false);
    }
    // Prompts and options remain.
    assert.equal(lesson.exercises[0].prompt, "?");
    assert.deepEqual(lesson.exercises[0].options, ["a", "b"]);
  });

  it("throws NOT_FOUND for an unknown slug", async () => {
    await assert.rejects(service.getLesson({ _id: "user1" }, "does-not-exist"), { code: "NOT_FOUND" });
  });

  it("throws FORBIDDEN for a locked lesson", async () => {
    await assert.rejects(service.getLesson({ _id: "user1" }, "l3"), { code: "FORBIDDEN" });
  });
});

// ---- LearnService.deleteAllForUser -----------------------------------------------------

describe("LearnService.deleteAllForUser", () => {
  it("clears progress and stats without touching other users' data", async () => {
    const repo = new FakeLearnRepository(buildFixture());
    const service = new LearnService(repo);
    await service.submitLesson({ _id: "userA" }, "l1", { answers: [0, true] });
    await service.submitLesson({ _id: "userB" }, "l1", { answers: [0, true] });

    await service.deleteAllForUser("userA");
    assert.equal((await repo.listProgressForUser("userA")).length, 0);
    assert.equal(await repo.findStats("userA"), null);
    assert.equal((await repo.listProgressForUser("userB")).length, 1);
    assert.ok(await repo.findStats("userB"));
  });
});

// ---- LearnService.checkAnswer (instant feedback) ---------------------------------------

describe("LearnService.checkAnswer", () => {
  let service;
  let repo;
  const user = { _id: "user1", goal: "budgeting" };

  beforeEach(() => {
    repo = new FakeLearnRepository(buildFixture());
    service = new LearnService(repo);
  });

  it("grades one answer and returns the correct answer + explanation", async () => {
    const right = await service.checkAnswer(user, "l1", { index: 0, answer: 0 });
    assert.deepEqual(right, { index: 0, isCorrect: true, correctAnswer: 0, explanation: "e1" });
    const wrong = await service.checkAnswer(user, "l1", { index: 0, answer: 2 });
    assert.equal(wrong.isCorrect, false);
    assert.equal(wrong.correctAnswer, 0);
  });

  it("stores nothing — XP and progress only change on submit", async () => {
    await service.checkAnswer(user, "l1", { index: 0, answer: 0 });
    const { stats } = await service.getStats(user);
    assert.equal(stats.xp, 0);
    assert.equal(stats.lessonsDone, 0);
    assert.equal((await repo.listProgressForUser(user._id)).length, 0);
  });

  it("rejects locked lessons, unknown lessons and bad indexes", async () => {
    await assert.rejects(service.checkAnswer(user, "l2", { index: 0, answer: 0 }), { code: "FORBIDDEN" });
    await assert.rejects(service.checkAnswer(user, "nope", { index: 0, answer: 0 }), { code: "NOT_FOUND" });
    for (const index of [-1, 99, 1.5, "0", undefined]) {
      await assert.rejects(service.checkAnswer(user, "l1", { index, answer: 0 }), { code: "VALIDATION_ERROR" });
    }
  });
});
