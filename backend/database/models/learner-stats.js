// @file backend/database/models/learner-stats.js
// Aggregate learner stats surfaced by GET /learn/stats and the header on the Learn tab.
// One document per user. Recomputable in principle from LessonProgress, but kept
// denormalised for cheap reads on every path/screen load.
//
// Streak semantics (UTC-day based, matches how "today" is displayed in the app):
//   - lastActiveDate is the UTC-midnight of the last day the user submitted a lesson.
//   - Submitting again on the SAME UTC day: no streak change.
//   - Submitting on the NEXT UTC day: currentStreak += 1.
//   - Any gap > 1 day: currentStreak resets to 1.
// See LearnService.applyStreak for the implementation.
import mongoose from "mongoose";

export const DEFAULT_DAILY_GOAL_XP = 50;

const learnerStatsSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    xp: { type: Number, required: true, min: 0, default: 0 },
    currentStreak: { type: Number, required: true, min: 0, default: 0 },
    longestStreak: { type: Number, required: true, min: 0, default: 0 },
    lastActiveDate: { type: Date, default: null },

    // Today's rolling counters. `todayDate` is the UTC-midnight the counters belong to;
    // when it doesn't match today we reset `todayXp` before adding.
    todayDate: { type: Date, default: null },
    todayXp: { type: Number, required: true, min: 0, default: 0 },
    dailyGoalXp: { type: Number, required: true, min: 1, default: DEFAULT_DAILY_GOAL_XP },

    // Lifetime counters.
    lessonsDone: { type: Number, required: true, min: 0, default: 0 },
    totalAnswers: { type: Number, required: true, min: 0, default: 0 },
    correctAnswers: { type: Number, required: true, min: 0, default: 0 },
    badges: { type: Number, required: true, min: 0, default: 0 },
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

const LearnerStats = mongoose.model("LearnerStats", learnerStatsSchema);
export default LearnerStats;
