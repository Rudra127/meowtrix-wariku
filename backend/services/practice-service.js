// @file backend/services/practice-service.js
// Generates extra practice exercises for a lesson using DeepSeek.
//
// The model is untrusted input: everything it returns goes through `parseGeneratedExercises`,
// which drops anything that doesn't match the exact exercise contract in database/models/lesson.js.
// A malformed or hallucinated exercise is discarded rather than shown to the user, and if nothing
// survives validation we fail with an UpstreamError instead of serving garbage.
import { EXERCISE_TYPES } from "../database/models/lesson.js";
import { createChatCompletion } from "../lib/deepseek.js";
import { UpstreamError } from "../utils/index.js";

export const MIN_PRACTICE_COUNT = 1;
export const MAX_PRACTICE_COUNT = 5;
export const DEFAULT_PRACTICE_COUNT = 4;

const MAX_PROMPT_LENGTH = 300;
const MAX_EXPLANATION_LENGTH = 300;
const MAX_OPTION_LENGTH = 160;

const LEVEL_GUIDANCE = {
  beginner: "The learner is a beginner: use plain language, small round numbers, and everyday situations.",
  intermediate: "The learner knows the basics: you may use terms like SIP, APR, EMI or index fund without defining them.",
  advanced: "The learner is experienced: make the questions genuinely challenging and quantitative.",
};

/** Normalised form used to detect near-duplicate prompts. */
const normalise = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Builds the generation prompt. Mentions "JSON" explicitly because DeepSeek's JSON mode
 * requires it. Existing prompts are included so the model avoids repeating them.
 */
export const buildPracticePrompt = ({ lesson, unitTitle, count, level }) => {
  const existing = (lesson.exercises ?? []).map((e) => `- ${e.prompt}`).join("\n");
  return [
    {
      role: "system",
      content: [
        "You write practice questions for Wariku, a personal-finance learning app used mainly in India.",
        "Return ONLY a JSON object of the form {\"exercises\": [ ... ]} with no prose and no markdown fences.",
        "",
        "Each exercise object must be exactly one of these four shapes:",
        '{"type":"multiple_choice","prompt":string,"options":[string,string,string,string],"answer":<0-based index of the correct option>,"explanation":string}',
        '{"type":"true_false","prompt":string,"answer":true|false,"explanation":string}',
        '{"type":"fill_number","prompt":string,"answer":<number>,"tolerance":<number, use 0 for exact>,"explanation":string}',
        '{"type":"order_steps","prompt":string,"options":[string,string,string],"answer":[0,1,2],"explanation":string}',
        "",
        "Rules:",
        "- For order_steps, list `options` already in the CORRECT order and set answer to [0,1,2,...].",
        "- For fill_number, the answer must be a plain number: no currency symbols, commas or units.",
        "- Amounts are Indian rupees. Use realistic Indian figures (salaries, rents, EMIs, UPI limits).",
        "- `explanation` is one short sentence saying why the answer is right.",
        "- Every question must be factually correct and unambiguous, with exactly one right answer.",
        "- Do not repeat the existing questions listed by the user.",
        "- Keep prompts under 200 characters.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Lesson: "${lesson.title}" (unit: "${unitTitle || "General"}")`,
        lesson.summary ? `What it covers: ${lesson.summary}` : "",
        level ? LEVEL_GUIDANCE[level] ?? "" : "",
        "",
        existing ? `Questions that already exist (do NOT repeat these):\n${existing}` : "",
        "",
        `Write ${count} new practice questions on this topic as JSON. Mix the question types.`,
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
};

/** Pulls a JSON value out of a model response, tolerating ```json fences and stray prose. */
export const extractJson = (content) => {
  const text = String(content ?? "").trim();
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    // Fall back to the outermost {...} or [...] block in the response.
    const match = unfenced.match(/[[{][\s\S]*[\]}]/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
};

const cleanText = (value, max) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max).trim() : trimmed;
};

const cleanOptions = (value, { min, max }) => {
  if (!Array.isArray(value) || value.length < min || value.length > max) return null;
  const options = value.map((o) => cleanText(o, MAX_OPTION_LENGTH));
  if (options.some((o) => o === null)) return null;
  // Duplicate options make a question ambiguous.
  if (new Set(options.map(normalise)).size !== options.length) return null;
  return options;
};

/** Validates one candidate exercise. Returns a clean exercise, or null to discard it. */
const validateExercise = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  if (!EXERCISE_TYPES.includes(raw.type)) return null;

  const prompt = cleanText(raw.prompt, MAX_PROMPT_LENGTH);
  if (!prompt) return null;
  const explanation = cleanText(raw.explanation, MAX_EXPLANATION_LENGTH) ?? "";

  switch (raw.type) {
    case "multiple_choice": {
      const options = cleanOptions(raw.options, { min: 2, max: 6 });
      if (!options) return null;
      if (!Number.isInteger(raw.answer) || raw.answer < 0 || raw.answer >= options.length) return null;
      return { type: raw.type, prompt, options, answer: raw.answer, tolerance: 0, explanation };
    }
    case "true_false": {
      if (typeof raw.answer !== "boolean") return null;
      return { type: raw.type, prompt, answer: raw.answer, tolerance: 0, explanation };
    }
    case "fill_number": {
      const answer = typeof raw.answer === "number" ? raw.answer : Number(raw.answer);
      if (!Number.isFinite(answer)) return null;
      const tolerance =
        Number.isFinite(raw.tolerance) && raw.tolerance >= 0 ? Math.min(raw.tolerance, Math.abs(answer) || 1) : 0;
      return { type: raw.type, prompt, answer, tolerance, explanation };
    }
    case "order_steps": {
      const options = cleanOptions(raw.options, { min: 3, max: 6 });
      if (!options) return null;
      if (!Array.isArray(raw.answer) || raw.answer.length !== options.length) return null;
      // `answer` must be a permutation of every index exactly once.
      const sorted = [...raw.answer].sort((a, b) => a - b);
      const isPermutation = sorted.every((v, i) => v === i);
      if (!isPermutation) return null;
      return { type: raw.type, prompt, options, answer: [...raw.answer], tolerance: 0, explanation };
    }
    default:
      return null;
  }
};

/**
 * Validates a whole model response into usable exercises.
 * Accepts `{ exercises: [...] }` or a bare array. Drops invalid entries, prompts that duplicate
 * each other, and prompts that duplicate `existingPrompts`.
 *
 * @param {unknown} payload           Parsed JSON from the model.
 * @param {{ existingPrompts?: string[], max?: number }} [options]
 * @returns {Array} zero or more clean exercises
 */
export const parseGeneratedExercises = (payload, { existingPrompts = [], max = MAX_PRACTICE_COUNT } = {}) => {
  const list = Array.isArray(payload) ? payload : Array.isArray(payload?.exercises) ? payload.exercises : null;
  if (!list) return [];

  const seen = new Set(existingPrompts.map(normalise));
  const out = [];
  for (const raw of list) {
    if (out.length >= max) break;
    const exercise = validateExercise(raw);
    if (!exercise) continue;
    const key = normalise(exercise.prompt);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(exercise);
  }
  return out;
};

export const clampCount = (value) => {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return DEFAULT_PRACTICE_COUNT;
  return Math.min(MAX_PRACTICE_COUNT, Math.max(MIN_PRACTICE_COUNT, n));
};

export default class PracticeService {
  /** @param {typeof createChatCompletion} [complete] Injectable for tests. */
  constructor(complete = createChatCompletion) {
    this.complete = complete;
  }

  /**
   * Asks the model for `count` fresh exercises on a lesson's topic.
   * @returns {Promise<{ exercises: Array, model: string, usage: object|null }>}
   * @throws {UpstreamError} when nothing the model returned passes validation.
   */
  async generate({ lesson, unitTitle, count = DEFAULT_PRACTICE_COUNT, level }) {
    const wanted = clampCount(count);
    // Ask for a couple extra so validation drop-outs don't leave us short.
    const messages = buildPracticePrompt({ lesson, unitTitle, count: Math.min(wanted + 2, 8), level });

    const result = await this.complete(messages, {
      temperature: 1.0, // some variety between rounds
      maxTokens: 1600,
      jsonMode: true,
    });

    const exercises = parseGeneratedExercises(extractJson(result.content), {
      existingPrompts: (lesson.exercises ?? []).map((e) => e.prompt),
      max: wanted,
    });

    if (exercises.length === 0) {
      console.error("[practice] no valid exercises in model response:", String(result.content).slice(0, 500));
      throw new UpstreamError("Couldn't generate practice questions right now. Please try again.");
    }

    return { exercises, model: result.model, usage: result.usage };
  }
}
