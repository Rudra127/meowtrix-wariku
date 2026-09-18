import { useAuth } from '@clerk/expo';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { learnApi } from '@/api/endpoints';
import { queryKeys } from '@/api/queryClient';
import type { LessonAnswer } from '@/api/types';
import { useApi } from '@/api/useApi';

/**
 * GET /learn/path — units in personalised order + learner stats.
 * The server has already reordered by `user.goal` and computed done/current/locked.
 */
export function useLearningPath() {
  const api = useApi();
  const { isSignedIn } = useAuth();
  return useQuery({
    queryKey: queryKeys.learn.path,
    queryFn: () => learnApi.path(api),
    enabled: !!isSignedIn,
  });
}

/**
 * GET /learn/stats — just the header stats block (streak, XP, daily goal, accuracy).
 * Cheaper than /learn/path for screens outside the Learn tab (e.g. Profile).
 */
export function useLearnerStats() {
  const api = useApi();
  const { isSignedIn } = useAuth();
  return useQuery({
    queryKey: queryKeys.learn.stats,
    queryFn: () => learnApi.stats(api).then((r) => r.stats),
    enabled: !!isSignedIn,
  });
}

/**
 * GET /learn/lessons/:slug — full lesson with exercises.
 * Answers, explanations and tolerances are stripped by the server. Locked lessons → 403.
 */
export function useLessonDetail(slug: string | undefined) {
  const api = useApi();
  const { isSignedIn } = useAuth();
  return useQuery({
    queryKey: queryKeys.learn.lesson(slug ?? ''),
    queryFn: () => learnApi.lesson(api, slug as string),
    enabled: !!isSignedIn && !!slug,
    // Once we've loaded a lesson we don't want it flickering mid-play.
    staleTime: 5 * 60_000,
  });
}

/**
 * POST /learn/lessons/:slug/submit — grade a full submission.
 * Invalidates `learn.path` (statuses/stats change) and the specific lesson cache
 * (progress row is updated). Return value is the full grading + refreshed stats.
 */
export function useSubmitLesson(slug: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (answers: LessonAnswer[]) => learnApi.submit(api, slug, answers),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.learn.all });
    },
  });
}

/**
 * POST /learn/lessons/:slug/check — grade one answer for instant feedback in the player.
 * Doesn't touch caches: nothing is stored server-side until the lesson is submitted.
 */
export function useCheckAnswer(slug: string) {
  const api = useApi();
  return useMutation({
    mutationFn: ({ index, answer }: { index: number; answer: LessonAnswer }) => learnApi.check(api, slug, index, answer),
  });
}
