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
TEST_MONGODB_URI=mongodb://127.0.0.1:27017/wariku_test npm test   # + real-Mongo auth flow tests
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
│   ├── user.js               PATCH/DELETE /users/me, GET /admin/users
│   ├── ai.js                 POST /ai/chat
│   ├── learn.js              GET /learn/path, /learn/stats, /learn/lessons/:slug, POST submit
│   └── webhooks.js           POST /webhooks/clerk (raw body, Svix-verified)
├── services/                 Business logic; throws AppErrors; returns plain data
│   ├── user-service.js       Onboarding + cascade delete (fans out to feature deleteAllForUser)
│   ├── ai-service.js         System prompt (personalised by level/goal) + message validation
│   └── learn-service.js      Path + grading + XP/streak (pure helpers exported for tests)
├── lib/deepseek.js           DeepSeek client (the only file that talks to the LLM provider)
├── database/
│   ├── connection.js
│   ├── models/               user.js (exports LEVELS/GOALS) + learn models (unit, lesson,
│   │                         lesson-progress, learner-stats)
│   ├── repository/           ALL Mongoose queries live here (user-repository, learn-repository)
│   └── seed/                 learn-content.js (units + lessons) + seed-learn.js runner
├── middlewares/
│   ├── protect.js            Requires a Clerk session → sets req.user (Mongo doc)
│   ├── isAdmin.js            After protect; requires req.user.role === "admin"
│   └── rate-limit.js         apiLimiter (per IP, all /api) and aiLimiter (per user, LLM routes)
├── utils/
│   ├── app-errors.js         AppError + BadRequest/Validation/Unauthorized/Forbidden/NotFound/Upstream/ServiceUnavailable
│   ├── error-handler.js      Global error middleware → { success:false, error:{ code, message } }
│   ├── index.js              Re-exports errors + sendSuccess(res, data, status?)
│   └── S3Config.js, multer.js, stripe.js   Unused template utilities (kept for later: avatars, payments)
└── tests/                    *.test.js — helpers.js sets fake Clerk keys + a local JWT signing key
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
| `CLIENT_URLS` | prod web | Comma-separated browser origins for CORS. Native apps don't need it. |

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
| PATCH | `/users/me` | protect | `{ isOnboarded?, currency?: "USD", level?, goal? }` | `{ user }` — other fields ignored |
| PUT | `/users/me/onboarding` | protect | `{ level, goal, currency? }` | `{ user }` — sets `isOnboarded`, `onboardedAt` |
| DELETE | `/users/me` | protect | — | `{ deleted: true }` — deletes in Clerk **and** Mongo |
| GET | `/admin/users` | protect + isAdmin | `?page&limit&search` | `{ items, total, page, limit, totalPages }` |
| POST | `/ai/chat` | protect + aiLimiter | `{ messages: [{ role: "user"\|"assistant", content }] }` (≤40, last = user, ≤4000 chars each) | `{ message: { role, content }, model, usage }` |
| GET | `/learn/path` | protect | — | `{ units: [{ id, index, title, description, icon, lessons: [{ id, title, summary, xp, minutes, icon, status }] }], stats }` — units are reordered so the goal-recommended unit comes first; `status` is `"done"\|"current"\|"locked"` |
| GET | `/learn/stats` | protect | — | `{ stats: { streakDays, longestStreak, xp, dailyGoalXp, todayXp, lessonsDone, accuracy, badges } }` |
| GET | `/learn/lessons/:slug` | protect | — | `{ lesson: { id, unitId, unitTitle, title, summary, xp, minutes, icon, exercises: [{ type, prompt, options? }] }, progress\|null, status }` — **answers/explanations stripped**; locked lessons → 403 |
| POST | `/learn/lessons/:slug/submit` | protect | `{ answers: unknown[] }` (one per exercise, in order) | `{ score, correct, total, passed, xpEarned, totalXpForLesson, results: [{ index, isCorrect, correctAnswer, explanation }], stats }` — graded server-side; `xpEarned` is the delta added this submit (retries only earn improvement) |
| POST | `/webhooks/clerk` | Svix signature | Clerk event | `{ received }` |

Error codes in use: `UNAUTHORIZED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `VALIDATION_ERROR` /
`BAD_REQUEST` / `DUPLICATE` 400, `PAYLOAD_TOO_LARGE` 413, `RATE_LIMITED` 429, `INTERNAL_ERROR` 500,
`UPSTREAM_ERROR` 502, `SERVICE_UNAVAILABLE` 503, `BAD_SIGNATURE` 400 (webhook).

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
5. **Register** in `express-app.js` next to `auth(app); user(app); ai(app);` (before the 404 handler).
6. **Test** in `tests/learn.test.js` (unit-test the service with a fake repository; add HTTP 401 checks).
7. **Document** the endpoints in the table above and add typed calls in `mobile/src/api/endpoints.ts`.
8. If users own data in the new collection, delete it in `UserService.deleteMe` and `handleClerkUserDeleted`.

## Gotchas

- `config/index.js` must be the first import in `index.js`; `@clerk/express` reads `CLERK_*` from `process.env`.
- `/api/v1/webhooks/clerk` is registered **before** `express.json()` because Svix verification needs the raw body.
- JSON body limit is 1 MB. Add a route-specific parser if you need file uploads (see `utils/multer.js`).
- `backend/.gitignore` ignores lockfiles (`package-lock.json`) — that's the template's choice; CI uses `npm install`.
- `winston` writes `error.log` only in production.
