# Roadmap & Feature Specs

Starting points for each tab. Data models and endpoints below are **suggestions** that follow the repo
conventions (see root `AGENTS.md`) — refine them as you build, and update this file when you do.

Build order suggestion: Learn MVP → Money MVP → ground Ask AI in Money data.

---

## 1. Learn — "Duolingo for finance"

**Status:** MVP shipped (Sep 2026). Backend (`/learn/*` + seed content + server-side grading + XP/streak
+ cascade delete) plus mobile (LearnScreen on real data, full lesson player with all 4 exercise types,
inline results with XP + streak) are all live. Next up is content depth (more units/lessons) and the
"later" list below (hearts/lives, leagues, placement quiz, AI-generated practice).

**Goal:** short daily lessons that build real money skills, with game mechanics that bring people back.

**MVP**
- A learning **path**: Units (e.g. "Budgeting basics") → Lessons → 5–10 exercises each. ✅ backend
- Exercise types: multiple choice, true/false, fill-in-the-number, order-the-steps. ✅ backend
- Instant feedback per exercise with a one-line explanation. ✅ backend (`/submit` returns `results`)
- **XP** per lesson, **daily streak**, lesson completion state. ✅ backend

**Also shipped**
- **AI-generated practice questions** ✅ backend — `POST /learn/lessons/:slug/practice` asks DeepSeek for
  fresh questions on a lesson's topic, validates them hard, and opens a single-use `PracticeSession`
  graded by `POST /learn/practice/:sessionId/submit`. Awards 2 XP per correct answer and feeds the
  streak, but never completes a lesson. Design notes in `backend/AGENTS.md` → "AI-generated practice".
  Mobile data layer is ready (`useGeneratePractice` / `useSubmitPractice`); **no UI is wired to it yet**.
- **Content: 8 units / 33 lessons / 138 exercises**, including India-specific units on UPI & digital
  payments (incl. PIN-safety and scam spotting), taxes on salary, insurance and retirement.

**Later:** hearts/lives, leagues, spaced-repetition review, placement quiz, personalised path beyond
"recommended unit first", lesson review mode, "explain this differently" tie-in with Ask AI.

**Shipped models** (`backend/database/models/`)
```
Unit           { slug, title, description, order, icon, isPublished }
Lesson         { unitId, slug, title, summary, order, xp, estimatedMinutes, icon,
                 exercises: [{ type, prompt, options?, answer, tolerance?, explanation }] }
LessonProgress { userId, lessonId, score, xpEarned, attempts, passed,
                 firstCompletedAt, lastAttemptAt }                          // unique (userId, lessonId)
LearnerStats   { userId, xp, currentStreak, longestStreak, lastActiveDate,
                 todayDate, todayXp, dailyGoalXp, lessonsDone,
                 totalAnswers, correctAnswers, badges }                     // unique userId
```
Content is authored in `backend/database/seed/learn-content.js` and loaded by
`npm run seed:learn` (idempotent upsert by slug).

**Shipped endpoints** (all `protect`, all filtered by `req.user._id`; see `backend/AGENTS.md`
for full response shapes)
- `GET  /api/v1/learn/path` — units + lessons + user status (recommended unit first)
- `GET  /api/v1/learn/lessons/:slug` — lesson with exercises (**answers stripped**; 403 if locked)
- `POST /api/v1/learn/lessons/:slug/submit { answers }` — server-side grading, XP delta, updated stats
- `GET  /api/v1/learn/stats` — xp, streak, dailyGoal, accuracy

Grading is entirely server-side so answers never travel to the client. `xpEarned` on a lesson
can only rise across attempts (retries award the delta, never claw XP back). Streaks advance
on any submit, using UTC-day boundaries. Cascade delete is wired via
`UserService._cascadeDelete → LearnService.deleteAllForUser` on account deletion.

**Shipped mobile pieces** (`mobile/src/features/learn/`)
- Hooks in `useLearn.ts`: `useLearningPath()`, `useLearnerStats()`, `useLessonDetail(slug)`,
  `useSubmitLesson(slug)` — TanStack Query with `queryKeys.learn.*` for invalidation.
- `LearnScreen.tsx` renders the personalised path straight from `GET /learn/path` (no more
  client-side reorder). `LessonNode.tsx` is untouched; `sampleData.ts` is now a thin type shim.
- `LessonPlayerScreen.tsx` — full-screen player, one exercise at a time, per-type input
  renderers (multiple choice / true-false / fill-number / order-steps), server-side grading on
  submit, then an inline results view with per-exercise feedback + explanation + XP + streak.
- Route: `app/lesson/[slug].tsx`, registered as a top-level `Stack.Screen` inside the signed-in
  protected block in `app/_layout.tsx` (hides the tab bar for an immersive experience).
- `ProfileScreen` reads real streak/XP/badges via `useLearnerStats()`.

---

## 2. Money — personal finance management

**Goal:** see where money goes, set budgets, save toward goals. Manual entry first.

**MVP**
- Accounts (cash, bank, card) with balances.
- Transactions: amount, type (income/expense/transfer), category, date, note.
- Monthly **budgets** per category with spent vs limit.
- **Savings goals** with target amount/date and progress.
- Dashboard: this month's income, spending, top categories.

**Later:** CSV import, recurring transactions, bank sync / SMS parsing (region-dependent), multi-currency.

**Suggested models** — amounts are **integers in minor units** (paise/cents) + ISO currency.
```js
Account     { userId, name, type: "cash"|"bank"|"card"|"wallet", currency, openingBalance }
Transaction { userId, accountId, type: "income"|"expense"|"transfer", amount, currency, category, date, note }
            // index { userId: 1, date: -1 }
Budget      { userId, category, month: "2026-09", limit }                 // unique (userId, category, month)
Goal        { userId, name, targetAmount, targetDate, savedAmount }
```

**Suggested endpoints** (all `protect`, all filtered by `req.user._id`)
- `GET/POST /api/v1/finance/accounts`, `PATCH/DELETE /api/v1/finance/accounts/:id`
- `GET /api/v1/finance/transactions?from&to&category&cursor`, `POST`, `PATCH/:id`, `DELETE/:id`
- `GET /api/v1/finance/summary?month=2026-09` → totals, per-category spend vs budget
- `GET/PUT /api/v1/finance/budgets?month=`, `GET/POST/PATCH /api/v1/finance/goals`

**Mobile:** `src/features/finance/` — Overview (tab root), TransactionList, AddTransaction (modal),
Budgets, Goals.

---

## 3. Ask AI — finance assistant (DeepSeek)

**Today:** `POST /api/v1/ai/chat` — stateless, non-streaming; the app keeps the conversation in memory
(`src/features/chat/useChat.ts`). System prompt in `backend/services/ai-service.js` (general education, not
regulated advice). Per-user rate limit 20 req/min.

**Next steps, in order**
1. **Persist conversations:** `Conversation { userId, title, createdAt }`,
   `Message { conversationId, userId, role, content, tokens }`. Endpoints:
   `GET/POST /api/v1/ai/conversations`, `GET /api/v1/ai/conversations/:id/messages`,
   `POST /api/v1/ai/conversations/:id/messages` (server loads history — clients stop sending it).
2. **Streaming:** DeepSeek supports `stream: true` (SSE). Stream from backend to app; on React Native use
   `expo/fetch` (supports streaming response bodies) and render tokens as they arrive.
3. **Grounding in the user's finances** ("answer questions about their own finances"): before calling the
   model, have the backend build a compact context — e.g. this month's summary, budgets, goals — from the
   Money feature and add it as a system message. Prefer **server-side** context building over sending data
   from the app. Later: tool/function calling (`get_transactions(from, to, category)`) so the model fetches
   only what it needs.
4. **Safety & cost:** keep the "education, not advice" framing; log token usage per user; add a daily quota;
   consider `deepseek-reasoner` for complex planning questions (configurable via `DEEPSEEK_MODEL`).
5. **Tie-in with Learn:** "Explain this lesson differently", generated practice questions.

---

## Cross-cutting

- **Onboarding:** ✅ done — level + goal questionnaire (`PUT /api/v1/users/me/onboarding`) personalises
  Learn/Money/Ask AI. Next: add currency and monthly income questions; use `goal` to seed default budgets.
- **Notifications:** streak reminders (expo-notifications + a scheduler on the backend).
- **Analytics & crash reporting:** add before beta.
- **Dark mode:** add a dark palette in `mobile/src/theme/index.ts`.
