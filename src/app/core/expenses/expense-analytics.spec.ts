import { Timestamp } from 'firebase/firestore';

import { Expense } from './expense.model';
import {
  availableTransactionYears,
  buildExpenseAnalytics,
} from './expense-analytics';

function expense(
  id: string,
  amountCents: number,
  category: Expense['category'],
  date: string,
): Expense {
  const timestamp = Timestamp.fromDate(new Date(`${date}T12:00:00`));

  return {
    id,
    amountCents,
    category,
    transactionType: 'expense',
    paymentMethod: 'card',
    description: id,
    occurredAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe('expense analytics', () => {
  const expenses = [
    expense('food-one', 1200, 'Food', '2026-06-02'),
    expense('food-two', 800, 'Food', '2026-06-15'),
    expense('home', 3000, 'Home', '2026-05-10'),
    expense('transport', 1500, 'Transport', '2025-06-10'),
    {
      ...expense('salary', 250000, 'FinancialExpenses', '2024-06-10'),
      transactionType: 'income' as const,
      paymentMethod: 'bankTransfer' as const,
    },
  ];

  it('builds monthly totals, comparison and category breakdown', () => {
    const analytics = buildExpenseAnalytics(expenses, {
      mode: 'month',
      year: 2026,
      month: 5,
      category: 'All',
      transactionType: 'expense',
    });

    expect(analytics.totalCents).toBe(2000);
    expect(analytics.previousTotalCents).toBe(3000);
    expect(analytics.changePercent).toBe(-33);
    expect(analytics.count).toBe(2);
    expect(analytics.topCategory).toBe('Food');
    expect(analytics.points[1].amountCents).toBe(1200);
    expect(analytics.points[14].amountCents).toBe(800);
  });

  it('builds yearly points and respects category filters', () => {
    const analytics = buildExpenseAnalytics(expenses, {
      mode: 'year',
      year: 2026,
      month: 0,
      category: 'Home',
      transactionType: 'expense',
    });

    expect(analytics.totalCents).toBe(3000);
    expect(analytics.count).toBe(1);
    expect(analytics.points[4].amountCents).toBe(3000);
    expect(analytics.points[5].amountCents).toBe(0);
  });

  it('returns sorted available years including the current year', () => {
    expect(availableTransactionYears(expenses, 'expense', 2026)).toEqual([
      2026,
      2025,
    ]);
    expect(availableTransactionYears(expenses, 'income', 2026)).toEqual([
      2026,
      2024,
    ]);
  });

  it('builds income analytics without mixing in expenses', () => {
    const analytics = buildExpenseAnalytics(expenses, {
      mode: 'year',
      year: 2024,
      month: 0,
      category: 'All',
      transactionType: 'income',
    });

    expect(analytics.totalCents).toBe(250000);
    expect(analytics.count).toBe(1);
    expect(analytics.averageCents).toBe(250000);
    expect(analytics.topCategory).toBe('FinancialExpenses');
    expect(analytics.points[5].amountCents).toBe(250000);
  });

  it('keeps income out of expense analytics', () => {
    const analytics = buildExpenseAnalytics(expenses, {
      mode: 'year',
      year: 2024,
      month: 0,
      category: 'All',
      transactionType: 'expense',
    });

    expect(analytics.totalCents).toBe(0);
    expect(analytics.count).toBe(0);
    expect(analytics.categories).toEqual([]);
  });

  it('localizes analytics labels in Greek', () => {
    const analytics = buildExpenseAnalytics(
      expenses,
      {
        mode: 'month',
        year: 2026,
        month: 5,
        category: 'All',
        transactionType: 'expense',
      },
      'el-GR',
    );

    expect(analytics.periodLabel).toContain('Ιούνιος');
    expect(analytics.chartLabel).toBe('Ημερήσια έξοδα');
  });

  it('uses income-specific chart labels', () => {
    const analytics = buildExpenseAnalytics(
      expenses,
      {
        mode: 'year',
        year: 2024,
        month: 0,
        category: 'All',
        transactionType: 'income',
      },
      'el-GR',
    );

    expect(analytics.chartLabel).toBe('Μηνιαία έσοδα');
  });
});
