// @file backend/api/learn.js
// HTTP layer for the Learn tab. Thin — everything real lives in services/learn-service.js.
import protect from "../middlewares/protect.js";
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

  // Grade a submission server-side. Body: { answers: unknown[] } — one per exercise, in order.
  // Returns per-exercise { isCorrect, correctAnswer, explanation }, awarded XP, refreshed stats.
  app.post("/api/v1/learn/lessons/:slug/submit", protect, async (req, res) => {
    sendSuccess(res, await service.submitLesson(req.user, req.params.slug, req.body));
  });
};

export default learn;
