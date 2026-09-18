// @file backend/database/repository/integration-repository.js
// All Mongoose queries for third-party account links. Every method is scoped to `userId`.
import Integration from "../models/integration.js";

export default class IntegrationRepository {
  async find(userId, provider) {
    return Integration.findOne({ userId, provider });
  }

  async listForUser(userId) {
    return Integration.find({ userId });
  }

  /** Creates or replaces the link. Atomic so two callback hits can't insert twice. */
  async upsert(userId, provider, fields) {
    try {
      return await Integration.findOneAndUpdate(
        { userId, provider },
        { $set: fields, $setOnInsert: { userId, provider } },
        { upsert: true, new: true, runValidators: true }
      );
    } catch (err) {
      if (err?.code === 11000) return Integration.findOne({ userId, provider });
      throw err;
    }
  }

  async update(userId, provider, updates) {
    return Integration.findOneAndUpdate({ userId, provider }, { $set: updates }, { new: true });
  }

  /** Marks the link as needing re-authentication and wipes the dead token + stale cache. */
  async markExpired(userId, provider, reason = "") {
    return Integration.findOneAndUpdate(
      { userId, provider },
      {
        $set: {
          status: "expired",
          accessToken: "",
          publicToken: "",
          lastError: reason.slice(0, 200),
          "cache.holdings": {},
          "cache.positions": {},
        },
      },
      { new: true }
    );
  }

  async cacheResponse(userId, provider, key, payload) {
    return Integration.findOneAndUpdate(
      { userId, provider },
      { $set: { [`cache.${key}`]: { payload, at: new Date() }, lastUsedAt: new Date(), lastError: "" } },
      { new: true }
    );
  }

  async remove(userId, provider) {
    return Integration.findOneAndDelete({ userId, provider });
  }

  /** Called from UserService.deleteMe — no orphaned broker tokens after account deletion. */
  async deleteAllForUser(userId) {
    const result = await Integration.deleteMany({ userId });
    return result.deletedCount ?? 0;
  }
}
