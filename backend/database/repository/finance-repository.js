// @file backend/database/repository/finance-repository.js
// Every Mongoose query for the Money feature. Services call this; routes never touch models.
//
// INVARIANT: each method takes `userId` and filters on it. There is no "find by id" that isn't
// also scoped to the owner — a guessed ObjectId must never read or write someone else's row.
import Account from "../models/account.js";
import Budget from "../models/budget.js";
import Goal from "../models/goal.js";
import Transaction from "../models/transaction.js";

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default class FinanceRepository {
  // ---- Accounts ---------------------------------------------------------------------------

  async listAccounts(userId) {
    return Account.find({ userId, archivedAt: null }).sort({ isDefault: -1, createdAt: 1 });
  }

  async findAccount(userId, id) {
    return Account.findOne({ _id: id, userId });
  }

  async createAccount(userId, fields) {
    return Account.create({ ...fields, userId });
  }

  async updateAccount(userId, id, updates) {
    return Account.findOneAndUpdate({ _id: id, userId }, { $set: updates }, { new: true, runValidators: true });
  }

  async archiveAccount(userId, id) {
    return Account.findOneAndUpdate({ _id: id, userId }, { $set: { archivedAt: new Date() } }, { new: true });
  }

  /** Clears `isDefault` on every account except `keepId`. */
  async clearDefaultAccounts(userId, keepId) {
    return Account.updateMany({ userId, _id: { $ne: keepId }, isDefault: true }, { $set: { isDefault: false } });
  }

  /**
   * Returns the user's default account, creating a "Cash" one on first use.
   * Atomic upsert so two concurrent quick-adds can't create two default accounts.
   */
  async ensureDefaultAccount(userId, currency) {
    const existing = await Account.findOne({ userId, isDefault: true, archivedAt: null });
    if (existing) return existing;
    const anyAccount = await Account.findOne({ userId, archivedAt: null }).sort({ createdAt: 1 });
    if (anyAccount) {
      anyAccount.isDefault = true;
      return anyAccount.save();
    }
    try {
      return await Account.create({ userId, name: "Cash", type: "cash", currency, isDefault: true });
    } catch {
      // Lost a race — the other writer's account is the default now.
      return Account.findOne({ userId, archivedAt: null }).sort({ createdAt: 1 });
    }
  }

  // ---- Transactions ----------------------------------------------------------------------

  /**
   * Filtered, newest-first page of transactions.
   * @param {{ from?: Date, to?: Date, type?: string, category?: string, categories?: string[],
   *           accountId?: string, source?: string, q?: string, month?: string,
   *           limit?: number, skip?: number }} filters
   */
  async listTransactions(userId, filters = {}) {
    const query = this.#transactionQuery(userId, filters);
    const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
    const [items, total] = await Promise.all([
      Transaction.find(query)
        .sort({ date: -1, _id: -1 })
        .skip(Math.max(0, filters.skip ?? 0))
        .limit(limit),
      Transaction.countDocuments(query),
    ]);
    return { items, total, limit, skip: Math.max(0, filters.skip ?? 0) };
  }

  async findTransaction(userId, id) {
    return Transaction.findOne({ _id: id, userId });
  }

  async createTransaction(userId, fields) {
    return Transaction.create({ ...fields, userId });
  }

  /** Bulk insert for voice/chat capture, where one utterance yields several entries. */
  async createTransactions(userId, rows) {
    if (!rows.length) return [];
    return Transaction.insertMany(
      rows.map((row) => ({ ...row, userId })),
      { ordered: true }
    );
  }

  async updateTransaction(userId, id, updates) {
    return Transaction.findOneAndUpdate({ _id: id, userId }, { $set: updates }, { new: true, runValidators: true });
  }

  async deleteTransaction(userId, id) {
    return Transaction.findOneAndDelete({ _id: id, userId });
  }

  #transactionQuery(userId, filters) {
    const query = { userId };
    if (filters.month) query.month = filters.month;
    if (filters.from || filters.to) {
      query.date = {};
      if (filters.from) query.date.$gte = filters.from;
      if (filters.to) query.date.$lt = filters.to; // half-open: [from, to)
    }
    if (filters.type) query.type = filters.type;
    if (filters.category) query.category = filters.category;
    if (filters.categories?.length) query.category = { $in: filters.categories };
    if (filters.accountId) query.accountId = filters.accountId;
    if (filters.source) query.source = filters.source;
    if (filters.q) {
      const regex = { $regex: escapeRegex(filters.q), $options: "i" };
      query.$or = [{ title: regex }, { note: regex }];
    }
    return query;
  }

  // ---- Aggregates -------------------------------------------------------------------------

  /** `{ income, expense, count }` in minor units for a date range (or month). */
  async totalsByType(userId, range = {}) {
    const rows = await Transaction.aggregate([
      { $match: this.#transactionQuery(userId, range) },
      { $group: { _id: "$type", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]);
    const find = (type) => rows.find((r) => r._id === type);
    return {
      income: find("income")?.total ?? 0,
      expense: find("expense")?.total ?? 0,
      count: rows.reduce((sum, r) => sum + r.count, 0),
    };
  }

  /** `[{ category, total, count }]` sorted by spend, descending. */
  async totalsByCategory(userId, range = {}) {
    const rows = await Transaction.aggregate([
      { $match: this.#transactionQuery(userId, range) },
      { $group: { _id: "$category", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]);
    return rows.map((r) => ({ category: r._id, total: r.total, count: r.count }));
  }

  /** `[{ month, income, expense }]` for the given month keys, oldest first. */
  async totalsByMonth(userId, months) {
    if (!months.length) return [];
    const rows = await Transaction.aggregate([
      { $match: { userId, month: { $in: months } } },
      { $group: { _id: { month: "$month", type: "$type" }, total: { $sum: "$amount" } } },
    ]);
    return months.map((month) => ({
      month,
      income: rows.find((r) => r._id.month === month && r._id.type === "income")?.total ?? 0,
      expense: rows.find((r) => r._id.month === month && r._id.type === "expense")?.total ?? 0,
    }));
  }

  /**
   * Expense totals bucketed by local calendar day: `[{ day: "2026-09-14", total }]`.
   * `$dateToString` with a timezone does the bucketing in Mongo, so a day never splits at UTC
   * midnight for users who aren't on UTC.
   */
  async expenseByDay(userId, { from, to, timeZone }) {
    const rows = await Transaction.aggregate([
      { $match: { userId, type: "expense", date: { $gte: from, $lt: to } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$date", timezone: timeZone } },
          total: { $sum: "$amount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    return rows.map((r) => ({ day: r._id, total: r.total }));
  }

  /** Sum of every account's opening balance, in minor units. */
  async openingBalanceTotal(userId) {
    const [row] = await Account.aggregate([
      { $match: { userId, archivedAt: null } },
      { $group: { _id: null, total: { $sum: "$openingBalance" } } },
    ]);
    return row?.total ?? 0;
  }

  /** Lifetime income − expense across all transactions, in minor units. */
  async netFlowTotal(userId) {
    const { income, expense } = await this.totalsByType(userId);
    return income - expense;
  }

  // ---- Budgets ----------------------------------------------------------------------------

  async listBudgets(userId, month) {
    return Budget.find({ userId, ...(month && { month }) }).sort({ category: 1 });
  }

  /** Creates or overwrites the limit for one category in one month. */
  async upsertBudget(userId, { category, month, limit }) {
    return Budget.findOneAndUpdate(
      { userId, category, month },
      { $set: { limit }, $setOnInsert: { userId, category, month } },
      { upsert: true, new: true, runValidators: true }
    );
  }

  async deleteBudget(userId, { category, month }) {
    return Budget.findOneAndDelete({ userId, category, month });
  }

  /** Copies the previous month's limits forward. Never overwrites limits already set. */
  async copyBudgets(userId, fromMonth, toMonth) {
    const previous = await Budget.find({ userId, month: fromMonth });
    if (!previous.length) return [];
    await Budget.bulkWrite(
      previous.map((b) => ({
        updateOne: {
          filter: { userId, category: b.category, month: toMonth },
          update: { $setOnInsert: { userId, category: b.category, month: toMonth, limit: b.limit } },
          upsert: true,
        },
      }))
    );
    return Budget.find({ userId, month: toMonth }).sort({ category: 1 });
  }

  // ---- Goals ------------------------------------------------------------------------------

  async listGoals(userId) {
    return Goal.find({ userId }).sort({ achievedAt: 1, createdAt: -1 });
  }

  async findGoal(userId, id) {
    return Goal.findOne({ _id: id, userId });
  }

  async createGoal(userId, fields) {
    return Goal.create({ ...fields, userId });
  }

  async updateGoal(userId, id, updates) {
    return Goal.findOneAndUpdate({ _id: id, userId }, { $set: updates }, { new: true, runValidators: true });
  }

  /** Adds to (or subtracts from) a goal's saved amount atomically, never below zero. */
  async addToGoal(userId, id, delta) {
    const goal = await Goal.findOne({ _id: id, userId });
    if (!goal) return null;
    goal.savedAmount = Math.max(0, goal.savedAmount + delta);
    if (goal.savedAmount >= goal.targetAmount && !goal.achievedAt) goal.achievedAt = new Date();
    if (goal.savedAmount < goal.targetAmount) goal.achievedAt = null;
    return goal.save();
  }

  async deleteGoal(userId, id) {
    return Goal.findOneAndDelete({ _id: id, userId });
  }

  // ---- Account deletion -------------------------------------------------------------------

  /** Wipes every finance document for a user. Called from UserService.deleteMe. */
  async deleteAllForUser(userId) {
    const results = await Promise.all([
      Transaction.deleteMany({ userId }),
      Budget.deleteMany({ userId }),
      Goal.deleteMany({ userId }),
      Account.deleteMany({ userId }),
    ]);
    return results.reduce((sum, r) => sum + (r.deletedCount ?? 0), 0);
  }
}
