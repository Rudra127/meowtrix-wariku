// @file backend/api/integrations.js
// Linking third-party brokerage accounts (Upstox, Zerodha) so the Ask AI tab can read holdings.
//
// Provider-agnostic: everything is driven by the `:provider` path param resolved against the
// brokerages registry (services/brokerages.js). Adding a broker needs no changes here.
//
// Holdings are intentionally NOT exposed as a screen-facing endpoint — the product decision is that
// portfolio data surfaces only through the Ask AI tab (services/ai-tools.js).
import { canSeeGrowwPortfolio, config } from "../config/index.js";
import protect from "../middlewares/protect.js";
import { brokerageFor, brokerageStatuses } from "../services/brokerages.js";
import { growwService } from "../services/groww-service.js";
import { ForbiddenError, NotFoundError, ServiceUnavailableError, sendSuccess } from "../utils/index.js";

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

  /**
   * Groww sits outside the `:provider` registry on purpose. The registry is for per-user OAuth
   * connections; Groww has no OAuth, so it is one server-wide account with nothing to connect or
   * disconnect. This route only reports whether it is readable by THIS user.
   *
   * Registered before `/:provider` so "groww" never falls through to the registry and 404s.
   */
  app.get("/api/v1/integrations/groww/status", protect, async (req, res) => {
    const available = canSeeGrowwPortfolio(req.user) && growwService.isConfigured();
    sendSuccess(res, {
      provider: "groww",
      label: "Groww",
      configured: growwService.isConfigured(),
      available,
      // A shared portfolio must be labelled as such wherever it is shown, not just in the chat.
      shared: available && !config.groww.ownerEmail,
      coverage: "equity",
      note: "Groww has no OAuth, so this is a single account configured on the server, not a per-user connection.",
    });
  });

  /**
   * The Groww portfolio itself. Unlike the OAuth brokers, whose holdings surface only through Ask AI,
   * this is readable directly so the check script and any future screen share one code path.
   */
  app.get("/api/v1/integrations/groww/portfolio", protect, async (req, res) => {
    if (!growwService.isConfigured()) {
      throw new ServiceUnavailableError("Groww isn't set up on this server yet");
    }
    if (!canSeeGrowwPortfolio(req.user)) {
      throw new ForbiddenError("This Groww portfolio belongs to another account.");
    }
    const portfolio = await growwService.getPortfolio({ refresh: req.query.refresh === "true" });
    sendSuccess(res, { ...portfolio, shared: !config.groww.ownerEmail });
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
