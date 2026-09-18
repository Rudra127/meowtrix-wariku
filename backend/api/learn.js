// @file backend/api/learn.js
// HTTP layer for the Learn tab. Thin — everything real lives in services/learn-service.js.
import protect from "../middlewares/protect.js";
import { aiLimiter } from "../middlewares/rate-limit.js";
import LearnService from "../services/learn-service.js";
import { sendSuccess } from "../utils/index.js";

const learn = (app) => {
  const service = new LearnService();

  // Personalised path + learner stats — the whole payload the Learn tab needs on mount.
  // Returns: { units: [{ id, index, title, description, icon, lessons: [{ id, title,
  //   summary, xp, minutes, icon, status: "done"|"current"|"locked" }] }], stats }
  app.get("/api/v1/learn/path", protect, async (req, res) => {
    sendSuccess(res, await service.getPath(req.user));
  });

  // Learner stats block (streak, xp, todayXp, dailyGoalXp, lessonsDone, accuracy, badges).
  app.get("/api/v1/learn/stats", protect, async (req, res) => {
    sendSuccess(res, await service.getStats(req.user));
  });

  // One lesson with exercises — answers/explanations STRIPPED. Locked lessons return 403.
  app.get("/api/v1/learn/lessons/:slug", protect, async (req, res) => {
    sendSuccess(res, await service.getLesson(req.user, req.params.slug));
  });

  // Instant feedback for one answer while playing. Body: { index, answer }.
  // Returns { index, isCorrect, correctAnswer, explanation }. Stores nothing.
  app.post("/api/v1/learn/lessons/:slug/check", protect, async (req, res) => {
    sendSuccess(res, await service.checkAnswer(req.user, req.params.slug, req.body));
  });

  // Grade a submission server-side. Body: { answers: unknown[] } — one per exercise, in order.
  // Returns per-exercise { isCorrect, correctAnswer, explanation }, awarded XP, refreshed stats.
  app.post("/api/v1/learn/lessons/:slug/submit", protect, async (req, res) => {
    sendSuccess(res, await service.submitLesson(req.user, req.params.slug, req.body));
  });

  // AI-generated extra practice on a lesson's topic. Body: { count?: 1-5 } (default 4).
  // Rate limited like other LLM routes. Returns { sessionId, lesson, exercises } with
  // answers stripped — grade the round via the submit route below.
  app.post("/api/v1/learn/lessons/:slug/practice", protect, aiLimiter, async (req, res) => {
    sendSuccess(res, await service.generatePractice(req.user, req.params.slug, { count: req.body?.count }));
  });

  // Instant feedback for one question in a practice round. Body: { index, answer }.
  // Same contract as the lesson `check` route; stores nothing.
  app.post("/api/v1/learn/practice/:sessionId/check", protect, async (req, res) => {
    sendSuccess(res, await service.checkPracticeAnswer(req.user, req.params.sessionId, req.body));
  });

  // Grade a practice round. Body: { answers: unknown[] } — one per generated exercise, in order.
  // Awards a small XP bonus and keeps the streak alive; does not complete the lesson.
  app.post("/api/v1/learn/practice/:sessionId/submit", protect, async (req, res) => {
    sendSuccess(res, await service.submitPractice(req.user, req.params.sessionId, req.body));
  });
};

export default learn;
