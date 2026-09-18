// @file backend/services/user-service.js
// Business logic for users. Throws AppErrors; returns plain data.
import { clerkClient } from "@clerk/express";
import UserRepository, {
  fieldsFromClerkUser,
  fieldsFromClerkWebhook,
} from "../database/repository/user-repository.js";
import { NotFoundError, ValidationError } from "../utils/index.js";

// Fields a user may change on their own profile via PATCH /users/me.
// Name/email/avatar are owned by Clerk — change them in the app through Clerk's `user.update()`,
// and the `user.updated` webhook (or the next first-login sync) mirrors them here.
const SELF_EDITABLE = {
  isOnboarded: (v) => typeof v === "boolean",
  currency: (v) => typeof v === "string" && /^[A-Za-z]{3}$/.test(v),
};

export default class UserService {
  constructor(repository = new UserRepository()) {
    this.repository = repository;
  }

  /**
   * Returns the local user for a Clerk user ID, creating it from Clerk's profile on first sight.
   * This is the "lazy sync" that makes the webhook optional in development.
   */
  async getOrCreateFromClerk(clerkId) {
    const existing = await this.repository.findByClerkId(clerkId);
    if (existing) return existing;

    const clerkUser = await clerkClient.users.getUser(clerkId);
    return this.repository.upsertFromClerk(clerkId, fieldsFromClerkUser(clerkUser));
  }

  /** Re-pulls the profile from Clerk (e.g. after the user edits their name in the app). */
  async refreshFromClerk(clerkId) {
    const clerkUser = await clerkClient.users.getUser(clerkId);
    return this.repository.upsertFromClerk(clerkId, fieldsFromClerkUser(clerkUser));
  }

  async updateMe(clerkId, body = {}) {
    const updates = {};
    const invalid = {};
    for (const [key, value] of Object.entries(body)) {
      const validate = SELF_EDITABLE[key];
      if (!validate) continue; // silently ignore non-editable fields
      if (!validate(value)) invalid[key] = "Invalid value";
      else updates[key] = key === "currency" ? value.toUpperCase() : value;
    }
    if (Object.keys(invalid).length) throw new ValidationError("Invalid fields", invalid);
    if (!Object.keys(updates).length) {
      throw new ValidationError(`Nothing to update. Editable fields: ${Object.keys(SELF_EDITABLE).join(", ")}`);
    }

    const user = await this.repository.updateByClerkId(clerkId, updates);
    if (!user) throw new NotFoundError("User not found");
    return user;
  }

  /** Deletes the account everywhere: Clerk (identity + sessions) and our DB (app data). */
  async deleteMe(clerkId) {
    await clerkClient.users.deleteUser(clerkId);
    await this.repository.deleteByClerkId(clerkId);
    // TODO(feature teams): also delete documents in your collections that reference this user.
  }

  async list(query) {
    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
    const search = typeof query.search === "string" ? query.search.slice(0, 100) : undefined;
    return this.repository.list({ page, limit, search });
  }

  // ---- Clerk webhook handlers -------------------------------------------------------------

  async handleClerkUserUpserted(data) {
    return this.repository.upsertFromClerk(data.id, fieldsFromClerkWebhook(data));
  }

  async handleClerkUserDeleted(data) {
    if (data?.id) await this.repository.deleteByClerkId(data.id);
  }
}
