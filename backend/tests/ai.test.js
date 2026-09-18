import "./helpers.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createChatCompletion } from "../lib/deepseek.js";
import AIService, { MAX_MESSAGES, buildSystemPrompt, validateMessages } from "../services/ai-service.js";
import { buildToolSchemas, createToolRunner, fromMajor, toMajor } from "../services/ai-tools.js";

const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Stand-ins so the agent loop runs with no Mongo and no network. */
const fakeBrokerage = (over = {}) => ({
  provider: "upstox",
  async getHoldings() {
    return {
      provider: "upstox",
      currency: "INR",
      asOf: new Date("2026-09-18T10:00:00Z"),
      fromCache: false,
      count: 1,
      investedValue: 50_000,
      currentValue: 62_500,
      pnl: 12_500,
      pnlPct: 25,
      holdings: [{ symbol: "INFY", exchange: "NSE", quantity: 10, currentValue: 62_500 }],
    };
  },
  async getPositions() {
    return { provider: "upstox", currency: "INR", asOf: new Date(), fromCache: false, count: 0, pnl: 0, positions: [] };
  },
  ...over,
});

/**
 * The brokerage resolver AIService expects: `context(user)` shapes the prompt/tools, `connected(user)`
 * returns the service the tools call. `linked` wires both up to a fakeBrokerage.
 */
const fakeBrokers = ({ linked = false, needsReauth = false, label = "Upstox", brokerage } = {}) => ({
  async context() {
    return { linked, needsReauth, label: linked || needsReauth ? label : "" };
  },
  async connected() {
    return linked ? (brokerage ?? fakeBrokerage()) : null;
  },
});

const fakeFinance = (overrides = {}) => ({
  async getSummary() {
    return {
      month: "2026-09",
      currency: "INR",
      timezone: "Asia/Kolkata",
      balance: { total: 1_184_206, openingBalance: 0, lifetimeIncome: 0, lifetimeExpense: 0 },
      totals: { income: 8_500_000, expense: 3_987_500, net: 4_512_500, count: 7 },
      previous: { month: "2026-08", income: 8_500_000, expense: 3_800_000, net: 4_700_000 },
      changePct: 4.9,
      byCategory: [{ category: "food", total: 612_000, count: 4, share: 15.3 }],
      topCategory: { category: "food", total: 612_000, count: 4 },
      budgets: [{ category: "food", month: "2026-09", limit: 800_000, spent: 612_000, remaining: 188_000, ratio: 0.765, overspent: false }],
      budgetTotals: { limit: 800_000, spent: 612_000, remaining: 188_000 },
      highlights: { saved: 2_500_000, invested: 1_500_000, netFlow: 4_512_500 },
      goals: { count: 0, targetAmount: 0, savedAmount: 0, items: [] },
      daysLeftInMonth: 12,
    };
  },
  async listTransactions() {
    return {
      items: [
        { id: "t1", type: "expense", amount: 48_900, category: "food", title: "Swiggy", date: new Date("2026-09-18"), source: "voice" },
      ],
      total: 1,
      limit: 20,
      skip: 0,
      currency: "INR",
    };
  },
  async listBudgets() {
    return { month: "2026-09", currency: "INR", budgets: [] };
  },
  async listGoals() {
    return { currency: "INR", goals: [] };
  },
  async listAccounts() {
    return [{ name: "Cash", type: "cash", openingBalance: 0 }];
  },
  async getMonthlyTrend() {
    return { currency: "INR", months: [{ month: "2026-08", income: 0, expense: 3_800_000, net: -3_800_000 }] };
  },
  async createTransaction(_user, body) {
    return { id: "new1", ...body, date: new Date("2026-09-18T12:00:00Z") };
  },
  ...overrides,
});

const user = { _id: "u1", firstName: "Asha", currency: "INR", timezone: "Asia/Kolkata", level: "beginner", goal: "budgeting" };

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

describe("buildSystemPrompt personalisation", () => {
  it("pitches a beginner answer at a beginner", () => {
    const prompt = buildSystemPrompt({ firstName: "A", currency: "INR", level: "beginner", goal: "debt" });
    assert.match(prompt, /BEGINNER/);
    assert.match(prompt, /No jargon/);
    assert.match(prompt, /paying off debt/);
    assert.doesNotMatch(prompt, /quantitative/);
  });

  it("lets an advanced user have the technical version", () => {
    const prompt = buildSystemPrompt({ firstName: "A", currency: "INR", level: "advanced", goal: "investing" });
    assert.match(prompt, /ADVANCED/);
    assert.match(prompt, /quantitative/);
    assert.doesNotMatch(prompt, /No jargon/);
  });

  it("defaults to beginner when the user hasn't onboarded", () => {
    const prompt = buildSystemPrompt({ firstName: "", currency: "INR" });
    assert.doesNotMatch(prompt, /undefined/);
    assert.match(prompt, /BEGINNER/);
    assert.match(prompt, /haven't told us their experience level/);
  });

  it("mentions the broker only in the state it is actually in", () => {
    const linked = buildSystemPrompt(user, { brokerLinked: true, brokerLabel: "Upstox" });
    assert.match(linked, /Upstox account is linked/);
    const unlinked = buildSystemPrompt(user, { brokerLinked: false });
    assert.match(unlinked, /No brokerage account is linked/);
  });

  it("always forbids inventing numbers", () => {
    assert.match(buildSystemPrompt(user), /Never invent a number/);
  });
});

describe("buildSystemPrompt voice rules", () => {
  const levels = [undefined, "beginner", "intermediate", "advanced"];

  it("bans em dashes, and practises what it preaches", () => {
    for (const level of levels) {
      const prompt = buildSystemPrompt({ ...user, level });
      assert.match(prompt, /Never use:/);
      assert.match(prompt, /Em dashes/);
      // The prompt must not contain the characters it forbids: models copy the register of
      // their system prompt, so a prompt full of em dashes teaches the model to use them.
      assert.doesNotMatch(prompt, /[—–]/, `em/en dash leaked into the ${level ?? "no-level"} prompt`);
    }
  });

  it("names the slop words it wants avoided", () => {
    const prompt = buildSystemPrompt(user);
    for (const word of ["crucial", "delve", "leverage", "utilize", "testament", "seamless"]) {
      assert.match(prompt, new RegExp(word), `${word} should be on the banned list`);
    }
  });

  it("bans the stock openers and closers", () => {
    const prompt = buildSystemPrompt(user);
    assert.match(prompt, /Great question/);
    assert.match(prompt, /I hope this helps/);
    assert.match(prompt, /Not just X, but Y/);
  });

  it("asks for the answer first and for active voice", () => {
    const prompt = buildSystemPrompt(user);
    assert.match(prompt, /Answer first/);
    assert.match(prompt, /Active voice/);
  });

  it("keeps the voice rules on every level without leaking level-specific wording", () => {
    // The shared voice block must not carry beginner-only or advanced-only vocabulary, or the
    // level assertions above would pass for the wrong reasons.
    const intermediate = buildSystemPrompt({ ...user, level: "intermediate" });
    assert.match(intermediate, /VOICE/);
    assert.doesNotMatch(intermediate, /No jargon/);
    assert.doesNotMatch(intermediate, /quantitative/);
  });
});

describe("buildToolSchemas", () => {
  it("hides the broker tools when no account is linked", () => {
    const names = buildToolSchemas({ brokerLinked: false }).map((t) => t.function.name);
    assert.ok(names.includes("get_month_summary"));
    assert.ok(!names.some((n) => n.startsWith("get_holdings") || n.startsWith("get_positions")));
  });

  it("exposes the broker tools once linked", () => {
    const names = buildToolSchemas({ brokerLinked: true, brokerLabel: "Upstox" }).map((t) => t.function.name);
    assert.ok(names.includes("get_holdings"));
    assert.ok(names.includes("get_positions"));
  });

  it("every tool declares a valid object schema", () => {
    for (const tool of buildToolSchemas({ brokerLinked: true })) {
      assert.equal(tool.type, "function");
      assert.equal(tool.function.parameters.type, "object");
      assert.ok(tool.function.description.length > 20, `${tool.function.name} needs a real description`);
    }
  });
});

describe("minor/major unit conversion", () => {
  it("round-trips without drift", () => {
    for (const rupees of [0.01, 1, 125.5, 48_900.99, 1_000_000]) {
      assert.equal(toMajor(fromMajor(rupees)), rupees);
    }
  });

  it("converts paise to rupees for the model", () => {
    assert.equal(toMajor(48_900), 489);
    assert.equal(fromMajor(489), 48_900);
  });
});

describe("createToolRunner", () => {
  const runner = () => createToolRunner({ user, finance: fakeFinance(), brokerage: fakeBrokerage() });

  it("returns month totals in rupees, not paise", async () => {
    const out = await runner().run("get_month_summary", "{}");
    assert.equal(out.expense, 39_875); // 3_987_500 paise
    assert.equal(out.income, 85_000);
    assert.equal(out.currency, "INR");
    assert.equal(out.hasData, true);
  });

  it("flags an empty ledger so the model doesn't present zeroes as spending", async () => {
    const finance = fakeFinance({
      async getSummary() {
        const base = await fakeFinance().getSummary();
        return { ...base, totals: { income: 0, expense: 0, net: 0, count: 0 }, byCategory: [], budgets: [] };
      },
    });
    const out = await createToolRunner({ user, finance, brokerage: fakeBrokerage() }).run("get_month_summary", "{}");
    assert.equal(out.hasData, false);
  });

  it("converts amounts on the way in for record_transaction", async () => {
    let received;
    const finance = fakeFinance({
      async createTransaction(_u, body, opts) {
        received = { body, opts };
        return { id: "x", ...body, date: new Date("2026-09-18T12:00:00Z") };
      },
    });
    const out = await createToolRunner({ user, finance, brokerage: fakeBrokerage() }).run(
      "record_transaction",
      JSON.stringify({ type: "expense", amount: 249.5, category: "food", title: "Lunch" })
    );
    assert.equal(received.body.amount, 24_950); // rupees → paise
    assert.equal(received.opts.source, "chat"); // provenance recorded
    assert.equal(out.saved, true);
    assert.equal(out.transaction.amount, 249.5); // read back in rupees
  });

  it("reports an unknown tool instead of throwing", async () => {
    const out = await runner().run("drop_database", "{}");
    assert.equal(out.error.code, "UNKNOWN_TOOL");
  });

  it("reports malformed arguments instead of throwing", async () => {
    const out = await runner().run("get_month_summary", "{not json");
    assert.equal(out.error.code, "BAD_ARGUMENTS");
  });

  it("turns an AppError into a message the assistant can relay", async () => {
    const brokerage = fakeBrokerage({
      async getHoldings() {
        const { BadRequestError } = await import("../utils/index.js");
        throw new BadRequestError("Connect your Upstox account first");
      },
    });
    const out = await createToolRunner({ user, finance: fakeFinance(), brokerage }).run("get_holdings", "{}");
    assert.equal(out.error.code, "BAD_REQUEST");
    assert.match(out.error.message, /Connect your Upstox/);
  });

  it("reports NOT_CONNECTED when the holdings tool runs with no linked broker", async () => {
    const out = await createToolRunner({ user, finance: fakeFinance(), brokerage: null }).run("get_holdings", "{}");
    assert.equal(out.error.code, "NOT_CONNECTED");
  });

  it("hides internal failures behind a generic message", async () => {
    const finance = fakeFinance({
      async listGoals() {
        throw new TypeError("repository is not defined");
      },
    });
    const out = await createToolRunner({ user, finance, brokerage: fakeBrokerage() }).run("get_goals", "{}");
    assert.equal(out.error.code, "TOOL_FAILED");
    assert.doesNotMatch(out.error.message, /repository/);
  });
});

describe("AIService.chat — agent loop", () => {
  it("answers directly when no tool is needed", async () => {
    let sent;
    const service = new AIService(
      async (messages) => {
        sent = messages;
        return { content: "Start small.", toolCalls: [], message: {}, model: "deepseek-chat", usage: null };
      },
      { finance: fakeFinance(), brokers: fakeBrokers() }
    );
    const result = await service.chat(user, [{ role: "user", content: "Budget tips?" }]);

    assert.equal(sent[0].role, "system");
    assert.match(sent[0].content, /BEGINNER/);
    assert.deepEqual(sent[1], { role: "user", content: "Budget tips?" });
    assert.deepEqual(result.message, { role: "assistant", content: "Start small." });
    assert.deepEqual(result.toolsUsed, []);
  });

  it("runs a tool, feeds the result back, then answers", async () => {
    const rounds = [];
    const complete = async (messages, options) => {
      rounds.push({ messages: [...messages], hadTools: !!options?.tools });
      if (rounds.length === 1) {
        return {
          content: "",
          toolCalls: [{ id: "call_1", name: "get_month_summary", arguments: "{}" }],
          message: {
            role: "assistant",
            content: null,
            tool_calls: [{ id: "call_1", type: "function", function: { name: "get_month_summary", arguments: "{}" } }],
          },
          model: "deepseek-chat",
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        };
      }
      return {
        content: "You spent ₹39,875 this month.",
        toolCalls: [],
        message: {},
        model: "deepseek-chat",
        usage: { promptTokens: 20, completionTokens: 8, totalTokens: 28 },
      };
    };

    const service = new AIService(complete, { finance: fakeFinance(), brokers: fakeBrokers() });
    const result = await service.chat(user, [{ role: "user", content: "How much did I spend this month?" }]);

    assert.equal(rounds.length, 2);
    assert.deepEqual(result.toolsUsed, ["get_month_summary"]);
    assert.match(result.message.content, /39,875/);

    // The tool result must be fed back as a `tool` message keyed to the call id.
    const toolMessage = rounds[1].messages.find((m) => m.role === "tool");
    assert.equal(toolMessage.tool_call_id, "call_1");
    assert.equal(JSON.parse(toolMessage.content).expense, 39_875);

    // Token usage is summed across every round, not just the last.
    assert.equal(result.usage.totalTokens, 43);
  });

  it("offers broker tools only when the account is linked", async () => {
    const seen = [];
    const complete = async (_messages, options) => {
      seen.push((options?.tools ?? []).map((t) => t.function.name));
      return { content: "ok", toolCalls: [], message: {}, model: "m", usage: null };
    };

    await new AIService(complete, { finance: fakeFinance(), brokers: fakeBrokers({ linked: true }) }).chat(user, [
      { role: "user", content: "How is my portfolio?" },
    ]);
    assert.ok(seen[0].includes("get_holdings"));

    seen.length = 0;
    await new AIService(complete, { finance: fakeFinance(), brokers: fakeBrokers({ linked: false }) }).chat(user, [
      { role: "user", content: "How is my portfolio?" },
    ]);
    assert.ok(!seen[0].includes("get_holdings"));
  });

  it("stops looping and says so if the model only ever calls tools", async () => {
    let calls = 0;
    const complete = async (_messages, options) => {
      calls += 1;
      if (!options?.tools) return { content: "", toolCalls: [], message: {}, model: "m", usage: null };
      return {
        content: "",
        toolCalls: [{ id: `call_${calls}`, name: "get_goals", arguments: "{}" }],
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{ id: `call_${calls}`, type: "function", function: { name: "get_goals", arguments: "{}" } }],
        },
        model: "m",
        usage: null,
      };
    };
    const service = new AIService(complete, { finance: fakeFinance(), brokers: fakeBrokers() });
    const result = await service.chat(user, [{ role: "user", content: "loop please" }]);
    // Bounded: it must not spin forever, and it must return something usable.
    assert.ok(calls <= 4);
    assert.ok(result.message.content.length > 0);
  });

  it("keeps working when the brokerage status lookup fails", async () => {
    const brokers = {
      async context() {
        throw new Error("mongo down");
      },
      async connected() {
        throw new Error("mongo down");
      },
    };
    const service = new AIService(
      async () => ({ content: "fine", toolCalls: [], message: {}, model: "m", usage: null }),
      { finance: fakeFinance(), brokers }
    );
    const result = await service.chat(user, [{ role: "user", content: "hi" }]);
    assert.equal(result.message.content, "fine");
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
    assert.equal(body.tools, undefined); // omitted unless asked for
    assert.equal(result.content, "Hello!");
    assert.deepEqual(result.usage, { promptTokens: 5, completionTokens: 2, totalTokens: 7 });
  });

  it("forwards tools and parses tool_calls with a null content", async () => {
    let body;
    const fetchImpl = async (_url, init) => {
      body = JSON.parse(init.body);
      return jsonResponse(200, {
        model: "deepseek-chat",
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [{ id: "c1", type: "function", function: { name: "get_goals", arguments: '{"a":1}' } }],
            },
            finish_reason: "tool_calls",
          },
        ],
      });
    };
    const tools = buildToolSchemas({ brokerLinked: false });
    const result = await createChatCompletion(messages, { apiKey: "k", fetchImpl, tools });

    assert.equal(body.tools.length, tools.length);
    assert.equal(result.content, "");
    assert.deepEqual(result.toolCalls, [{ id: "c1", name: "get_goals", arguments: '{"a":1}' }]);
    assert.equal(result.finishReason, "tool_calls");
  });

  it("forwards response_format for JSON mode", async () => {
    let body;
    const fetchImpl = async (_url, init) => {
      body = JSON.parse(init.body);
      return jsonResponse(200, { choices: [{ message: { content: "{}" } }] });
    };
    await createChatCompletion(messages, { apiKey: "k", fetchImpl, responseFormat: { type: "json_object" } });
    assert.deepEqual(body.response_format, { type: "json_object" });
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

  it("rejects replies with neither content nor tool calls → 502", async () => {
    const fetchImpl = async () => jsonResponse(200, { choices: [] });
    await assert.rejects(createChatCompletion(messages, { apiKey: "k", fetchImpl }), { statusCode: 502 });
  });
});
