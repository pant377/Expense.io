import { Expense } from '../expenses/expense.model';

export interface SpendingLimits {
  dailyLimitCents: number | null;
  monthlyLimitCents: number | null;
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
};

export function buildSpendingLimitSummary(
  expenses: Expense[],
  limits: SpendingLimits,
  now = new Date(),
): SpendingLimitSummary {
  let dailySpentCents = 0;
  let monthlySpentCents = 0;

  expenses.forEach((expense) => {
    const occurredAt = expense.occurredAt.toDate();
    const isCurrentMonth =
      occurredAt.getFullYear() === now.getFullYear() &&
      occurredAt.getMonth() === now.getMonth();

    if (!isCurrentMonth) {
      return;
    }

    monthlySpentCents += expense.amountCents;

    if (occurredAt.getDate() === now.getDate()) {
      dailySpentCents += expense.amountCents;
    }
  });

  return {
    daily: buildLimitStatus(dailySpentCents, limits.dailyLimitCents),
    monthly: buildLimitStatus(monthlySpentCents, limits.monthlyLimitCents),
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
