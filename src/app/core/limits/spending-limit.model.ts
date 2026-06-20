import { Expense } from '../expenses/expense.model';

export interface SpendingLimits {
  showOnDashboard: boolean;
  dailyLimitCents: number | null;
  monthlyLimitCents: number | null;
  excludeIncome: boolean;
  emailAlertsEnabled: boolean;
  alertThresholds: number[];
  baseCurrency: string;
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
  showOnDashboard: false,
  dailyLimitCents: null,
  monthlyLimitCents: null,
  excludeIncome: true,
  emailAlertsEnabled: false,
  alertThresholds: [],
  baseCurrency: 'EUR',
};

export function convertCurrency(
  amountCents: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number>,
): number {
  const from = fromCurrency || 'EUR';
  const to = toCurrency || 'EUR';
  if (from === to) {
    return amountCents;
  }
  const rateFrom = rates[from] || 1;
  const rateTo = rates[to] || 1;
  // Convert fromCurrency to EUR, then EUR to toCurrency
  const amountInEur = amountCents / rateFrom;
  return Math.round(amountInEur * rateTo);
}

export function buildSpendingLimitSummary(
  expenses: Expense[],
  limits: SpendingLimits,
  rates: Record<string, number> = { EUR: 1.0 },
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

    const txCurrency = transaction.currency || 'EUR';
    const amountInBase = convertCurrency(
      transaction.amountCents,
      txCurrency,
      limits.baseCurrency || 'EUR',
      rates,
    );

    const signedAmount =
      transaction.transactionType === 'expense'
        ? amountInBase
        : limits.excludeIncome
          ? 0
          : -amountInBase;

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
