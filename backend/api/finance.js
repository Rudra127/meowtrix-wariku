// @file backend/api/finance.js
// Money tab HTTP layer. Thin handlers: validate nothing here, delegate to FinanceService.
// Express 5 forwards rejected promises to the error handler, so handlers just `throw`.
import multer from "multer";
import { isSttConfigured } from "../config/index.js";
import { ALLOWED_AUDIO_TYPES, MAX_AUDIO_BYTES } from "../lib/transcribe.js";
import protect from "../middlewares/protect.js";
import { voiceLimiter } from "../middlewares/rate-limit.js";
import FinanceService from "../services/finance-service.js";
import VoiceService from "../services/voice-service.js";
import { sendSuccess, ValidationError } from "../utils/index.js";

/**
 * Audio upload for voice capture. Memory storage — clips are seconds long and we forward the bytes
 * straight to the speech-to-text provider without ever touching disk.
 * This is route-scoped on purpose: the global JSON parser stays at its 1 MB limit.
 */
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_BYTES, files: 1, fields: 4 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_AUDIO_TYPES.includes(file.mimetype?.toLowerCase())) return cb(null, true);
    cb(new ValidationError(`Unsupported audio format: ${file.mimetype}`));
  },
}).single("audio");

/** Wraps multer so its own errors become our envelope instead of a raw 500. */
const uploadAudio = (req, res, next) =>
  audioUpload(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") return next(new ValidationError("That recording is too long"));
    if (err.code === "LIMIT_UNEXPECTED_FILE") return next(new ValidationError("Send the clip as the `audio` field"));
    return next(err);
  });

const finance = (app) => {
  const service = new FinanceService();
  const voice = new VoiceService();

  // ---- Dashboard -------------------------------------------------------------------------

  // ?month=2026-09 (defaults to the current month in the user's timezone)
  app.get("/api/v1/finance/summary", protect, async (req, res) => {
    sendSuccess(res, await service.getSummary(req.user, req.query.month));
  });

  // ?period=week|month|year&month=2026-09 — expense series for the chart
  app.get("/api/v1/finance/series", protect, async (req, res) => {
    sendSuccess(res, await service.getSeries(req.user, req.query.period, req.query.month));
  });

  // ---- Transactions ----------------------------------------------------------------------

  // ?month|from|to|type|category|source|q|limit|skip
  app.get("/api/v1/finance/transactions", protect, async (req, res) => {
    sendSuccess(res, await service.listTransactions(req.user, req.query));
  });

  // Body: { type, amount (minor units), category, title?, note?, date?, accountId? }
  // Or:   { transactions: [ …same… ] } to add several at once (voice review, bulk entry).
  app.post("/api/v1/finance/transactions", protect, async (req, res) => {
    const rows = req.body?.transactions;
    if (Array.isArray(rows)) {
      const created = await service.createTransactions(req.user, rows, { source: req.body?.source ?? "manual" });
      return sendSuccess(res, { transactions: created, created: created.length }, 201);
    }
    const created = await service.createTransaction(req.user, req.body);
    return sendSuccess(res, { transaction: created }, 201);
  });

  app.patch("/api/v1/finance/transactions/:id", protect, async (req, res) => {
    sendSuccess(res, { transaction: await service.updateTransaction(req.user, req.params.id, req.body) });
  });

  app.delete("/api/v1/finance/transactions/:id", protect, async (req, res) => {
    await service.deleteTransaction(req.user, req.params.id);
    sendSuccess(res, { deleted: true });
  });

  // ---- Voice / natural-language capture ---------------------------------------------------
  //
  // Both routes RETURN DRAFTS — they never write. The app shows them for confirmation and then
  // POSTs to /finance/transactions with { transactions, source: "voice" }.

  // Tells the app whether to show the mic at all, and what the category pickers should offer.
  app.get("/api/v1/finance/voice/capabilities", protect, async (_req, res) => {
    sendSuccess(res, { speechToText: isSttConfigured(), categories: VoiceService.categoryOptions() });
  });

  // multipart/form-data: audio=<clip>, optional language=<ISO 639-1>
  app.post("/api/v1/finance/voice", protect, voiceLimiter, uploadAudio, async (req, res) => {
    if (!req.file?.buffer) throw new ValidationError("Attach the recording as the `audio` field");
    const result = await voice.captureFromAudio(req.user, req.file.buffer, {
      mimeType: req.file.mimetype,
      filename: req.file.originalname,
      language: req.body?.language,
    });
    sendSuccess(res, result);
  });

  // Body: { text } — the typed equivalent ("spent 250 on coffee, 1200 groceries").
  // Works even when speech-to-text isn't configured.
  app.post("/api/v1/finance/parse", protect, voiceLimiter, async (req, res) => {
    sendSuccess(res, await voice.captureFromText(req.user, req.body?.text));
  });

  // ---- Accounts --------------------------------------------------------------------------

  app.get("/api/v1/finance/accounts", protect, async (req, res) => {
    sendSuccess(res, { accounts: await service.listAccounts(req.user) });
  });

  // Body: { name, type?, openingBalance?, isDefault? }
  app.post("/api/v1/finance/accounts", protect, async (req, res) => {
    sendSuccess(res, { account: await service.createAccount(req.user, req.body) }, 201);
  });

  app.patch("/api/v1/finance/accounts/:id", protect, async (req, res) => {
    sendSuccess(res, { account: await service.updateAccount(req.user, req.params.id, req.body) });
  });

  // Archives (soft delete) — transactions keep pointing at it so history survives.
  app.delete("/api/v1/finance/accounts/:id", protect, async (req, res) => {
    await service.archiveAccount(req.user, req.params.id);
    sendSuccess(res, { archived: true });
  });

  // ---- Budgets ---------------------------------------------------------------------------

  // ?month=2026-09 → limits with spend-so-far merged in
  app.get("/api/v1/finance/budgets", protect, async (req, res) => {
    sendSuccess(res, await service.listBudgets(req.user, req.query.month));
  });

  // Body: { category, limit (minor units), month? } — creates or overwrites
  app.put("/api/v1/finance/budgets", protect, async (req, res) => {
    sendSuccess(res, { budget: await service.setBudget(req.user, req.body) });
  });

  // Body: { month? } — carries last month's limits forward without touching existing ones
  app.post("/api/v1/finance/budgets/copy-previous", protect, async (req, res) => {
    sendSuccess(res, await service.copyBudgetsFromPreviousMonth(req.user, req.body?.month));
  });

  app.delete("/api/v1/finance/budgets/:category", protect, async (req, res) => {
    await service.deleteBudget(req.user, req.params.category, req.query.month);
    sendSuccess(res, { deleted: true });
  });

  // ---- Goals -----------------------------------------------------------------------------

  app.get("/api/v1/finance/goals", protect, async (req, res) => {
    sendSuccess(res, await service.listGoals(req.user));
  });

  // Body: { name, targetAmount (minor units), savedAmount?, targetDate? }
  app.post("/api/v1/finance/goals", protect, async (req, res) => {
    sendSuccess(res, { goal: await service.createGoal(req.user, req.body) }, 201);
  });

  app.patch("/api/v1/finance/goals/:id", protect, async (req, res) => {
    sendSuccess(res, { goal: await service.updateGoal(req.user, req.params.id, req.body) });
  });

  // Body: { amount } — positive to add, negative to withdraw
  app.post("/api/v1/finance/goals/:id/contribute", protect, async (req, res) => {
    sendSuccess(res, { goal: await service.contributeToGoal(req.user, req.params.id, req.body?.amount) });
  });

  app.delete("/api/v1/finance/goals/:id", protect, async (req, res) => {
    await service.deleteGoal(req.user, req.params.id);
    sendSuccess(res, { deleted: true });
  });
};

export default finance;
