// @file backend/database/models/transaction.js
// One income or expense entry.
//
// `amount` is always a POSITIVE integer in MINOR units (paise/cents) — `type` carries the
// direction. Storing the sign separately keeps aggregation pipelines trivial and stops a stray
// negative income row from silently corrupting totals. Clients derive the display sign from `type`.
import mongoose from "mongoose";
import { CATEGORIES, TRANSACTION_TYPES } from "./categories.js";
import { jsonTransform } from "./json-transform.js";

/** How the entry got created — powers "added by voice" badges and lets us audit AI writes. */
export const TRANSACTION_SOURCES = ["manual", "voice", "chat", "import"];

const transactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", default: null },
    type: { type: String, enum: TRANSACTION_TYPES, required: true },
    /** Positive integer, minor units. */
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, trim: true, uppercase: true, default: "INR", maxlength: 3 },
    category: { type: String, enum: CATEGORIES, required: true },
    title: { type: String, trim: true, maxlength: 120, default: "" },
    note: { type: String, trim: true, maxlength: 500, default: "" },
    /** UTC instant the money moved. */
    date: { type: Date, required: true },
    /**
     * Local calendar month ("2026-09") of `date` in the user's timezone, denormalised so month
     * queries and budget joins are a plain equality match instead of a timezone-aware range scan.
     * Written by the service — never set this from a request body.
     */
    month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/, index: true },
    source: { type: String, enum: TRANSACTION_SOURCES, default: "manual" },
    /** Verbatim phrase this entry was extracted from, for voice/chat entries. Aids debugging. */
    sourceText: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { timestamps: true, toJSON: jsonTransform }
);

// Feed queries: "my transactions, newest first".
transactionSchema.index({ userId: 1, date: -1 });
// Monthly summaries and per-category rollups.
transactionSchema.index({ userId: 1, month: 1, type: 1 });

const Transaction = mongoose.model("Transaction", transactionSchema);
export default Transaction;
