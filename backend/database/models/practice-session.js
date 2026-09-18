// @file backend/database/models/practice-session.js
// An AI-generated practice round for one lesson, for one user.
//
// Why a collection instead of returning answers to the client: generated exercises must be
// graded server-side like authored ones, so the answers have to live somewhere the client
// can't read. The client gets a `sessionId` plus answer-stripped exercises, then submits
// answers against the session.
//
// Sessions are disposable — a TTL index drops them ~24h after creation, so this collection
// never grows unbounded and abandoned rounds clean themselves up.
import mongoose from "mongoose";
import { EXERCISE_TYPES } from "./lesson.js";

// Mirrors the embedded exercise shape in lesson.js (see that file for the `answer` contract).
const generatedExerciseSchema = new mongoose.Schema(
  {
    type: { type: String, enum: EXERCISE_TYPES, required: true },
    prompt: { type: String, required: true, trim: true },
    options: { type: [String], default: undefined },
    answer: { type: mongoose.Schema.Types.Mixed, required: true },
    tolerance: { type: Number, default: 0, min: 0 },
    explanation: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const practiceSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    lessonId: { type: mongoose.Schema.Types.ObjectId, ref: "Lesson", required: true, index: true },
    exercises: {
      type: [generatedExerciseSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "A practice session must have at least one exercise",
      },
    },
    status: { type: String, enum: ["open", "completed"], default: "open", index: true },
    // Filled in on submit.
    score: { type: Number, default: null, min: 0, max: 1 },
    correct: { type: Number, default: null, min: 0 },
    total: { type: Number, default: null, min: 0 },
    xpEarned: { type: Number, default: 0, min: 0 },
    completedAt: { type: Date, default: null },
    // Provider metadata, handy for cost/debug tracking.
    model: { type: String, default: "" },

    // TTL: Mongo removes the document ~24h after creation.
    createdAt: { type: Date, default: () => new Date(), expires: 60 * 60 * 24 },
  },
  {
    // `createdAt` is declared explicitly above for the TTL index, so only add `updatedAt`.
    timestamps: { createdAt: false, updatedAt: true },
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

const PracticeSession = mongoose.model("PracticeSession", practiceSessionSchema);
export default PracticeSession;
