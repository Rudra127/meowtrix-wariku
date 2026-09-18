/**
 * One typed function per backend endpoint. Add new endpoints here (grouped by feature),
 * then wrap them in React Query hooks under src/hooks or src/features/<feature>/.
 */
import type { ApiClient } from './client';
import type {
  ChatMessage,
  ChatResponse,
  Goal,
  LearnPath,
  LearnerStats,
  LessonAnswer,
  LessonDetail,
  LessonSubmitResult,
  Level,
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
  /** Grade a submission server-side. `answers` is one entry per exercise, in order. */
  submit: (api: ApiClient, slug: string, answers: LessonAnswer[]) =>
    api.post<LessonSubmitResult>(`/learn/lessons/${slug}/submit`, { answers }),
};
