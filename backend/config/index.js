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

  // Speech-to-text for voice transaction entry. Any OpenAI-compatible
  // `POST {baseUrl}/audio/transcriptions` provider (OpenAI, Groq, self-hosted Whisper).
  stt: {
    apiKey: process.env.STT_API_KEY,
    baseUrl: process.env.STT_BASE_URL || "https://api.groq.com/openai/v1",
    model: process.env.STT_MODEL || "whisper-large-v3-turbo",
  },

  // Brokerages — read-only holdings/positions, surfaced only through the AI assistant.
  // Both are OAuth-style with daily-expiring access tokens (see lib/kite.js, lib/upstox.js).
  zerodha: {
    apiKey: process.env.ZERODHA_API_KEY,
    apiSecret: process.env.ZERODHA_API_SECRET,
    // Must match the redirect URL registered on the Kite Connect app, character for character.
    redirectUrl: process.env.ZERODHA_REDIRECT_URL,
  },
  // Upstox API v2 — FREE (no monthly fee), standard OAuth 2.0. The recommended zero-cost option.
  upstox: {
    apiKey: process.env.UPSTOX_API_KEY,
    apiSecret: process.env.UPSTOX_API_SECRET,
    // Must match the redirect URL registered on the Upstox app exactly.
    redirectUrl: process.env.UPSTOX_REDIRECT_URL,
  },

  // Encrypts third-party access tokens at rest (lib/crypto.js). 32 random bytes, hex encoded.
  encryptionKey: process.env.ENCRYPTION_KEY,

  // Deep link scheme used to bounce browser OAuth callbacks back into the app.
  appScheme: process.env.APP_SCHEME || "wariku",

  // Browser origins allowed by CORS. Native apps send no Origin header and are always allowed.
  clientUrls: list(process.env.CLIENT_URLS),
};

/** Storing any broker token needs the encryption key, plus that broker's own credentials. */
export const isZerodhaConfigured = () =>
  Boolean(config.zerodha.apiKey && config.zerodha.apiSecret && config.zerodha.redirectUrl && config.encryptionKey);

export const isUpstoxConfigured = () =>
  Boolean(config.upstox.apiKey && config.upstox.apiSecret && config.upstox.redirectUrl && config.encryptionKey);

/** True when at least one brokerage is usable. */
export const isAnyBrokerConfigured = () => isZerodhaConfigured() || isUpstoxConfigured();

/** True when voice transcription is available. */
export const isSttConfigured = () => Boolean(config.stt.apiKey);

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
  if (!isSttConfigured()) {
    console.warn("⚠️  STT_API_KEY is not set — voice capture is disabled (typed quick-add still works)");
  }
  if (!isAnyBrokerConfigured()) {
    console.warn(
      "⚠️  No brokerage configured — set UPSTOX_* (free) or ZERODHA_* + ENCRYPTION_KEY to enable holdings in Ask AI"
    );
  }
  return missing.map(([name]) => name);
};
