/**
 * PLACEHOLDER data for the Money tab until `/finance/*` endpoints exist (docs/ROADMAP.md → Money).
 * Amounts are integers in minor units (paise), negative = expense.
 */
import type { IconName } from '@/components/ui';

export type CategoryId = 'food' | 'groceries' | 'transport' | 'shopping' | 'bills' | 'fun' | 'health' | 'salary' | 'freelance' | 'other';
export type Category = { id: CategoryId; label: string; icon: IconName; color: string; soft: string; kind: 'expense' | 'income' };
export type Transaction = { id: string; title: string; category: CategoryId; amount: number; date: string };
export type Period = 'week' | 'month' | 'year';

export const categories: Record<CategoryId, Category> = {
  food: { id: 'food', label: 'Food & dining', icon: 'restaurant', color: '#E0791B', soft: '#FDF0E3', kind: 'expense' },
  groceries: { id: 'groceries', label: 'Groceries', icon: 'basket', color: '#2E9D62', soft: '#E3F5EA', kind: 'expense' },
  transport: { id: 'transport', label: 'Transport', icon: 'car', color: '#3B6FD8', soft: '#E6EDFB', kind: 'expense' },
  shopping: { id: 'shopping', label: 'Shopping', icon: 'bag-handle', color: '#C2417A', soft: '#FBE7F0', kind: 'expense' },
  bills: { id: 'bills', label: 'Bills', icon: 'flash', color: '#7A5AF8', soft: '#EFEBFE', kind: 'expense' },
  fun: { id: 'fun', label: 'Entertainment', icon: 'film', color: '#D946EF', soft: '#FBE8FD', kind: 'expense' },
  health: { id: 'health', label: 'Health', icon: 'heart', color: '#E5484D', soft: '#FDECEC', kind: 'expense' },
  other: { id: 'other', label: 'Other', icon: 'ellipsis-horizontal', color: '#6C736E', soft: '#ECEEE7', kind: 'expense' },
  salary: { id: 'salary', label: 'Salary', icon: 'briefcase', color: '#0F3B2E', soft: '#EDF9D0', kind: 'income' },
  freelance: { id: 'freelance', label: 'Freelance', icon: 'laptop', color: '#0F3B2E', soft: '#EDF9D0', kind: 'income' },
};

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

export const openingBalance = 11_842_060; // ₹1,18,420.60

export const sampleTransactions: Transaction[] = [
  { id: 't1', title: 'Swiggy', category: 'food', amount: -48_900, date: hoursAgo(2) },
  { id: 't2', title: 'Metro card top-up', category: 'transport', amount: -50_000, date: hoursAgo(6) },
  { id: 't3', title: 'Salary — Acme Corp', category: 'salary', amount: 8_500_000, date: hoursAgo(28) },
  { id: 't4', title: 'BigBasket', category: 'groceries', amount: -236_450, date: hoursAgo(30) },
  { id: 't5', title: 'Netflix', category: 'fun', amount: -64_900, date: hoursAgo(52) },
  { id: 't6', title: 'Electricity bill', category: 'bills', amount: -182_000, date: hoursAgo(75) },
  { id: 't7', title: 'Logo design gig', category: 'freelance', amount: 1_200_000, date: hoursAgo(98) },
];

export const spending: Record<Period, { label: string; value: number }[]> = {
  week: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, i) => ({
    label,
    value: [84_000, 132_000, 56_000, 210_500, 98_000, 305_000, 142_000][i],
  })),
  month: ['W1', 'W2', 'W3', 'W4'].map((label, i) => ({ label, value: [912_000, 1_284_000, 760_500, 1_031_000][i] })),
  year: ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'].map((label, i) => ({
    label,
    value: [3_820_000, 3_410_000, 4_020_000, 3_650_000, 4_480_000, 3_990_000, 3_720_000, 4_150_000, 2_840_000, 0, 0, 0][i],
  })),
};

export const summary = { spent: 3_987_500, saved: 2_500_000, invested: 1_500_000, budgetLeft: 1_012_500, changePct: 2.4 };

export const budgets = [
  { category: 'food' as const, spent: 612_000, limit: 800_000 },
  { category: 'groceries' as const, spent: 918_000, limit: 1_000_000 },
  { category: 'shopping' as const, spent: 245_000, limit: 600_000 },
];
