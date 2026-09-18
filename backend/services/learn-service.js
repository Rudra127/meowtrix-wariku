// @file backend/services/learn-service.js
// Business logic for the Learn tab. Throws AppErrors; returns plain data.
//
// Design notes:
//   - Grading happens here so answers never leave the server (see docs/ROADMAP.md).
//   - Path/order is personalised from `user.goal` (recommended unit first).
//   - Streak boundaries are UTC-midnight so "day" is consistent across time zones.
//   - LessonProgress.xpEarned only rises (retries can boost score but never claw it back).
//   - LearnerStats is denormalised for cheap reads on every path/screen load.
import { DEFAULT_DAILY_GOAL_XP } from "../database/models/learner-stats.js";
import { EXERCISE_TYPES } from "../database/models/lesson.js";
import LearnRepository from "../database/repository/learn-repository.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/index.js";
import PracticeService from "./practice-service.js";

/** Score >= this counts as passing a lesson (used for status + streak eligibility). */
export const PASS_THRESHOLD = 0.6;

/**
 * XP per correct answer in an AI practice round. Deliberately small: practice keeps the
 * streak alive and nudges accuracy, but it must never be a faster path to XP than doing
 * real lessons (a 5-question round caps at 10 XP vs 20–50 for a lesson).
 */
export const PRACTICE_XP_PER_CORRECT = 2;

/** Onboarding goal → recommended unit slug. Keep in sync with mobile options.ts. */
export const GOAL_TO_UNIT_SLUG = {
  budgeting: "u1",
  saving: "u2",
  debt: "u3",
  investing: "u4",
  learning: "u1",
};

// ---- Date helpers (UTC-day granularity) ------------------------------------------------

/** Midnight UTC of the day `date` falls on. Returns a new Date. */
export const utcMidnight = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

/** Whole-day difference, UTC. `a` and `b` are treated as day boundaries. */
export const daysBetween = (a, b) => {
  const ms = utcMidnight(b).getTime() - utcMidnight(a).getTime();
  return Math.round(ms / 86_400_000);
};

// ---- Grading ---------------------------------------------------------------------------

/** True iff `answer` is the correct response to `exercise`. Pure. */
export const gradeAnswer = (exercise, answer) => {
  switch (exercise.type) {
    case "multiple_choice":
      return Number.isInteger(answer) && answer === exercise.answer;
    case "true_false":
      return typeof answer === "boolean" && answer === exercise.answer;
    case "fill_number": {
      if (typeof answer !== "number" || !Number.isFinite(answer)) return false;
      const tolerance = Number.isFinite(exercise.tolerance) ? exercise.tolerance : 0;
      return Math.abs(answer - exercise.answer) <= tolerance;
    }
    case "order_steps": {
      if (!Array.isArray(answer) || !Array.isArray(exercise.answer)) return false;
      if (answer.length !== exercise.answer.length) return false;
      return answer.every((v, i) => v === exercise.answer[i]);
    }
    default:
      return false;
  }
};

/**
 * Grades a full lesson.
 * @returns {{ correct: number, total: number, score: number, passed: boolean,
 *            results: { index: number, isCorrect: boolean, correctAnswer: unknown, explanation: string }[] }}
 */
export const gradeLesson = (lesson, answers) => {
  if (!Array.isArray(answers)) throw new ValidationError("`answers` must be an array");
  if (answers.length !== lesson.exercises.length) {
    throw new ValidationError(
      `Expected ${lesson.exercises.length} answers, got ${answers.length}`
    );
  }
  const results = lesson.exercises.map((ex, index) => {
    if (!EXERCISE_TYPES.includes(ex.type)) {
      throw new ValidationError(`exercises[${index}].type is invalid on the server`);
    }
    const isCorrect = gradeAnswer(ex, answers[index]);
    return { index, isCorrect, correctAnswer: ex.answer, explanation: ex.explanation ?? "" };
  });
  const correct = results.filter((r) => r.isCorrect).length;
  const total = results.length;
  const score = total === 0 ? 0 : correct / total;
  return { correct, total, score, passed: score >= PASS_THRESHOLD, results };
};

// ---- Stats + streak --------------------------------------------------------------------

/**
 * Rolls forward daily counters + broken-streak detection on read. Mutates and returns `stats`.
 * Doesn't touch xp/streak on a successful submit — that's `applyStreakOnSubmit`.
 */
export const refreshDailyCounters = (stats, now = new Date()) => {
  const today = utcMidnight(now);
  if (!stats.todayDate || utcMidnight(stats.todayDate).getTime() !== today.getTime()) {
    stats.todayDate = today;
    stats.todayXp = 0;
  }
  if (stats.lastActiveDate && daysBetween(stats.lastActiveDate, today) > 1) {
    stats.currentStreak = 0;
  }
  return stats;
};

/**
 * Advances the streak because the user just submitted a lesson.
 * Same UTC day → no change. Yesterday → +1. Longer gap or first ever → reset to 1.
 */
export const applyStreakOnSubmit = (stats, now = new Date()) => {
  const today = utcMidnight(now);
  const last = stats.lastActiveDate ? utcMidnight(stats.lastActiveDate) : null;
  if (!last) {
    stats.currentStreak = 1;
  } else {
    const gap = daysBetween(last, today);
    if (gap === 0) {
      // same day → keep current streak
    } else if (gap === 1) {
      stats.currentStreak = (stats.currentStreak || 0) + 1;
    } else {
      stats.currentStreak = 1;
    }
  }
  if (stats.currentStreak > stats.longestStreak) stats.longestStreak = stats.currentStreak;
  stats.lastActiveDate = today;
  return stats;
};

/** Public stats shape consumed by the mobile Learn tab. */
export const formatStats = (stats) => ({
  streakDays: stats.currentStreak || 0,
  longestStreak: stats.longestStreak || 0,
  xp: stats.xp || 0,
  dailyGoalXp: stats.dailyGoalXp || DEFAULT_DAILY_GOAL_XP,
  todayXp: stats.todayXp || 0,
  lessonsDone: stats.lessonsDone || 0,
  accuracy: stats.totalAnswers > 0 ? stats.correctAnswers / stats.totalAnswers : 0,
  badges: stats.badges || 0,
});

// ---- Path / personalisation ------------------------------------------------------------

const recommendedUnitSlug = (user) => {
  const slug = user?.goal ? GOAL_TO_UNIT_SLUG[user.goal] : null;
  return slug ?? null;
};

/**
 * Builds the Learn tab payload:
 *   { units: [{ id, index, title, description, lessons: [{ id, title, summary, xp,
 *              minutes, icon, status }] }], stats }
 *
 * `status` is computed server-side: lessons with a `passed` progress row are `done`;
 * the first non-`done` lesson in the (possibly reordered) path is `current`; everything
 * else is `locked`. This mirrors what mobile's `personalizePath` used to compute from
 * the sample data — clients can now trust the server's status directly.
 */
export const shapePath = (units, lessons, progressByLessonId, recommendedSlug) => {
  const recommendedIdx = units.findIndex((u) => u.slug === recommendedSlug);
  const ordered =
    recommendedIdx > 0
      ? [units[recommendedIdx], ...units.slice(0, recommendedIdx), ...units.slice(recommendedIdx + 1)]
      : [...units];

  const lessonsByUnit = new Map();
  for (const l of lessons) {
    const key = String(l.unitId);
    if (!lessonsByUnit.has(key)) lessonsByUnit.set(key, []);
    lessonsByUnit.get(key).push(l);
  }
  for (const arr of lessonsByUnit.values()) arr.sort((a, b) => a.order - b.order);

  // Walk the ordered path once to find the first non-`done` lesson → mark it `current`.
  let currentLessonId = null;
  outer: for (const unit of ordered) {
    const items = lessonsByUnit.get(String(unit._id)) ?? [];
    for (const lesson of items) {
      const p = progressByLessonId.get(String(lesson._id));
      if (!p?.passed) {
        currentLessonId = String(lesson._id);
        break outer;
      }
    }
  }

  return ordered.map((unit, i) => ({
    id: unit.slug,
    index: i + 1,
    title: unit.title,
    description: unit.description,
    icon: unit.icon,
    lessons: (lessonsByUnit.get(String(unit._id)) ?? []).map((lesson) => {
      const p = progressByLessonId.get(String(lesson._id));
      const status = p?.passed ? "done" : String(lesson._id) === currentLessonId ? "current" : "locked";
      return {
        id: lesson.slug,
        title: lesson.title,
        summary: lesson.summary,
        xp: lesson.xp,
        minutes: lesson.estimatedMinutes,
        icon: lesson.icon,
        status,
      };
    }),
  }));
};

/** Strips answer/explanation/tolerance from exercises for lesson fetch. */
const publicExercise = (ex) => ({
  type: ex.type,
  prompt: ex.prompt,
  ...(ex.options ? { options: [...ex.options] } : {}),
});

// ---- Service ---------------------------------------------------------------------------

export default class LearnService {
  constructor(repository = new LearnRepository(), practiceService = new PracticeService()) {
    this.repository = repository;
    this.practiceService = practiceService;
  }

  /** GET /learn/path — path + stats in the shape the mobile UI already renders. */
  async getPath(user) {
    const [units, lessons, progress, statsDoc] = await Promise.all([
      this.repository.listUnits(),
      this.repository.listLessons(),
      this.repository.listProgressForUser(user._id),
      this.repository.getOrCreateStats(user._id),
    ]);
    const progressByLessonId = new Map(progress.map((p) => [String(p.lessonId), p]));
    const shapedUnits = shapePath(units, lessons, progressByLessonId, recommendedUnitSlug(user));

    // Roll forward "today" and detect broken streaks on read; persist so subsequent reads match.
    const before = { todayDate: statsDoc.todayDate, todayXp: statsDoc.todayXp, currentStreak: statsDoc.currentStreak };
    refreshDailyCounters(statsDoc);
    if (
      String(statsDoc.todayDate) !== String(before.todayDate) ||
      statsDoc.todayXp !== before.todayXp ||
      statsDoc.currentStreak !== before.currentStreak
    ) {
      await statsDoc.save();
    }

    return { units: shapedUnits, stats: formatStats(statsDoc) };
  }

  /** GET /learn/stats — same stats block used by the header. */
  async getStats(user) {
    const stats = await this.repository.getOrCreateStats(user._id);
    refreshDailyCounters(stats);
    await stats.save();
    return { stats: formatStats(stats) };
  }

  /**
   * GET /learn/lessons/:slug — fetch a lesson with exercises stripped of answers.
   * Locked lessons return 403. Done lessons are viewable (for review).
   */
  async getLesson(user, slug) {
    if (!slug || typeof slug !== "string") throw new ValidationError("Missing lesson slug");
    const lesson = await this.repository.findLessonBySlug(slug);
    if (!lesson) throw new NotFoundError("Lesson not found");

    const status = await this._statusForLesson(user, lesson);
    if (status === "locked") {
      throw new ForbiddenError("Finish the lessons before this one to unlock it.");
    }
    const progress = await this.repository.findProgress(user._id, lesson._id);
    const units = await this.repository.listUnits();
    const unit = units.find((u) => String(u._id) === String(lesson.unitId));

    return {
      lesson: {
        id: lesson.slug,
        unitId: unit?.slug ?? null,
        unitTitle: unit?.title ?? "",
        title: lesson.title,
        summary: lesson.summary,
        xp: lesson.xp,
        minutes: lesson.estimatedMinutes,
        icon: lesson.icon,
        exercises: lesson.exercises.map(publicExercise),
      },
      progress: progress
        ? {
            score: progress.score,
            xpEarned: progress.xpEarned,
            attempts: progress.attempts,
            passed: progress.passed,
          }
        : null,
      status,
    };
  }

  /**
   * POST /learn/lessons/:slug/submit — grades server-side, records progress + XP + streak.
   * Body: { answers: unknown[] }. Returns per-exercise results with the correct answer and
   * a one-line explanation, plus the awarded XP delta and refreshed stats.
   */
  async submitLesson(user, slug, body = {}) {
    if (!slug || typeof slug !== "string") throw new ValidationError("Missing lesson slug");
    const lesson = await this.repository.findLessonBySlug(slug);
    if (!lesson) throw new NotFoundError("Lesson not found");

    const status = await this._statusForLesson(user, lesson);
    if (status === "locked") {
      throw new ForbiddenError("Finish the lessons before this one to unlock it.");
    }

    const graded = gradeLesson(lesson, body.answers);
    const previous = await this.repository.findProgress(user._id, lesson._id);

    // xpEarned for this lesson can only rise — retries earn the delta of a better score.
    const potentialXp = Math.round(lesson.xp * graded.score);
    const previousXp = previous?.xpEarned ?? 0;
    const previousBestScore = previous?.score ?? 0;
    const wasPassed = previous?.passed ?? false;
    const newBestScore = Math.max(previousBestScore, graded.score);
    const newXpTotal = Math.max(previousXp, potentialXp);
    const xpDelta = newXpTotal - previousXp;
    const nowPassed = wasPassed || graded.passed;
    const firstCompletedAt = previous?.firstCompletedAt ?? (graded.passed ? new Date() : null);

    await this.repository.upsertProgress(user._id, lesson._id, {
      score: newBestScore,
      xpEarned: newXpTotal,
      attempts: (previous?.attempts ?? 0) + 1,
      passed: nowPassed,
      firstCompletedAt,
      lastAttemptAt: new Date(),
    });

    const stats = await this.repository.getOrCreateStats(user._id);
    refreshDailyCounters(stats);
    applyStreakOnSubmit(stats);
    stats.xp += xpDelta;
    stats.todayXp += xpDelta;
    stats.totalAnswers += graded.total;
    stats.correctAnswers += graded.correct;
    if (graded.passed && !wasPassed) stats.lessonsDone += 1;
    await stats.save();

    return {
      score: graded.score,
      correct: graded.correct,
      total: graded.total,
      passed: graded.passed,
      xpEarned: xpDelta,
      totalXpForLesson: newXpTotal,
      results: graded.results,
      stats: formatStats(stats),
    };
  }

  /**
   * POST /learn/lessons/:slug/check — grades ONE answer for instant feedback in the player.
   * Body: { index, answer }. Stores nothing; XP/progress only change on `submitLesson`, which
   * re-grades every answer server-side. The client locks an answer once it has been checked.
   */
  async checkAnswer(user, slug, body = {}) {
    if (!slug || typeof slug !== "string") throw new ValidationError("Missing lesson slug");
    const { index, answer } = body;
    const lesson = await this.repository.findLessonBySlug(slug);
    if (!lesson) throw new NotFoundError("Lesson not found");
    if (!Number.isInteger(index) || index < 0 || index >= lesson.exercises.length) {
      throw new ValidationError(`\`index\` must be an integer between 0 and ${lesson.exercises.length - 1}`);
    }
    const status = await this._statusForLesson(user, lesson);
    if (status === "locked") {
      throw new ForbiddenError("Finish the lessons before this one to unlock it.");
    }
    const exercise = lesson.exercises[index];
    return {
      index,
      isCorrect: gradeAnswer(exercise, answer),
      correctAnswer: exercise.answer,
      explanation: exercise.explanation ?? "",
    };
  }

  // -- AI practice ---------------------------------------------------------------------

  /**
   * POST /learn/practice/:sessionId/check — instant feedback for one question in a practice
   * round, mirroring `checkAnswer` for lessons. Stores nothing: XP and stats only move on
   * `submitPractice`, which re-grades every answer from the session.
   */
  async checkPracticeAnswer(user, sessionId, body = {}) {
    if (!sessionId || typeof sessionId !== "string") throw new ValidationError("Missing session id");
    const { index, answer } = body;
    const session = await this.repository.findPracticeSession(user._id, sessionId);
    if (!session) throw new NotFoundError("Practice session not found or expired");
    if (!Number.isInteger(index) || index < 0 || index >= session.exercises.length) {
      throw new ValidationError(`\`index\` must be an integer between 0 and ${session.exercises.length - 1}`);
    }
    const exercise = session.exercises[index];
    return {
      index,
      isCorrect: gradeAnswer(exercise, answer),
      correctAnswer: exercise.answer,
      explanation: exercise.explanation ?? "",
    };
  }

  /**
   * POST /learn/lessons/:slug/practice — generates fresh exercises on the lesson's topic
   * via DeepSeek and opens a practice session.
   *
   * Answers are stored server-side on the session (never sent to the client), so the round
   * is graded exactly like an authored lesson. Locked lessons are rejected.
   *
   * @returns {{ sessionId, lesson: { id, title }, exercises: PublicExercise[], model }}
   */
  async generatePractice(user, slug, { count } = {}) {
    if (!slug || typeof slug !== "string") throw new ValidationError("Missing lesson slug");
    const lesson = await this.repository.findLessonBySlug(slug);
    if (!lesson) throw new NotFoundError("Lesson not found");

    const status = await this._statusForLesson(user, lesson);
    if (status === "locked") {
      throw new ForbiddenError("Finish the lessons before this one to unlock it.");
    }

    const units = await this.repository.listUnits();
    const unit = units.find((u) => String(u._id) === String(lesson.unitId));

    const { exercises, model } = await this.practiceService.generate({
      lesson,
      unitTitle: unit?.title ?? "",
      count,
      level: user.level,
    });

    const session = await this.repository.createPracticeSession({
      userId: user._id,
      lessonId: lesson._id,
      exercises,
      model,
    });

    return {
      sessionId: String(session._id),
      lesson: { id: lesson.slug, title: lesson.title },
      exercises: exercises.map(publicExercise),
      model,
    };
  }

  /**
   * POST /learn/practice/:sessionId/submit — grades a practice round.
   *
   * Practice affects streak, todayXp and accuracy, but never `lessonsDone` or LessonProgress:
   * only real lessons count as completions, so practice can't unlock the next lesson.
   * Sessions are single-use.
   */
  async submitPractice(user, sessionId, body = {}) {
    if (!sessionId || typeof sessionId !== "string") throw new ValidationError("Missing session id");
    const session = await this.repository.findPracticeSession(user._id, sessionId);
    if (!session) throw new NotFoundError("Practice session not found or expired");
    if (session.status === "completed") {
      throw new ValidationError("This practice round has already been submitted");
    }

    const graded = gradeLesson({ exercises: session.exercises }, body.answers);
    const xpEarned = graded.correct * PRACTICE_XP_PER_CORRECT;

    session.status = "completed";
    session.score = graded.score;
    session.correct = graded.correct;
    session.total = graded.total;
    session.xpEarned = xpEarned;
    session.completedAt = new Date();
    await session.save();

    const stats = await this.repository.getOrCreateStats(user._id);
    refreshDailyCounters(stats);
    applyStreakOnSubmit(stats);
    stats.xp += xpEarned;
    stats.todayXp += xpEarned;
    stats.totalAnswers += graded.total;
    stats.correctAnswers += graded.correct;
    await stats.save();

    return {
      score: graded.score,
      correct: graded.correct,
      total: graded.total,
      passed: graded.passed,
      xpEarned,
      results: graded.results,
      stats: formatStats(stats),
    };
  }

  // -- private (underscore prefix; not enforced by the language) --------------------

  async _statusForLesson(user, lesson) {
    const [units, lessons, progress] = await Promise.all([
      this.repository.listUnits(),
      this.repository.listLessons(),
      this.repository.listProgressForUser(user._id),
    ]);
    const progressByLessonId = new Map(progress.map((p) => [String(p.lessonId), p]));
    const shaped = shapePath(units, lessons, progressByLessonId, recommendedUnitSlug(user));
    for (const unit of shaped) {
      const found = unit.lessons.find((l) => l.id === lesson.slug);
      if (found) return found.status;
    }
    return "locked";
  }

  // -- cleanup (called by UserService.deleteMe / webhook handler) --------------------

  async deleteAllForUser(userId) {
    await Promise.all([
      this.repository.deleteAllProgressForUser(userId),
      this.repository.deleteStatsForUser(userId),
      this.repository.deleteAllPracticeForUser(userId),
    ]);
  }
}
