// @file backend/database/repository/user-repository.js
// All Mongoose queries for users live here. Services call this; routes never touch models directly.
import User from "../models/user.js";

/** Maps a Clerk Backend API `User` object onto our schema fields. */
export const fieldsFromClerkUser = (clerkUser) => {
  const primaryEmail =
    clerkUser.emailAddresses?.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
    clerkUser.emailAddresses?.[0]?.emailAddress ??
    "";
  const role = clerkUser.publicMetadata?.role === "admin" ? "admin" : "user";

  return {
    email: primaryEmail,
    firstName: clerkUser.firstName ?? "",
    lastName: clerkUser.lastName ?? "",
    imageUrl: clerkUser.imageUrl ?? "",
    role,
  };
};

/** Same mapping for webhook payloads, which use snake_case. */
export const fieldsFromClerkWebhook = (data) => {
  const primaryEmail =
    data.email_addresses?.find((e) => e.id === data.primary_email_address_id)?.email_address ??
    data.email_addresses?.[0]?.email_address ??
    "";
  const role = data.public_metadata?.role === "admin" ? "admin" : "user";

  return {
    email: primaryEmail,
    firstName: data.first_name ?? "",
    lastName: data.last_name ?? "",
    imageUrl: data.image_url ?? "",
    role,
  };
};

export default class UserRepository {
  async findByClerkId(clerkId) {
    return User.findOne({ clerkId });
  }

  /**
   * Creates or refreshes the local user for a Clerk ID. Atomic, so two parallel first
   * requests from a brand-new user can't create duplicates.
   */
  async upsertFromClerk(clerkId, fields) {
    try {
      return await User.findOneAndUpdate(
        { clerkId },
        { $set: fields, $setOnInsert: { clerkId } },
        { upsert: true, new: true, runValidators: true }
      );
    } catch (err) {
      // Concurrent upserts can still race on the unique index; the other writer won, so read it back.
      if (err?.code === 11000) return User.findOne({ clerkId });
      throw err;
    }
  }

  async updateByClerkId(clerkId, updates) {
    return User.findOneAndUpdate({ clerkId }, { $set: updates }, { new: true, runValidators: true });
  }

  async deleteByClerkId(clerkId) {
    return User.deleteOne({ clerkId });
  }

  async list({ page = 1, limit = 20, search } = {}) {
    const filter = search
      ? {
          $or: ["email", "firstName", "lastName"].map((field) => ({
            [field]: { $regex: escapeRegex(search), $options: "i" },
          })),
        }
      : {};
    const [items, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      User.countDocuments(filter),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
