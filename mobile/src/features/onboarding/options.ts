/**
 * Onboarding questions + how each answer personalises the app.
 * Keep LEVELS/GOALS in sync with backend/database/models/user.js.
 */
import type { Goal, Level } from '@/api/types';
import type { IconName } from '@/components/ui';

export type MoneyFocus = 'budget' | 'savings' | 'debt' | 'invest' | 'tip';

export const LEVEL_OPTIONS: { value: Level; label: string; description: string; icon: IconName }[] = [
  { value: 'beginner', label: 'Beginner', description: 'I’m just starting to manage my money.', icon: 'leaf-outline' },
  { value: 'intermediate', label: 'Intermediate', description: 'I budget and save, and want to level up.', icon: 'trending-up-outline' },
  { value: 'advanced', label: 'Advanced', description: 'I invest and want deeper, sharper insights.', icon: 'rocket-outline' },
];

export type GoalPlan = {
  value: Goal;
  label: string;
  description: string;
  icon: IconName;
  /** One-liner shown on the plan summary and dashboards. */
  headline: string;
  /** What the personalised dashboard will emphasise (onboarding summary). */
  planPoints: string[];
  /** Learn: which unit to recommend first (features/learn/sampleData.ts ids). */
  learnUnitId: string;
  /** Money: which focus card to show at the top. */
  moneyFocus: MoneyFocus;
  /** Ask AI: starter prompts. */
  aiSuggestions: { icon: IconName; text: string }[];
};

export const GOAL_OPTIONS: GoalPlan[] = [
  {
    value: 'budgeting',
    label: 'Control my spending',
    description: 'See where money goes and stick to a budget.',
    icon: 'pie-chart-outline',
    headline: 'Spend with a plan',
    planPoints: ['A monthly budget front and centre', 'Lessons on budgeting methods', 'Alerts before you overspend'],
    learnUnitId: 'u1',
    moneyFocus: 'budget',
    aiSuggestions: [
      { icon: 'pie-chart-outline', text: 'Help me build a monthly budget' },
      { icon: 'cut-outline', text: 'Where can I cut spending without feeling it?' },
      { icon: 'calculator-outline', text: 'Explain the 50/30/20 rule with my salary' },
      { icon: 'repeat-outline', text: 'How do I track expenses consistently?' },
    ],
  },
  {
    value: 'saving',
    label: 'Build my savings',
    description: 'Create an emergency fund and save for goals.',
    icon: 'shield-checkmark-outline',
    headline: 'Build your safety net',
    planPoints: ['Emergency-fund tracker on your dashboard', 'Lessons on saving habits', 'Nudges to save first'],
    learnUnitId: 'u2',
    moneyFocus: 'savings',
    aiSuggestions: [
      { icon: 'umbrella-outline', text: 'How big should my emergency fund be?' },
      { icon: 'business-outline', text: 'Where should I keep my savings?' },
      { icon: 'flag-outline', text: 'Plan to save ₹1 lakh in 12 months' },
      { icon: 'sync-outline', text: 'How do I automate my savings?' },
    ],
  },
  {
    value: 'debt',
    label: 'Pay off debt',
    description: 'Clear loans and credit cards faster.',
    icon: 'card-outline',
    headline: 'Become debt-free',
    planPoints: ['Debt payoff progress on your dashboard', 'Lessons on interest and credit', 'Payoff strategies from the AI'],
    learnUnitId: 'u3',
    moneyFocus: 'debt',
    aiSuggestions: [
      { icon: 'card-outline', text: 'How do I pay off credit card debt fast?' },
      { icon: 'git-compare-outline', text: 'Snowball vs avalanche — which is better?' },
      { icon: 'stats-chart-outline', text: 'How does my credit score work?' },
      { icon: 'swap-vertical-outline', text: 'Should I consolidate my loans?' },
    ],
  },
  {
    value: 'investing',
    label: 'Start investing',
    description: 'Grow wealth with SIPs, funds and stocks.',
    icon: 'trending-up-outline',
    headline: 'Grow your wealth',
    planPoints: ['Investment snapshot on your dashboard', 'Investing 101 lessons first', 'Portfolio questions for the AI'],
    learnUnitId: 'u4',
    moneyFocus: 'invest',
    aiSuggestions: [
      { icon: 'trending-up-outline', text: 'Explain SIPs like I’m new to investing' },
      { icon: 'layers-outline', text: 'Index funds vs active funds?' },
      { icon: 'time-outline', text: 'How much should I invest each month?' },
      { icon: 'shield-outline', text: 'How do I think about investment risk?' },
    ],
  },
  {
    value: 'learning',
    label: 'Just learn the basics',
    description: 'Understand money, no pressure.',
    icon: 'school-outline',
    headline: 'Master the fundamentals',
    planPoints: ['A guided lesson path from day one', 'Daily money tips', 'Ask anything, no judgement'],
    learnUnitId: 'u1',
    moneyFocus: 'tip',
    aiSuggestions: [
      { icon: 'school-outline', text: 'What are the money basics everyone should know?' },
      { icon: 'cash-outline', text: 'How does inflation affect my savings?' },
      { icon: 'document-text-outline', text: 'Explain how taxes on salary work' },
      { icon: 'bulb-outline', text: 'Give me one money habit to start today' },
    ],
  },
];

export const levelOption = (level: Level | null | undefined) =>
  LEVEL_OPTIONS.find((l) => l.value === level) ?? LEVEL_OPTIONS[0];

export const goalPlan = (goal: Goal | null | undefined) => GOAL_OPTIONS.find((g) => g.value === goal) ?? GOAL_OPTIONS[4];
