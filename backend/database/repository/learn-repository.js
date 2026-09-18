// @file backend/database/repository/learn-repository.js
// All Mongoose queries for the Learn feature live here. Services call this;
// routes never touch models directly. Every user-scoped query filters by `userId`
// so a route can never see another user's data by accident.
import LearnerStats from "../models/learner-stats.js";
import Lesson from "../models/lesson.js";
import LessonProgress from "../models/lesson-progress.js";
import Unit from "../models/unit.js";

export default class LearnRepository {
  // ---- Content (shared across users) ---------------------------------------------------

  /** Published units in path order. */
  async listUnits() {
    return Unit.find({ isPublished: true }).sort({ order: 1 }).lean();
  }

  /** Every lesson, sorted by (unitId, order). Used to build the whole path in one round-trip. */
  async listLessons() {
    return Lesson.find({}).sort({ unitId: 1, order: 1 }).lean();
  }

  /** Lookup by public slug. Returns the full document (answers included) — service strips them. */
  async findLessonBySlug(slug) {
    return Lesson.findOne({ slug }).lean();
  }

  // ---- Per-user progress ---------------------------------------------------------------

  /** All lesson progress rows for one user. */
  async listProgressForUser(userId) {
    return LessonProgress.find({ userId }).lean();
  }

  async findProgress(userId, lessonId) {
    return LessonProgress.findOne({ userId, lessonId }).lean();
  }

  /**
   * Upserts a single lesson's progress. `updates` is the full desired state for the
   * mutable fields; we don't try to be atomic across attempts because the service reads
   * the row first, computes new values, then writes — a lost update just costs the user
   * a stat bump on a rare simultaneous double-submit, which is acceptable.
   */
  async upsertProgress(userId, lessonId, updates) {
    try {
      return await LessonProgress.findOneAndUpdate(
        { userId, lessonId },
        { $set: updates, $setOnInsert: { userId, lessonId } },
        { upsert: true, new: true, runValidators: true }
      );
    } catch (err) {
      if (err?.code === 11000) return LessonProgress.findOne({ userId, lessonId });
      throw err;
    }
  }

  async deleteAllProgressForUser(userId) {
    const result = await LessonProgress.deleteMany({ userId });
    return result.deletedCount ?? 0;
  }

  // ---- Per-user stats ------------------------------------------------------------------

  async findStats(userId) {
    return LearnerStats.findOne({ userId });
  }

  /** Returns a Mongoose document (mutable) so the service can `.save()` after edits. */
  async getOrCreateStats(userId) {
    try {
      return await LearnerStats.findOneAndUpdate(
        { userId },
        { $setOnInsert: { userId } },
        { upsert: true, new: true, runValidators: true }
      );
    } catch (err) {
      if (err?.code === 11000) return LearnerStats.findOne({ userId });
      throw err;
    }
  }

  async deleteStatsForUser(userId) {
    const result = await LearnerStats.deleteOne({ userId });
    return result.deletedCount ?? 0;
  }
}
