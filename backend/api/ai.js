// @file backend/api/ai.js
import protect from "../middlewares/protect.js";
import { aiLimiter } from "../middlewares/rate-limit.js";
import AIService from "../services/ai-service.js";
import { sendSuccess } from "../utils/index.js";

const ai = (app) => {
  const service = new AIService();

  /**
   * The finance assistant. Stateless — the app sends the conversation each time.
   *
   * Body:    { messages: [{ role: "user" | "assistant", content: string }, ...] }  (last = user)
   * Returns: { message: { role: "assistant", content }, model, usage, toolsUsed }
   *
   * `toolsUsed` names the tools the model called to answer (services/ai-tools.js). The app shows it
   * as a "checked your spending" hint, and it makes grounding auditable: an answer full of figures
   * with an empty `toolsUsed` means the model made them up.
   *
   * A request can take a while — the assistant may run several tool round-trips before replying.
   */
  app.post("/api/v1/ai/chat", protect, aiLimiter, async (req, res) => {
    const result = await service.chat(req.user, req.body?.messages);
    sendSuccess(res, result);
  });
};

export default ai;
