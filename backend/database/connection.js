// @file backend/database/connection.js
import mongoose from "mongoose";
import { config } from "../config/index.js";

const databaseConnection = async () => {
  if (!config.mongoUri) {
    if (config.isProd) {
      console.error("❌ MONGODB_URI is required in production");
      process.exit(1);
    }
    console.warn("⚠️  MONGODB_URI not set — starting without a database (authenticated routes will fail)");
    return;
  }

  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10_000 });
    console.log("✅ Database connected");
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    if (config.isProd) process.exit(1);
  }
};

export default databaseConnection;
