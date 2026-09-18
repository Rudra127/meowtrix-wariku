/**
 * Presentation for every transaction category: label, icon, colour.
 *
 * The ids here MUST match backend/database/models/categories.js exactly — the backend validates
 * against its list, so an id that exists only here would be rejected on save.
 *
 * Amounts everywhere are integers in MINOR units (paise/cents) and `Transaction.amount` is always
 * positive; `type` carries the direction. Use `signedAmount()` before displaying.
 */
import type { IconName } from '@/components/ui';
import type { CategoryId, ExpenseCategory, IncomeCategory, TransactionType } from '@/api/types';

export type CategoryMeta = {
  id: CategoryId;
  label: string;
  icon: IconName;
  /** Icon colour. */
  color: string;
  /** Icon background. */
  soft: string;
  kind: TransactionType;
};

const expense = (id: ExpenseCategory, label: string, icon: IconName, color: string, soft: string): CategoryMeta => ({
  id,
  label,
  icon,
  color,
  soft,
  kind: 'expense',
});

const income = (id: IncomeCategory, label: string, icon: IconName): CategoryMeta => ({
  id,
  label,
  icon,
  color: '#0F3B2E',
  soft: '#EDF9D0',
  kind: 'income',
});

export const CATEGORIES: Record<CategoryId, CategoryMeta> = {
  // Expenses
  food: expense('food', 'Food & dining', 'restaurant', '#E0791B', '#FDF0E3'),
  groceries: expense('groceries', 'Groceries', 'basket', '#2E9D62', '#E3F5EA'),
  transport: expense('transport', 'Transport', 'car', '#3B6FD8', '#E6EDFB'),
  shopping: expense('shopping', 'Shopping', 'bag-handle', '#C2417A', '#FBE7F0'),
  bills: expense('bills', 'Bills', 'flash', '#7A5AF8', '#EFEBFE'),
  rent: expense('rent', 'Rent', 'home', '#8B5CF6', '#F0EAFE'),
  emi: expense('emi', 'Loan / EMI', 'card', '#DB2777', '#FCE7F3'),
  health: expense('health', 'Health', 'heart', '#E5484D', '#FDECEC'),
  education: expense('education', 'Education', 'school', '#0891B2', '#E0F2FE'),
  travel: expense('travel', 'Travel', 'airplane', '#0D9488', '#DFF5F2'),
  fun: expense('fun', 'Entertainment', 'film', '#D946EF', '#FBE8FD'),
  gifts: expense('gifts', 'Gifts & donations', 'gift', '#F43F5E', '#FEE7EB'),
  investment: expense('investment', 'Investments', 'trending-up', '#059669', '#DCFCE7'),
  savings: expense('savings', 'Savings', 'shield-checkmark', '#2563EB', '#E4EDFD'),
  other: expense('other', 'Other', 'ellipsis-horizontal', '#6C736E', '#ECEEE7'),

  // Income
  salary: income('salary', 'Salary', 'briefcase'),
  freelance: income('freelance', 'Freelance', 'laptop'),
  business: income('business', 'Business', 'storefront'),
  interest: income('interest', 'Interest & dividends', 'cash'),
  refund: income('refund', 'Refund / cashback', 'return-down-back'),
  gift_received: income('gift_received', 'Gift received', 'gift'),
  other_income: income('other_income', 'Other income', 'add-circle'),
};

/** Safe lookup — an unknown id (older app, new backend category) falls back rather than crashing. */
export const categoryMeta = (id: string | undefined, type: TransactionType = 'expense'): CategoryMeta =>
  CATEGORIES[id as CategoryId] ?? CATEGORIES[type === 'income' ? 'other_income' : 'other'];

export const EXPENSE_OPTIONS = Object.values(CATEGORIES).filter((c) => c.kind === 'expense');
export const INCOME_OPTIONS = Object.values(CATEGORIES).filter((c) => c.kind === 'income');

export const categoryOptions = (type: TransactionType) => (type === 'income' ? INCOME_OPTIONS : EXPENSE_OPTIONS);

/** The default selection when switching income ↔ expense. */
export const defaultCategory = (type: TransactionType): CategoryId => (type === 'income' ? 'salary' : 'food');

/**
 * Display sign. The API stores `amount` positive with a separate `type`; the UI wants
 * −₹489 for an expense and +₹85,000 for income.
 */
export const signedAmount = (tx: { type: TransactionType; amount: number }) =>
  tx.type === 'expense' ? -tx.amount : tx.amount;

/** Badge text for entries the user didn't type by hand. */
export const SOURCE_LABELS: Record<string, { label: string; icon: IconName } | undefined> = {
  voice: { label: 'Added by voice', icon: 'mic' },
  chat: { label: 'Added by AI', icon: 'sparkles' },
  import: { label: 'Imported', icon: 'download' },
};
