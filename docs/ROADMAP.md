# Roadmap & Feature Specs

Starting points for each tab. Data models and endpoints below are **suggestions** that follow the repo
conventions (see root `AGENTS.md`) — refine them as you build, and update this file when you do.

Build order suggestion: Learn MVP → Money MVP → ground Ask AI in Money data.

---

## 1. Learn — "Duolingo for finance"

**Goal:** short daily lessons that build real money skills, with game mechanics that bring people back.

**MVP**
- A learning **path**: Units (e.g. "Budgeting basics") → Lessons → 5–10 exercises each.
- Exercise types: multiple choice, true/false, fill-in-the-number, order-the-steps.
- Instant feedback per exercise with a one-line explanation.
- **XP** per lesson, **daily streak**, lesson completion state.

**Later:** hearts/lives, leagues, spaced-repetition review, placement quiz, AI-generated practice questions
(DeepSeek via backend), personalised path from onboarding goals.

**Suggested models** (`backend/database/models/`)
```js
Unit          { slug, title, description, order, isPublished }
Lesson        { unitId, slug, title, order, xp, exercises: [{ type, prompt, options?, answer, explanation }] }
LessonProgress{ userId, lessonId, completedAt, score, attempts }            // unique (userId, lessonId)
LearnerStats  { userId, xp, currentStreak, longestStreak, lastActiveDate }   // unique userId
```
Content can start as seed JSON in `backend/database/seed/` loaded by a script.

**Suggested endpoints**
- `GET  /api/v1/learn/path` → units with lessons + the user's completion state
- `GET  /api/v1/learn/lessons/:id` → lesson with exercises (**omit answers** in the response)
- `POST /api/v1/learn/lessons/:id/submit` `{ answers }` → graded result, XP earned, updated streak
  (grade on the server so answers can't be read from the app)
- `GET  /api/v1/learn/stats` → xp, streaks

**Mobile:** `src/features/learn/` — PathScreen (tab root), LessonPlayer (full-screen stack route, one
exercise at a time, progress bar), ResultScreen (XP + streak animation).

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
