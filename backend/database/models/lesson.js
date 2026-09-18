// @file backend/database/models/lesson.js
// A lesson belongs to a Unit and contains embedded exercises. The exercise `answer`
// field is polymorphic (see EXERCISE_TYPES below); grading lives in services/learn-service.js
// so answers never need to leave the server.
import mongoose from "mongoose";

export const EXERCISE_TYPES = ["multiple_choice", "true_false", "fill_number", "order_steps"];

// Kept as a plain sub-schema (no _id) so exercises are addressed by their array index,
// which is how the client submits answers.
const exerciseSchema = new mongoose.Schema(
  {
    type: { type: String, enum: EXERCISE_TYPES, required: true },
    prompt: { type: String, required: true, trim: true },
    // multiple_choice: choice labels; order_steps: steps to arrange (shown shuffled by the client).
    options: { type: [String], default: undefined },
    // Polymorphic:
    //   multiple_choice → Number (index into options)
    //   true_false     → Boolean
    //   fill_number    → Number
    //   order_steps    → [Number] (correct order as indices into options)
    answer: { type: mongoose.Schema.Types.Mixed, required: true },
    // Absolute tolerance for fill_number (0 = exact). Ignored for other types.
    tolerance: { type: Number, default: 0, min: 0 },
    explanation: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const lessonSchema = new mongoose.Schema(
  {
    unitId: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true, index: true },
    slug: { type: String, required: true, unique: true, trim: true, index: true },
    title: { type: String, required: true, trim: true },
    summary: { type: String, default: "", trim: true },
    order: { type: Number, required: true, min: 0 },
    xp: { type: Number, required: true, min: 0, default: 20 },
    estimatedMinutes: { type: Number, required: true, min: 1, default: 3 },
    icon: { type: String, default: "book-outline" },
    exercises: {
      type: [exerciseSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "A lesson must have at least one exercise",
      },
    },
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

lessonSchema.index({ unitId: 1, order: 1 });

const Lesson = mongoose.model("Lesson", lessonSchema);
export default Lesson;
