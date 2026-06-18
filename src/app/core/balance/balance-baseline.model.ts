import { Expense } from '../expenses/expense.model';
import { convertCurrency } from '../limits/spending-limit.model';

export type BalanceBaselineSource = 'manual' | 'statement';
export type BalanceInstitution = 'alpha' | 'eurobank' | 'piraeus' | 'unknown';

export interface BalanceBaseline {
  amountCents: number | null;
  currency: string;
  effectiveDate: string;
  source: BalanceBaselineSource;
  institution: BalanceInstitution | null;
}

export const EMPTY_BALANCE_BASELINE: BalanceBaseline = {
  amountCents: null,
  currency: 'EUR',
  effectiveDate: '',
  source: 'manual',
  institution: null,
};

export function buildEstimatedBalanceCents(
  expenses: Expense[],
  baseline: BalanceBaseline,
  rates: Record<string, number> = { EUR: 1 },
): number | null {
  if (baseline.amountCents === null || !isDateKey(baseline.effectiveDate)) {
    return null;
  }

  return expenses.reduce((balanceCents, expense) => {
    const occurredOn = timestampDateKey(expense.occurredAt.toDate());

    if (!occurredOn || occurredOn <= baseline.effectiveDate) {
      return balanceCents;
    }

    const amountCents = convertCurrency(
      expense.amountCents,
      expense.currency,
      baseline.currency,
      rates,
    );

    return expense.transactionType === 'income'
      ? balanceCents + amountCents
      : balanceCents - amountCents;
  }, baseline.amountCents);
}

export function amountToSignedCents(value: number | string): number {
  const amount = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(amount) || Math.abs(amount) > 1_000_000_000) {
    throw new Error('Balance amount is outside the supported range.');
  }

  return Math.round((amount + Math.sign(amount) * Number.EPSILON) * 100);
}

function timestampDateKey(date: Date): string | null {
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value);
}
