// @file backend/services/ai-service.js
// "Ask AI" — a finance assistant that can read the user's own money data.
//
// It is an agent loop, not a single completion: the model may call tools (services/ai-tools.js) to
// look up real transactions, budgets, goals and Zerodha holdings, then answer from what it found.
//
//   user question
//        ↓
//   system prompt (who they are, what level, what data exists, today's date)
//        ↓
//   ┌──▶ DeepSeek ──tool_calls?──▶ run tools ──▶ append results ──┐
//   │                                                             │
//   └─────────────────── up to MAX_TOOL_ROUNDS ───────────────────┘
//        ↓ no more tool calls
//   prose answer, pitched at the user's level
//
// Grounding rule that matters most: the model must never invent a number. Every figure it states
// about the user has to come from a tool result, and the prompt says so explicitly.
import { createChatCompletion } from "../lib/deepseek.js";
import { localDateKey } from "../utils/dates.js";
import { ValidationError } from "../utils/index.js";
import { brokerageContext, connectedBrokerage } from "./brokerages.js";
import FinanceService from "./finance-service.js";
import { MAX_CALLS_PER_ROUND, MAX_TOOL_ROUNDS, buildToolSchemas, createToolRunner } from "./ai-tools.js";

export const MAX_MESSAGES = 40;
export const MAX_CONTENT_LENGTH = 4000;

/**
 * How the answer should sound. This is the single most requested behaviour: a beginner must never be
 * handed "your XIRR suggests rebalancing into debt instruments", and an advanced user must not be
 * told what a budget is.
 */
const LEVEL_GUIDANCE = {
  beginner: [
    "LEVEL — BEGINNER. They are new to managing money.",
    "Use plain, everyday words. No jargon: not APR, XIRR, NAV, expense ratio, asset allocation,",
    "liquidity, equity/debt split. If a term is genuinely unavoidable, give it in brackets in",
    "everyday words the first time. Short sentences. Ground every point in a concrete rupee example",
    "from their own data. At most three points per answer. End with one specific next step they can",
    "do today. Never assume they already have investments, a credit score target or a spreadsheet.",
  ].join(" "),
  intermediate: [
    "LEVEL — INTERMEDIATE. They budget and save already and want to level up.",
    "Common terms are fine without definition: SIP, EMI, emergency fund, index fund, APR,",
    "compounding. Be concise and practical. Compare options briefly and say which you'd lean to and",
    "why. Skip the absolute basics unless they ask.",
  ].join(" "),
  advanced: [
    "LEVEL — ADVANCED. They invest and want sharp, dense answers.",
    "Be precise and quantitative: use percentages, real rates, time horizons and post-tax figures.",
    "Discuss trade-offs and second-order effects. Technical vocabulary is expected. Do not explain",
    "fundamentals, do not pad with encouragement, and lead with the conclusion.",
  ].join(" "),
};

const GOAL_FOCUS = {
  budgeting: "controlling spending and sticking to a budget",
  saving: "building savings and an emergency fund",
  debt: "paying off debt",
  investing: "starting and growing investments",
  learning: "learning personal-finance fundamentals",
};

/**
 * @param {object} user             Mongoose user doc
 * @param {{ brokerLinked?: boolean, brokerNeedsReauth?: boolean, brokerLabel?: string }} [context]
 */
export const buildSystemPrompt = (user, context = {}) => {
  const brokerLabel = context.brokerLabel || "a brokerage";
  const timeZone = user.timezone || "Asia/Kolkata";
  const currency = user.currency || "INR";
  const today = localDateKey(new Date(), timeZone);

  const lines = [
    "You are Wariku's personal-finance assistant, inside a mobile app that teaches money skills.",
    `Today is ${today}. The user's name is ${user.firstName || "there"} and their currency is ${currency}.`,
    "",
    "WHAT YOU CAN DO",
    "You have tools that read this user's real financial data: their transactions, monthly summaries,",
    "budgets, savings goals and accounts. Use them whenever a question touches their own money —",
    'anything with "my", "I", "this month", or a specific amount. Do not ask the user for figures you',
    "can look up yourself.",
    context.brokerLinked
      ? `Their ${brokerLabel} account is linked, so you can also read their stock and mutual-fund holdings.`
      : "No brokerage account is linked. If they ask about their holdings or portfolio, tell them they " +
        "can connect Upstox or Zerodha from Profile → Connected accounts, and answer the general part " +
        "of their question in the meantime.",
    context.brokerNeedsReauth
      ? `Their ${brokerLabel} session has expired — if a holdings lookup fails, tell them to reconnect from Profile.`
      : "",
    "",
    "GROUNDING — THIS IS THE RULE THAT MATTERS MOST",
    "Never invent a number, holding, merchant, price or date about this user. Every figure you state",
    "about them must come from a tool result you actually received. If a tool returns no data, say",
    "plainly that there's nothing recorded yet and suggest adding some — never fill the gap with an",
    "example presented as fact. If a tool returns an error, explain what the user should do about it.",
    "Amounts from tools are already in the user's currency, in normal units — state them as-is.",
    "",
    "HOW TO ANSWER",
    "Lead with the answer, then the reasoning. Prefer short paragraphs or a few bullets. Use concrete",
    `${currency} amounts from their data rather than vague advice. Keep it under 250 words unless they`,
    "ask for depth. Markdown is supported: **bold** and `-` bullets render, tables do not.",
    "",
    "SCOPE AND SAFETY",
    "You give general financial education, not regulated investment, tax or legal advice. For",
    "decisions that hinge on someone's specific situation, say what information matters and suggest a",
    "qualified professional for anything binding. Never recommend buying or selling a specific",
    "security, even when you can see their holdings — you may explain what they hold, how it has",
    "performed, and concepts like diversification and risk. Never state or predict market prices you",
    "have not been given. Say when you are unsure.",
    "",
    LEVEL_GUIDANCE[user.level] ?? LEVEL_GUIDANCE.beginner,
  ];

  if (user.goal) {
    lines.push("", `Their stated goal is ${GOAL_FOCUS[user.goal]} — connect advice back to it when relevant.`);
  }
  if (!user.level) {
    lines.push(
      "",
      "They haven't told us their experience level yet, so assume a beginner and keep it simple."
    );
  }

  return lines.filter(Boolean).join("\n");
};

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
  /**
   * Dependencies are injected so tests can run the whole loop offline — see tests/ai.test.js.
   * `brokers` is a resolver with `context(user)` and `connected(user)`; defaults to the real
   * brokerages registry, and tests pass a fake.
   */
  constructor(complete = createChatCompletion, { finance, brokers } = {}) {
    this.complete = complete;
    this.finance = finance ?? new FinanceService();
    this.brokers = brokers ?? { context: brokerageContext, connected: connectedBrokerage };
  }

  /**
   * Answers one question, calling tools as needed.
   *
   * @returns {{ message: { role: "assistant", content: string }, model: string,
   *             usage: object | null, toolsUsed: string[] }}
   */
  async chat(user, messages) {
    const history = validateMessages(messages);

    // Knowing up front whether a broker is linked shapes the prompt AND the tool list, so the model
    // never offers a capability this user doesn't have. Resolve the connected broker once and reuse
    // it for the tools — never let a broker/Mongo outage break the chat.
    const { context, brokerage } = await this.#brokerState(user);
    const tools = buildToolSchemas({ brokerLinked: context.linked, brokerLabel: context.label });
    const runner = createToolRunner({ user, finance: this.finance, brokerage });

    const conversation = [
      {
        role: "system",
        content: buildSystemPrompt(user, {
          brokerLinked: context.linked,
          brokerNeedsReauth: context.needsReauth,
          brokerLabel: context.label,
        }),
      },
      ...history,
    ];

    const toolsUsed = [];
    let usage = null;
    let model = "";

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const isLastRound = round === MAX_TOOL_ROUNDS - 1;
      const result = await this.complete(conversation, {
        // On the final round, drop the tools so the model has no choice but to answer in prose.
        ...(isLastRound ? {} : { tools }),
      });

      usage = this.#addUsage(usage, result.usage);
      model = result.model || model;

      if (!result.toolCalls?.length) {
        // A reply with no tool calls AND no text would render as an empty chat bubble. Rare, but
        // "say something honest" beats "show nothing".
        const content = result.content?.trim()
          ? result.content
          : "I couldn't put an answer together for that. Could you rephrase it?";
        return {
          message: { role: "assistant", content },
          model,
          usage,
          toolsUsed,
        };
      }

      // Append the assistant's tool-call turn verbatim; the provider requires every tool_call_id to
      // be answered by a matching `tool` message.
      conversation.push(result.message);

      const calls = result.toolCalls.slice(0, MAX_CALLS_PER_ROUND);
      const outcomes = await Promise.all(calls.map((call) => runner.run(call.name, call.arguments)));

      calls.forEach((call, i) => {
        toolsUsed.push(call.name);
        conversation.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(outcomes[i]),
        });
      });

      // Any calls we trimmed still need a reply, or the next request is malformed.
      for (const dropped of result.toolCalls.slice(MAX_CALLS_PER_ROUND)) {
        conversation.push({
          role: "tool",
          tool_call_id: dropped.id,
          content: JSON.stringify({ error: { code: "TOO_MANY_CALLS", message: "Skipped — ask for less at once." } }),
        });
      }
    }

    // Ran out of rounds without prose. Rather than returning nothing, say so honestly.
    return {
      message: {
        role: "assistant",
        content: "I couldn't finish looking that up. Could you ask about one thing at a time?",
      },
      model,
      usage,
      toolsUsed,
    };
  }

  /** Never let a broker outage break the chat — degrade to "not linked". */
  async #brokerState(user) {
    try {
      const [context, brokerage] = await Promise.all([this.brokers.context(user), this.brokers.connected(user)]);
      return { context, brokerage };
    } catch (err) {
      console.error("[ai-service] could not read brokerage status", err?.message);
      return { context: { linked: false, needsReauth: false, label: "" }, brokerage: null };
    }
  }

  #addUsage(total, next) {
    if (!next) return total;
    if (!total) return { ...next };
    return {
      promptTokens: total.promptTokens + next.promptTokens,
      completionTokens: total.completionTokens + next.completionTokens,
      totalTokens: total.totalTokens + next.totalTokens,
    };
  }
}
