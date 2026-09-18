// @file backend/database/models/account.js
// A place money sits: cash in hand, a bank account, a card, a wallet.
// Every user gets a default "Cash" account lazily on first use so quick-add never needs setup.
import mongoose from "mongoose";
import { jsonTransform } from "./json-transform.js";

export const ACCOUNT_TYPES = ["cash", "bank", "card", "wallet"];

const accountSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    type: { type: String, enum: ACCOUNT_TYPES, default: "cash" },
    currency: { type: String, trim: true, uppercase: true, default: "INR", maxlength: 3 },
    /** Balance before the first recorded transaction. Integer MINOR units (paise/cents). */
    openingBalance: { type: Number, default: 0 },
    isDefault: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: jsonTransform }
);

// One default account per user.
accountSchema.index({ userId: 1, isDefault: 1 });

const Account = mongoose.model("Account", accountSchema);
export default Account;
