import "./helpers.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createChatCompletion } from "../lib/deepseek.js";
import AIService, { MAX_MESSAGES, buildSystemPrompt, validateMessages } from "../services/ai-service.js";

const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("validateMessages", () => {
  const bad = [
    ["undefined", undefined],
    ["empty array", []],
    ["system role", [{ role: "system", content: "x" }]],
    ["blank content", [{ role: "user", content: "   " }]],
    ["non-string content", [{ role: "user", content: 42 }]],
    ["too long", [{ role: "user", content: "a".repeat(4001) }]],
    ["last is assistant", [{ role: "user", content: "hi" }, { role: "assistant", content: "yo" }]],
    ["too many", Array.from({ length: MAX_MESSAGES + 1 }, () => ({ role: "user", content: "hi" }))],
  ];
  for (const [name, input] of bad) {
    it(`rejects ${name}`, () => {
      assert.throws(() => validateMessages(input), { code: "VALIDATION_ERROR", statusCode: 400 });
    });
  }

  it("accepts and trims a valid history, dropping extra keys", () => {
    const out = validateMessages([
      { role: "user", content: " What is an SIP? ", extra: 1 },
      { role: "assistant", content: "A systematic investment plan." },
      { role: "user", content: "How much should I start with?" },
    ]);
    assert.deepEqual(out[0], { role: "user", content: "What is an SIP?" });
    assert.equal(out.length, 3);
  });
});

describe("AIService.chat", () => {
  it("prepends a system prompt personalised to the user", async () => {
    let sent;
    const service = new AIService(async (messages) => {
      sent = messages;
      return { content: "Start small.", model: "deepseek-chat", usage: null };
    });
    const user = { firstName: "Asha", currency: "INR" };
    const result = await service.chat(user, [{ role: "user", content: "Budget tips?" }]);

    assert.equal(sent[0].role, "system");
    assert.equal(sent[0].content, buildSystemPrompt(user));
    assert.match(sent[0].content, /Asha/);
    assert.deepEqual(sent[1], { role: "user", content: "Budget tips?" });
    assert.deepEqual(result.message, { role: "assistant", content: "Start small." });
  });
});

describe("buildSystemPrompt personalisation", () => {
  it("adapts tone to level and mentions the goal", () => {
    const beginner = buildSystemPrompt({ firstName: "A", currency: "INR", level: "beginner", goal: "debt" });
    assert.match(beginner, /avoid jargon/);
    assert.match(beginner, /paying off debt/);
    const advanced = buildSystemPrompt({ firstName: "A", currency: "INR", level: "advanced", goal: "investing" });
    assert.match(advanced, /quantitative/);
    assert.doesNotMatch(advanced, /avoid jargon/);
  });

  it("works for users who haven't onboarded yet", () => {
    const prompt = buildSystemPrompt({ firstName: "", currency: "INR" });
    assert.doesNotMatch(prompt, /undefined/);
  });
});

describe("createChatCompletion (DeepSeek client)", () => {
  const messages = [{ role: "user", content: "hi" }];

  it("503 when no API key is configured", async () => {
    await assert.rejects(createChatCompletion(messages, { apiKey: "" }), { statusCode: 503 });
  });

  it("sends an OpenAI-compatible request and parses the reply", async () => {
    let call;
    const fetchImpl = async (url, init) => {
      call = { url, init };
      return jsonResponse(200, {
        model: "deepseek-chat",
        choices: [{ message: { role: "assistant", content: "Hello!" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
      });
    };
    const result = await createChatCompletion(messages, { apiKey: "k", baseUrl: "https://api.test/", fetchImpl });

    assert.equal(call.url, "https://api.test/chat/completions");
    assert.equal(call.init.headers.Authorization, "Bearer k");
    const body = JSON.parse(call.init.body);
    assert.equal(body.stream, false);
    assert.deepEqual(body.messages, messages);
    assert.equal(result.content, "Hello!");
    assert.deepEqual(result.usage, { promptTokens: 5, completionTokens: 2, totalTokens: 7 });
  });

  it("maps provider 5xx → 502 UPSTREAM_ERROR", async () => {
    const fetchImpl = async () => jsonResponse(500, { error: "boom" });
    await assert.rejects(createChatCompletion(messages, { apiKey: "k", fetchImpl }), {
      statusCode: 502,
      code: "UPSTREAM_ERROR",
    });
  });

  it("maps bad key / no balance (401/402) → 503", async () => {
    for (const status of [401, 402]) {
      const fetchImpl = async () => jsonResponse(status, {});
      await assert.rejects(createChatCompletion(messages, { apiKey: "k", fetchImpl }), { statusCode: 503 });
    }
  });

  it("maps network failures → 502", async () => {
    const fetchImpl = async () => {
      throw new TypeError("fetch failed");
    };
    await assert.rejects(createChatCompletion(messages, { apiKey: "k", fetchImpl }), { statusCode: 502 });
  });

  it("rejects replies without content → 502", async () => {
    const fetchImpl = async () => jsonResponse(200, { choices: [] });
    await assert.rejects(createChatCompletion(messages, { apiKey: "k", fetchImpl }), { statusCode: 502 });
  });
});
