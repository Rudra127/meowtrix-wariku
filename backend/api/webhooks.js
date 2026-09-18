// @file backend/api/webhooks.js
// Clerk → backend user sync. Optional in development (protect.js lazily creates users),
// recommended in production so name/email/role changes and deletions propagate.
// Setup: Clerk Dashboard → Webhooks → Add endpoint → https://<backend>/api/v1/webhooks/clerk
//        events: user.created, user.updated, user.deleted → copy Signing Secret into
//        CLERK_WEBHOOK_SIGNING_SECRET.
import express from "express";
import { verifyWebhook } from "@clerk/express/webhooks";
import UserService from "../services/user-service.js";

const webhooks = (app) => {
  const service = new UserService();

  // Signature verification needs the exact raw bytes, so this route must be registered
  // BEFORE the global express.json() middleware (see express-app.js).
  app.post("/api/v1/webhooks/clerk", express.raw({ type: "application/json" }), async (req, res) => {
    let event;
    try {
      event = await verifyWebhook(req);
    } catch (err) {
      console.warn("[webhooks/clerk] verification failed:", err.message);
      return res.status(400).json({ success: false, error: { code: "BAD_SIGNATURE", message: "Invalid webhook" } });
    }

    switch (event.type) {
      case "user.created":
      case "user.updated":
        await service.handleClerkUserUpserted(event.data);
        break;
      case "user.deleted":
        await service.handleClerkUserDeleted(event.data);
        break;
      default:
        break; // Unsubscribed/unknown events are acknowledged so Clerk doesn't retry them.
    }
    return res.status(200).json({ success: true, data: { received: event.type } });
  });
};

export default webhooks;
