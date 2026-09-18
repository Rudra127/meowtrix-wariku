// @file backend/config/index.js
// Loads `.env.<NODE_ENV>` (e.g. `.env.dev`, `.env.prod`) and exposes a single typed-ish config object.
// Import this module FIRST (index.js does) so every other module sees the populated process.env.
import dotEnv from "dotenv";

dotEnv.config({ path: `./.env.${process.env.NODE_ENV}`, quiet: true });

const list = (value) =>
  (value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

export const config = {
  env: process.env.NODE_ENV || "dev",
  isProd: process.env.NODE_ENV === "prod" || process.env.NODE_ENV === "production",
  port: Number(process.env.PORT) || 5947,
  mongoUri: process.env.MONGODB_URI,

  clerk: {
    // Read directly from process.env by @clerk/express as well — the names must stay exactly these.
    secretKey: process.env.CLERK_SECRET_KEY,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    webhookSecret: process.env.CLERK_WEBHOOK_SIGNING_SECRET,
  },

  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
  },

  // Browser origins allowed by CORS. Native apps send no Origin header and are always allowed.
  clientUrls: list(process.env.CLIENT_URLS),
};

/** Logs which required settings are missing. Never throws, so /health still works while configuring. */
export const reportMissingConfig = () => {
  const missing = [
    ["MONGODB_URI", config.mongoUri],
    ["CLERK_SECRET_KEY", config.clerk.secretKey],
    ["CLERK_PUBLISHABLE_KEY", config.clerk.publishableKey],
  ].filter(([, value]) => !value);

  for (const [name] of missing) {
    console.warn(`⚠️  ${name} is not set — see backend/.env.example`);
  }
  if (!config.deepseek.apiKey) {
    console.warn("⚠️  DEEPSEEK_API_KEY is not set — /api/v1/ai/* will return 503");
  }
  return missing.map(([name]) => name);
};
