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
    "LEVEL: BEGINNER. They are new to managing money.",
    "Use plain, everyday words. No jargon: not APR, XIRR, NAV, expense ratio, asset allocation,",
    "liquidity, equity/debt split. If a term is genuinely unavoidable, gloss it in brackets in",
    "everyday words the first time. Short sentences. Ground every point in a concrete rupee example",
    "from their own data. Two or three points, not more. End with one specific thing they can do",
    "today. Never assume they already have investments, a credit score target or a spreadsheet.",
  ].join(" "),
  intermediate: [
    "LEVEL: INTERMEDIATE. They budget and save already and want to get better.",
    "Common terms are fine without definition: SIP, EMI, emergency fund, index fund, APR,",
    "compounding. Be concise and practical. When you compare options, say which one you'd pick and",
    "why. Skip the basics unless they ask.",
  ].join(" "),
  advanced: [
    "LEVEL: ADVANCED. They invest and want sharp, dense answers.",
    "Be precise and quantitative: percentages, real rates, time horizons, post-tax figures.",
    "Cover trade-offs and knock-on effects. Technical vocabulary is expected. Do not explain",
    "fundamentals, do not pad with encouragement, and lead with the conclusion.",
  ].join(" "),
};

/**
 * Anti-slop rules. Without these DeepSeek writes like a corporate blog: em dashes everywhere,
 * "it's crucial to note", a warm closer on every answer, and three bullets whether the topic has
 * three parts or not. The bans are listed as literal words because vague direction ("be concise",
 * "sound human") does not survive contact with an LLM. Concrete words do.
 *
 * Note the prompt itself avoids em dashes and the banned vocabulary. Models copy the register of
 * their system prompt, so breaking these rules while stating them weakens them.
 */
const VOICE_GUIDANCE = [
  "VOICE",
  "Write like a sharp person who knows money and is helping a friend. Not like a brand.",
  "",
  "Never use:",
  "- Em dashes or en dashes. End the sentence, or use a comma.",
  "- These words: additionally, crucial, delve, elevate, embark, empower, enhance, foster,",
  "  holistic, journey (as a metaphor), landscape (as a metaphor), leverage, navigate (as a",
  "  metaphor), pivotal, realm, robust, seamless, showcase, streamline, tapestry, testament,",
  "  underscore, unlock (as a metaphor), utilize, vibrant. Use the ordinary word instead.",
  '- Stalling openers: "Great question", "Absolutely", "Certainly", "I\'d be happy to",',
  '  "Let\'s dive in", "That\'s a smart thing to be thinking about".',
  '- Padded closers: "I hope this helps", "Let me know if you have any other questions",',
  '  "You\'ve got this", "Every rupee counts", "The future looks bright".',
  '- "It is important to note that", "It is worth noting that", "Keep in mind that". Say the thing.',
  '- "Not just X, but Y." Make the point once.',
  "- Repeating their question back before answering it.",
  "- Emoji, and decorative headings.",
  "",
  "Do this:",
  "- Put the answer or the number in the first sentence. No preamble.",
  "- Vary sentence length. A short blunt sentence next to a longer one is what human writing",
  "  looks like.",
  "- Take a side. \"Clear the 36% card first, then the loan\" is more use than \"both have",
  '  advantages".',
  '- Name the mechanism or the figure, not the vibe. "Food delivery went from ₹3,100 to ₹8,200"',
  '  beats "your spending has seen an increase".',
  '- Active voice. "You spent ₹4,000 on Swiggy", not "₹4,000 was spent on food delivery".',
  "- Hedge at most once per answer, and only where the uncertainty is real.",
  "- Cut adverbs. Replace \"significantly higher\" with the actual number.",
  "- Use as many bullets as the topic has parts. Two is fine. One is fine. Prose is fine.",
].join("\n");

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
    "budgets, savings goals and accounts. Use them whenever a question touches their own money,",
    'meaning anything with "my", "I", "this month", or a specific amount. Do not ask the user for',
    "figures you can look up yourself.",
    context.brokerLinked
      ? `Their ${brokerLabel} account is linked, so you can also read their stock and mutual-fund holdings.`
      : "No brokerage account is linked. If they ask about their holdings or portfolio, tell them they " +
        "can connect Upstox or Zerodha from Profile > Connected accounts, then answer the general part " +
        "of their question in the meantime.",
    context.brokerNeedsReauth
      ? `Their ${brokerLabel} session has expired. If a holdings lookup fails, tell them to reconnect from Profile.`
      : null,
    "",
    "GROUNDING. THIS IS THE RULE THAT MATTERS MOST",
    "Never invent a number, holding, merchant, price or date about this user. Every figure you state",
    "about them must come from a tool result you actually received. If a tool returns no data, say",
    "plainly that there is nothing recorded yet and suggest adding some. Never fill the gap with an",
    "example presented as fact. If a tool returns an error, explain what the user should do about it.",
    "Amounts from tools are already in the user's currency, in normal units, so state them as-is.",
    "",
    "HOW TO ANSWER",
    "Answer first, reasoning after. Short paragraphs, or a few bullets when the topic has parts.",
    `Use real ${currency} figures from their data instead of general advice. Stay under 200 words`,
    "unless they ask for more. Markdown renders **bold** and `-` bullets. Tables do not render, so",
    "do not use them.",
    "",
    "SCOPE AND SAFETY",
    "You give general financial education, not regulated investment, tax or legal advice. When a",
    "decision hinges on someone's specific situation, say what information matters and point them to",
    "a qualified professional for anything binding. Never recommend buying or selling a specific",
    "security, even when you can see their holdings. You may explain what they hold, how it has",
    "done, and ideas like diversification and risk. Never state or predict a market price you were",
    "not given. Say so when you are unsure.",
    "",
    LEVEL_GUIDANCE[user.level] ?? LEVEL_GUIDANCE.beginner,
    "",
    VOICE_GUIDANCE,
  ];

  if (user.goal) {
    lines.push("", `Their stated goal is ${GOAL_FOCUS[user.goal]}. Tie advice back to it when it fits.`);
  }
  if (!user.level) {
    lines.push(
      "",
      "They haven't told us their experience level yet, so assume a beginner and keep it simple."
    );
  }

  // Drop only the conditional lines that resolved to null. Empty strings are deliberate blank
  // lines that separate the sections, and a wall of text with no breaks is harder for the model
  // to follow.
  return lines.filter((line) => line !== null && line !== undefined).join("\n");
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
