import "./helpers.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normaliseCategory } from "../database/models/categories.js";
import FinanceService, { MAX_AMOUNT_MINOR } from "../services/finance-service.js";
import VoiceService from "../services/voice-service.js";
import { addMonths, isMonthKey, localDateKey, monthKey, monthRange, parseDate, weekRange } from "../utils/dates.js";

const user = { _id: "user1", currency: "INR", timezone: "Asia/Kolkata" };

/**
 * In-memory stand-in for FinanceRepository. Only the methods under test are implemented; anything
 * else throwing loudly is the point — it shows a code path we haven't covered.
 */
const fakeRepo = (overrides = {}) => {
  const created = [];
  return {
    created,
    async ensureDefaultAccount() {
      return { _id: "acc1", name: "Cash", currency: "INR" };
    },
    async findAccount(_userId, id) {
      return id === "acc1" ? { _id: "acc1" } : null;
    },
    async createTransactions(_userId, rows) {
      created.push(...rows);
      return rows.map((r, i) => ({ ...r, _id: `t${i}` }));
    },
    async listAccounts() {
      return [{ _id: "acc1", name: "Cash", isDefault: true }];
    },
    async listTransactions() {
      return { items: [], total: 0, limit: 50, skip: 0 };
    },
    async findTransaction() {
      return null;
    },
    async totalsByType() {
      return { income: 0, expense: 0, count: 0 };
    },
    async totalsByCategory() {
      return [];
    },
    async totalsByMonth(_userId, months) {
      return months.map((month) => ({ month, income: 0, expense: 0 }));
    },
    async expenseByDay() {
      return [];
    },
    async openingBalanceTotal() {
      return 0;
    },
    async listBudgets() {
      return [];
    },
    async listGoals() {
      return [];
    },
    ...overrides,
  };
};

const service = (overrides) => new FinanceService(fakeRepo(overrides));

describe("date helpers", () => {
  it("validates month keys", () => {
    for (const good of ["2026-01", "2026-09", "2026-12"]) assert.ok(isMonthKey(good));
    for (const bad of ["2026-13", "2026-00", "26-09", "2026-9", "", null, "2026-09-01"]) {
      assert.ok(!isMonthKey(bad), `${bad} should be rejected`);
    }
  });

  it("walks months across year boundaries", () => {
    assert.equal(addMonths("2026-01", -1), "2025-12");
    assert.equal(addMonths("2026-12", 1), "2027-01");
    assert.equal(addMonths("2026-09", 0), "2026-09");
    assert.equal(addMonths("2026-09", -12), "2025-09");
  });

  it("files a transaction under the user's local month, not the UTC one", () => {
    // 00:30 IST on 1 October is 19:00 UTC on 30 September. Grouping by UTC would say September.
    const lateNightIst = new Date("2026-09-30T19:00:00Z");
    assert.equal(monthKey(lateNightIst, "Asia/Kolkata"), "2026-10");
    assert.equal(monthKey(lateNightIst, "UTC"), "2026-09");
  });

  it("builds a half-open month range in the user's timezone", () => {
    const { from, to } = monthRange("2026-09", "Asia/Kolkata");
    // 1 Sep 00:00 IST = 31 Aug 18:30 UTC
    assert.equal(from.toISOString(), "2026-08-31T18:30:00.000Z");
    assert.equal(to.toISOString(), "2026-09-30T18:30:00.000Z");
    assert.ok(from < to);
  });

  it("starts the week on Monday", () => {
    const { from, to } = weekRange("Asia/Kolkata");
    assert.ok(from < to);
    const firstDay = new Date(localDateKey(from, "Asia/Kolkata"));
    assert.equal(firstDay.getUTCDay(), 1); // Monday
  });

  it("reads a bare date as local noon so it can't drift into the previous day", () => {
    const parsed = parseDate("2026-09-14", "Asia/Kolkata");
    assert.equal(localDateKey(parsed, "Asia/Kolkata"), "2026-09-14");
  });

  it("rejects unparseable dates", () => {
    for (const bad of ["not a date", "", null, undefined, "2026-13-45"]) {
      assert.equal(parseDate(bad, "UTC"), null, `${bad} should not parse`);
    }
  });
});

describe("category normalisation", () => {
  it("passes through valid categories", () => {
    assert.equal(normaliseCategory("groceries", "expense"), "groceries");
    assert.equal(normaliseCategory("salary", "income"), "salary");
  });

  it("maps common synonyms an AI is likely to emit", () => {
    assert.equal(normaliseCategory("Dining", "expense"), "food");
    assert.equal(normaliseCategory("petrol", "expense"), "transport");
    assert.equal(normaliseCategory("utilities", "expense"), "bills");
    assert.equal(normaliseCategory("credit card", "expense"), "emi");
    assert.equal(normaliseCategory("SIP", "expense"), "investment");
    assert.equal(normaliseCategory("paycheck", "income"), "salary");
    assert.equal(normaliseCategory("dividends", "income"), "interest");
  });

  it("routes 'gift' by direction", () => {
    assert.equal(normaliseCategory("gift", "expense"), "gifts");
    assert.equal(normaliseCategory("gift", "income"), "gift_received");
  });

  it("falls back to the type's other bucket rather than failing", () => {
    assert.equal(normaliseCategory("interdimensional portal", "expense"), "other");
    assert.equal(normaliseCategory(undefined, "income"), "other_income");
  });

  it("never returns an income category for an expense", () => {
    assert.equal(normaliseCategory("salary", "expense"), "other");
  });
});

describe("FinanceService.createTransaction validation", () => {
  it("accepts a well-formed expense and derives its month", async () => {
    const repo = fakeRepo();
    const created = await new FinanceService(repo).createTransaction(user, {
      type: "expense",
      amount: 48_900,
      category: "food",
      title: "Swiggy",
      date: "2026-09-14",
    });
    assert.equal(created.amount, 48_900);
    assert.equal(created.month, "2026-09");
    assert.equal(created.source, "manual");
    assert.equal(created.currency, "INR");
    assert.equal(created.accountId, "acc1"); // default account attached automatically
  });

  it("rejects a decimal amount — minor units are integers", async () => {
    await assert.rejects(
      service().createTransaction(user, { type: "expense", amount: 125.5, category: "food" }),
      { code: "VALIDATION_ERROR" }
    );
  });

  it("rejects zero, negative and absurd amounts", async () => {
    for (const amount of [0, -100, MAX_AMOUNT_MINOR + 1]) {
      await assert.rejects(
        service().createTransaction(user, { type: "expense", amount, category: "food" }),
        { code: "VALIDATION_ERROR" },
        `amount ${amount} should be rejected`
      );
    }
  });

  it("rejects a missing or unknown type", async () => {
    for (const type of [undefined, "transfer", "refund"]) {
      await assert.rejects(service().createTransaction(user, { type, amount: 100, category: "food" }), {
        code: "VALIDATION_ERROR",
      });
    }
  });

  it("rejects an income category on an expense (manual entry is strict)", async () => {
    await assert.rejects(service().createTransaction(user, { type: "expense", amount: 100, category: "salary" }), {
      code: "VALIDATION_ERROR",
    });
  });

  it("coerces a bad category when the source is the AI, instead of failing the save", async () => {
    const created = await service().createTransaction(
      user,
      { type: "expense", amount: 100, category: "teleportation" },
      { source: "chat" }
    );
    assert.equal(created.category, "other");
    assert.equal(created.source, "chat");
  });

  it("rejects an unowned accountId", async () => {
    await assert.rejects(
      service().createTransaction(user, { type: "expense", amount: 100, category: "food", accountId: "someone-else" }),
      { code: "NOT_FOUND" }
    );
  });

  it("rejects out-of-range dates", async () => {
    for (const date of ["1990-01-01", "2099-01-01"]) {
      await assert.rejects(
        service().createTransaction(user, { type: "expense", amount: 100, category: "food", date }),
        { code: "VALIDATION_ERROR" }
      );
    }
  });

  it("defaults the date to now", async () => {
    const created = await service().createTransaction(user, { type: "expense", amount: 100, category: "food" });
    assert.ok(Date.now() - created.date.getTime() < 5000);
  });
});

describe("FinanceService.createTransactions (batch)", () => {
  it("writes nothing when any row is invalid", async () => {
    const repo = fakeRepo();
    await assert.rejects(
      new FinanceService(repo).createTransactions(user, [
        { type: "expense", amount: 100, category: "food" },
        { type: "expense", amount: -5, category: "food" }, // bad
      ]),
      { code: "VALIDATION_ERROR" }
    );
    assert.equal(repo.created.length, 0, "a partial save would leave a half-recorded voice note");
  });

  it("names the offending row so the app can highlight it", async () => {
    await assert.rejects(
      service().createTransactions(user, [
        { type: "expense", amount: 100, category: "food" },
        { type: "expense", amount: 0, category: "food" },
      ]),
      (err) => /Transaction 2:/.test(err.message)
    );
  });

  it("saves several rows from one utterance", async () => {
    const repo = fakeRepo();
    const rows = await new FinanceService(repo).createTransactions(
      user,
      [
        { type: "expense", amount: 4_000, category: "food", title: "Chai" },
        { type: "expense", amount: 120_000, category: "groceries", title: "BigBasket" },
      ],
      { source: "voice", sourceText: "chai 40 then 1200 on groceries" }
    );
    assert.equal(rows.length, 2);
    assert.ok(repo.created.every((r) => r.source === "voice"));
    assert.ok(repo.created.every((r) => r.sourceText.includes("chai")));
  });

  it("refuses an empty batch and an oversized one", async () => {
    await assert.rejects(service().createTransactions(user, []), { code: "VALIDATION_ERROR" });
    const many = Array.from({ length: 26 }, () => ({ type: "expense", amount: 100, category: "food" }));
    await assert.rejects(service().createTransactions(user, many), { code: "VALIDATION_ERROR" });
  });
});

describe("FinanceService.getSummary", () => {
  it("computes balance, net and month-on-month change", async () => {
    const repo = fakeRepo({
      async totalsByType(_userId, range = {}) {
        if (range.month === "2026-09") return { income: 8_500_000, expense: 4_000_000, count: 7 };
        if (range.month === "2026-08") return { income: 8_500_000, expense: 2_000_000, count: 5 };
        return { income: 17_000_000, expense: 6_000_000, count: 12 }; // lifetime
      },
      async totalsByCategory() {
        return [
          { category: "food", total: 3_000_000, count: 4 },
          { category: "savings", total: 1_000_000, count: 1 },
        ];
      },
      async openingBalanceTotal() {
        return 1_000_000;
      },
    });

    const summary = await new FinanceService(repo).getSummary(user, "2026-09");

    assert.equal(summary.totals.net, 4_500_000);
    // opening + lifetime income − lifetime expense
    assert.equal(summary.balance.total, 1_000_000 + 17_000_000 - 6_000_000);
    // spending doubled: (4m − 2m) / 2m = +100%
    assert.equal(summary.changePct, 100);
    assert.equal(summary.previous.month, "2026-08");
    // share of total spending
    assert.equal(summary.byCategory[0].share, 75);
    assert.equal(summary.highlights.saved, 1_000_000);
  });

  it("merges budget limits with spend so far and flags overspending", async () => {
    const repo = fakeRepo({
      async listBudgets() {
        return [
          { _id: "b1", category: "food", month: "2026-09", limit: 800_000 },
          { _id: "b2", category: "fun", month: "2026-09", limit: 100_000 },
        ];
      },
      async totalsByCategory() {
        return [
          { category: "food", total: 612_000, count: 4 },
          { category: "fun", total: 150_000, count: 2 },
        ];
      },
    });

    const { budgets, budgetTotals } = await new FinanceService(repo).getSummary(user, "2026-09");
    const food = budgets.find((b) => b.category === "food");
    const fun = budgets.find((b) => b.category === "fun");

    assert.equal(food.spent, 612_000);
    assert.equal(food.remaining, 188_000);
    assert.equal(food.overspent, false);
    assert.equal(fun.overspent, true);
    assert.equal(fun.remaining, -50_000);
    assert.equal(budgetTotals.limit, 900_000);
    assert.equal(budgetTotals.remaining, 138_000);
  });

  it("handles a brand-new user with no data (no NaN, no divide-by-zero)", async () => {
    const summary = await service().getSummary(user, "2026-09");
    assert.equal(summary.totals.income, 0);
    assert.equal(summary.balance.total, 0);
    assert.equal(summary.changePct, 0);
    assert.deepEqual(summary.byCategory, []);
    assert.equal(summary.topCategory, null);
    for (const value of Object.values(summary.totals)) assert.ok(Number.isFinite(value));
  });

  it("rejects a malformed month", async () => {
    await assert.rejects(service().getSummary(user, "September"), { code: "VALIDATION_ERROR" });
  });
});

describe("FinanceService.getSeries", () => {
  it("returns seven Monday-first days for the week", async () => {
    const series = await service().getSeries(user, "week");
    assert.equal(series.points.length, 7);
    assert.equal(series.points[0].label, "Mon");
    assert.equal(series.points[6].label, "Sun");
  });

  it("buckets a month into weeks and totals them", async () => {
    const repo = fakeRepo({
      async expenseByDay() {
        return [
          { day: "2026-09-02", total: 100_000 }, // W1
          { day: "2026-09-10", total: 50_000 }, // W2
          { day: "2026-09-30", total: 25_000 }, // W5
        ];
      },
    });
    const series = await new FinanceService(repo).getSeries(user, "month", "2026-09");
    assert.equal(series.points[0].value, 100_000);
    assert.equal(series.points[1].value, 50_000);
    assert.equal(series.total, 175_000);
    assert.equal(series.points.at(-1).value, 25_000);
  });

  it("returns twelve months for the year", async () => {
    const series = await service().getSeries(user, "year", "2026-09");
    assert.equal(series.points.length, 12);
    assert.equal(series.points[0].key, "2026-01");
    assert.equal(series.points[11].key, "2026-12");
  });
});

describe("VoiceService extraction", () => {
  const voice = (content) =>
    new VoiceService({
      complete: async () => ({ content, toolCalls: [], message: {}, model: "deepseek-chat", usage: null }),
      transcribe: async () => ({ text: "spent 250 on coffee", model: "whisper" }),
    });

  it("converts spoken rupees into integer minor units", async () => {
    const result = await voice(
      JSON.stringify({
        transactions: [{ type: "expense", amount: 250.5, category: "food", title: "Coffee", confidence: 0.9 }],
      })
    ).captureFromText(user, "spent 250.50 on coffee");

    assert.equal(result.drafts.length, 1);
    assert.equal(result.drafts[0].amount, 25_050);
    assert.equal(result.drafts[0].needsReview, false);
  });

  it("extracts several transactions from one utterance", async () => {
    const result = await voice(
      JSON.stringify({
        transactions: [
          { type: "expense", amount: 40, category: "food", title: "Chai", confidence: 0.9 },
          { type: "income", amount: 85_000, category: "salary", title: "Salary", confidence: 0.95 },
        ],
      })
    ).captureFromText(user, "chai 40 and salary came in");

    assert.equal(result.drafts.length, 2);
    assert.equal(result.drafts[1].type, "income");
    assert.equal(result.drafts[1].amount, 8_500_000);
  });

  it("flags low-confidence and untitled rows for review", async () => {
    const result = await voice(
      JSON.stringify({
        transactions: [
          { type: "expense", amount: 15, category: "food", title: "", confidence: 0.3 },
          { type: "expense", amount: 500, category: "food", title: "Pizza", confidence: 0.95 },
        ],
      })
    ).captureFromText(user, "fifty or fifteen on something");

    assert.equal(result.drafts[0].needsReview, true);
    assert.equal(result.drafts[1].needsReview, false);
    assert.match(result.message, /check the highlighted/);
  });

  it("drops rows with no usable amount rather than guessing", async () => {
    const result = await voice(
      JSON.stringify({
        transactions: [
          { type: "expense", amount: null, category: "food" },
          { type: "expense", amount: 0, category: "food" },
          { type: "expense", amount: "abc", category: "food" },
          { type: "expense", amount: 100, category: "food", title: "Real" },
        ],
      })
    ).captureFromText(user, "mumble");

    assert.equal(result.drafts.length, 1);
    assert.equal(result.drafts[0].title, "Real");
  });

  it("never books a future date", async () => {
    const result = await voice(
      JSON.stringify({
        transactions: [{ type: "expense", amount: 100, category: "food", title: "X", date: "2099-01-01" }],
      })
    ).captureFromText(user, "spent 100");
    assert.ok(new Date(result.drafts[0].date).getTime() <= Date.now() + 1000);
  });

  it("clamps an absurd amount out of the results", async () => {
    const result = await voice(
      JSON.stringify({ transactions: [{ type: "expense", amount: 9_999_999_999, category: "food", title: "X" }] })
    ).captureFromText(user, "spent a lot");
    assert.equal(result.drafts.length, 0);
  });

  it("coerces an invented category onto the canonical list", async () => {
    const result = await voice(
      JSON.stringify({ transactions: [{ type: "expense", amount: 100, category: "vibes", title: "X" }] })
    ).captureFromText(user, "spent 100 on vibes");
    assert.equal(result.drafts[0].category, "other");
  });

  it("survives fenced JSON from the model", async () => {
    const result = await voice(
      '```json\n{"transactions":[{"type":"expense","amount":100,"category":"food","title":"X"}]}\n```'
    ).captureFromText(user, "spent 100");
    assert.equal(result.drafts.length, 1);
  });

  it("reports unparseable model output as an upstream error", async () => {
    await assert.rejects(voice("I'm afraid I can't do that").captureFromText(user, "spent 100"), {
      statusCode: 502,
    });
  });

  it("surfaces phrases it could not pin an amount to", async () => {
    const result = await voice(
      JSON.stringify({ transactions: [], unclear: ["paid the guy for the thing"] })
    ).captureFromText(user, "paid the guy for the thing");
    assert.deepEqual(result.unclear, ["paid the guy for the thing"]);
    assert.match(result.message, /couldn't pin down an amount/);
  });

  it("rejects empty and oversized input", async () => {
    await assert.rejects(voice("{}").captureFromText(user, "   "), { code: "VALIDATION_ERROR" });
    await assert.rejects(voice("{}").captureFromText(user, "a".repeat(1001)), { code: "VALIDATION_ERROR" });
  });

  it("returns a friendly result when the audio was silent", async () => {
    const svc = new VoiceService({
      complete: async () => {
        throw new Error("should not be called for empty audio");
      },
      transcribe: async () => ({ text: "", model: "whisper" }),
    });
    const result = await svc.captureFromAudio(user, Buffer.from("x"), { mimeType: "audio/m4a" });
    assert.deepEqual(result.drafts, []);
    assert.match(result.message, /couldn't hear anything/);
  });
});
