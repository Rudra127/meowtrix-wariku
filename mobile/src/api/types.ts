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
  createdAt: string;
  updatedAt: string;
};

export type ChatRole = 'user' | 'assistant';
export type ChatMessage = { role: ChatRole; content: string };
export type ChatResponse = {
  message: ChatMessage;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
};

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
