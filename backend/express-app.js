// @file backend/express-app.js
// Middleware order matters — read top to bottom.
import { clerkMiddleware } from "@clerk/express";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import ai from "./api/ai.js";
import auth from "./api/auth.js";
import learn from "./api/learn.js";
import user from "./api/user.js";
import webhooks from "./api/webhooks.js";
import { config } from "./config/index.js";
import { apiLimiter } from "./middlewares/rate-limit.js";
import { NotFoundError, ServiceUnavailableError } from "./utils/index.js";
import HandleErrors from "./utils/error-handler.js";

const isLocalOrigin = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

const expressApp = async (app) => {
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // behind nginx/load balancer in prod → correct client IP for rate limiting

  if (!config.isProd && config.env !== "test") app.use(morgan("dev"));

  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

  // CORS only matters for browsers (Expo web, future admin site). Native apps send no Origin.
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || config.clientUrls.includes(origin) || (!config.isProd && isLocalOrigin(origin))) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );

  // Webhooks need the raw body → registered before express.json().
  webhooks(app);

  app.use(express.json({ limit: "1mb" }));

  // Public routes
  app.get("/", (_req, res) => {
    res.json({ success: true, data: { name: "wariku-api", version: "1.0.0" } });
  });
  app.get("/health", (_req, res) => {
    res.json({ success: true, data: { status: "healthy", timestamp: new Date().toISOString() } });
  });

  // Everything under /api/v1 is rate limited and gets Clerk auth state attached.
  app.use("/api", apiLimiter);
  if (config.clerk.secretKey && config.clerk.publishableKey) {
    // Parses `Authorization: Bearer <token>` and verifies it. Does NOT reject signed-out requests;
    // routes opt in with the `protect` middleware.
    app.use("/api", clerkMiddleware());
  } else {
    app.use("/api", () => {
      throw new ServiceUnavailableError("Auth is not configured (set CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY)");
    });
  }

  // Feature routes — add new modules here (see backend/AGENTS.md → "Adding a feature").
  auth(app);
  user(app);
  ai(app);
  learn(app);

  app.use((req) => {
    throw new NotFoundError(`Route not found: ${req.method} ${req.path}`);
  });

  app.use(HandleErrors); // must be last
};

export default expressApp;
