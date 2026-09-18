// @file backend/tests/practice.test.js
// Offline tests for AI practice generation. The model is untrusted input, so the bulk of
// this file hammers `parseGeneratedExercises` with the kinds of malformed output an LLM
// actually produces. No network: PracticeService takes an injected `complete`.
import "./helpers.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import PracticeService, {
  DEFAULT_PRACTICE_COUNT,
  MAX_PRACTICE_COUNT,
  buildPracticePrompt,
  clampCount,
  extractJson,
  parseGeneratedExercises,
} from "../services/practice-service.js";

const mcq = (over = {}) => ({
  type: "multiple_choice",
  prompt: "What is a budget?",
  options: ["A plan", "A loan", "A tax", "A bank"],
  answer: 0,
  explanation: "It's a plan.",
  ...over,
});

const lesson = {
  title: "What is a budget?",
  summary: "Income vs expenses.",
  exercises: [{ prompt: "Existing question about budgets" }],
};

// ---- extractJson ----------------------------------------------------------------------

describe("extractJson", () => {
  it("parses plain JSON", () => {
    assert.deepEqual(extractJson('{"exercises":[]}'), { exercises: [] });
  });

  it("strips ```json fences", () => {
    assert.deepEqual(extractJson('```json\n{"exercises":[1]}\n```'), { exercises: [1] });
    assert.deepEqual(extractJson('```\n{"a":2}\n```'), { a: 2 });
  });

  it("recovers a JSON block wrapped in prose", () => {
    const out = extractJson('Sure! Here you go:\n{"exercises":[{"a":1}]}\nHope that helps.');
    assert.deepEqual(out, { exercises: [{ a: 1 }] });
  });

  it("parses a bare array", () => {
    assert.deepEqual(extractJson("[1,2,3]"), [1, 2, 3]);
  });

  it("returns null for unparseable junk", () => {
    for (const bad of ["", "not json at all", "{broken", null, undefined]) {
      assert.equal(extractJson(bad), null);
    }
  });
});

// ---- parseGeneratedExercises: happy paths ---------------------------------------------

describe("parseGeneratedExercises accepts valid shapes", () => {
  it("accepts { exercises: [...] } and a bare array alike", () => {
    assert.equal(parseGeneratedExercises({ exercises: [mcq()] }).length, 1);
    assert.equal(parseGeneratedExercises([mcq()]).length, 1);
  });

  it("accepts all four exercise types", () => {
    const out = parseGeneratedExercises([
      mcq(),
      { type: "true_false", prompt: "UPI is instant?", answer: true, explanation: "Yes." },
      { type: "fill_number", prompt: "10% of 40000?", answer: 4000, tolerance: 0, explanation: "0.1 x 40000." },
      {
        type: "order_steps",
        prompt: "Order these",
        options: ["First", "Second", "Third"],
        answer: [0, 1, 2],
        explanation: "In order.",
      },
    ]);
    assert.equal(out.length, 4);
    assert.deepEqual(
      out.map((e) => e.type),
      ["multiple_choice", "true_false", "fill_number", "order_steps"]
    );
  });

  it("normalises output: trims text and always sets tolerance + explanation", () => {
    const out = parseGeneratedExercises([
      { type: "true_false", prompt: "  spaced  ", answer: false, explanation: "  why  " },
    ]);
    assert.deepEqual(out[0], {
      type: "true_false",
      prompt: "spaced",
      answer: false,
      tolerance: 0,
      explanation: "why",
    });
  });

  it("defaults a missing explanation to an empty string", () => {
    const out = parseGeneratedExercises([mcq({ explanation: undefined })]);
    assert.equal(out[0].explanation, "");
  });

  it("coerces a numeric string answer for fill_number", () => {
    const out = parseGeneratedExercises([
      { type: "fill_number", prompt: "How much?", answer: "2500", explanation: "" },
    ]);
    assert.equal(out[0].answer, 2500);
  });
});

// ---- parseGeneratedExercises: rejection ----------------------------------------------

describe("parseGeneratedExercises rejects malformed exercises", () => {
  const cases = [
    ["a non-array payload", { nope: true }],
    ["null", null],
    ["an unknown type", [mcq({ type: "essay" })]],
    ["a missing type", [mcq({ type: undefined })]],
    ["a blank prompt", [mcq({ prompt: "   " })]],
    ["a non-string prompt", [mcq({ prompt: 42 })]],
    ["mcq with a non-integer answer", [mcq({ answer: 1.5 })]],
    ["mcq with an out-of-range answer", [mcq({ answer: 9 })]],
    ["mcq with a negative answer", [mcq({ answer: -1 })]],
    ["mcq with a string answer", [mcq({ answer: "0" })]],
    ["mcq with too few options", [mcq({ options: ["only one"] })]],
    ["mcq with duplicate options", [mcq({ options: ["Same", "same", "Other", "More"] })]],
    ["mcq with a blank option", [mcq({ options: ["ok", "  ", "c", "d"] })]],
    ["mcq with no options", [mcq({ options: undefined })]],
    ["true_false with a non-boolean answer", [{ type: "true_false", prompt: "q", answer: "yes" }]],
    ["fill_number with a non-numeric answer", [{ type: "fill_number", prompt: "q", answer: "lots" }]],
    ["fill_number with NaN", [{ type: "fill_number", prompt: "q", answer: NaN }]],
    ["fill_number with Infinity", [{ type: "fill_number", prompt: "q", answer: Infinity }]],
    ["order_steps with too few options", [{ type: "order_steps", prompt: "q", options: ["a", "b"], answer: [0, 1] }]],
    [
      "order_steps where answer length mismatches options",
      [{ type: "order_steps", prompt: "q", options: ["a", "b", "c"], answer: [0, 1] }],
    ],
    [
      "order_steps where answer is not a permutation",
      [{ type: "order_steps", prompt: "q", options: ["a", "b", "c"], answer: [0, 1, 1] }],
    ],
    [
      "order_steps with an out-of-range index",
      [{ type: "order_steps", prompt: "q", options: ["a", "b", "c"], answer: [0, 1, 5] }],
    ],
    ["order_steps with a non-array answer", [{ type: "order_steps", prompt: "q", options: ["a", "b", "c"], answer: 0 }]],
    ["a null entry", [null]],
    ["a string entry", ["just a question?"]],
  ];

  for (const [name, payload] of cases) {
    it(`drops ${name}`, () => {
      assert.deepEqual(parseGeneratedExercises(payload), []);
    });
  }

  it("keeps the good exercises and drops only the bad ones", () => {
    const out = parseGeneratedExercises([mcq({ prompt: "Good one" }), mcq({ answer: 99 }), mcq({ prompt: "Also good" })]);
    assert.equal(out.length, 2);
    assert.deepEqual(
      out.map((e) => e.prompt),
      ["Good one", "Also good"]
    );
  });

  it("clamps an oversized fill_number tolerance and ignores a negative one", () => {
    const big = parseGeneratedExercises([
      { type: "fill_number", prompt: "q", answer: 100, tolerance: 9999 },
    ]);
    assert.equal(big[0].tolerance, 100, "tolerance can't exceed the answer's magnitude");
    const negative = parseGeneratedExercises([
      { type: "fill_number", prompt: "q2", answer: 100, tolerance: -5 },
    ]);
    assert.equal(negative[0].tolerance, 0);
  });
});

// ---- de-duplication + capping --------------------------------------------------------

describe("parseGeneratedExercises de-duplicates and caps", () => {
  it("drops prompts that repeat an existing lesson question, ignoring case and punctuation", () => {
    const out = parseGeneratedExercises([mcq({ prompt: "What IS a budget???" }), mcq({ prompt: "Something new" })], {
      existingPrompts: ["What is a budget?"],
    });
    assert.equal(out.length, 1);
    assert.equal(out[0].prompt, "Something new");
  });

  it("drops duplicates within the same batch", () => {
    const out = parseGeneratedExercises([mcq({ prompt: "Same question" }), mcq({ prompt: "same question!" })]);
    assert.equal(out.length, 1);
  });

  it("never returns more than `max`", () => {
    const many = Array.from({ length: 12 }, (_, i) => mcq({ prompt: `Question number ${i}` }));
    assert.equal(parseGeneratedExercises(many, { max: 3 }).length, 3);
    assert.equal(parseGeneratedExercises(many).length, MAX_PRACTICE_COUNT);
  });
});

// ---- clampCount ----------------------------------------------------------------------

describe("clampCount", () => {
  it("defaults when the value isn't a number", () => {
    for (const v of [undefined, null, "abc", {}]) {
      assert.equal(clampCount(v), DEFAULT_PRACTICE_COUNT);
    }
  });
  it("clamps into the allowed range", () => {
    assert.equal(clampCount(0), 1);
    assert.equal(clampCount(-5), 1);
    assert.equal(clampCount(99), MAX_PRACTICE_COUNT);
    assert.equal(clampCount(3), 3);
    assert.equal(clampCount("2"), 2);
  });
});

// ---- buildPracticePrompt -------------------------------------------------------------

describe("buildPracticePrompt", () => {
  it("says JSON (required by DeepSeek's JSON mode) and describes every type", () => {
    const [system] = buildPracticePrompt({ lesson, unitTitle: "Budgeting", count: 4 });
    assert.match(system.content, /JSON/);
    for (const type of ["multiple_choice", "true_false", "fill_number", "order_steps"]) {
      assert.match(system.content, new RegExp(type));
    }
  });

  it("passes existing prompts so the model doesn't repeat them", () => {
    const [, user] = buildPracticePrompt({ lesson, unitTitle: "Budgeting", count: 4 });
    assert.match(user.content, /Existing question about budgets/);
    assert.match(user.content, /do NOT repeat/i);
  });

  it("adapts to the learner's level and never leaks `undefined`", () => {
    const [, beginner] = buildPracticePrompt({ lesson, unitTitle: "U", count: 3, level: "beginner" });
    assert.match(beginner.content, /beginner/i);
    const [, none] = buildPracticePrompt({ lesson, unitTitle: "", count: 3 });
    assert.doesNotMatch(none.content, /undefined/);
  });
});

// ---- PracticeService.generate --------------------------------------------------------

describe("PracticeService.generate", () => {
  const goodResponse = (exercises) => ({
    content: JSON.stringify({ exercises }),
    model: "deepseek-chat",
    usage: null,
  });

  it("requests JSON mode and returns validated exercises", async () => {
    let options;
    const service = new PracticeService(async (_messages, opts) => {
      options = opts;
      return goodResponse([mcq({ prompt: "Fresh question one" }), mcq({ prompt: "Fresh question two" })]);
    });
    const out = await service.generate({ lesson, unitTitle: "Budgeting", count: 2 });
    assert.equal(options.jsonMode, true);
    assert.equal(out.exercises.length, 2);
    assert.equal(out.model, "deepseek-chat");
  });

  it("asks for a few extra questions so validation drop-outs don't leave it short", async () => {
    let asked;
    const service = new PracticeService(async (messages) => {
      asked = messages.at(-1).content;
      return goodResponse([mcq({ prompt: "One" })]);
    });
    await service.generate({ lesson, unitTitle: "U", count: 2 });
    assert.match(asked, /Write 4 new practice questions/);
  });

  it("trims the result down to the requested count", async () => {
    const many = Array.from({ length: 8 }, (_, i) => mcq({ prompt: `Unique question ${i}` }));
    const service = new PracticeService(async () => goodResponse(many));
    const out = await service.generate({ lesson, unitTitle: "U", count: 2 });
    assert.equal(out.exercises.length, 2);
  });

  it("throws UPSTREAM_ERROR when nothing survives validation", async () => {
    const service = new PracticeService(async () => goodResponse([mcq({ answer: 42 }), { type: "bogus" }]));
    await assert.rejects(service.generate({ lesson, unitTitle: "U", count: 3 }), { code: "UPSTREAM_ERROR" });
  });

  it("throws UPSTREAM_ERROR when the model returns unparseable content", async () => {
    const service = new PracticeService(async () => ({ content: "I can't do that", model: "m", usage: null }));
    await assert.rejects(service.generate({ lesson, unitTitle: "U", count: 3 }), { code: "UPSTREAM_ERROR" });
  });

  it("filters out questions that duplicate the lesson's existing ones", async () => {
    const service = new PracticeService(async () =>
      goodResponse([mcq({ prompt: "Existing question about budgets" }), mcq({ prompt: "A genuinely new one" })])
    );
    const out = await service.generate({ lesson, unitTitle: "U", count: 4 });
    assert.equal(out.exercises.length, 1);
    assert.equal(out.exercises[0].prompt, "A genuinely new one");
  });

  it("propagates provider failures untouched", async () => {
    const service = new PracticeService(async () => {
      const err = new Error("provider down");
      err.code = "UPSTREAM_ERROR";
      throw err;
    });
    await assert.rejects(service.generate({ lesson, unitTitle: "U", count: 3 }), { code: "UPSTREAM_ERROR" });
  });
});
