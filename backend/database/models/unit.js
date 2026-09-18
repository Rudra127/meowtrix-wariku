// @file backend/database/models/unit.js
// A learning unit: a themed group of lessons (e.g. "Budgeting basics").
// `slug` is the stable public id used in API responses and by the mobile client
// (see mobile/src/features/onboarding/options.ts → `learnUnitId`). Content is
// authored server-side and loaded via database/seed/learn-seed.js.
import mongoose from "mongoose";

const unitSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    order: { type: Number, required: true, min: 0, index: true },
    icon: { type: String, default: "book-outline" },
    isPublished: { type: Boolean, default: true },
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

const Unit = mongoose.model("Unit", unitSchema);
export default Unit;
