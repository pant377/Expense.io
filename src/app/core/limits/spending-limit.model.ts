import { Expense } from '../expenses/expense.model';

export interface SpendingLimits {
  dailyLimitCents: number | null;
  monthlyLimitCents: number | null;
  excludeIncome: boolean;
  emailAlertsEnabled: boolean;
  alertThresholds: number[];
}

export interface SpendingLimitStatus {
  limitCents: number;
  spentCents: number;
  remainingCents: number;
  exceededByCents: number;
  usedPercent: number;
  exceededPercent: number;
  isExceeded: boolean;
}

export interface SpendingLimitSummary {
  daily: SpendingLimitStatus | null;
  monthly: SpendingLimitStatus | null;
}

export const EMPTY_SPENDING_LIMITS: SpendingLimits = {
  dailyLimitCents: null,
  monthlyLimitCents: null,
  excludeIncome: true,
  emailAlertsEnabled: false,
  alertThresholds: [],
};

export function buildSpendingLimitSummary(
  expenses: Expense[],
  limits: SpendingLimits,
  now = new Date(),
): SpendingLimitSummary {
  let dailySpentCents = 0;
  let monthlySpentCents = 0;

  expenses.forEach((transaction) => {
    const occurredAt = transaction.occurredAt.toDate();
    const isCurrentMonth =
      occurredAt.getFullYear() === now.getFullYear() &&
      occurredAt.getMonth() === now.getMonth();

    if (!isCurrentMonth) {
      return;
    }

    const signedAmount =
      transaction.transactionType === 'expense'
        ? transaction.amountCents
        : limits.excludeIncome
          ? 0
          : -transaction.amountCents;

    monthlySpentCents += signedAmount;

    if (occurredAt.getDate() === now.getDate()) {
      dailySpentCents += signedAmount;
    }
  });

  return {
    daily: buildLimitStatus(Math.max(dailySpentCents, 0), limits.dailyLimitCents),
    monthly: buildLimitStatus(
      Math.max(monthlySpentCents, 0),
      limits.monthlyLimitCents,
    ),
  };
}

function buildLimitStatus(
  spentCents: number,
  limitCents: number | null,
): SpendingLimitStatus | null {
  if (limitCents === null || limitCents <= 0) {
    return null;
  }

  const differenceCents = spentCents - limitCents;
  const exceededByCents = Math.max(differenceCents, 0);

  return {
    limitCents,
    spentCents,
    remainingCents: Math.max(-differenceCents, 0),
    exceededByCents,
    usedPercent: Math.round((spentCents / limitCents) * 100),
    exceededPercent: roundToSingleDecimal(
      (exceededByCents / limitCents) * 100,
    ),
    isExceeded: exceededByCents > 0,
  };
}

function roundToSingleDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}
