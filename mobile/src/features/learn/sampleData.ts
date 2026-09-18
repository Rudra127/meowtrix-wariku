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
  {
    id: 'u3',
    index: 3,
    title: 'Debt & credit',
    description: 'Borrow smart, repay faster.',
    lessons: [
      { id: 'l9', title: 'How interest works', summary: 'Why a 3% monthly rate is 42% a year.', xp: 20, minutes: 4, icon: 'calculator', status: 'locked' },
      { id: 'l10', title: 'Snowball vs avalanche', summary: 'Two proven ways to clear debt.', xp: 30, minutes: 5, icon: 'layers', status: 'locked' },
      { id: 'l11', title: 'Your credit score', summary: 'What moves it, and what doesn’t.', xp: 30, minutes: 5, icon: 'speedometer', status: 'locked' },
    ],
  },
  {
    id: 'u4',
    index: 4,
    title: 'Investing 101',
    description: 'Make your money work for you.',
    lessons: [
      { id: 'l12', title: 'Risk and return', summary: 'The trade-off behind every investment.', xp: 20, minutes: 4, icon: 'pulse', status: 'locked' },
      { id: 'l13', title: 'What is a SIP?', summary: 'Investing a little, every month.', xp: 30, minutes: 5, icon: 'repeat', status: 'locked' },
      { id: 'l14', title: 'Index funds', summary: 'Own the whole market, cheaply.', xp: 30, minutes: 5, icon: 'grid', status: 'locked' },
    ],
  },
];

/**
 * Orders the path for the user's goal: recommended unit first, and exactly one "current" lesson —
 * the first unfinished lesson of the recommended unit. Everything else unfinished is locked.
 */
export function personalizePath(all: Unit[], recommendedUnitId: string): Unit[] {
  const rec = all.find((u) => u.id === recommendedUnitId) ?? all[0];
  const ordered = [rec, ...all.filter((u) => u.id !== rec.id)];
  const currentId = rec.lessons.find((l) => l.status !== 'done')?.id;
  return ordered.map((u) => ({
    ...u,
    lessons: u.lessons.map((l) => ({
      ...l,
      status: l.status === 'done' ? 'done' : l.id === currentId ? 'current' : 'locked',
    })),
  }));
}
