# Roadmap & Feature Specs

Starting points for each tab. Data models and endpoints below are **suggestions** that follow the repo
conventions (see root `AGENTS.md`) — refine them as you build, and update this file when you do.

**Status:** Money ✅ and Ask AI ✅ are built (see each section). Learn is next — still a spec.

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

## 2. Money — personal finance management ✅ BUILT

> **Built and live** on `/api/v1/finance/*` (see `backend/AGENTS.md` for the full endpoint table) with the
> Money tab wired to it (`mobile/src/features/finance/`). What actually shipped differs from the original
> suggestion below in a few deliberate ways:
> - **Voice-first entry** is the headline: the user speaks, the backend transcribes (`/finance/voice`) and an
>   LLM extracts transactions in JSON mode, and the user **confirms drafts** before anything is saved.
>   `/finance/parse` is the typed equivalent. This was the owner's core ask — automatic capture from voice/AI
>   rather than form-filling.
> - `Transaction.amount` is stored **positive** with a separate `type` (not signed).
> - A denormalised `month` field + `User.timezone` make monthly rollups timezone-correct (`utils/dates.js`).
> - `GET /finance/summary` returns the whole dashboard (balance, totals, per-category, budgets, goals,
>   month-on-month change) in one request; `GET /finance/series` powers the chart.
> - Categories are a fixed, shared list (`backend/database/models/categories.js` ↔
>   `mobile/src/features/finance/categories.ts`) so voice extraction, storage and icons all agree.
> The original spec is kept below for context.

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

## 3. Ask AI — finance assistant (DeepSeek) ✅ BUILT (grounded, tool-calling)

**Today:** `POST /api/v1/ai/chat` — stateless, non-streaming; the app keeps the conversation in memory
(`src/features/chat/useChat.ts`). It is now an **agent loop** (`backend/services/ai-service.js`): DeepSeek can
call tools (`backend/services/ai-tools.js`) to read the user's real data before answering. Response includes
`toolsUsed`, which the app surfaces as a "Checked your spending" hint so grounding is visible.

**Tools available** (each bound to one user; amounts cross the boundary in rupees):
`get_month_summary`, `list_transactions`, `get_spending_trend`, `get_budgets`, `get_goals`, `get_accounts`,
`record_transaction` (the only writer — logs an expense/income the user asks it to), and — only when a
brokerage is linked — `get_zerodha_holdings`, `get_zerodha_positions`.

**Answers adapt to the user's level** (beginner / intermediate / advanced from onboarding): the system prompt
bans jargon for beginners and goes precise/quantitative for advanced users. The load-bearing rule is
"**never invent a number**" — every figure comes from a tool result.

**Brokerage holdings** (Upstox — free — or Zerodha) are reachable only through the AI tools (no holdings
screen), matching the owner's ask. The integration layer is provider-generic: a broker is a `lib/<broker>.js`
client implementing a uniform interface plus one line in `services/brokerages.js`. The connect flow lives in
Profile → Connected accounts; tokens are encrypted at rest and expire daily, surfaced as a "Reconnect" state.

**Still next, in order**
1. **Persist conversations:** `Conversation { userId, title, createdAt }`,
   `Message { conversationId, userId, role, content, tokens }`. Endpoints:
   `GET/POST /api/v1/ai/conversations`, `GET /api/v1/ai/conversations/:id/messages`,
   `POST /api/v1/ai/conversations/:id/messages` (server loads history — clients stop sending it).
2. **Streaming:** DeepSeek supports `stream: true` (SSE). Trickier now that the reply may involve tool rounds;
   stream only the final turn. On React Native use `expo/fetch`.
3. **Safety & cost:** keep the "education, not advice" framing; log token usage per user (the response already
   returns `usage`); add a daily quota; consider `deepseek-reasoner` for complex planning (`DEEPSEEK_MODEL`).
4. **More brokers / accounts:** the integration layer (`services/brokerage-service.js` + `brokerages.js`,
   `models/integration.js`) is provider-generic — Upstox and Zerodha already share it; add bank/mutual-fund
   providers the same way (a `lib/<broker>.js` client + one registry line) and they surface via the same
   `get_holdings` tool.
5. **Tie-in with Learn:** "Explain this lesson differently", generated practice questions.

---

## Cross-cutting

- **Onboarding:** ✅ done — level + goal questionnaire (`PUT /api/v1/users/me/onboarding`) personalises
  Learn/Money/Ask AI. Next: add currency and monthly income questions; use `goal` to seed default budgets.
- **Notifications:** streak reminders (expo-notifications + a scheduler on the backend).
- **Analytics & crash reporting:** add before beta.
- **Dark mode:** add a dark palette in `mobile/src/theme/index.ts`.
