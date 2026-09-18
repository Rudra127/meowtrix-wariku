import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Don't hammer the server on auth/validation errors; do retry flaky network once.
      retry: (failureCount, error) =>
        failureCount < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
    },
  },
});

/**
 * Query keys in one place so invalidation stays consistent.
 *
 * Money keys are nested under a single `finance` root: after a write, invalidating
 * `queryKeys.finance.all` refreshes the summary, the chart and every transaction list at once,
 * which is what the dashboard needs — a new expense changes all three.
 */
export const queryKeys = {
  me: ['me'] as const,

  finance: {
    all: ['finance'] as const,
    summary: (month?: string) => ['finance', 'summary', month ?? 'current'] as const,
    series: (period: string, month?: string) => ['finance', 'series', period, month ?? 'current'] as const,
    transactions: (filters?: Record<string, unknown>) => ['finance', 'transactions', filters ?? {}] as const,
    accounts: ['finance', 'accounts'] as const,
    budgets: (month?: string) => ['finance', 'budgets', month ?? 'current'] as const,
    goals: ['finance', 'goals'] as const,
  },

  voice: {
    capabilities: ['voice', 'capabilities'] as const,
  },

  integrations: {
    all: ['integrations'] as const,
  },
} as const;
