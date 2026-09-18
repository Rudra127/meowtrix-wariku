// @file backend/services/voice-service.js
// Turns "spent four fifty on groceries and got my salary" into structured draft transactions.
//
// Pipeline:  audio ──lib/transcribe.js──▶ transcript ──DeepSeek (JSON mode)──▶ drafts ──▶ user reviews
//
// Drafts are deliberately NOT saved here. Speech recognition mishears numbers ("fifty"/"fifteen",
// "lakh"/"lack") and a wrong amount silently poisoning someone's ledger is a much worse failure than
// one extra tap. api/finance.js returns drafts; the app pre-selects them and saves on confirm.
import { createChatCompletion } from "../lib/deepseek.js";
import { transcribeAudio } from "../lib/transcribe.js";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  categoriesFor,
  normaliseCategory,
} from "../database/models/categories.js";
import { localDateKey, localParts, parseDate } from "../utils/dates.js";
import { MAX_AMOUNT_MINOR } from "./finance-service.js";
import { UpstreamError, ValidationError } from "../utils/index.js";

export const MAX_TRANSCRIPT_LENGTH = 1000;
/** More than this in one breath is almost certainly a misparse, not a real batch. */
export const MAX_DRAFTS = 10;

/**
 * Biases the speech decoder towards money vocabulary. Whisper takes a `prompt` as a style/vocab
 * hint, which noticeably improves digits and Indian number words.
 */
export const STT_PROMPT =
  "Personal finance voice note. Expect amounts, rupees, dollars, lakh, crore, thousand, " +
  "and words like spent, paid, bought, received, salary, rent, groceries, Swiggy, Zomato, Uber, petrol, EMI, SIP.";

const buildExtractionPrompt = (user, timeZone) => {
  const now = new Date();
  const today = localDateKey(now, timeZone);
  const { year, month, day } = localParts(now, timeZone);
  const weekday = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });

  return [
    "You extract personal-finance transactions from a short spoken note and reply with JSON only.",
    "",
    `Today is ${weekday}, ${today}. The user's currency is ${user.currency || "INR"}.`,
    "",
    "Reply with this exact JSON shape:",
    '{"transactions":[{"type":"expense|income","amount":<number>,"category":"<id>",' +
      '"title":"<short label>","date":"YYYY-MM-DD","confidence":<0-1>}],"unclear":["<phrase>"]}',
    "",
    `Expense categories: ${EXPENSE_CATEGORIES.join(", ")}.`,
    `Income categories: ${INCOME_CATEGORIES.join(", ")}.`,
    "",
    "Rules:",
    `- "amount" is a positive number in whole ${user.currency || "INR"} units (₹125.50 → 125.5), never in paise/cents.`,
    '- Resolve spoken magnitudes: "2k" → 2000, "1.5 lakh" → 150000, "2 crore" → 20000000.',
    '- Default to type "expense". Use "income" only for clear earnings: salary, got paid, received, refund, dividend.',
    "- One note can contain several transactions. Emit one object per distinct amount.",
    '- "date" defaults to today. Resolve relative words ("yesterday", "last Friday", "on the 3rd") ' +
      "against today's date. Never emit a future date.",
    '- "title" is a short human label: the merchant or the thing bought ("Swiggy", "Metro card", ' +
      '"Salary"). Max 60 characters. Never put the amount in the title.',
    '- "confidence" is how sure you are of the amount AND the category. Below 0.5 means the user ' +
      "should double-check it.",
    "- If a phrase mentions money but you cannot determine an amount, add the phrase to " +
      '"unclear" and do NOT invent a transaction for it.',
    "- Never invent amounts, merchants or dates that were not spoken.",
    '- If the note contains no transaction at all, return {"transactions":[],"unclear":[]}.',
  ].join("\n");
};

/** Parses the model's JSON, tolerating the ```json fences some models still emit. */
const parseModelJson = (content) => {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    // Last resort: pull the outermost object out of any surrounding prose.
    const match = /\{[\s\S]*\}/.exec(cleaned);
    if (!match) throw new UpstreamError("Could not understand the assistant's reply — please try again");
    try {
      return JSON.parse(match[0]);
    } catch {
      throw new UpstreamError("Could not understand the assistant's reply — please try again");
    }
  }
};

export default class VoiceService {
  constructor({ complete = createChatCompletion, transcribe = transcribeAudio } = {}) {
    this.complete = complete;
    this.transcribe = transcribe;
  }

  /** Audio → transcript → drafts. */
  async captureFromAudio(user, buffer, { mimeType, filename, language } = {}) {
    const { text, model: sttModel } = await this.transcribe(buffer, {
      mimeType,
      filename,
      language,
      prompt: STT_PROMPT,
    });
    if (!text) {
      return { transcript: "", drafts: [], unclear: [], sttModel, message: "I couldn't hear anything — try again." };
    }
    const result = await this.captureFromText(user, text);
    return { ...result, sttModel };
  }

  /** Text → drafts. Also the typed fallback when speech-to-text isn't configured. */
  async captureFromText(user, text) {
    const transcript = typeof text === "string" ? text.trim() : "";
    if (!transcript) throw new ValidationError("`text` must be a non-empty string", { text: "Required" });
    if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
      throw new ValidationError(`Keep it under ${MAX_TRANSCRIPT_LENGTH} characters`, { text: "Too long" });
    }

    const timeZone = user.timezone || "Asia/Kolkata";
    const result = await this.complete(
      [
        { role: "system", content: buildExtractionPrompt(user, timeZone) },
        { role: "user", content: transcript },
      ],
      {
        // Extraction wants determinism, not creativity.
        temperature: 0,
        maxTokens: 900,
        responseFormat: { type: "json_object" },
      }
    );

    const parsed = parseModelJson(result.content);
    const drafts = this.#toDrafts(parsed?.transactions, timeZone);
    const unclear = Array.isArray(parsed?.unclear)
      ? parsed.unclear.filter((p) => typeof p === "string" && p.trim()).slice(0, 5)
      : [];

    return {
      transcript,
      drafts,
      unclear,
      model: result.model,
      usage: result.usage,
      message: this.#summarise(drafts, unclear),
    };
  }

  /**
   * Validates and normalises the model's rows into draft transactions the app can show and POST
   * back unchanged. Anything unusable is dropped rather than guessed at.
   */
  #toDrafts(rows, timeZone) {
    if (!Array.isArray(rows)) return [];
    const drafts = [];

    for (const row of rows.slice(0, MAX_DRAFTS)) {
      const type = row?.type === "income" ? "income" : "expense";

      // Major units → minor units. This is the only float→integer conversion in the stack, and it
      // rounds once, here, on purpose.
      const major = typeof row?.amount === "number" ? row.amount : Number.parseFloat(row?.amount);
      if (!Number.isFinite(major) || major <= 0) continue;
      const amount = Math.round(major * 100);
      if (amount < 1 || amount > MAX_AMOUNT_MINOR) continue;

      const date = parseDate(row?.date, timeZone) ?? new Date();
      // A misheard year ("twenty twenty-nine") shouldn't book an expense in the future.
      const safeDate = date.getTime() > Date.now() ? new Date() : date;

      const title = typeof row?.title === "string" ? row.title.trim().slice(0, 60) : "";
      const confidence = typeof row?.confidence === "number" ? Math.min(1, Math.max(0, row.confidence)) : 0.6;

      drafts.push({
        type,
        amount,
        category: normaliseCategory(row?.category, type),
        title,
        date: safeDate.toISOString(),
        confidence,
        /** The app pre-selects these; low-confidence rows still need a look. */
        needsReview: confidence < 0.5 || !title,
      });
    }
    return drafts;
  }

  #summarise(drafts, unclear) {
    if (!drafts.length) {
      return unclear.length
        ? "I heard something about money but couldn't pin down an amount."
        : "I couldn't find a transaction in that.";
    }
    const noun = drafts.length === 1 ? "transaction" : "transactions";
    const flagged = drafts.filter((d) => d.needsReview).length;
    return flagged
      ? `Found ${drafts.length} ${noun} — check the highlighted one${flagged > 1 ? "s" : ""}.`
      : `Found ${drafts.length} ${noun}.`;
  }

  /** Category lists for the app's review UI, so it never hard-codes them. */
  static categoryOptions() {
    return { expense: categoriesFor("expense"), income: categoriesFor("income") };
  }
}
