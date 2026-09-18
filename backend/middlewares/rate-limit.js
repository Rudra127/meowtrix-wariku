// @file backend/middlewares/rate-limit.js
import { rateLimit } from "express-rate-limit";
import { STATUS_CODES } from "../utils/index.js";

const limitHandler = (_req, res) =>
  res.status(STATUS_CODES.TOO_MANY_REQUESTS).json({
    success: false,
    error: { code: "RATE_LIMITED", message: "Too many requests, please slow down." },
  });

/** Broad per-IP limit for the whole API. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: limitHandler,
});

/** Per-user limit for expensive LLM calls. Must run after `protect` (keys on req.user). */
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => `ai:${req.user.clerkId}`,
  handler: limitHandler,
});
