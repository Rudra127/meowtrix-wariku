// @file backend/api/user.js
import isAdmin from "../middlewares/isAdmin.js";
import protect from "../middlewares/protect.js";
import UserService from "../services/user-service.js";
import { sendSuccess } from "../utils/index.js";

const user = (app) => {
  const service = new UserService();

  // Update app-level profile fields (isOnboarded, currency). Identity fields live in Clerk.
  app.patch("/api/v1/users/me", protect, async (req, res) => {
    const updated = await service.updateMe(req.user.clerkId, req.body);
    sendSuccess(res, { user: updated });
  });

  // Permanently delete the account (Clerk + Mongo). Required by App Store / Play Store policies.
  app.delete("/api/v1/users/me", protect, async (req, res) => {
    await service.deleteMe(req.user.clerkId);
    sendSuccess(res, { deleted: true });
  });

  // Admin: paginated user list. Query: ?page=1&limit=20&search=alice
  app.get("/api/v1/admin/users", protect, isAdmin, async (req, res) => {
    sendSuccess(res, await service.list(req.query));
  });
};

export default user;
