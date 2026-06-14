import { Timestamp } from 'firebase/firestore';

import {
  dateKey,
  nextOccurrenceOnOrAfter,
  nextRecurringDate,
  normalizeRecurringExpenseSchedule,
} from './recurring-expense.model';

describe('recurring expense dates', () => {
  it('advances weekly schedules by seven calendar days', () => {
    const next = nextRecurringDate(new Date(2026, 5, 13, 12), 'weekly');

    expect(dateKey(next)).toBe('2026-06-20');
  });

  it('clamps month-end schedules while preserving the anchor day', () => {
    const january = new Date(2026, 0, 31, 12);
    const february = nextRecurringDate(january, 'monthly', 31);
    const march = nextRecurringDate(february, 'monthly', 31);

    expect(dateKey(february)).toBe('2026-02-28');
    expect(dateKey(march)).toBe('2026-03-31');
  });

  it('finds the next occurrence on or after a target date', () => {
    const next = nextOccurrenceOnOrAfter(
      new Date(2026, 0, 31, 12),
      new Date(2026, 2, 1, 12),
      'monthly',
    );

    expect(dateKey(next)).toBe('2026-03-31');
  });

  it('normalizes legacy schedules without inventing transaction data', () => {
    const timestamp = Timestamp.fromDate(new Date(2026, 5, 13, 12));
    const schedule = normalizeRecurringExpenseSchedule('legacy', {
      description: 'Legacy schedule',
      amountCents: 1000,
      category: 'Food',
      frequency: 'monthly',
      startDate: timestamp,
      nextOccurrenceAt: timestamp,
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    expect(schedule.transactionType).toBe('expense');
    expect(schedule.paymentMethod).toBeNull();
  });
});
