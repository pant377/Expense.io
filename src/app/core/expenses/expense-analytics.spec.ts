import { Timestamp } from 'firebase/firestore';

import { Expense } from './expense.model';
import { availableExpenseYears, buildExpenseAnalytics } from './expense-analytics';

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
  ];

  it('builds monthly totals, comparison and category breakdown', () => {
    const analytics = buildExpenseAnalytics(expenses, {
      mode: 'month',
      year: 2026,
      month: 5,
      category: 'All',
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
    });

    expect(analytics.totalCents).toBe(3000);
    expect(analytics.count).toBe(1);
    expect(analytics.points[4].amountCents).toBe(3000);
    expect(analytics.points[5].amountCents).toBe(0);
  });

  it('returns sorted available years including the current year', () => {
    expect(availableExpenseYears(expenses, 2026)).toEqual([2026, 2025]);
  });

  it('localizes analytics labels in Greek', () => {
    const analytics = buildExpenseAnalytics(
      expenses,
      {
        mode: 'month',
        year: 2026,
        month: 5,
        category: 'All',
      },
      'el-GR',
    );

    expect(analytics.periodLabel).toContain('Ιούνιος');
    expect(analytics.chartLabel).toBe('Ημερήσια έξοδα');
  });
});
