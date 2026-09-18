// @file backend/database/models/integration.js
// A user's link to a third-party financial account. Today: Zerodha (Kite Connect).
//
// SECURITY: `accessToken` and `publicToken` hold ciphertext from lib/crypto.js, never raw
// credentials. `toJSON` drops both — this document is never safe to send to a client as-is, so the
// service builds an explicit public shape instead (see ZerodhaService.getStatus).
import mongoose from "mongoose";

export const PROVIDERS = ["zerodha"];
export const INTEGRATION_STATUSES = [
  "connected", // token present and believed valid
  "expired", // token past its expiry, or the broker rejected it — user must reconnect
  "disconnected", // user unlinked, or we could not decrypt the token
];

/** Cached broker responses so a chat follow-up doesn't re-hit Zerodha's rate limits. */
const cacheEntrySchema = new mongoose.Schema(
  {
    payload: { type: mongoose.Schema.Types.Mixed, default: null },
    at: { type: Date, default: null },
  },
  { _id: false }
);

const integrationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    provider: { type: String, enum: PROVIDERS, required: true },
    status: { type: String, enum: INTEGRATION_STATUSES, default: "disconnected" },

    /** The broker's own identifiers — safe to show ("Connected as AB1234"). */
    externalUserId: { type: String, trim: true, default: "" },
    externalUserName: { type: String, trim: true, default: "" },

    /** Ciphertext only. See lib/crypto.js. */
    accessToken: { type: String, default: "" },
    publicToken: { type: String, default: "" },

    connectedAt: { type: Date, default: null },
    /** Kite tokens die at ~06:00 IST daily; we pre-empt the 403 by checking this. */
    expiresAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
    /** Last upstream failure, for the Profile screen's status row. */
    lastError: { type: String, trim: true, default: "" },

    cache: {
      holdings: { type: cacheEntrySchema, default: () => ({}) },
      positions: { type: cacheEntrySchema, default: () => ({}) },
    },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        // Belt and braces: even an accidental `res.json(integration)` leaks nothing.
        delete ret.accessToken;
        delete ret.publicToken;
        delete ret.cache;
        return ret;
      },
    },
  }
);

// One link per provider per user.
integrationSchema.index({ userId: 1, provider: 1 }, { unique: true });

const Integration = mongoose.model("Integration", integrationSchema);
export default Integration;
