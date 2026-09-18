// @file backend/database/models/budget.js
// A monthly spending limit for one expense category, e.g. food ≤ ₹8,000 in 2026-09.
import mongoose from "mongoose";
import { EXPENSE_CATEGORIES } from "./categories.js";
import { jsonTransform } from "./json-transform.js";

const budgetSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    category: { type: String, enum: EXPENSE_CATEGORIES, required: true },
    /** Local calendar month, "2026-09". */
    month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    /** Positive integer, minor units. */
    limit: { type: Number, required: true, min: 1 },
  },
  { timestamps: true, toJSON: jsonTransform }
);

// One limit per category per month.
budgetSchema.index({ userId: 1, month: 1, category: 1 }, { unique: true });

const Budget = mongoose.model("Budget", budgetSchema);
export default Budget;
