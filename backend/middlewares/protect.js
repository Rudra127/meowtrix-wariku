// @file backend/middlewares/protect.js
// Requires a valid Clerk session. Usage: app.get("/api/v1/thing", protect, handler)
//
// The client sends `Authorization: Bearer <Clerk session token>` (from `getToken()` in the app).
// `clerkMiddleware()` (registered globally in express-app.js) verifies the token's signature and
// expiry; here we reject signed-out requests and attach the local Mongo user as `req.user`.
import { getAuth } from "@clerk/express";
import UserService from "../services/user-service.js";
import { UnauthorizedError } from "../utils/index.js";

const userService = new UserService();

const protect = async (req, _res, next) => {
  const { isAuthenticated, userId } = getAuth(req);
  if (!isAuthenticated || !userId) throw new UnauthorizedError();

  // Mongoose document for the current user. `req.user.clerkId` is the Clerk ID,
  // `req.user._id` is what other collections should reference.
  req.user = await userService.getOrCreateFromClerk(userId);
  next();
};

export default protect;
