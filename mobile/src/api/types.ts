/** Shapes returned by the backend. Keep in sync with backend/database/models/*.js. */

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
