// @file backend/database/models/user.js
// Local mirror of a Clerk user. Clerk owns identity (email, password, OAuth, sessions);
// this collection owns app data that hangs off a user (XP, budgets, chat history, ...).
// Link other collections to users via `userId: { type: ObjectId, ref: "User" }` (i.e. this doc's _id).
import mongoose from "mongoose";

// Onboarding answers — they personalise the app (dashboard focus, lesson path, AI tone).
// Keep in sync with mobile/src/features/onboarding/options.ts.
export const LEVELS = ["beginner", "intermediate", "advanced"];
export const GOALS = ["budgeting", "saving", "debt", "investing", "learning"];

const userSchema = new mongoose.Schema(
  {
    clerkId: { type: String, required: true, unique: true, index: true },
    email: { type: String, trim: true, lowercase: true, index: true },
    firstName: { type: String, trim: true, default: "" },
    lastName: { type: String, trim: true, default: "" },
    imageUrl: { type: String, default: "" },
    // Set from Clerk `publicMetadata.role` (Dashboard → Users → user → Metadata).
    role: { type: String, enum: ["user", "admin"], default: "user" },

    // App-level profile. Extend here as features land (see docs/ROADMAP.md).
    isOnboarded: { type: Boolean, default: false },
    onboardedAt: { type: Date, default: null },
    level: { type: String, enum: LEVELS, default: null },
    goal: { type: String, enum: GOALS, default: null },
    currency: { type: String, trim: true, uppercase: true, default: "INR", maxlength: 3 },
    /**
     * IANA zone, sent by the app on onboarding. Decides which calendar month a transaction
     * belongs to — see backend/utils/dates.js for why UTC grouping is wrong here.
     */
    timezone: { type: String, trim: true, default: "Asia/Kolkata" },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        return ret;
      },
    },
  }
);

const User = mongoose.model("User", userSchema);
export default User;
