// @file backend/middlewares/isAdmin.js
// Must run AFTER `protect`. Usage: app.get("/api/v1/admin/thing", protect, isAdmin, handler)
// Make someone an admin: Clerk Dashboard → Users → <user> → Metadata → Public → { "role": "admin" }.
// The role is copied into Mongo on first login and on every `user.updated` webhook.
import { ForbiddenError, UnauthorizedError } from "../utils/index.js";

const isAdmin = (req, _res, next) => {
  if (!req.user) throw new UnauthorizedError();
  if (req.user.role !== "admin") throw new ForbiddenError();
  next();
};

export default isAdmin;
