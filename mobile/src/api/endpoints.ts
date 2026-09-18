/**
 * One typed function per backend endpoint. Add new endpoints here (grouped by feature),
 * then wrap them in React Query hooks under src/hooks or src/features/<feature>/.
 */
import type { ApiClient } from './client';
import type {
  AnswerCheck,
  ChatMessage,
  ChatResponse,
  Goal,
  LearnPath,
  LearnerStats,
  LessonAnswer,
  LessonDetail,
  LessonSubmitResult,
  Level,
  PracticeSession,
  PracticeSubmitResult,
  User,
} from './types';

export const authApi = {
  /** Verifies the session and creates the backend user on first call. */
  me: (api: ApiClient) => api.get<{ user: User }>('/auth/me'),
  /** Re-pulls name/email/avatar from Clerk into the backend. */
  sync: (api: ApiClient) => api.post<{ user: User }>('/auth/sync'),
};

export const usersApi = {
  updateMe: (api: ApiClient, updates: Partial<Pick<User, 'isOnboarded' | 'currency' | 'level' | 'goal'>>) =>
    api.patch<{ user: User }>('/users/me', updates),
  /** Saves the onboarding questionnaire and sets isOnboarded = true. */
  completeOnboarding: (api: ApiClient, answers: { level: Level; goal: Goal; currency?: string }) =>
    api.put<{ user: User }>('/users/me/onboarding', answers),
  deleteMe: (api: ApiClient) => api.delete<{ deleted: true }>('/users/me'),
};

export const aiApi = {
  chat: (api: ApiClient, messages: ChatMessage[]) =>
    api.post<ChatResponse>('/ai/chat', { messages }, { timeoutMs: 90_000 }),
};

export const learnApi = {
  /** Full path + stats for the Learn tab. Units come back in personalised order. */
  path: (api: ApiClient) => api.get<LearnPath>('/learn/path'),
  /** Just the stats block (streak, XP, daily goal, accuracy). */
  stats: (api: ApiClient) => api.get<{ stats: LearnerStats }>('/learn/stats'),
  /** Lesson with exercises — answers, explanations and tolerances are stripped by the server. */
  lesson: (api: ApiClient, slug: string) => api.get<LessonDetail>(`/learn/lessons/${slug}`),
  /** Instant feedback for one answer while playing (stores nothing). */
  check: (api: ApiClient, slug: string, index: number, answer: LessonAnswer) =>
    api.post<AnswerCheck>(`/learn/lessons/${slug}/check`, { index, answer }),
  /** Grade a submission server-side. `answers` is one entry per exercise, in order. */
  submit: (api: ApiClient, slug: string, answers: LessonAnswer[]) =>
    api.post<LessonSubmitResult>(`/learn/lessons/${slug}/submit`, { answers }),

  /**
   * Generate fresh AI practice questions for a lesson's topic (1–5, default 4).
   * Hits DeepSeek server-side, so it's slower than the other calls — allow a long timeout.
   */
  generatePractice: (api: ApiClient, slug: string, count?: number) =>
    api.post<PracticeSession>(`/learn/lessons/${slug}/practice`, count ? { count } : {}, { timeoutMs: 90_000 }),

  /** Instant feedback for one question in a practice round (stores nothing). */
  checkPractice: (api: ApiClient, sessionId: string, index: number, answer: LessonAnswer) =>
    api.post<AnswerCheck>(`/learn/practice/${sessionId}/check`, { index, answer }),

  /** Grade a practice round. Single-use: a session can only be submitted once. */
  submitPractice: (api: ApiClient, sessionId: string, answers: LessonAnswer[]) =>
    api.post<PracticeSubmitResult>(`/learn/practice/${sessionId}/submit`, { answers }),
};
