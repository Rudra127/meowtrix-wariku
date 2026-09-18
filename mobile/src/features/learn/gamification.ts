/**
 * Client-side game layer on top of the server's learner stats: XP levels, achievements,
 * and copy for feedback moments. Pure functions — safe to use anywhere.
 *
 * Achievements are derived from stats (the backend's `badges` counter isn't awarded yet).
 * If they move server-side later, keep the ids so the UI doesn't change.
 */
import type { LearnerStats } from '@/api/types';
import type { IconName } from '@/components/ui';

// ---- Levels ------------------------------------------------------------------------------

/** XP needed to REACH each level (index = level - 1). Gentle early curve, then +250/level. */
const LEVEL_THRESHOLDS = [0, 50, 120, 220, 350, 520, 740, 1000];

function thresholdFor(level: number) {
  if (level - 1 < LEVEL_THRESHOLDS.length) return LEVEL_THRESHOLDS[level - 1];
  return LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1] + (level - LEVEL_THRESHOLDS.length) * 250;
}

export type LevelInfo = { level: number; title: string; current: number; next: number; progress: number; toNext: number };

const TITLES = ['Rookie', 'Saver', 'Planner', 'Budget Boss', 'Money Mind', 'Wealth Builder', 'Finance Pro', 'Money Master'];

export function levelFromXp(xp: number): LevelInfo {
  let level = 1;
  while (xp >= thresholdFor(level + 1)) level += 1;
  const current = thresholdFor(level);
  const next = thresholdFor(level + 1);
  return {
    level,
    title: TITLES[Math.min(level - 1, TITLES.length - 1)],
    current,
    next,
    progress: (xp - current) / (next - current),
    toNext: next - xp,
  };
}

// ---- Achievements ------------------------------------------------------------------------

export type Achievement = {
  id: string;
  title: string;
  description: string;
  icon: IconName;
  color: string;
  unlocked: boolean;
};

export function getAchievements(stats: LearnerStats): Achievement[] {
  const defs: (Omit<Achievement, 'unlocked'> & { test: (s: LearnerStats) => boolean })[] = [
    { id: 'first-lesson', title: 'First steps', description: 'Complete your first lesson.', icon: 'footsteps', color: '#2E9D62', test: (s) => s.lessonsDone >= 1 },
    { id: 'streak-3', title: 'On fire', description: 'Keep a 3-day streak.', icon: 'flame', color: '#F97316', test: (s) => s.longestStreak >= 3 },
    { id: 'xp-100', title: 'Century', description: 'Earn 100 XP.', icon: 'flash', color: '#E0A100', test: (s) => s.xp >= 100 },
    { id: 'lessons-5', title: 'Bookworm', description: 'Complete 5 lessons.', icon: 'library', color: '#3B6FD8', test: (s) => s.lessonsDone >= 5 },
    { id: 'sharp', title: 'Sharp mind', description: '90% accuracy over 3+ lessons.', icon: 'locate', color: '#7A5AF8', test: (s) => s.lessonsDone >= 3 && s.accuracy >= 0.9 },
    { id: 'streak-7', title: 'Unstoppable', description: 'Keep a 7-day streak.', icon: 'rocket', color: '#E5484D', test: (s) => s.longestStreak >= 7 },
    { id: 'xp-500', title: 'High roller', description: 'Earn 500 XP.', icon: 'diamond', color: '#0F9DB4', test: (s) => s.xp >= 500 },
  ];
  return defs.map(({ test, ...a }) => ({ ...a, unlocked: test(stats) }));
}

/** Achievements unlocked by going from `before` to `after` (for "New badge!" moments). */
export function newlyUnlocked(before: LearnerStats | undefined, after: LearnerStats): Achievement[] {
  if (!before) return [];
  const was = new Set(getAchievements(before).filter((a) => a.unlocked).map((a) => a.id));
  return getAchievements(after).filter((a) => a.unlocked && !was.has(a.id));
}

// ---- Feedback copy -----------------------------------------------------------------------

const PRAISE = ['Nice!', 'Great job!', 'Spot on!', 'Nailed it!', 'Correct!', 'Brilliant!'];
const NUDGE = ['Not quite', 'Close one', 'Almost', 'Good try'];
export const praise = (i: number) => PRAISE[i % PRAISE.length];
export const nudge = (i: number) => NUDGE[i % NUDGE.length];
