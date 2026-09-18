// @file backend/database/models/goal.js
// A savings goal: "₹1,00,000 emergency fund by next September".
//
// `savedAmount` is tracked explicitly rather than derived from transactions — users move money to a
// goal at their own pace, and not every contribution has a matching ledger entry yet.
import mongoose from "mongoose";
import { jsonTransform } from "./json-transform.js";

const goalSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    /** Positive integers, minor units. */
    targetAmount: { type: Number, required: true, min: 1 },
    savedAmount: { type: Number, default: 0, min: 0 },
    currency: { type: String, trim: true, uppercase: true, default: "INR", maxlength: 3 },
    targetDate: { type: Date, default: null },
    achievedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: jsonTransform }
);

goalSchema.index({ userId: 1, createdAt: -1 });

const Goal = mongoose.model("Goal", goalSchema);
export default Goal;
