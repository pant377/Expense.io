import { Timestamp } from 'firebase/firestore';

import { Expense } from '../expenses/expense.model';
import {
  SpendingLimits,
  buildSpendingLimitSummary,
} from './spending-limit.model';

function expense(
  id: string,
  amountCents: number,
  date: string,
  transactionType: Expense['transactionType'] = 'expense',
): Expense {
  const timestamp = Timestamp.fromDate(new Date(`${date}T12:00:00`));

  return {
    id,
    amountCents,
    category: 'Food',
    transactionType,
    paymentMethod: 'card',
    description: id,
    occurredAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe('spending limits', () => {
  const limits: SpendingLimits = {
    dailyLimitCents: 2000,
    monthlyLimitCents: 10000,
    excludeIncome: true,
    emailAlertsEnabled: false,
    alertThresholds: [],
  };

  it('calculates daily and monthly usage for the current periods', () => {
    const summary = buildSpendingLimitSummary(
      [
        expense('today', 2500, '2026-06-13'),
        expense('same-month', 3000, '2026-06-02'),
        expense('previous-month', 9000, '2026-05-31'),
      ],
      limits,
      new Date('2026-06-13T18:00:00'),
    );

    expect(summary.daily?.spentCents).toBe(2500);
    expect(summary.daily?.exceededByCents).toBe(500);
    expect(summary.daily?.exceededPercent).toBe(25);
    expect(summary.monthly?.spentCents).toBe(5500);
    expect(summary.monthly?.remainingCents).toBe(4500);
    expect(summary.monthly?.usedPercent).toBe(55);
  });

  it('returns no status when a limit is disabled', () => {
    const summary = buildSpendingLimitSummary(
      [expense('today', 2500, '2026-06-13')],
      {
        dailyLimitCents: null,
        monthlyLimitCents: null,
        excludeIncome: true,
        emailAlertsEnabled: false,
        alertThresholds: [],
      },
      new Date('2026-06-13T18:00:00'),
    );

    expect(summary.daily).toBeNull();
    expect(summary.monthly).toBeNull();
  });

  it('does not mark spending equal to the limit as exceeded', () => {
    const summary = buildSpendingLimitSummary(
      [expense('today', 2000, '2026-06-13')],
      limits,
      new Date('2026-06-13T18:00:00'),
    );

    expect(summary.daily?.isExceeded).toBeFalse();
    expect(summary.daily?.remainingCents).toBe(0);
    expect(summary.daily?.usedPercent).toBe(100);
  });

  it('keeps a decimal for small limit overruns', () => {
    const summary = buildSpendingLimitSummary(
      [expense('today', 2001, '2026-06-13')],
      limits,
      new Date('2026-06-13T18:00:00'),
    );

    expect(summary.daily?.exceededPercent).toBe(0.1);
  });

  it('does not count income toward spending limits', () => {
    const summary = buildSpendingLimitSummary(
      [
        expense('expense', 1000, '2026-06-13'),
        expense('income', 100000, '2026-06-13', 'income'),
      ],
      limits,
      new Date('2026-06-13T18:00:00'),
    );

    expect(summary.daily?.spentCents).toBe(1000);
    expect(summary.monthly?.spentCents).toBe(1000);
  });

  it('uses income to offset spending when exclusion is disabled', () => {
    const summary = buildSpendingLimitSummary(
      [
        expense('expense', 3000, '2026-06-13'),
        expense('income', 1250, '2026-06-13', 'income'),
      ],
      { ...limits, excludeIncome: false },
      new Date('2026-06-13T18:00:00'),
    );

    expect(summary.daily?.spentCents).toBe(1750);
    expect(summary.monthly?.spentCents).toBe(1750);
  });

  it('never reports negative net spending when income exceeds expenses', () => {
    const summary = buildSpendingLimitSummary(
      [
        expense('expense', 1000, '2026-06-13'),
        expense('income', 5000, '2026-06-13', 'income'),
      ],
      { ...limits, excludeIncome: false },
      new Date('2026-06-13T18:00:00'),
    );

    expect(summary.daily?.spentCents).toBe(0);
    expect(summary.monthly?.spentCents).toBe(0);
  });
});
