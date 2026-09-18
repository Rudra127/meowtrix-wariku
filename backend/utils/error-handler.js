// @file backend/utils/error-handler.js
// Global Express error middleware — must be registered last. Every error response looks like:
//   { success: false, error: { code, message, details?, stack? } }   (stack only outside production)
import winston from "winston";
import { config } from "../config/index.js";
import { AppError, STATUS_CODES } from "./app-errors.js";

const logger = winston.createLogger({
  level: "error",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.Console({ silent: config.env === "test" }),
    ...(config.isProd ? [new winston.transports.File({ filename: "error.log" })] : []),
  ],
});

/** Converts known library errors (Mongoose, body-parser, ...) into AppErrors. */
const normalize = (err) => {
  if (err instanceof AppError) return err;

  if (err?.name === "ValidationError" && err.errors) {
    const details = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message]));
    return new AppError("Validation failed", STATUS_CODES.BAD_REQUEST, "VALIDATION_ERROR", details);
  }
  if (err?.name === "CastError") {
    return new AppError(`Invalid ${err.path}`, STATUS_CODES.BAD_REQUEST, "BAD_REQUEST");
  }
  if (err?.code === 11000) {
    return new AppError("Duplicate value", STATUS_CODES.BAD_REQUEST, "DUPLICATE", err.keyValue);
  }
  // Malformed JSON / oversized body from express.json()
  if (err?.type === "entity.parse.failed") {
    return new AppError("Malformed JSON body", STATUS_CODES.BAD_REQUEST, "BAD_REQUEST");
  }
  if (err?.type === "entity.too.large") {
    return new AppError("Request body too large", 413, "PAYLOAD_TOO_LARGE");
  }

  const unknown = new AppError("Something went wrong", STATUS_CODES.INTERNAL_ERROR, "INTERNAL_ERROR");
  unknown.isOperational = false;
  unknown.cause = err;
  return unknown;
};

// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by its 4 params.
const errorHandler = (err, req, res, _next) => {
  const error = normalize(err);

  if (!error.isOperational || error.statusCode >= 500) {
    logger.error(err?.message ?? String(err), {
      method: req.method,
      path: req.originalUrl,
      stack: err?.stack,
    });
  }

  const body = { success: false, error: { code: error.code, message: error.message } };
  if (error.details !== undefined) body.error.details = error.details;
  if (!config.isProd && !error.isOperational) body.error.stack = err?.stack;

  res.status(error.statusCode).json(body);
};

export default errorHandler;
