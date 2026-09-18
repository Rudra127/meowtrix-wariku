// @file backend/services/user-service.js
// Business logic for users. Throws AppErrors; returns plain data.
import { clerkClient } from "@clerk/express";
import { GOALS, LEVELS } from "../database/models/user.js";
import FinanceRepository from "../database/repository/finance-repository.js";
import IntegrationRepository from "../database/repository/integration-repository.js";
import UserRepository, {
  fieldsFromClerkUser,
  fieldsFromClerkWebhook,
} from "../database/repository/user-repository.js";
import { isTimeZone } from "../utils/dates.js";
import LearnService from "./learn-service.js";
import { NotFoundError, ValidationError } from "../utils/index.js";

// Fields a user may change on their own profile via PATCH /users/me.
// Name/email/avatar are owned by Clerk — change them in the app through Clerk's `user.update()`,
// and the `user.updated` webhook (or the next first-login sync) mirrors them here.
const isCurrency = (v) => typeof v === "string" && /^[A-Za-z]{3}$/.test(v);
const SELF_EDITABLE = {
  isOnboarded: (v) => typeof v === "boolean",
  currency: isCurrency,
  level: (v) => LEVELS.includes(v),
  goal: (v) => GOALS.includes(v),
  timezone: isTimeZone,
};

export default class UserService {
  /**
   * The extra dependencies exist only for the account-deletion cascade (`#purgeUserData`).
   * They're constructor arguments so tests can assert the cascade ran without a database.
   */
  constructor(
    repository = new UserRepository(),
    {
      financeRepository = new FinanceRepository(),
      integrationRepository = new IntegrationRepository(),
      learnService = new LearnService(),
    } = {}
  ) {
    this.repository = repository;
    this.financeRepository = financeRepository;
    this.integrationRepository = integrationRepository;
    this.learnService = learnService;
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

  /**
   * Saves the onboarding questionnaire and marks the user onboarded.
   * Body: { level, goal, currency? } — level/goal drive personalisation across the app.
   */
  async completeOnboarding(clerkId, body = {}) {
    const { level, goal, currency, timezone } = body;
    const invalid = {};
    if (!LEVELS.includes(level)) invalid.level = `Must be one of: ${LEVELS.join(", ")}`;
    if (!GOALS.includes(goal)) invalid.goal = `Must be one of: ${GOALS.join(", ")}`;
    if (currency !== undefined && !isCurrency(currency)) invalid.currency = "Must be a 3-letter ISO code";
    // The app sends its device timezone here; ignore it silently if the device reports nonsense
    // rather than failing onboarding over it.
    if (Object.keys(invalid).length) throw new ValidationError("Invalid onboarding answers", invalid);

    const user = await this.repository.updateByClerkId(clerkId, {
      level,
      goal,
      ...(currency && { currency: currency.toUpperCase() }),
      ...(isTimeZone(timezone) && { timezone }),
      isOnboarded: true,
      onboardedAt: new Date(),
    });
    if (!user) throw new NotFoundError("User not found");
    return user;
  }

  /**
   * Deletes the account everywhere: Clerk (identity + sessions) and our DB (all app data).
   *
   * Order matters. Clerk goes first so the user's sessions are revoked immediately — if our own
   * cleanup then fails halfway, they cannot keep using a half-deleted account. `_cascadeDelete`
   * runs before the User row so a crash leaves orphaned children discoverable by userId rather
   * than silently unreachable.
   */
  async deleteMe(clerkId) {
    const user = await this.repository.findByClerkId(clerkId);
    await clerkClient.users.deleteUser(clerkId);
    if (user) await this._cascadeDelete(user._id);
    await this.repository.deleteByClerkId(clerkId);
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

  /**
   * A user was deleted in the Clerk Dashboard (or by another client). Mirror it: same cascade as
   * `deleteMe`, minus the Clerk call that already happened.
   */
  async handleClerkUserDeleted(data) {
    if (!data?.id) return;
    const user = await this.repository.findByClerkId(data.id);
    if (user) await this._cascadeDelete(user._id);
    await this.repository.deleteByClerkId(data.id);
  }

  /**
   * Fan-out cleanup for per-user data across every feature. Called on account deletion.
   *
   * ADDING A FEATURE WITH USER-OWNED DATA? Add it here, or deleting an account will leave that data
   * behind — which breaks both the App Store / Play Store deletion requirement and any
   * "right to erasure" promise.
   */
  async _cascadeDelete(userId) {
    await Promise.all([
      // Learn: lesson progress + learner stats.
      this.learnService.deleteAllForUser(userId),
      // Money: accounts, transactions, budgets, goals.
      this.financeRepository.deleteAllForUser(userId),
      // Broker links — these hold encrypted access tokens, so leaving them is a real risk.
      this.integrationRepository.deleteAllForUser(userId),
    ]);
  }
}
