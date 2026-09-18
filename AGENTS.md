# Wariku — Agent & Contributor Guide

> **Read this first.** It is the source of truth for how this repo is organised and the rules for
> changing it. Sub-guides: [`backend/AGENTS.md`](backend/AGENTS.md), [`mobile/AGENTS.md`](mobile/AGENTS.md),
> [`docs/AUTH.md`](docs/AUTH.md) (Clerk setup), [`docs/ROADMAP.md`](docs/ROADMAP.md) (feature specs).

## What we're building

A mobile app that makes people better with money. Three main tabs:

| Tab | Route | What it is | Status |
|---|---|---|---|
| **Learn** | `mobile/app/(tabs)/index.tsx` | Duolingo-style finance lessons: units → lessons → quizzes, XP, streaks | UI done, sample data |
| **Money** | `mobile/app/(tabs)/money.tsx` | Personal finance management: transactions, budgets, goals | UI done, sample data |
| **Ask AI** | `mobile/app/(tabs)/ask.tsx` | Finance chatbot on **DeepSeek**, answers questions about the user's own finances | Working chat (DeepSeek) |
| Profile | `mobile/app/(tabs)/profile.tsx` | Account, backend-connection status, sign out, delete account | Done |

First run: a 2-question onboarding (experience level + main goal) personalises every tab and the AI's tone.

**What's done:** the skeleton. Clerk auth end-to-end (mobile ↔ backend), user sync into MongoDB, a typed
API client, a DeepSeek client, a design system, and tab UIs (Learn/Money on sample data). **What's next:** the features — see `docs/ROADMAP.md`.

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

## Run it locally

Prereqs: Node ≥ 20.9, MongoDB (`brew services start mongodb-community`) or an Atlas URI, a Clerk
application (see `docs/AUTH.md`), optionally a DeepSeek API key.

```bash
# 1. Backend  → http://localhost:5947
cd backend && npm install
cp .env.example .env.dev          # fill in MONGODB_URI, CLERK_*, DEEPSEEK_API_KEY
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
  Never floats. Format for display only in the UI.
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
