import type { ExerciseType, LessonAnswer, PublicExercise } from '@/api/types';
import type { IconName } from '@/components/ui';

/** Label + icon shown above each question so users know how to answer. */
export const EXERCISE_META: Record<ExerciseType, { label: string; icon: IconName }> = {
  multiple_choice: { label: 'Choose one', icon: 'list-outline' },
  true_false: { label: 'True or false?', icon: 'git-compare-outline' },
  fill_number: { label: 'Type the answer', icon: 'keypad-outline' },
  order_steps: { label: 'Put in order', icon: 'swap-vertical-outline' },
};

/** Whether the learner has given a usable answer for this exercise. */
export function isAnswered(exercise: PublicExercise | undefined, answer: LessonAnswer | undefined): boolean {
  if (!exercise || answer === null || answer === undefined) return false;
  if (exercise.type === 'order_steps') return Array.isArray(answer) && answer.length === (exercise.options?.length ?? 0);
  return true;
}

/** Human-readable answer for the review list (works for user answers and correct answers). */
export function formatAnswer(answer: LessonAnswer | number | boolean | number[], exercise: PublicExercise | undefined): string {
  if (answer === null || answer === undefined) return 'Skipped';
  if (typeof answer === 'boolean') return answer ? 'True' : 'False';
  if (Array.isArray(answer)) {
    return exercise?.options ? answer.map((i) => exercise.options?.[i] ?? String(i)).join(' → ') : answer.join(', ');
  }
  if (exercise?.type === 'multiple_choice' && exercise.options) return exercise.options[answer] ?? String(answer);
  return answer.toLocaleString('en-IN');
}

export function fillMissing(answers: LessonAnswer[], total: number): LessonAnswer[] {
  return Array.from({ length: total }, (_, i) => answers[i] ?? null);
}

export function shuffleIndices(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  // Never show steps already in the correct order — that would give the answer away.
  if (n > 1 && arr.every((v, i) => v === i)) [arr[0], arr[1]] = [arr[1], arr[0]];
  return arr;
}
