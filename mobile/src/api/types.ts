/** Shapes returned by the backend. Keep in sync with backend/database/models/*.js. */
import type { IconName } from '@/components/ui';

export type ApiSuccess<T> = { success: true; data: T };
export type ApiFailure = { success: false; error: { code: string; message: string; details?: unknown } };
export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export type Level = 'beginner' | 'intermediate' | 'advanced';
export type Goal = 'budgeting' | 'saving' | 'debt' | 'investing' | 'learning';

export type User = {
  id: string;
  clerkId: string;
  email: string;
  firstName: string;
  lastName: string;
  imageUrl: string;
  role: 'user' | 'admin';
  isOnboarded: boolean;
  onboardedAt: string | null;
  level: Level | null;
  goal: Goal | null;
  currency: string;
  /** IANA zone — decides which calendar month a transaction belongs to. */
  timezone: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatRole = 'user' | 'assistant';
export type ChatMessage = { role: ChatRole; content: string };
export type ChatResponse = {
  message: ChatMessage;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  /** Names of the tools the assistant called (backend/services/ai-tools.js) — shown as a hint. */
  toolsUsed: string[];
};

// ---- Money -----------------------------------------------------------------------------------
//
// EVERY amount below is an INTEGER in MINOR units (paise/cents). See root AGENTS.md → Money.
// `Transaction.amount` is always POSITIVE — `type` carries the direction. Use `signedAmount()`
// from src/features/finance/categories.ts for display.

export type TransactionType = 'income' | 'expense';
export type TransactionSource = 'manual' | 'voice' | 'chat' | 'import';
export type AccountType = 'cash' | 'bank' | 'card' | 'wallet';

/** Canonical category ids. Mirrors backend/database/models/categories.js. */
export type ExpenseCategory =
  | 'food'
  | 'groceries'
  | 'transport'
  | 'shopping'
  | 'bills'
  | 'rent'
  | 'emi'
  | 'health'
  | 'education'
  | 'travel'
  | 'fun'
  | 'gifts'
  | 'investment'
  | 'savings'
  | 'other';

export type IncomeCategory = 'salary' | 'freelance' | 'business' | 'interest' | 'refund' | 'gift_received' | 'other_income';

export type CategoryId = ExpenseCategory | IncomeCategory;

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  openingBalance: number;
  isDefault: boolean;
  archivedAt: string | null;
};

export type Transaction = {
  id: string;
  accountId: string | null;
  type: TransactionType;
  /** Positive integer, minor units. */
  amount: number;
  currency: string;
  category: CategoryId;
  title: string;
  note: string;
  date: string;
  /** "2026-09" — the user's local calendar month. */
  month: string;
  source: TransactionSource;
  sourceText: string;
  createdAt: string;
  updatedAt: string;
};

export type BudgetStatus = {
  id: string;
  category: ExpenseCategory;
  month: string;
  limit: number;
  spent: number;
  /** Negative when overspent. */
  remaining: number;
  /** 0–1+, spent ÷ limit. */
  ratio: number;
  overspent: boolean;
};

export type GoalItem = {
  id: string;
  name: string;
  targetAmount: number;
  savedAmount: number;
  currency: string;
  targetDate: string | null;
  achievedAt: string | null;
  remaining: number;
  ratio: number;
  achieved: boolean;
};

export type CategoryTotal = { category: CategoryId; total: number; count: number; share: number };

export type FinanceSummary = {
  month: string;
  currency: string;
  timezone: string;
  balance: { total: number; openingBalance: number; lifetimeIncome: number; lifetimeExpense: number };
  totals: { income: number; expense: number; net: number; count: number };
  previous: { month: string; income: number; expense: number; net: number };
  /** Spending change vs last month, percent. Negative means spending less. */
  changePct: number;
  byCategory: CategoryTotal[];
  topCategory: { category: CategoryId; total: number; count: number } | null;
  budgets: BudgetStatus[];
  budgetTotals: { limit: number; spent: number; remaining: number };
  highlights: { saved: number; invested: number; netFlow: number };
  goals: { count: number; targetAmount: number; savedAmount: number; items: GoalItem[] };
  daysLeftInMonth: number;
};

export type SeriesPeriod = 'week' | 'month' | 'year';
export type SeriesPoint = { label: string; key: string; value: number };
export type FinanceSeries = { period: SeriesPeriod; currency: string; points: SeriesPoint[]; total: number };

export type TransactionPage = {
  items: Transaction[];
  total: number;
  limit: number;
  skip: number;
  currency: string;
};

/** What the app POSTs to create a transaction. Amount in minor units. */
export type TransactionInput = {
  type: TransactionType;
  amount: number;
  category: CategoryId;
  title?: string;
  note?: string;
  date?: string;
  accountId?: string;
};

// ---- Voice capture ---------------------------------------------------------------------------

/**
 * A transaction the AI extracted from speech or text but has NOT saved. The user confirms these
 * before anything is written — see backend/services/voice-service.js for why.
 */
export type TransactionDraft = {
  type: TransactionType;
  /** Positive integer, minor units. */
  amount: number;
  category: CategoryId;
  title: string;
  date: string;
  /** 0–1. How sure the model is of the amount and category. */
  confidence: number;
  /** True when the user really should look at this row before saving. */
  needsReview: boolean;
};

export type VoiceCaptureResult = {
  transcript: string;
  drafts: TransactionDraft[];
  /** Phrases that mentioned money but had no determinable amount. */
  unclear: string[];
  message: string;
  model?: string;
  sttModel?: string;
};

export type VoiceCapabilities = {
  /** False when the server has no STT provider configured — hide the mic, keep typed entry. */
  speechToText: boolean;
  categories: { expense: ExpenseCategory[]; income: IncomeCategory[] };
};

// ---- Linked accounts -------------------------------------------------------------------------

export type BrokerProvider = 'upstox' | 'zerodha';

export type IntegrationStatus = {
  provider: BrokerProvider;
  label: string;
  /** False when the server has no Kite credentials — show "unavailable", not "connect". */
  configured: boolean;
  /** True only when we hold a usable token. */
  connected: boolean;
  status: 'connected' | 'expired' | 'disconnected';
  /** Linked, but the broker session died (Zerodha tokens expire every morning) → "Reconnect". */
  needsReauth: boolean;
  brokerUserId: string;
  brokerUserName: string;
  connectedAt: string | null;
  expiresAt: string | null;
  lastError: string;
};

export type BrokerLoginUrl = { url: string; expiresInSeconds: number; redirectUrl: string };

// ---- Learn -------------------------------------------------------------------------
// Shapes match backend/services/learn-service.js response payloads. When adding a new
// exercise type or field, keep the shape identical on both sides.
//
// `icon` is typed as Ionicons `IconName` (imported at the top of this file) for
// compile-time safety in the UI. The seed content in backend/database/seed/learn-content.js
// controls the actual strings sent; unknown icons render blank rather than crashing.

export type LessonStatus = 'done' | 'current' | 'locked';

export type LearnLesson = {
  id: string;
  title: string;
  summary: string;
  xp: number;
  minutes: number;
  icon: IconName;
  status: LessonStatus;
};

export type LearnUnit = {
  id: string;
  index: number;
  title: string;
  description: string;
  icon: IconName;
  lessons: LearnLesson[];
};

export type LearnerStats = {
  streakDays: number;
  longestStreak: number;
  xp: number;
  dailyGoalXp: number;
  todayXp: number;
  lessonsDone: number;
  accuracy: number;
  badges: number;
};

export type LearnPath = { units: LearnUnit[]; stats: LearnerStats };

export type ExerciseType = 'multiple_choice' | 'true_false' | 'fill_number' | 'order_steps';

/** Exercise as delivered to the client — no `answer`, `explanation` or `tolerance`. */
export type PublicExercise = {
  type: ExerciseType;
  prompt: string;
  options?: string[];
};

export type LessonDetail = {
  lesson: {
    id: string;
    unitId: string | null;
    unitTitle: string;
    title: string;
    summary: string;
    xp: number;
    minutes: number;
    icon: IconName;
    exercises: PublicExercise[];
  };
  progress: { score: number; xpEarned: number; attempts: number; passed: boolean } | null;
  status: LessonStatus;
};

/** One user answer. `null` = skipped (counts as wrong on the server). */
export type LessonAnswer = number | boolean | number[] | null;

export type ExerciseResult = {
  index: number;
  isCorrect: boolean;
  correctAnswer: number | boolean | number[];
  explanation: string;
};

/** POST /learn/lessons/:slug/check — instant feedback for one answer (nothing is stored). */
export type AnswerCheck = ExerciseResult;

export type LessonSubmitResult = {
  score: number;
  correct: number;
  total: number;
  passed: boolean;
  xpEarned: number;
  totalXpForLesson: number;
  results: ExerciseResult[];
  stats: LearnerStats;
};

// ---- AI practice rounds --------------------------------------------------------------
// Extra questions generated on demand by DeepSeek for a lesson's topic. The exercises come
// back answer-stripped just like a normal lesson; grade them by posting the answers back
// with the `sessionId`. Sessions are single-use and expire server-side after ~24h.

export type PracticeSession = {
  sessionId: string;
  lesson: { id: string; title: string };
  exercises: PublicExercise[];
  model: string;
};

export type PracticeSubmitResult = {
  score: number;
  correct: number;
  total: number;
  passed: boolean;
  /** Small bonus (2 XP per correct answer) — practice never completes a lesson. */
  xpEarned: number;
  results: ExerciseResult[];
  stats: LearnerStats;
};
