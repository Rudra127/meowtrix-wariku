// @file backend/database/seed/seed-learn.js
// Idempotent seed for the Learn feature. Upserts by slug, so re-running just updates content.
// Run: `npm run seed:learn` (loads .env.dev via cross-env NODE_ENV=dev).
import "../../config/index.js"; // must load .env.<NODE_ENV> before anything else

import chalk from "chalk";
import mongoose from "mongoose";
import databaseConnection from "../connection.js";
import Lesson from "../models/lesson.js";
import Unit from "../models/unit.js";
import { LESSONS, UNITS } from "./learn-content.js";

const seed = async () => {
  await databaseConnection();
  if (mongoose.connection.readyState !== 1) {
    throw new Error("Not connected to MongoDB. Set MONGODB_URI in backend/.env.dev.");
  }

  // Units first — remember slug → _id so lessons can reference them.
  const unitIdBySlug = new Map();
  for (const u of UNITS) {
    const doc = await Unit.findOneAndUpdate(
      { slug: u.slug },
      { $set: u },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    unitIdBySlug.set(doc.slug, doc._id);
  }
  console.log(chalk.green(`✓ upserted ${UNITS.length} units`));

  // Lessons
  for (const lesson of LESSONS) {
    const { unitSlug, ...rest } = lesson;
    const unitId = unitIdBySlug.get(unitSlug);
    if (!unitId) throw new Error(`Lesson ${lesson.slug} references unknown unit ${unitSlug}`);
    await Lesson.findOneAndUpdate(
      { slug: lesson.slug },
      { $set: { ...rest, unitId } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
  }
  console.log(chalk.green(`✓ upserted ${LESSONS.length} lessons`));

  await mongoose.disconnect();
  console.log(chalk.greenBright("Done."));
};

seed().catch((err) => {
  console.error(chalk.red("Seed failed:"), err);
  process.exit(1);
});
