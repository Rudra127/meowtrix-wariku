// @file backend/utils/index.js
export * from "./app-errors.js";

/**
 * Sends the standard success envelope: { success: true, data }.
 * Express 5 forwards rejected promises from async handlers to the error handler,
 * so route handlers don't need try/catch — just `throw` an AppError.
 */
export const sendSuccess = (res, data, statusCode = 200) =>
  res.status(statusCode).json({ success: true, data });
