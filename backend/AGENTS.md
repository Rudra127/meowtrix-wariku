# Backend — Agent Guide

Read the root [`AGENTS.md`](../AGENTS.md) first for product context and repo-wide conventions.

Node 20 · Express 5 · MongoDB/Mongoose 8 · `@clerk/express` · DeepSeek (OpenAI-compatible HTTP API).
ES modules (`"type": "module"`) — always use `import`, and include the `.js` extension in relative imports.

## Commands

```bash
npm run dev        # nodemon, loads .env.dev
npm run prod       # node, loads .env.prod
npm start          # same as dev (the VM's PM2 process uses this — see .github/workflows/cicd.yaml)
npm test           # node:test + supertest, fully offline
TEST_MONGODB_URI=mongodb://127.0.0.1:27017/wariku_test npm test   # + real-Mongo tests (each file uses its own DB via testMongoUri())
npm run lint
npm run seed:learn # upsert Learn content (units, lessons, exercises) from database/seed/learn-content.js
```

## Layout

```
backend/
├── index.js                  Entry: loads config FIRST, connects Mongo, mounts app, listens
├── express-app.js            Middleware order + route registration (read it top to bottom)
├── config/index.js           Loads .env.<NODE_ENV>; exports `config` — read env vars ONLY through this
├── api/                      HTTP layer — one file per feature, thin handlers
│   ├── auth.js               GET /auth/me, POST /auth/sync
│   ├── user.js               PATCH/DELETE /users/me, PUT /users/me/onboarding, GET /admin/users
│   ├── finance.js            /finance/* — transactions, budgets, goals, summary, series, voice
│   ├── integrations.js       /integrations/:provider/* — broker connect / status / callback (generic)
│   ├── ai.js                 POST /ai/chat
│   ├── learn.js              GET /learn/path, /learn/stats, /learn/lessons/:slug,
│   │                         POST check + submit + practice + practice/:id/submit
│   └── webhooks.js           POST /webhooks/clerk (raw body, Svix-verified)
├── services/                 Business logic; throws AppErrors; returns plain data
│   ├── user-service.js       Profile + onboarding; owns the account-deletion cascade (_cascadeDelete)
│   ├── finance-service.js    Accounts/transactions/budgets/goals + the monthly dashboard rollup
│   ├── voice-service.js      transcript → draft transactions (LLM JSON mode); drafts are NOT saved
│   ├── learn-service.js      Path + grading + XP/streak (pure helpers exported for tests)
│   ├── practice-service.js   AI practice generation + HARD validation of the model's JSON
│   ├── ai-service.js         Ask AI agent loop + level-aware system prompt (personalised by level/goal)
│   ├── ai-tools.js           Tool schemas + runner the AI calls to read the user's real data
│   ├── brokerage-service.js  Generic broker: connect flow, daily-token lifecycle, normalised holdings
│   └── brokerages.js         Registry (Upstox, Zerodha) + connectedBrokerage / brokerageContext helpers
├── lib/
│   ├── deepseek.js           DeepSeek client — chat, JSON mode, tool calling (only LLM caller)
│   ├── transcribe.js         Speech-to-text (OpenAI-compatible /audio/transcriptions)
│   ├── kite.js               Zerodha Kite Connect v3 — uniform broker-client interface
│   ├── upstox.js             Upstox API v2 (free) — same uniform broker-client interface
│   └── crypto.js             AES-256-GCM for tokens at rest + signed OAuth state (HMAC)
├── database/
│   ├── connection.js         Also honours DNS_SERVERS for networks that block SRV lookups
│   ├── models/               user (LEVELS/GOALS/timezone), account, transaction, budget, goal,
│   │                         integration, categories (canonical ids + normaliseCategory),
│   │                         and learn models (unit, lesson, lesson-progress, learner-stats,
│   │                         practice-session)
│   ├── repository/           ALL Mongoose queries live here (user, finance, integration, learn)
│   └── seed/                 learn-content.js (8 units / 33 lessons) + seed-learn.js runner
├── middlewares/
│   ├── protect.js            Requires a Clerk session → sets req.user (Mongo doc)
│   ├── isAdmin.js            After protect; requires req.user.role === "admin"
│   └── rate-limit.js         apiLimiter (per IP), aiLimiter + voiceLimiter (per user, expensive routes)
├── utils/
│   ├── app-errors.js         AppError + BadRequest/Validation/Unauthorized/Forbidden/NotFound/
│   │                         ReauthRequired (409)/Upstream/ServiceUnavailable
│   ├── error-handler.js      Global error middleware → { success:false, error:{ code, message } }
│   ├── dates.js              Timezone-aware month maths (Intl only) — the "which month?" source of truth
│   ├── index.js              Re-exports errors + sendSuccess(res, data, status?)
│   └── S3Config.js, stripe.js   Unused template utilities (kept for later: avatars, payments)
└── tests/                    *.test.js — helpers.js sets fake Clerk/STT/Zerodha keys + a JWT signing key
```

## Environment (`.env.example` is the reference)

| Var | Required | Notes |
|---|---|---|
| `PORT` | no | Default 5947. The mobile app assumes 5947 in dev. |
| `MONGODB_URI` | yes | Server still boots without it in dev (auth routes will fail). |
| `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | yes | Same Clerk app as the mobile key. Missing → `/api/*` returns 503 `SERVICE_UNAVAILABLE`. |
| `CLERK_WEBHOOK_SIGNING_SECRET` | prod | Enables `POST /api/v1/webhooks/clerk`. |
| `DEEPSEEK_API_KEY` | for AI | Missing → `/api/v1/ai/*` returns 503. |
| `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL` | no | Defaults `https://api.deepseek.com`, `deepseek-chat`. |
| `STT_API_KEY` | for voice | Missing → `POST /finance/voice` returns 503 and the app hides the mic. Typed `/finance/parse` still works. |
| `STT_BASE_URL`, `STT_MODEL` | no | OpenAI-compatible transcription endpoint. Defaults to Groq `whisper-large-v3-turbo`. |
| `UPSTOX_API_KEY`, `UPSTOX_API_SECRET`, `UPSTOX_REDIRECT_URL` | for holdings | **Free** broker. All three + `ENCRYPTION_KEY` to connect Upstox. Redirect URL must match the Upstox app exactly. |
| `ZERODHA_API_KEY`, `ZERODHA_API_SECRET`, `ZERODHA_REDIRECT_URL` | for holdings | **Paid** broker. All three + `ENCRYPTION_KEY` to connect Zerodha. Redirect URL must match the Kite app exactly. |
| `ENCRYPTION_KEY` | for holdings | 32 random bytes (hex). Encrypts broker tokens at rest. Rotating it invalidates every connection. |
| `APP_SCHEME` | no | Deep-link scheme the OAuth callback returns to. Default `wariku` (matches `mobile/app.json`). |
| `CLIENT_URLS` | prod web | Comma-separated browser origins for CORS. Native apps don't need it. |

> **Atlas note:** put the database name in the URI path (`…mongodb.net/wariku`), or Mongoose uses `test`.
> For the real-Mongo tests use a **separate** DB (`…/wariku_test`) — the suite drops it on teardown.

## Auth, precisely

1. `clerkMiddleware()` runs on every `/api` request. It reads `Authorization: Bearer <token>`, verifies the
   Clerk session JWT (signature via JWKS, expiry, not-before) and attaches auth state. It does **not**
   reject anonymous requests.
2. `protect` calls `getAuth(req)`; no `userId` → `401 UNAUTHORIZED`. Otherwise it loads the Mongo user by
   `clerkId`, creating it from Clerk's Backend API on first sight (`UserService.getOrCreateFromClerk`, atomic
   upsert — safe under concurrent first requests).
3. `req.user` is a **Mongoose document**: use `req.user._id` for foreign keys, `req.user.clerkId` for Clerk
   calls.
4. Roles: set `{ "role": "admin" }` in the user's **public metadata** in the Clerk Dashboard. It's copied to
   Mongo on first login and by the `user.updated` webhook (or call `POST /api/v1/auth/sync`).

## Endpoints

All under `/api/v1`. All return the standard envelope.

| Method | Path | Auth | Body / query | Returns `data` |
|---|---|---|---|---|
| GET | `/health` (no prefix) | — | — | `{ status, timestamp }` |
| GET | `/auth/me` | protect | — | `{ user }` — creates the user on first call |
| POST | `/auth/sync` | protect | — | `{ user }` — re-pulls profile from Clerk |
| PATCH | `/users/me` | protect | `{ isOnboarded?, currency?, level?, goal?, timezone? }` | `{ user }` — other fields ignored |
| PUT | `/users/me/onboarding` | protect | `{ level, goal, currency?, timezone? }` | `{ user }` — sets `isOnboarded`, `onboardedAt` |
| DELETE | `/users/me` | protect | — | `{ deleted: true }` — deletes in Clerk **and** Mongo |
| GET | `/admin/users` | protect + isAdmin | `?page&limit&search` | `{ items, total, page, limit, totalPages }` |
| POST | `/ai/chat` | protect + aiLimiter | `{ messages: [...] }` (≤40, last = user, ≤4000 chars each) | `{ message, model, usage, toolsUsed }` — runs a tool-calling loop |
| GET | `/learn/path` | protect | — | `{ units: [{ id, index, title, description, icon, lessons: [{ id, title, summary, xp, minutes, icon, status }] }], stats }` — units are reordered so the goal-recommended unit comes first; `status` is `"done"\|"current"\|"locked"` |
| GET | `/learn/stats` | protect | — | `{ stats: { streakDays, longestStreak, xp, dailyGoalXp, todayXp, lessonsDone, accuracy, badges } }` |
| GET | `/learn/lessons/:slug` | protect | — | `{ lesson: { id, unitId, unitTitle, title, summary, xp, minutes, icon, exercises: [{ type, prompt, options? }] }, progress\|null, status }` — **answers/explanations stripped**; locked lessons → 403 |
| POST | `/learn/lessons/:slug/check` | protect | `{ index, answer }` | `{ index, isCorrect, correctAnswer, explanation }` — instant feedback for one question in the player; **stores nothing** (XP/progress only change on submit, which re-grades every answer) |
| POST | `/learn/lessons/:slug/submit` | protect | `{ answers: unknown[] }` (one per exercise, in order) | `{ score, correct, total, passed, xpEarned, totalXpForLesson, results: [{ index, isCorrect, correctAnswer, explanation }], stats }` — graded server-side; `xpEarned` is the delta added this submit (retries only earn improvement) |
| POST | `/learn/lessons/:slug/practice` | protect + aiLimiter | `{ count?: 1-5 }` (default 4) | `{ sessionId, lesson: { id, title }, exercises: [{ type, prompt, options? }], model }` — DeepSeek generates fresh questions on the lesson's topic; **answers stay server-side** on the session. Locked lessons → 403, no key → 503 |
| POST | `/learn/practice/:sessionId/check` | protect | `{ index, answer }` | `{ index, isCorrect, correctAnswer, explanation }` — instant feedback inside a practice round; **stores nothing** (same contract as the lesson `check` route) |
| POST | `/learn/practice/:sessionId/submit` | protect | `{ answers: unknown[] }` (one per generated exercise) | `{ score, correct, total, passed, xpEarned, results, stats }` — **single-use**; awards 2 XP per correct answer and keeps the streak alive, but never completes a lesson or unlocks the next one |
| POST | `/webhooks/clerk` | Svix signature | Clerk event | `{ received }` |

**Money** — all `protect`, all filtered by `req.user._id`. Amounts are **integer minor units**.

| Method | Path | Body / query | Returns `data` |
|---|---|---|---|
| GET | `/finance/summary` | `?month=2026-09` | Full monthly dashboard: balance, totals, per-category, budgets, goals, `changePct` |
| GET | `/finance/series` | `?period=week\|month\|year&month=` | `{ period, points:[{label,key,value}], total }` — expense chart |
| GET | `/finance/transactions` | `?month\|from\|to\|type\|category\|source\|q\|limit\|skip` | `{ items, total, limit, skip, currency }` |
| POST | `/finance/transactions` | one tx, **or** `{ transactions:[…], source }` | `{ transaction }` or `{ transactions, created }` (201) |
| PATCH/DELETE | `/finance/transactions/:id` | — | `{ transaction }` / `{ deleted }` |
| GET/POST | `/finance/accounts` | `{ name, type?, openingBalance? }` | `{ accounts }` / `{ account }` |
| PATCH/DELETE | `/finance/accounts/:id` | — | `{ account }` / `{ archived }` (soft delete) |
| GET | `/finance/budgets` | `?month=` | `{ month, budgets:[{category,limit,spent,remaining,ratio,overspent}] }` |
| PUT | `/finance/budgets` | `{ category, limit, month? }` | `{ budget }` — creates or overwrites |
| POST | `/finance/budgets/copy-previous` | `{ month? }` | `{ month, budgets }` |
| DELETE | `/finance/budgets/:category` | `?month=` | `{ deleted }` |
| GET/POST | `/finance/goals` | `{ name, targetAmount, savedAmount?, targetDate? }` | `{ goals }` / `{ goal }` |
| PATCH/DELETE | `/finance/goals/:id` | — | `{ goal }` / `{ deleted }` |
| POST | `/finance/goals/:id/contribute` | `{ amount }` (+/−) | `{ goal }` |

**Voice capture** — `protect` + `voiceLimiter`. These **return drafts and write nothing**; the app confirms
them, then POSTs to `/finance/transactions` with `source:"voice"`.

| Method | Path | Body / query | Returns `data` |
|---|---|---|---|
| GET | `/finance/voice/capabilities` | — | `{ speechToText: boolean, categories:{expense,income} }` |
| POST | `/finance/voice` | multipart: `audio` (clip), `language?` | `{ transcript, drafts, unclear, message }` |
| POST | `/finance/parse` | `{ text }` | same shape — the typed fallback |

**Linked accounts** — provider-generic (`:provider` ∈ `upstox`, `zerodha`; see `services/brokerages.js`).

| Method | Path | Auth | Returns `data` |
|---|---|---|---|
| GET | `/integrations` | protect | `{ integrations: [status, …] }` — one per supported broker |
| GET | `/integrations/:provider` | protect | `{ connected, needsReauth, brokerUserName, … }` (never the token) |
| GET | `/integrations/:provider/login-url` | protect | `{ url, expiresInSeconds, redirectUrl }` |
| GET | `/integrations/:provider/callback` | **public** (signed `state`) | 302 → `wariku://broker-callback?provider=…&status=…` |
| DELETE | `/integrations/:provider` | protect | `{ disconnected: true }` |

Adding a broker = write `lib/<broker>.js` against the uniform client interface, then add one line to
`services/brokerages.js`. Nothing else changes. Holdings are intentionally **not** an HTTP endpoint —
they're reachable only through the AI tools (`ai-tools.js`), matching the decision to surface them only in
Ask AI.

Error codes in use: `UNAUTHORIZED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `VALIDATION_ERROR` /
`BAD_REQUEST` / `DUPLICATE` 400, `PAYLOAD_TOO_LARGE` 413, `REAUTH_REQUIRED` 409 (broker session expired),
`RATE_LIMITED` 429, `INTERNAL_ERROR` 500, `UPSTREAM_ERROR` 502, `SERVICE_UNAVAILABLE` 503,
`BAD_SIGNATURE` 400 (webhook).

## AI-generated practice (`services/practice-service.js`)

**Model output is untrusted input.** Everything DeepSeek returns goes through
`parseGeneratedExercises`, which validates each candidate against the exact exercise contract in
`models/lesson.js` and **discards** anything that doesn't fit — wrong type, answer index out of
range, duplicate options, an `order_steps` answer that isn't a permutation, and so on. If nothing
survives, the route fails with `UPSTREAM_ERROR` rather than serving a broken question. When you
add an exercise type, update the validator and `EXERCISE_TYPES` together or generated questions
of that type will be silently dropped.

Two more things worth knowing:

- **Answers never reach the client.** A generated round is persisted as a `PracticeSession` with
  the answers attached, and the client only gets `sessionId` + answer-stripped exercises. Grading
  reuses the same `gradeLesson` path as authored lessons. Sessions are single-use and a TTL index
  drops them ~24h after creation, so the collection self-cleans.
- **Practice can't replace lessons.** It updates streak, `todayXp` and accuracy, but never
  `lessonsDone` or `LessonProgress` — so no amount of practice unlocks the next lesson, and the
  XP rate (2/correct) stays below doing the real thing.

`buildPracticePrompt` asks for `count + 2` questions so validation drop-outs don't leave the round
short, and uses DeepSeek's JSON mode (`jsonMode: true` in `lib/deepseek.js`). JSON mode requires
the word "JSON" in the prompt — a test asserts that, so don't remove it.

## Adding a feature (e.g. `learn`)

1. **Model** — `database/models/lesson-progress.js`. Include `userId: { type: ObjectId, ref: "User", index: true }`.
2. **Repository** — `database/repository/learn-repository.js`. Every query that touches user data filters by `userId`.
3. **Service** — `services/learn-service.js`. Validate input, throw `ValidationError`/`NotFoundError`, return plain data.
   Accept dependencies via the constructor (like `AIService`) so tests can inject fakes.
4. **Routes** — `api/learn.js`:
   ```js
   import protect from "../middlewares/protect.js";
   import LearnService from "../services/learn-service.js";
   import { sendSuccess } from "../utils/index.js";

   const learn = (app) => {
     const service = new LearnService();
     app.get("/api/v1/learn/path", protect, async (req, res) => {
       sendSuccess(res, await service.getPath(req.user._id));
     });
   };
   export default learn;
   ```
   Express 5 forwards rejected promises to the error handler — **no try/catch needed**; just `throw`.
5. **Register** in `express-app.js` next to `auth(app); user(app); finance(app); integrations(app); ai(app);`
   (before the 404 handler).
6. **Test** in `tests/learn.test.js` (unit-test the service with a fake repository; add HTTP 401 checks).
7. **Document** the endpoints in the table above and add typed calls in `mobile/src/api/endpoints.ts`.
8. If users own data in the new collection, add its repository to `UserService.#purgeUserData` so the
   account-deletion cascade removes it (covered by the deletion test in `tests/integration.test.js`).

## Gotchas

- `config/index.js` must be the first import in `index.js`; `@clerk/express` reads `CLERK_*` from `process.env`.
- `/api/v1/webhooks/clerk` is registered **before** `express.json()` because Svix verification needs the raw body.
- JSON body limit is 1 MB. Add a route-specific parser if you need file uploads (see `utils/multer.js`).
- `backend/.gitignore` ignores lockfiles (`package-lock.json`) — that's the template's choice; CI uses `npm install`.
- `winston` writes `error.log` only in production.
- **Voice/AI money flow:** amounts cross the AI/voice boundary in **major** units (rupees) because the model
  reasons in rupees; `ai-tools.js` (`toMajor`/`fromMajor`) and `voice-service.js` convert to/from minor units
  once, at the edge. Everything stored stays minor units.
- **Never blind-save AI-parsed transactions.** Voice/parse endpoints return drafts for the user to confirm;
  only `record_transaction` (an explicit chat request) and confirmed drafts write.
- The broker callback is **public** — it authenticates via the HMAC-signed `state` in the login URL, since
  the browser redirect carries no Clerk session. Broker access tokens expire daily (Kite ~06:00 IST, Upstox
  ~03:30 IST) → `REAUTH_REQUIRED`; the app shows a "Reconnect" state.
- Node `--test` on Windows: use `npm test` (globs `tests/*.test.js`); a bare `node --test tests/` fails there.
- Tests are offline — inject `fetchImpl`/fake repositories (see `tests/ai.test.js`, `tests/integrations.test.js`).
