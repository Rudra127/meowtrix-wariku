// @file backend/services/ai-service.js
// "Ask AI" tab — finance assistant on top of DeepSeek.
// Starter implementation: stateless, non-streaming. See docs/ROADMAP.md for next steps
// (persisted conversations, streaming, grounding answers in the user's own finance data).
import { createChatCompletion } from "../lib/deepseek.js";
import { ValidationError } from "../utils/index.js";

export const MAX_MESSAGES = 40;
export const MAX_CONTENT_LENGTH = 4000;

export const buildSystemPrompt = (user) =>
  [
    "You are Wariku's personal-finance assistant inside a mobile app that teaches money skills.",
    "Explain concepts simply, with concrete numbers and short examples. Prefer bullet points.",
    "You give general financial education, not regulated investment, tax or legal advice:",
    "when a question depends on someone's specific situation, say what information matters and",
    "suggest consulting a qualified professional for binding decisions. Never invent facts,",
    "prices or regulations; say when you are unsure. Keep answers under 250 words unless asked.",
    `The user's name is ${user.firstName || "there"} and their preferred currency is ${user.currency || "INR"}.`,
  ].join(" ");

/** Validates client-supplied chat history. Clients may only send user/assistant turns. */
export const validateMessages = (messages) => {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new ValidationError("`messages` must be a non-empty array");
  }
  if (messages.length > MAX_MESSAGES) {
    throw new ValidationError(`At most ${MAX_MESSAGES} messages per request`);
  }
  const clean = messages.map((m, i) => {
    if (!m || !["user", "assistant"].includes(m.role)) {
      throw new ValidationError(`messages[${i}].role must be "user" or "assistant"`);
    }
    if (typeof m.content !== "string" || !m.content.trim()) {
      throw new ValidationError(`messages[${i}].content must be a non-empty string`);
    }
    if (m.content.length > MAX_CONTENT_LENGTH) {
      throw new ValidationError(`messages[${i}].content exceeds ${MAX_CONTENT_LENGTH} characters`);
    }
    return { role: m.role, content: m.content.trim() };
  });
  if (clean.at(-1).role !== "user") throw new ValidationError("The last message must be from the user");
  return clean;
};

export default class AIService {
  constructor(complete = createChatCompletion) {
    this.complete = complete;
  }

  async chat(user, messages) {
    const history = validateMessages(messages);
    const result = await this.complete([{ role: "system", content: buildSystemPrompt(user) }, ...history]);
    return {
      message: { role: "assistant", content: result.content },
      model: result.model,
      usage: result.usage,
    };
  }
}
