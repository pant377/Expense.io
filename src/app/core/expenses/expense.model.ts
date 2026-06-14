import { Timestamp } from 'firebase/firestore';

export const EXPENSE_CATEGORIES = [
  'Food',
  'Transport',
  'Vehicle',
  'Home',
  'Health',
  'Leisure',
  'Subscriptions',
  'FinancialExpenses',
  'Investments',
  'Gift',
  'Other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const TRANSACTION_TYPES = ['expense', 'income'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const PAYMENT_METHODS = ['cash', 'card', 'bankTransfer'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface Expense {
  id: string;
  description: string;
  amountCents: number;
  category: ExpenseCategory;
  transactionType: TransactionType;
  paymentMethod: PaymentMethod | null;
  occurredAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ExpenseDraft {
  description: string;
  amountCents: number;
  category: ExpenseCategory;
  transactionType: TransactionType;
  paymentMethod: PaymentMethod;
  occurredAt: Timestamp;
}

export function normalizeExpense(
  id: string,
  data: Record<string, unknown>,
): Expense {
  return {
    ...(data as unknown as Omit<
      Expense,
      'id' | 'transactionType' | 'paymentMethod'
    >),
    id,
    transactionType: data['transactionType'] === 'income' ? 'income' : 'expense',
    paymentMethod: isPaymentMethod(data['paymentMethod'])
      ? data['paymentMethod']
      : null,
  };
}

export function isExpenseTransaction(expense: Expense): boolean {
  return expense.transactionType === 'expense';
}

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return PAYMENT_METHODS.some((method) => method === value);
}

export function eurosToCents(value: number | string): number {
  const amount = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Expense amount must be greater than zero.');
  }

  return Math.round((amount + Number.EPSILON) * 100);
}
