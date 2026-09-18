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

/** Query keys in one place so invalidation stays consistent. */
export const queryKeys = {
  me: ['me'] as const,
  learn: {
    all: ['learn'] as const,
    path: ['learn', 'path'] as const,
    stats: ['learn', 'stats'] as const,
    lesson: (slug: string) => ['learn', 'lesson', slug] as const,
  },
};
