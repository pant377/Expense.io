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
    expect(expense.photoStoragePath).toBeNull();
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

  it('preserves complete valid photo metadata', () => {
    const timestamp = Timestamp.fromDate(new Date(2026, 5, 13, 12));
    const expense = normalizeExpense('with-photo', {
      description: 'Groceries',
      amountCents: 4200,
      category: 'Food',
      transactionType: 'expense',
      paymentMethod: 'card',
      photoStoragePath: 'users/user-1/expenses/with-photo/receipt',
      photoFileName: 'receipt.jpg',
      photoContentType: 'image/jpeg',
      occurredAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    expect(expense.photoStoragePath).toBe(
      'users/user-1/expenses/with-photo/receipt',
    );
    expect(expense.photoFileName).toBe('receipt.jpg');
    expect(expense.photoContentType).toBe('image/jpeg');
  });

  it('drops incomplete photo metadata', () => {
    const timestamp = Timestamp.fromDate(new Date(2026, 5, 13, 12));
    const expense = normalizeExpense('invalid-photo', {
      description: 'Groceries',
      amountCents: 4200,
      category: 'Food',
      photoStoragePath: 'users/user-1/expenses/invalid-photo/receipt',
      occurredAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    expect(expense.photoStoragePath).toBeNull();
    expect(expense.photoFileName).toBeNull();
    expect(expense.photoContentType).toBeNull();
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
