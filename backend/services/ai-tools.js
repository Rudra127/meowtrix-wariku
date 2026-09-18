// @file backend/services/ai-tools.js
// The tools the Ask AI assistant can call — its window onto the user's real money.
//
// Design rules:
//   • Every tool is bound to ONE user at construction. A tool has no `userId` argument, so the model
//     cannot ask about somebody else's finances even if it tries.
//   • Amounts crossing the tool boundary are in MAJOR units (rupees, not paise). The model reasons
//     and speaks in rupees; converting once here beats hoping it divides by 100 correctly.
//     Our storage layer keeps using minor units — see toMajor/fromMajor.
//   • Tool failures come back as `{ error: { code, message } }` instead of throwing. "Connect your
//     Zerodha account first" is information the assistant should relay, not a 500.
//   • Only ONE tool writes (`record_transaction`), and the prompt requires it to read back what it
//     saved so a mistake is visible immediately.
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../database/models/categories.js";
import { currentMonthKey } from "../utils/dates.js";
import { AppError } from "../utils/index.js";

/** How many times the model may call tools before we force a plain-text answer. */
export const MAX_TOOL_ROUNDS = 4;
/** Cap on tool calls per round, so a loop can't fan out. */
export const MAX_CALLS_PER_ROUND = 4;

/** Minor units (paise) → major units (rupees). */
export const toMajor = (minor) => Math.round(Number(minor ?? 0)) / 100;
/** Major units (rupees) → minor units (paise). Rounds once, here. */
export const fromMajor = (major) => Math.round(Number(major) * 100);

const money = (minor) => toMajor(minor);

/**
 * OpenAI-style function schemas. Zerodha tools are omitted entirely when the user has no broker
 * linked — a tool the model can't usefully call is just an invitation to hallucinate.
 *
 * @param {{ zerodhaLinked?: boolean }} context
 */
export const buildToolSchemas = ({
  brokerLinked = false,
  brokerLabel = "your brokerage",
  growwPortfolio = false,
  growwShared = false,
} = {}) => {
  const tools = [
    {
      type: "function",
      function: {
        name: "get_month_summary",
        description:
          "The user's income, spending, per-category breakdown, budget status and goal progress for " +
          "one calendar month. Call this first for any question about how much they earned, spent, " +
          "saved, or whether they are on track. Amounts are in the user's currency (major units).",
        parameters: {
          type: "object",
          properties: {
            month: {
              type: "string",
              description: 'Month as "YYYY-MM". Omit for the current month.',
            },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "list_transactions",
        description:
          "Individual transactions, newest first. Use when the user asks about specific purchases, " +
          'a merchant ("how much on Swiggy?"), or wants examples behind a total. Prefer ' +
          "get_month_summary for totals — it is one call instead of many.",
        parameters: {
          type: "object",
          properties: {
            month: { type: "string", description: 'Month as "YYYY-MM".' },
            from: { type: "string", description: "Start date, YYYY-MM-DD (inclusive)." },
            to: { type: "string", description: "End date, YYYY-MM-DD (exclusive)." },
            type: { type: "string", enum: ["income", "expense"] },
            category: {
              type: "string",
              description: `One category id. Expense: ${EXPENSE_CATEGORIES.join(", ")}. Income: ${INCOME_CATEGORIES.join(", ")}.`,
            },
            query: { type: "string", description: "Free-text match on the title/note, e.g. a merchant name." },
            limit: { type: "integer", description: "Max rows, 1–50. Default 20." },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_spending_trend",
        description:
          "Income and expense totals for the last N months, oldest first. Use for " +
          '"am I spending more than before?" and any month-over-month comparison.',
        parameters: {
          type: "object",
          properties: { months: { type: "integer", description: "How many months, 2–12. Default 6." } },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_budgets",
        description: "Monthly budget limits with spend so far and how much is left in each category.",
        parameters: {
          type: "object",
          properties: { month: { type: "string", description: 'Month as "YYYY-MM". Omit for the current month.' } },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_goals",
        description: "The user's savings goals: target amount, amount saved, target date and progress.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "get_accounts",
        description:
          "The user's accounts (cash, bank, card, wallet) and their overall balance. Use for " +
          '"how much do I have?"',
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "record_transaction",
        description:
          "Record a new income or expense in the user's ledger. Only call this when the user clearly " +
          'asks to log something ("add 250 for lunch", "I paid rent"). Never log something they ' +
          "merely mentioned while asking a question. After it succeeds, tell them exactly what you " +
          "saved so they can correct it.",
        parameters: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["income", "expense"] },
            amount: {
              type: "number",
              description: "Positive amount in the user's currency, major units (125.50 means ₹125.50).",
            },
            category: {
              type: "string",
              description: `Expense: ${EXPENSE_CATEGORIES.join(", ")}. Income: ${INCOME_CATEGORIES.join(", ")}.`,
            },
            title: { type: "string", description: "Short label — merchant or what it was for." },
            date: { type: "string", description: "YYYY-MM-DD. Omit for today. Never in the future." },
          },
          required: ["type", "amount", "category"],
        },
      },
    },
  ];

  if (brokerLinked) {
    tools.push(
      {
        type: "function",
        function: {
          name: "get_holdings",
          description:
            `The user's stock and mutual-fund holdings from ${brokerLabel}: quantity, average price, ` +
            "current price, invested value, current value and profit/loss per holding plus totals. " +
            "Amounts are in INR. Use for any question about their portfolio or investments.",
          parameters: {
            type: "object",
            properties: {
              refresh: { type: "boolean", description: "Skip the short cache and re-fetch. Use sparingly." },
            },
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_positions",
          description:
            `The user's open positions (intraday and F&O) from ${brokerLabel} with profit/loss. Use ` +
            "only for questions about trades or open positions, not long-term holdings.",
          parameters: { type: "object", properties: { refresh: { type: "boolean" } } },
        },
      }
    );
  }

  // Groww is a single server-wide account (it has no OAuth), so the description has to be explicit
  // about whose holdings these are. Calling a shared demo portfolio "yours" would be a lie the model
  // would happily repeat.
  if (growwPortfolio) {
    tools.push({
      type: "function",
      function: {
        name: "get_groww_portfolio",
        description: growwShared
          ? "Equity holdings from a SHARED DEMO Groww account configured on this server. These are " +
            "NOT the user's own holdings — say so plainly whenever you use this data, and never call " +
            "them 'your holdings'. Returns quantity, average price, current price, invested value, " +
            "current value and profit/loss per holding plus totals, in INR. Covers stocks only, no " +
            "mutual funds."
          : "The user's own equity holdings from their Groww account: quantity, average price, " +
            "current price, invested value, current value and profit/loss per holding plus totals, " +
            "in INR. Covers stocks held in the demat account only, NOT mutual funds — if they ask " +
            "about mutual funds, say Groww's API does not expose them. If `pricesComplete` is false, " +
            "some holdings had no live price and their current value shows the amount invested, so " +
            "caveat the total instead of stating it as market value.",
        parameters: {
          type: "object",
          properties: {
            refresh: { type: "boolean", description: "Skip the short cache and re-fetch. Use sparingly." },
            withDayChange: {
              type: "boolean",
              description:
                "Also fetch today's price move and the 52-week range per holding. Slower (one extra " +
                "call per stock), so pass true only when the question is about today's movement or " +
                "where a stock sits in its yearly range.",
            },
          },
        },
      },
    });
  }

  return tools;
};

/** Normalises anything thrown inside a tool into a shape the model can read and explain. */
const toToolError = (err) => {
  if (err instanceof AppError && err.isOperational) {
    return { error: { code: err.code, message: err.message } };
  }
  console.error("[ai-tools] unexpected tool failure", err);
  return { error: { code: "TOOL_FAILED", message: "That lookup failed. Tell the user and suggest retrying." } };
};

const clampInt = (value, min, max, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

/**
 * Builds the tool implementations for one user.
 *
 * @param {{ user: object, finance: import("./finance-service.js").default,
 *           zerodha: import("./zerodha-service.js").default }} deps
 * @returns {{ run: (name: string, rawArgs: string) => Promise<object>, names: string[] }}
 */
export const createToolRunner = ({ user, finance, brokerage = null, groww = null, growwShared = false }) => {
  const currency = user.currency || "INR";

  const handlers = {
    async get_month_summary({ month }) {
      const summary = await finance.getSummary(user, month);
      return {
        month: summary.month,
        currency,
        income: money(summary.totals.income),
        expense: money(summary.totals.expense),
        net: money(summary.totals.net),
        transactionCount: summary.totals.count,
        balance: money(summary.balance.total),
        previousMonth: {
          month: summary.previous.month,
          income: money(summary.previous.income),
          expense: money(summary.previous.expense),
        },
        spendingChangeVsPreviousMonthPct: summary.changePct,
        byCategory: summary.byCategory.map((row) => ({
          category: row.category,
          spent: money(row.total),
          transactions: row.count,
          shareOfSpendingPct: row.share,
        })),
        budgets: summary.budgets.map((b) => ({
          category: b.category,
          limit: money(b.limit),
          spent: money(b.spent),
          remaining: money(b.remaining),
          overspent: b.overspent,
        })),
        savedThisMonth: money(summary.highlights.saved),
        investedThisMonth: money(summary.highlights.invested),
        goals: { count: summary.goals.count, saved: money(summary.goals.savedAmount), target: money(summary.goals.targetAmount) },
        daysLeftInMonth: summary.daysLeftInMonth,
        // Empty ledgers are the common case for new users. Say so explicitly so the model doesn't
        // present zeroes as if they were real spending data.
        hasData: summary.totals.count > 0,
      };
    },

    async list_transactions({ month, from, to, type, category, query, limit }) {
      const page = await finance.listTransactions(user, {
        month,
        from,
        to,
        type,
        category,
        q: query,
        limit: clampInt(limit, 1, 50, 20),
      });
      return {
        currency,
        total: page.total,
        returned: page.items.length,
        transactions: page.items.map((tx) => ({
          id: tx.id ?? tx._id?.toString(),
          type: tx.type,
          amount: money(tx.amount),
          category: tx.category,
          title: tx.title,
          date: tx.date instanceof Date ? tx.date.toISOString().slice(0, 10) : tx.date,
          addedBy: tx.source,
        })),
      };
    },

    async get_spending_trend({ months }) {
      const trend = await finance.getMonthlyTrend(user, clampInt(months, 2, 12, 6));
      return {
        currency,
        months: trend.months.map((m) => ({
          month: m.month,
          income: money(m.income),
          expense: money(m.expense),
          net: money(m.net),
        })),
      };
    },

    async get_budgets({ month }) {
      const result = await finance.listBudgets(user, month);
      return {
        month: result.month,
        currency,
        budgets: result.budgets.map((b) => ({
          category: b.category,
          limit: money(b.limit),
          spent: money(b.spent),
          remaining: money(b.remaining),
          usedPct: Math.round(b.ratio * 100),
          overspent: b.overspent,
        })),
        hasBudgets: result.budgets.length > 0,
      };
    },

    async get_goals() {
      const { goals } = await finance.listGoals(user);
      return {
        currency,
        goals: goals.map((g) => ({
          name: g.name,
          target: money(g.targetAmount),
          saved: money(g.savedAmount),
          remaining: money(g.remaining),
          progressPct: Math.round(g.ratio * 100),
          targetDate: g.targetDate ? new Date(g.targetDate).toISOString().slice(0, 10) : null,
          achieved: g.achieved,
        })),
        hasGoals: goals.length > 0,
      };
    },

    async get_accounts() {
      const [accounts, summary] = await Promise.all([finance.listAccounts(user), finance.getSummary(user)]);
      return {
        currency,
        totalBalance: money(summary.balance.total),
        accounts: accounts.map((a) => ({ name: a.name, type: a.type, openingBalance: money(a.openingBalance) })),
      };
    },

    async record_transaction({ type, amount, category, title, date }) {
      const created = await finance.createTransaction(
        user,
        { type, amount: fromMajor(amount), category, title, date },
        // `source: "chat"` both marks provenance in the ledger and puts the service into
        // coerce-the-category mode instead of reject-on-unknown.
        { source: "chat" }
      );
      return {
        saved: true,
        transaction: {
          id: created.id ?? created._id?.toString(),
          type: created.type,
          amount: money(created.amount),
          currency,
          category: created.category,
          title: created.title,
          date: created.date.toISOString().slice(0, 10),
        },
      };
    },

    async get_holdings({ refresh } = {}) {
      if (!brokerage) return { error: { code: "NOT_CONNECTED", message: "No brokerage is connected." } };
      const data = await brokerage.getHoldings(user, { refresh: refresh === true });
      return {
        broker: data.provider,
        currency: data.currency,
        asOf: data.asOf,
        holdingCount: data.count,
        investedValue: data.investedValue,
        currentValue: data.currentValue,
        profitLoss: data.pnl,
        profitLossPct: data.pnlPct,
        holdings: data.holdings,
      };
    },

    async get_positions({ refresh } = {}) {
      if (!brokerage) return { error: { code: "NOT_CONNECTED", message: "No brokerage is connected." } };
      const data = await brokerage.getPositions(user, { refresh: refresh === true });
      return {
        broker: data.provider,
        currency: data.currency,
        asOf: data.asOf,
        positionCount: data.count,
        profitLoss: data.pnl,
        positions: data.positions,
      };
    },

    /**
     * Groww equity holdings. Unlike `get_holdings` this reads a single server-wide account, so the
     * result carries `ownership` and, for a shared account, a `disclaimer` the model is told to
     * repeat. `pricesComplete` travels too, because Groww gives no live price with holdings.
     */
    async get_groww_portfolio({ refresh, withDayChange } = {}) {
      if (!groww) {
        return { error: { code: "NOT_CONFIGURED", message: "Groww is not available for this user." } };
      }
      const data = await groww.getPortfolio({
        refresh: refresh === true,
        withDayChange: withDayChange === true,
      });
      return {
        broker: data.provider,
        currency: data.currency,
        asOf: data.asOf,
        ownership: growwShared ? "shared_demo_account" : "user_own_account",
        ...(growwShared && {
          disclaimer:
            "These holdings belong to a shared demo account, not to this user. Say so before " +
            "discussing them.",
        }),
        holdingCount: data.count,
        investedValue: data.investedValue,
        currentValue: data.currentValue,
        profitLoss: data.pnl,
        profitLossPct: data.pnlPct,
        pricesComplete: data.pricesComplete,
        ...(data.valuationNote && { valuationNote: data.valuationNote }),
        // Pre-computed so the model quotes figures instead of doing arithmetic over the list.
        analysis: data.analysis,
        // Absent day-change data means "not fetched", NOT "the stock didn't move".
        dayChangeAvailable: data.dayChangeAvailable === true,
        ...(withDayChange === true && data.dayChangeAvailable !== true
          ? { dayChangeNote: "Today's move could not be fetched, so do not state any daily change." }
          : {}),
        coverage: "Equity/stocks only. Groww's API does not expose mutual fund holdings.",
        holdings: data.holdings,
      };
    },
  };

  return {
    names: Object.keys(handlers),

    /**
     * Executes one tool call. Never throws — the model always gets something it can talk about.
     * @param {string} name
     * @param {string} rawArgs JSON string from the model
     */
    async run(name, rawArgs) {
      const handler = handlers[name];
      if (!handler) {
        return { error: { code: "UNKNOWN_TOOL", message: `No such tool: ${name}` } };
      }
      let args = {};
      if (rawArgs && rawArgs !== "{}") {
        try {
          args = JSON.parse(rawArgs);
        } catch {
          return { error: { code: "BAD_ARGUMENTS", message: "Arguments were not valid JSON. Try again." } };
        }
      }
      try {
        return await handler(args ?? {});
      } catch (err) {
        return toToolError(err);
      }
    },
  };
};

/** Small helper for the system prompt so it and the tools agree on "today". */
export const todayFor = (user) => currentMonthKey(user.timezone || "Asia/Kolkata");
