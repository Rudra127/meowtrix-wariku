// @file backend/utils/app-errors.js
// Throw these from services/middleware. The global error handler turns them into:
//   { success: false, error: { code, message, details? } }  with the matching HTTP status.

export const STATUS_CODES = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
};

export class AppError extends Error {
  /**
   * @param {string} message   Safe to show to the client.
   * @param {number} statusCode
   * @param {string} code      Stable, machine-readable (SCREAMING_SNAKE). Clients switch on this.
   * @param {unknown} [details] Optional extra info (e.g. field errors). Sent to the client.
   */
  constructor(message, statusCode = STATUS_CODES.INTERNAL_ERROR, code = "INTERNAL_ERROR", details) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true; // expected error → message is safe to expose
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request", details) {
    super(message, STATUS_CODES.BAD_REQUEST, "BAD_REQUEST", details);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", details) {
    super(message, STATUS_CODES.BAD_REQUEST, "VALIDATION_ERROR", details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, STATUS_CODES.UNAUTHORIZED, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this resource") {
    super(message, STATUS_CODES.FORBIDDEN, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, STATUS_CODES.NOT_FOUND, "NOT_FOUND");
  }
}

export class UpstreamError extends AppError {
  constructor(message = "An upstream service failed", details) {
    super(message, STATUS_CODES.BAD_GATEWAY, "UPSTREAM_ERROR", details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "Service unavailable") {
    super(message, STATUS_CODES.SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE");
  }
}
