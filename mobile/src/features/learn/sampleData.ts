/**
 * Thin type-only re-export. The Learn feature used to hold placeholder content here;
 * it now consumes the real backend via `useLearn.ts` (hooks over `GET /learn/path`).
 * `LessonNode.tsx` still imports `Lesson` from this path — that's why the file remains.
 */
import type { LearnLesson, LearnUnit, LearnerStats, LessonStatus } from '@/api/types';

export type Lesson = LearnLesson;
export type Unit = LearnUnit;
export type { LearnerStats, LessonStatus };
