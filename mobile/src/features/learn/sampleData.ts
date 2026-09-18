/**
 * PLACEHOLDER content for the Learn tab until the backend `/learn/*` endpoints exist
 * (docs/ROADMAP.md → Learn). Replace with React Query hooks that call learnApi.
 */
import type { IconName } from '@/components/ui';

export type LessonStatus = 'done' | 'current' | 'locked';
export type Lesson = { id: string; title: string; summary: string; xp: number; minutes: number; icon: IconName; status: LessonStatus };
export type Unit = { id: string; index: number; title: string; description: string; lessons: Lesson[] };

export const learnerStats = { streakDays: 4, xp: 340, dailyGoalXp: 50, todayXp: 30, lessonsDone: 12, accuracy: 0.92, badges: 3 };

export const units: Unit[] = [
  {
    id: 'u1',
    index: 1,
    title: 'Budgeting basics',
    description: 'Know where every rupee goes.',
    lessons: [
      { id: 'l1', title: 'What is a budget?', summary: 'Income, expenses and the gap between them.', xp: 20, minutes: 3, icon: 'wallet', status: 'done' },
      { id: 'l2', title: 'Needs vs wants', summary: 'Sort spending so cuts hurt less.', xp: 20, minutes: 4, icon: 'cart', status: 'done' },
      { id: 'l3', title: 'The 50/30/20 rule', summary: 'A simple split for any salary.', xp: 30, minutes: 5, icon: 'pie-chart', status: 'current' },
      { id: 'l4', title: 'Tracking expenses', summary: 'Build the habit in 2 minutes a day.', xp: 30, minutes: 4, icon: 'receipt', status: 'locked' },
      { id: 'l5', title: 'Unit checkpoint', summary: 'Prove it — 8 quick questions.', xp: 50, minutes: 6, icon: 'trophy', status: 'locked' },
    ],
  },
  {
    id: 'u2',
    index: 2,
    title: 'Saving & emergency funds',
    description: 'Build a cushion for life’s surprises.',
    lessons: [
      { id: 'l6', title: 'Why save first', summary: 'Pay yourself before anyone else.', xp: 20, minutes: 3, icon: 'shield-checkmark', status: 'locked' },
      { id: 'l7', title: 'Emergency fund size', summary: '3–6 months, and how to get there.', xp: 30, minutes: 5, icon: 'umbrella', status: 'locked' },
      { id: 'l8', title: 'Where to keep it', summary: 'Savings accounts vs liquid funds.', xp: 30, minutes: 5, icon: 'business', status: 'locked' },
    ],
  },
];
