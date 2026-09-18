// @file backend/api/ai.js
import protect from "../middlewares/protect.js";
import { aiLimiter } from "../middlewares/rate-limit.js";
import AIService from "../services/ai-service.js";
import { sendSuccess } from "../utils/index.js";

const ai = (app) => {
  const service = new AIService();

  // Body: { messages: [{ role: "user" | "assistant", content: string }, ...] }  (last = user)
  // Returns: { message: { role: "assistant", content }, model, usage }
  app.post("/api/v1/ai/chat", protect, aiLimiter, async (req, res) => {
    const result = await service.chat(req.user, req.body?.messages);
    sendSuccess(res, result);
  });
};

export default ai;
