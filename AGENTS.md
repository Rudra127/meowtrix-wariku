# Wariku — Agent & Contributor Guide

> **Read this first.** It is the source of truth for how this repo is organised and the rules for
> changing it. Sub-guides: [`backend/AGENTS.md`](backend/AGENTS.md), [`mobile/AGENTS.md`](mobile/AGENTS.md),
> [`docs/AUTH.md`](docs/AUTH.md) (Clerk setup), [`docs/ROADMAP.md`](docs/ROADMAP.md) (feature specs).

## What we're building

A mobile app that makes people better with money. Three main tabs:

| Tab | Route | What it is | Status |
|---|---|---|---|
| **Learn** | `mobile/app/(tabs)/index.tsx` | Duolingo-style finance lessons: units → lessons → quizzes, XP, streaks | **Done** — end-to-end (backend + seeded content + full player + results) |
| **Money** | `mobile/app/(tabs)/money.tsx` | Personal finance: **voice-first** entry, budgets, goals, monthly dashboard | **Done (live data)** |
| **Ask AI** | `mobile/app/(tabs)/ask.tsx` | Finance assistant on **DeepSeek** with **tool calling** — answers from the user's real finances + broker holdings | **Done (grounded)** |
| Profile | `mobile/app/(tabs)/profile.tsx` | Account, connected accounts (Upstox/Zerodha), backend status, sign out, delete account | Done |

First run: a 2-question onboarding (experience level + main goal) personalises every tab and the AI's tone.

**What's done:** the skeleton (Clerk auth end-to-end, user sync into MongoDB, typed API client, DeepSeek
client, design system) plus all three features — **Learn**, **Money** and **Ask AI**.
- **Learn** — units → lessons → exercises with server-side grading, XP, streaks and a full lesson player.
  Content is seeded (`npm run seed:learn`); progress and stats live on `/api/v1/learn/*`.
- **Money** — add income/expenses by **voice**: the user speaks, the backend transcribes (`/finance/voice`)
  and an LLM extracts transactions, then the user confirms before anything is saved. Manual quick-add,
  budgets, savings goals and a timezone-correct monthly dashboard are all live on `/api/v1/finance/*`.
- **Ask AI** — a grounded agent: it calls tools (`backend/services/ai-tools.js`) to read the user's own
  transactions/budgets/goals and, when a broker is connected (**Upstox** or **Zerodha**), their portfolio
  holdings, and answers at the experience level from onboarding. It never states a figure it didn't fetch
  from a tool.

**What's next:** the Learn feature — see `docs/ROADMAP.md`.

### Owner setup still required
Both features degrade gracefully without these; see each app's `.env.example`.
- `STT_API_KEY` (`backend/.env.dev`) — turns on the microphone. Without it, typed natural-language entry
  still works. Groq has a free tier; OpenAI works too.
- A **brokerage** (Profile → Connected accounts) so Ask AI can read holdings. Two providers are supported;
  connect either:
  - **Upstox** (recommended — **free**): `UPSTOX_API_KEY` / `UPSTOX_API_SECRET` / `UPSTOX_REDIRECT_URL` +
    `ENCRYPTION_KEY`. Free developer app at https://account.upstox.com/developer/apps.
  - **Zerodha**: `ZERODHA_API_KEY` / `ZERODHA_API_SECRET` / `ZERODHA_REDIRECT_URL` + `ENCRYPTION_KEY`. Kite
    Connect requires a **paid** developer app.
  Without any of these the cards show "not available". Each redirect URL must exactly match the one
  registered on that broker's app (and in dev be your LAN IP, not `localhost`).
- Learn content must be seeded once: `cd backend && npm run seed:learn`.

## Repo map

```
wariku/
├── AGENTS.md            ← you are here (CLAUDE.md imports it)
├── docs/
│   ├── AUTH.md          Clerk dashboard setup, auth flow, troubleshooting
│   └── ROADMAP.md       Specs + suggested data models/endpoints for Learn, Money, Ask AI
├── backend/             Node 20 + Express 5 + MongoDB (Mongoose) + @clerk/express + DeepSeek
├── mobile/              Expo SDK 57 + React Native + expo-router + @clerk/expo (Core 3)
└── .github/workflows/   Backend CI (lint + test) and deploy to a self-hosted VM via PM2
```

## How the pieces talk

```
 Mobile app (Expo)                        Backend (Express)                     External
 ─────────────────                        ─────────────────                     ────────
 Clerk hooks (useSignIn/useSignUp/useSSO) ───────────────────────────────────▶ Clerk (auth)
     │ session token (short-lived JWT, auto-refreshed by Clerk)
     ▼
 useApi() → fetch  ── Authorization: Bearer <token> ──▶ clerkMiddleware() verifies JWT
                                                         protect → finds/creates Mongo user → req.user
                                                         route → service → repository ──▶ MongoDB
                                                         ai-service → lib/deepseek.js ──▶ DeepSeek API
 ◀──────────── { success: true, data } | { success: false, error: { code, message } }
```

1. **Clerk owns identity** (sign-up, sign-in, passwords, Google OAuth, sessions). The backend never sees
   passwords and never issues its own tokens.
2. Every API request carries the **Clerk session token**. The backend verifies it with `@clerk/express`.
3. On a user's first authenticated request, `protect` **creates their Mongo `User`** (lazy sync). The
   optional Clerk webhook keeps name/email/role in sync afterwards and handles deletions.
4. App data (lessons progress, transactions, chats…) lives in MongoDB, keyed by `User._id`.
5. **Ask AI is an agent, not a passthrough.** `ai-service` runs a tool-calling loop: DeepSeek may call tools
   (`ai-tools.js`) that read the user's finance data and Zerodha holdings, then answers from the results.
6. **Third-party tokens** (Zerodha access tokens) are encrypted at rest with `ENCRYPTION_KEY` (`lib/crypto.js`)
   and only ever read server-side; the app never receives them.

## Run it locally

Prereqs: Node ≥ 20.9, MongoDB (`brew services start mongodb-community`) or an Atlas URI, a Clerk
application (see `docs/AUTH.md`), optionally a DeepSeek API key.

```bash
# 1. Backend  → http://localhost:5947
cd backend && npm install
cp .env.example .env.dev          # fill in MONGODB_URI, CLERK_*, DEEPSEEK_API_KEY
                                  # optional: STT_API_KEY (voice), ZERODHA_* + ENCRYPTION_KEY (holdings)
npm run dev
curl localhost:5947/health

# 2. Mobile (new terminal)
cd mobile && npm install
cp .env.example .env              # fill in EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
npm start                          # scan QR with Expo Go, or press i / a
```

The app automatically targets `http://<your computer's LAN IP>:5947/api/v1` in development, so phones on
the same Wi-Fi work without extra config. Profile tab → "Backend connection" shows whether it's working.

## Checks (run before you say you're done)

| Where | Command | What |
|---|---|---|
| backend | `npm test` | Unit + HTTP tests (offline; no Clerk/Mongo/DeepSeek needed) |
| backend | `TEST_MONGODB_URI=mongodb://127.0.0.1:27017/wariku_test npm test` | + authenticated end-to-end tests against real Mongo |
| backend | `npm run lint` | ESLint |
| mobile | `npm run typecheck` | `tsc --noEmit` |
| mobile | `npm run lint` | `expo lint` |
| mobile | `npm run doctor` | `expo-doctor` (dependency versions, config) |

## Conventions (apply everywhere)

- **API shape:** every response is `{ success: true, data }` or
  `{ success: false, error: { code, message, details? } }`. `code` is SCREAMING_SNAKE and stable — clients
  branch on `code`, never on `message`.
- **Routes:** versioned under `/api/v1/`, resource-oriented (`/users/me`, `/ai/chat`,
  `/learn/lessons/:id`). Admin-only routes live under `/api/v1/admin/`.
- **Auth:** every non-public route uses `protect`. Never trust a user id from the request body/query —
  always use `req.user` (set by `protect`). Admin routes add `isAdmin` after `protect`.
- **Ownership:** every user-owned document has `userId: ObjectId(ref "User")`, and every query filters by
  `req.user._id`.
- **Secrets:** backend secrets live in `backend/.env.*` (git-ignored). The mobile app may only contain
  `EXPO_PUBLIC_*` values — those ship inside the app bundle, so they must never be secrets. The DeepSeek key
  therefore stays on the backend; the app always calls DeepSeek through `/api/v1/ai/*`.
- **Money:** store amounts as **integers in minor units** (paise/cents) plus an ISO-4217 `currency`.
  Never floats. Format for display only in the UI. A `Transaction.amount` is always **positive**; its
  `type` (`income`/`expense`) carries the direction — derive the display sign, don't store it. (One
  documented exception: Zerodha holdings are pass-through rupee floats, never stored in the ledger.)
- **Timezone:** which calendar month a transaction belongs to depends on the **user's** timezone
  (`User.timezone`), not UTC. Month maths lives in `backend/utils/dates.js`; the mobile onboarding sends the
  device zone.
- **AI grounding:** the assistant must never invent a figure about the user — every number comes from a
  tool result. New AI capabilities are tools in `backend/services/ai-tools.js`, bound to one user.
- **Keep layers:** backend `api/` (HTTP) → `services/` (logic) → `database/repository/` (queries).
  Mobile `app/` (routes, thin) → `src/features/<feature>/` (screens, hooks) → `src/api/` (HTTP).
- **Tests:** new backend endpoints get tests in `backend/tests/`. Keep tests offline (inject fakes, see
  `tests/ai.test.js`).
- **Docs are part of the change:** when you add an endpoint, env var, model or screen, update the relevant
  `AGENTS.md` / `docs/*.md` in the same change.

## Decisions already made (don't relitigate without asking)

| Decision | Why |
|---|---|
| Clerk for auth, session token sent straight to backend | No custom JWTs/refresh logic to maintain; Clerk handles rotation |
| `@clerk/expo` **Core 3** hooks (`useSignIn()` → `{ signIn, errors, fetchStatus }`) | Current SDK. The old `setActive`/`attemptFirstFactor` API is in `@clerk/expo/legacy` — don't mix them |
| Custom auth screens (not Clerk's prebuilt native `<AuthView/>`) | Work in Expo Go, fully brandable |
| expo-router with `Stack.Protected` guards in `app/_layout.tsx` | One place decides signed-in vs signed-out navigation |
| TanStack Query for server state | Caching, retries, invalidation; cache is cleared on user change |
| DeepSeek via plain `fetch` in `backend/lib/deepseek.js` | OpenAI-compatible API; swapping models/providers touches one file |
| MongoDB + Mongoose | Existing template; flexible for lesson content |

## Open items for the owner

- Clerk keys: add to `backend/.env.dev` and `mobile/.env` (see `docs/AUTH.md` checklist).
- DeepSeek key: add `DEEPSEEK_API_KEY` to `backend/.env.dev`.
- Final bundle ID / package name (currently `com.wariku.app` in `mobile/app.json`), app icon, brand colours
  (`mobile/src/theme/index.ts`).
- Default currency is `INR` (`backend/database/models/user.js`) — change if the launch market differs.
