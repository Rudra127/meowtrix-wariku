// @file backend/database/models/lesson-progress.js
// Per-user progress on a lesson. Created (or updated) whenever the user submits a lesson.
// `score` is the fraction of correct exercises on the best attempt (0..1).
// `xpEarned` is what the user has been awarded for this lesson so far; retries can only
// raise this value — see LearnService.submitLesson.
import mongoose from "mongoose";

const lessonProgressSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    lessonId: { type: mongoose.Schema.Types.ObjectId, ref: "Lesson", required: true, index: true },
    score: { type: Number, required: true, min: 0, max: 1 },
    xpEarned: { type: Number, required: true, min: 0, default: 0 },
    attempts: { type: Number, required: true, min: 1, default: 1 },
    passed: { type: Boolean, required: true, default: false },
    firstCompletedAt: { type: Date, default: null },
    lastAttemptAt: { type: Date, default: () => new Date() },
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

// One progress row per (user, lesson).
lessonProgressSchema.index({ userId: 1, lessonId: 1 }, { unique: true });

const LessonProgress = mongoose.model("LessonProgress", lessonProgressSchema);
export default LessonProgress;
