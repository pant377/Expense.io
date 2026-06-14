import { Timestamp } from 'firebase/firestore';

import { eurosToCents, normalizeExpense } from './expense.model';

describe('expense model', () => {
  it('normalizes legacy records without inventing transaction data', () => {
    const timestamp = Timestamp.fromDate(new Date(2026, 5, 13, 12));
    const expense = normalizeExpense('legacy', {
      description: 'Legacy expense',
      amountCents: 1000,
      category: 'Food',
      occurredAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    expect(expense.transactionType).toBe('expense');
    expect(expense.paymentMethod).toBeNull();
  });

  it('preserves valid transaction fields', () => {
    const timestamp = Timestamp.fromDate(new Date(2026, 5, 13, 12));
    const income = normalizeExpense('income', {
      description: 'Salary',
      amountCents: 250000,
      category: 'FinancialExpenses',
      transactionType: 'income',
      paymentMethod: 'bankTransfer',
      occurredAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    expect(income.transactionType).toBe('income');
    expect(income.paymentMethod).toBe('bankTransfer');
  });

  it('converts decimal euro values without floating point drift', () => {
    expect(eurosToCents(12.34)).toBe(1234);
    expect(eurosToCents('0.10')).toBe(10);
  });

  it('rejects invalid amounts', () => {
    expect(() => eurosToCents(0)).toThrow();
    expect(() => eurosToCents('not-a-number')).toThrow();
  });
});
