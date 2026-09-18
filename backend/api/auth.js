// @file backend/api/auth.js
import protect from "../middlewares/protect.js";
import UserService from "../services/user-service.js";
import { sendSuccess } from "../utils/index.js";

const auth = (app) => {
  const service = new UserService();

  // Called by the app right after sign-in. Verifies the Clerk session, creates the local user
  // on first login (lazy sync), and returns it. Doubles as "is my backend connection working?".
  app.get("/api/v1/auth/me", protect, async (req, res) => {
    sendSuccess(res, { user: req.user });
  });

  // Forces a re-pull of name/email/avatar/role from Clerk into Mongo.
  // Call after the user edits their Clerk profile if you don't run the webhook.
  app.post("/api/v1/auth/sync", protect, async (req, res) => {
    const user = await service.refreshFromClerk(req.user.clerkId);
    sendSuccess(res, { user });
  });
};

export default auth;
