/**
 * One typed function per backend endpoint. Add new endpoints here (grouped by feature),
 * then wrap them in React Query hooks under src/hooks or src/features/<feature>/.
 */
import type { ApiClient } from './client';
import type { ChatMessage, ChatResponse, User } from './types';

export const authApi = {
  /** Verifies the session and creates the backend user on first call. */
  me: (api: ApiClient) => api.get<{ user: User }>('/auth/me'),
  /** Re-pulls name/email/avatar from Clerk into the backend. */
  sync: (api: ApiClient) => api.post<{ user: User }>('/auth/sync'),
};

export const usersApi = {
  updateMe: (api: ApiClient, updates: Partial<Pick<User, 'isOnboarded' | 'currency'>>) =>
    api.patch<{ user: User }>('/users/me', updates),
  deleteMe: (api: ApiClient) => api.delete<{ deleted: true }>('/users/me'),
};

export const aiApi = {
  chat: (api: ApiClient, messages: ChatMessage[]) =>
    api.post<ChatResponse>('/ai/chat', { messages }, { timeoutMs: 90_000 }),
};
