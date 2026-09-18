// @file backend/api/integrations.js
// Linking third-party brokerage accounts (Upstox, Zerodha) so the Ask AI tab can read holdings.
//
// Provider-agnostic: everything is driven by the `:provider` path param resolved against the
// brokerages registry (services/brokerages.js). Adding a broker needs no changes here.
//
// Holdings are intentionally NOT exposed as a screen-facing endpoint — the product decision is that
// portfolio data surfaces only through the Ask AI tab (services/ai-tools.js).
import { config } from "../config/index.js";
import protect from "../middlewares/protect.js";
import { brokerageFor, brokerageStatuses } from "../services/brokerages.js";
import { NotFoundError, sendSuccess } from "../utils/index.js";

/** Resolves `:provider` to a service or 404s — a bad provider id is not a valid resource. */
const resolve = (req) => {
  const service = brokerageFor(req.params.provider);
  if (!service) throw new NotFoundError(`Unknown provider: ${req.params.provider}`);
  return service;
};

const integrations = (app) => {
  // Everything the Profile screen needs to render its "Connected accounts" section (all providers).
  app.get("/api/v1/integrations", protect, async (req, res) => {
    sendSuccess(res, { integrations: await brokerageStatuses(req.user) });
  });

  app.get("/api/v1/integrations/:provider", protect, async (req, res) => {
    sendSuccess(res, await resolve(req).getStatus(req.user));
  });

  // The app opens this URL in a browser (expo-web-browser) to start broker sign-in.
  app.get("/api/v1/integrations/:provider/login-url", protect, async (req, res) => {
    sendSuccess(res, await resolve(req).getLoginUrl(req.user));
  });

  /**
   * The broker's browser redirect. PUBLIC by design: it arrives from the broker's servers with no
   * Clerk session attached. Authenticity comes from the HMAC-signed, 10-minute `state` we put in the
   * login URL — never from anything else in the query string.
   *
   * Always answers with a 302 into the app's deep link, success or failure, so the user is never
   * stranded on a JSON page in a browser tab. The full query is forwarded so each provider's client
   * can read whichever params it uses (Zerodha: request_token; Upstox: code).
   */
  app.get("/api/v1/integrations/:provider/callback", async (req, res) => {
    const service = brokerageFor(req.params.provider);
    if (!service) return res.redirect(302, `${config.appScheme}://broker-callback?status=link_expired`);
    const { redirect } = await service.handleCallback(req.query);
    res.redirect(302, redirect);
  });

  app.delete("/api/v1/integrations/:provider", protect, async (req, res) => {
    sendSuccess(res, await resolve(req).disconnect(req.user));
  });
};

export default integrations;
