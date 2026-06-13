import { Timestamp } from 'firebase/firestore';

export const EXPENSE_CATEGORIES = [
  'Food',
  'Transport',
  'Home',
  'Health',
  'Leisure',
  'Subscriptions',
  'Other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface Expense {
  id: string;
  description: string;
  amountCents: number;
  category: ExpenseCategory;
  occurredAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ExpenseDraft {
  description: string;
  amountCents: number;
  category: ExpenseCategory;
  occurredAt: Timestamp;
}

export function eurosToCents(value: number | string): number {
  const amount = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Expense amount must be greater than zero.');
  }

  return Math.round((amount + Number.EPSILON) * 100);
}
