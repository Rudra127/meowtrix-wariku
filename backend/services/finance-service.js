// @file backend/services/finance-service.js
// Business logic for the Money tab: accounts, transactions, budgets, goals and the monthly rollup.
//
// Money rules (root AGENTS.md → Conventions → Money):
//   • every amount crossing this layer is an INTEGER in MINOR units (paise/cents) — never a float
//   • `Transaction.amount` is positive; `type` carries the direction
//   • which calendar month a transaction lands in depends on the user's timezone, not UTC
import FinanceRepository from "../database/repository/finance-repository.js";
import { ACCOUNT_TYPES } from "../database/models/account.js";
import {
  EXPENSE_CATEGORIES,
  TRANSACTION_TYPES,
  categoriesFor,
  isValidCategory,
  normaliseCategory,
} from "../database/models/categories.js";
import {
  addMonths,
  currentMonthKey,
  isMonthKey,
  localDateKey,
  localParts,
  monthKey,
  monthRange,
  parseDate,
  weekRange,
  zonedToUtc,
} from "../utils/dates.js";
import { NotFoundError, ValidationError } from "../utils/index.js";

/** Largest single amount we accept: ₹10,00,00,000. Guards against a misheard "lakh"/"crore". */
export const MAX_AMOUNT_MINOR = 100_000_000_00;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

const isPositiveInt = (value) => Number.isInteger(value) && value > 0;

/** Amounts arrive as integer minor units. Rejects floats, negatives and absurd magnitudes. */
const requireAmount = (value, field = "amount") => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValidationError(`\`${field}\` must be a number of minor units (e.g. 12550 for ₹125.50)`, {
      [field]: "Must be an integer in minor units",
    });
  }
  if (!Number.isInteger(value)) {
    throw new ValidationError(`\`${field}\` must be an integer in minor units, not a decimal`, {
      [field]: "Must be a whole number of paise/cents",
    });
  }
  if (value <= 0) throw new ValidationError(`\`${field}\` must be greater than zero`, { [field]: "Must be positive" });
  if (value > MAX_AMOUNT_MINOR) {
    throw new ValidationError(`\`${field}\` is unrealistically large`, { [field]: "Too large" });
  }
  return value;
};

const optionalText = (value, field, maxLength) => {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new ValidationError(`\`${field}\` must be a string`, { [field]: "Must be text" });
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new ValidationError(`\`${field}\` must be at most ${maxLength} characters`, { [field]: "Too long" });
  }
  return trimmed;
};

const pct = (value, of) => (of > 0 ? Math.round((value / of) * 1000) / 10 : 0);

export default class FinanceService {
  constructor(repository = new FinanceRepository()) {
    this.repository = repository;
  }

  // ---- Accounts ---------------------------------------------------------------------------

  async listAccounts(user) {
    const accounts = await this.repository.listAccounts(user._id);
    // First visit: give them somewhere for money to live so quick-add needs no setup.
    if (!accounts.length) return [await this.repository.ensureDefaultAccount(user._id, user.currency)];
    return accounts;
  }

  async createAccount(user, body = {}) {
    const name = optionalText(body.name, "name", 60);
    if (!name) throw new ValidationError("`name` is required", { name: "Required" });
    const type = body.type ?? "cash";
    if (!ACCOUNT_TYPES.includes(type)) {
      throw new ValidationError(`\`type\` must be one of: ${ACCOUNT_TYPES.join(", ")}`, { type: "Invalid" });
    }
    const openingBalance = body.openingBalance ?? 0;
    if (!Number.isInteger(openingBalance)) {
      throw new ValidationError("`openingBalance` must be an integer in minor units", {
        openingBalance: "Must be a whole number",
      });
    }

    const existing = await this.repository.listAccounts(user._id);
    const account = await this.repository.createAccount(user._id, {
      name,
      type,
      openingBalance,
      currency: user.currency,
      isDefault: body.isDefault === true || existing.length === 0,
    });
    if (account.isDefault) await this.repository.clearDefaultAccounts(user._id, account._id);
    return account;
  }

  async updateAccount(user, id, body = {}) {
    const updates = {};
    if (body.name !== undefined) {
      const name = optionalText(body.name, "name", 60);
      if (!name) throw new ValidationError("`name` cannot be empty", { name: "Required" });
      updates.name = name;
    }
    if (body.type !== undefined) {
      if (!ACCOUNT_TYPES.includes(body.type)) {
        throw new ValidationError(`\`type\` must be one of: ${ACCOUNT_TYPES.join(", ")}`, { type: "Invalid" });
      }
      updates.type = body.type;
    }
    if (body.openingBalance !== undefined) {
      if (!Number.isInteger(body.openingBalance)) {
        throw new ValidationError("`openingBalance` must be an integer in minor units", {
          openingBalance: "Must be a whole number",
        });
      }
      updates.openingBalance = body.openingBalance;
    }
    if (body.isDefault === true) updates.isDefault = true;
    if (!Object.keys(updates).length) throw new ValidationError("Nothing to update");

    const account = await this.repository.updateAccount(user._id, id, updates);
    if (!account) throw new NotFoundError("Account not found");
    if (updates.isDefault) await this.repository.clearDefaultAccounts(user._id, account._id);
    return account;
  }

  /**
   * Archives rather than deletes: transactions reference the account, and a hard delete would
   * orphan history the user still wants to see.
   */
  async archiveAccount(user, id) {
    const accounts = await this.repository.listAccounts(user._id);
    if (accounts.length <= 1) throw new ValidationError("You need at least one account");
    const account = await this.repository.archiveAccount(user._id, id);
    if (!account) throw new NotFoundError("Account not found");
    if (account.isDefault) {
      const next = accounts.find((a) => !a._id.equals(account._id));
      if (next) await this.repository.updateAccount(user._id, next._id, { isDefault: true });
    }
    return account;
  }

  // ---- Transactions ----------------------------------------------------------------------

  /**
   * @param {object} user  Mongoose user doc (needs _id, currency, timezone)
   * @param {object} query from/to (ISO), month, type, category, source, q, limit, skip
   */
  async listTransactions(user, query = {}) {
    const timeZone = this.#timeZone(user);
    const filters = {
      limit: Math.min(200, Math.max(1, Number.parseInt(query.limit, 10) || 50)),
      skip: Math.max(0, Number.parseInt(query.skip, 10) || 0),
    };

    if (query.month !== undefined) {
      if (!isMonthKey(query.month)) throw new ValidationError("`month` must look like 2026-09", { month: "Invalid" });
      filters.month = query.month;
    }
    if (query.from) {
      const from = parseDate(query.from, timeZone);
      if (!from) throw new ValidationError("`from` is not a valid date", { from: "Invalid" });
      filters.from = from;
    }
    if (query.to) {
      const to = parseDate(query.to, timeZone);
      if (!to) throw new ValidationError("`to` is not a valid date", { to: "Invalid" });
      filters.to = to;
    }
    if (query.type) {
      if (!TRANSACTION_TYPES.includes(query.type)) {
        throw new ValidationError(`\`type\` must be one of: ${TRANSACTION_TYPES.join(", ")}`, { type: "Invalid" });
      }
      filters.type = query.type;
    }
    if (query.category) {
      const categories = String(query.category)
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      filters.categories = categories;
    }
    if (query.source) filters.source = query.source;
    if (query.q) filters.q = String(query.q).slice(0, 100);

    const page = await this.repository.listTransactions(user._id, filters);
    return { ...page, items: page.items, currency: user.currency };
  }

  async createTransaction(user, body = {}, { source = "manual", sourceText = "" } = {}) {
    const [row] = await this.createTransactions(user, [body], { source, sourceText });
    return row;
  }

  /**
   * Creates one or more transactions in a single call. Voice and chat capture use this because one
   * utterance ("chai 40, then 1200 on groceries") often means several entries.
   * Validates every row BEFORE writing any, so a partial save can't happen.
   */
  async createTransactions(user, rows, { source = "manual", sourceText = "" } = {}) {
    if (!Array.isArray(rows) || !rows.length) throw new ValidationError("No transactions to create");
    if (rows.length > 25) throw new ValidationError("At most 25 transactions per request");

    const timeZone = this.#timeZone(user);
    const accountCache = new Map();

    const prepared = [];
    for (const [index, body] of rows.entries()) {
      try {
        prepared.push(await this.#buildTransaction(user, body, { source, sourceText, timeZone, accountCache }));
      } catch (err) {
        // Point the client at the offending row instead of a bare "amount is required".
        if (err instanceof ValidationError && rows.length > 1) {
          throw new ValidationError(`Transaction ${index + 1}: ${err.message}`, err.details);
        }
        throw err;
      }
    }
    return this.repository.createTransactions(user._id, prepared);
  }

  async updateTransaction(user, id, body = {}) {
    const existing = await this.repository.findTransaction(user._id, id);
    if (!existing) throw new NotFoundError("Transaction not found");

    const timeZone = this.#timeZone(user);
    const updates = {};
    const type = body.type ?? existing.type;
    if (body.type !== undefined) {
      if (!TRANSACTION_TYPES.includes(body.type)) {
        throw new ValidationError(`\`type\` must be one of: ${TRANSACTION_TYPES.join(", ")}`, { type: "Invalid" });
      }
      updates.type = body.type;
      // Switching income↔expense invalidates the old category; re-derive it.
      if (!isValidCategory(existing.category, body.type)) {
        updates.category = normaliseCategory(body.category ?? existing.category, body.type);
      }
    }
    if (body.amount !== undefined) updates.amount = requireAmount(body.amount);
    if (body.category !== undefined) {
      if (!isValidCategory(body.category, type)) {
        throw new ValidationError(`\`category\` must be one of: ${categoriesFor(type).join(", ")}`, {
          category: "Invalid for this type",
        });
      }
      updates.category = body.category;
    }
    if (body.title !== undefined) updates.title = optionalText(body.title, "title", 120);
    if (body.note !== undefined) updates.note = optionalText(body.note, "note", 500);
    if (body.date !== undefined) {
      const date = this.#requireDate(body.date, timeZone);
      updates.date = date;
      updates.month = monthKey(date, timeZone); // keep the denormalised month in step
    }
    if (body.accountId !== undefined) {
      const account = await this.repository.findAccount(user._id, body.accountId);
      if (!account) throw new NotFoundError("Account not found");
      updates.accountId = account._id;
    }
    if (!Object.keys(updates).length) throw new ValidationError("Nothing to update");

    const updated = await this.repository.updateTransaction(user._id, id, updates);
    if (!updated) throw new NotFoundError("Transaction not found");
    return updated;
  }

  async deleteTransaction(user, id) {
    const deleted = await this.repository.deleteTransaction(user._id, id);
    if (!deleted) throw new NotFoundError("Transaction not found");
    return deleted;
  }

  async #buildTransaction(user, body, { source, sourceText, timeZone, accountCache }) {
    const type = body.type;
    if (!TRANSACTION_TYPES.includes(type)) {
      throw new ValidationError(`\`type\` must be one of: ${TRANSACTION_TYPES.join(", ")}`, { type: "Required" });
    }
    const amount = requireAmount(body.amount);

    // Callers range from a strict client form to a loose AI guess. Reject an unknown category from
    // a client (it's a bug) but coerce one from the AI (it's a hallucination we can recover from).
    const rawCategory = body.category;
    const category =
      source === "manual"
        ? (() => {
            if (!isValidCategory(rawCategory, type)) {
              throw new ValidationError(`\`category\` must be one of: ${categoriesFor(type).join(", ")}`, {
                category: "Invalid for this type",
              });
            }
            return rawCategory;
          })()
        : normaliseCategory(rawCategory, type);

    const date = body.date === undefined ? new Date() : this.#requireDate(body.date, timeZone);

    let accountId = null;
    if (body.accountId) {
      if (!accountCache.has(String(body.accountId))) {
        const account = await this.repository.findAccount(user._id, body.accountId);
        if (!account) throw new NotFoundError("Account not found");
        accountCache.set(String(body.accountId), account._id);
      }
      accountId = accountCache.get(String(body.accountId));
    } else {
      if (!accountCache.has("__default")) {
        const account = await this.repository.ensureDefaultAccount(user._id, user.currency);
        accountCache.set("__default", account?._id ?? null);
      }
      accountId = accountCache.get("__default");
    }

    return {
      accountId,
      type,
      amount,
      currency: user.currency,
      category,
      title: optionalText(body.title, "title", 120),
      note: optionalText(body.note, "note", 500),
      date,
      month: monthKey(date, timeZone),
      source,
      sourceText: optionalText(body.sourceText ?? sourceText, "sourceText", 500),
    };
  }

  #requireDate(value, timeZone) {
    const date = parseDate(value, timeZone);
    if (!date) throw new ValidationError("`date` must be an ISO timestamp or YYYY-MM-DD", { date: "Invalid" });
    const year = date.getUTCFullYear();
    if (year < 2000 || year > new Date().getUTCFullYear() + 1) {
      throw new ValidationError("`date` is out of range", { date: "Out of range" });
    }
    return date;
  }

  // ---- Budgets ----------------------------------------------------------------------------

  async listBudgets(user, month) {
    const key = this.#resolveMonth(user, month);
    const [budgets, spendByCategory] = await Promise.all([
      this.repository.listBudgets(user._id, key),
      this.repository.totalsByCategory(user._id, { month: key, type: "expense" }),
    ]);
    return { month: key, currency: user.currency, budgets: this.#mergeBudgets(budgets, spendByCategory) };
  }

  async setBudget(user, body = {}) {
    const month = this.#resolveMonth(user, body.month);
    if (!EXPENSE_CATEGORIES.includes(body.category)) {
      throw new ValidationError(`\`category\` must be one of: ${EXPENSE_CATEGORIES.join(", ")}`, {
        category: "Invalid",
      });
    }
    const limit = requireAmount(body.limit, "limit");
    return this.repository.upsertBudget(user._id, { category: body.category, month, limit });
  }

  async deleteBudget(user, category, month) {
    const key = this.#resolveMonth(user, month);
    const deleted = await this.repository.deleteBudget(user._id, { category, month: key });
    if (!deleted) throw new NotFoundError("Budget not found");
    return deleted;
  }

  /** Carries last month's limits into `month`, leaving any already-set limit alone. */
  async copyBudgetsFromPreviousMonth(user, month) {
    const key = this.#resolveMonth(user, month);
    const budgets = await this.repository.copyBudgets(user._id, addMonths(key, -1), key);
    return { month: key, budgets };
  }

  #mergeBudgets(budgets, spendByCategory) {
    const spent = new Map(spendByCategory.map((row) => [row.category, row.total]));
    return budgets.map((budget) => {
      const used = spent.get(budget.category) ?? 0;
      return {
        id: budget.id ?? budget._id?.toString(),
        category: budget.category,
        month: budget.month,
        limit: budget.limit,
        spent: used,
        remaining: budget.limit - used,
        ratio: budget.limit > 0 ? Math.round((used / budget.limit) * 1000) / 1000 : 0,
        overspent: used > budget.limit,
      };
    });
  }

  // ---- Goals ------------------------------------------------------------------------------

  async listGoals(user) {
    const goals = await this.repository.listGoals(user._id);
    return { currency: user.currency, goals: goals.map((g) => this.#decorateGoal(g)) };
  }

  async createGoal(user, body = {}) {
    const name = optionalText(body.name, "name", 80);
    if (!name) throw new ValidationError("`name` is required", { name: "Required" });
    const targetAmount = requireAmount(body.targetAmount, "targetAmount");
    const savedAmount = body.savedAmount === undefined ? 0 : body.savedAmount;
    if (!Number.isInteger(savedAmount) || savedAmount < 0) {
      throw new ValidationError("`savedAmount` must be a non-negative integer in minor units", {
        savedAmount: "Invalid",
      });
    }
    const targetDate = body.targetDate ? this.#requireDate(body.targetDate, this.#timeZone(user)) : null;

    const goal = await this.repository.createGoal(user._id, {
      name,
      targetAmount,
      savedAmount,
      targetDate,
      currency: user.currency,
      achievedAt: savedAmount >= targetAmount ? new Date() : null,
    });
    return this.#decorateGoal(goal);
  }

  async updateGoal(user, id, body = {}) {
    const updates = {};
    if (body.name !== undefined) {
      const name = optionalText(body.name, "name", 80);
      if (!name) throw new ValidationError("`name` cannot be empty", { name: "Required" });
      updates.name = name;
    }
    if (body.targetAmount !== undefined) updates.targetAmount = requireAmount(body.targetAmount, "targetAmount");
    if (body.savedAmount !== undefined) {
      if (!Number.isInteger(body.savedAmount) || body.savedAmount < 0) {
        throw new ValidationError("`savedAmount` must be a non-negative integer in minor units", {
          savedAmount: "Invalid",
        });
      }
      updates.savedAmount = body.savedAmount;
    }
    if (body.targetDate !== undefined) {
      updates.targetDate = body.targetDate ? this.#requireDate(body.targetDate, this.#timeZone(user)) : null;
    }
    if (!Object.keys(updates).length) throw new ValidationError("Nothing to update");

    const goal = await this.repository.updateGoal(user._id, id, updates);
    if (!goal) throw new NotFoundError("Goal not found");
    // Re-evaluate achievement whenever either side of the comparison moved.
    const achieved = goal.savedAmount >= goal.targetAmount;
    if (achieved !== !!goal.achievedAt) {
      const synced = await this.repository.updateGoal(user._id, id, { achievedAt: achieved ? new Date() : null });
      return this.#decorateGoal(synced);
    }
    return this.#decorateGoal(goal);
  }

  /** Moves money into (positive) or out of (negative) a goal. */
  async contributeToGoal(user, id, amount) {
    if (!Number.isInteger(amount) || amount === 0) {
      throw new ValidationError("`amount` must be a non-zero integer in minor units", { amount: "Invalid" });
    }
    if (Math.abs(amount) > MAX_AMOUNT_MINOR) throw new ValidationError("`amount` is unrealistically large");
    const goal = await this.repository.addToGoal(user._id, id, amount);
    if (!goal) throw new NotFoundError("Goal not found");
    return this.#decorateGoal(goal);
  }

  async deleteGoal(user, id) {
    const deleted = await this.repository.deleteGoal(user._id, id);
    if (!deleted) throw new NotFoundError("Goal not found");
    return deleted;
  }

  #decorateGoal(goal) {
    const json = typeof goal.toJSON === "function" ? goal.toJSON() : { ...goal };
    return {
      ...json,
      remaining: Math.max(0, goal.targetAmount - goal.savedAmount),
      ratio: goal.targetAmount > 0 ? Math.round((goal.savedAmount / goal.targetAmount) * 1000) / 1000 : 0,
      achieved: !!goal.achievedAt,
    };
  }

  // ---- Dashboard ---------------------------------------------------------------------------

  /**
   * Everything the Money tab's header needs for one month, in one round trip:
   * balance, income/expense totals, month-on-month change, per-category split, budget status,
   * goal progress and a few derived highlights.
   */
  async getSummary(user, month) {
    const timeZone = this.#timeZone(user);
    const key = this.#resolveMonth(user, month);
    const previousKey = addMonths(key, -1);

    const [totals, previousTotals, byCategory, budgetRows, goals, openingBalance, lifetime] = await Promise.all([
      this.repository.totalsByType(user._id, { month: key }),
      this.repository.totalsByType(user._id, { month: previousKey }),
      this.repository.totalsByCategory(user._id, { month: key, type: "expense" }),
      this.repository.listBudgets(user._id, key),
      this.repository.listGoals(user._id),
      this.repository.openingBalanceTotal(user._id),
      this.repository.totalsByType(user._id),
    ]);

    const budgets = this.#mergeBudgets(budgetRows, byCategory);
    const budgetTotals = budgets.reduce(
      (acc, b) => ({ limit: acc.limit + b.limit, spent: acc.spent + b.spent }),
      { limit: 0, spent: 0 }
    );

    const categoryTotal = byCategory.reduce((sum, row) => sum + row.total, 0);
    const bucket = (category) => byCategory.find((row) => row.category === category)?.total ?? 0;

    return {
      month: key,
      currency: user.currency,
      timezone: timeZone,
      // Balance = what you started with + everything that has flowed since.
      balance: {
        total: openingBalance + lifetime.income - lifetime.expense,
        openingBalance,
        lifetimeIncome: lifetime.income,
        lifetimeExpense: lifetime.expense,
      },
      totals: {
        income: totals.income,
        expense: totals.expense,
        net: totals.income - totals.expense,
        count: totals.count,
      },
      previous: {
        month: previousKey,
        income: previousTotals.income,
        expense: previousTotals.expense,
        net: previousTotals.income - previousTotals.expense,
      },
      /** Spending change vs last month, in percent. Negative = spending less, which is good. */
      changePct: pct(totals.expense - previousTotals.expense, previousTotals.expense),
      byCategory: byCategory.map((row) => ({ ...row, share: pct(row.total, categoryTotal) })),
      topCategory: byCategory[0] ?? null,
      budgets,
      budgetTotals: { ...budgetTotals, remaining: budgetTotals.limit - budgetTotals.spent },
      highlights: {
        // "Saved"/"invested" are explicit categories, not a guess from the leftover cash.
        saved: bucket("savings"),
        invested: bucket("investment"),
        // Cash left over after everything that went out this month.
        netFlow: totals.income - totals.expense,
      },
      goals: {
        count: goals.length,
        targetAmount: goals.reduce((sum, g) => sum + g.targetAmount, 0),
        savedAmount: goals.reduce((sum, g) => sum + g.savedAmount, 0),
        items: goals.slice(0, 3).map((g) => this.#decorateGoal(g)),
      },
      daysLeftInMonth: this.#daysLeftInMonth(key, timeZone),
    };
  }

  /**
   * Expense series for the chart.
   * week  → the 7 days of the current local week (Mon…Sun)
   * month → weekly buckets W1…W5 of the month
   * year  → 12 months, J…D
   */
  async getSeries(user, period = "week", month) {
    const timeZone = this.#timeZone(user);

    if (period === "year") {
      const key = this.#resolveMonth(user, month);
      const year = Number(key.slice(0, 4));
      const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
      const rows = await this.repository.totalsByMonth(user._id, months);
      return {
        period,
        currency: user.currency,
        points: rows.map((row, i) => ({ label: MONTH_INITIALS[i], key: row.month, value: row.expense })),
        total: rows.reduce((sum, row) => sum + row.expense, 0),
      };
    }

    if (period === "month") {
      const key = this.#resolveMonth(user, month);
      const { from, to } = monthRange(key, timeZone);
      const days = await this.repository.expenseByDay(user._id, { from, to, timeZone });
      const byDay = new Map(days.map((d) => [d.day, d.total]));
      const daysInMonth = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).getUTCDate();
      // Calendar-agnostic buckets: days 1–7, 8–14, 15–21, 22–28, 29+.
      const buckets = [];
      for (let start = 1; start <= daysInMonth; start += 7) {
        const end = Math.min(start + 6, daysInMonth);
        let value = 0;
        for (let day = start; day <= end; day += 1) {
          value += byDay.get(`${key}-${String(day).padStart(2, "0")}`) ?? 0;
        }
        buckets.push({ label: `W${buckets.length + 1}`, key: `${key}-${String(start).padStart(2, "0")}`, value });
      }
      return { period, currency: user.currency, points: buckets, total: buckets.reduce((s, b) => s + b.value, 0) };
    }

    // week (default)
    const { from, to } = weekRange(timeZone);
    const days = await this.repository.expenseByDay(user._id, { from, to, timeZone });
    const byDay = new Map(days.map((d) => [d.day, d.total]));
    const start = localParts(from, timeZone);
    const points = WEEKDAYS.map((label, i) => {
      const day = localDateKey(zonedToUtc(start.year, start.month, start.day + i, timeZone, 12), timeZone);
      return { label, key: day, value: byDay.get(day) ?? 0 };
    });
    return { period: "week", currency: user.currency, points, total: points.reduce((s, p) => s + p.value, 0) };
  }

  /** Recent spending trend across `count` months, oldest first. Used by the AI for context. */
  async getMonthlyTrend(user, count = 6, month) {
    const key = this.#resolveMonth(user, month);
    const months = Array.from({ length: count }, (_, i) => addMonths(key, i - (count - 1)));
    const rows = await this.repository.totalsByMonth(user._id, months);
    return { currency: user.currency, months: rows.map((row) => ({ ...row, net: row.income - row.expense })) };
  }

  // ---- Shared ------------------------------------------------------------------------------

  #timeZone(user) {
    return user.timezone || "Asia/Kolkata";
  }

  #resolveMonth(user, month) {
    if (month === undefined || month === null || month === "") return currentMonthKey(this.#timeZone(user));
    if (!isMonthKey(month)) throw new ValidationError("`month` must look like 2026-09", { month: "Invalid" });
    return month;
  }

  #daysLeftInMonth(key, timeZone) {
    const today = currentMonthKey(timeZone);
    if (key !== today) return 0; // only meaningful for the month in progress
    const { day, year, month } = localParts(new Date(), timeZone);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return daysInMonth - day;
  }

  /** Called from UserService.deleteMe — the account deletion cascade. */
  async deleteAllForUser(userId) {
    return this.repository.deleteAllForUser(userId);
  }
}

export { isPositiveInt, requireAmount };
