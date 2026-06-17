import { Timestamp } from 'firebase/firestore';

import {
  BalanceBaseline,
  amountToSignedCents,
  buildEstimatedBalanceCents,
} from './balance-baseline.model';
import { Expense } from '../expenses/expense.model';

describe('balance baseline', () => {
  const baseline: BalanceBaseline = {
    amountCents: 100000,
    currency: 'EUR',
    effectiveDate: '2026-06-10',
    source: 'manual',
    institution: null,
  };

  it('adds income and subtracts expenses after the baseline date', () => {
    expect(
      buildEstimatedBalanceCents(
        [
          expense('before', 2000, 'expense', '2026-06-10'),
          expense('income', 5000, 'income', '2026-06-11'),
          expense('expense', 1250, 'expense', '2026-06-12'),
        ],
        baseline,
      ),
    ).toBe(103750);
  });

  it('returns null when no baseline amount is saved', () => {
    expect(
      buildEstimatedBalanceCents([], {
        ...baseline,
        amountCents: null,
      }),
    ).toBeNull();
  });

  it('rounds signed decimal balances to integer cents', () => {
    expect(amountToSignedCents('123.45')).toBe(12345);
    expect(amountToSignedCents('-12.34')).toBe(-1234);
    expect(amountToSignedCents(0)).toBe(0);
  });
});

function expense(
  id: string,
  amountCents: number,
  transactionType: Expense['transactionType'],
  occurredOn: string,
): Expense {
  return {
    id,
    description: id,
    amountCents,
    category: 'Other',
    transactionType,
    paymentMethod: 'card',
    currency: 'EUR',
    photoStoragePath: null,
    photoFileName: null,
    photoContentType: null,
    occurredAt: Timestamp.fromDate(new Date(`${occurredOn}T12:00:00`)),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
}
