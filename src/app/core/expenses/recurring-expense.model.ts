import { Timestamp } from 'firebase/firestore';

import { ExpenseCategory } from './expense.model';

export const RECURRING_FREQUENCIES = ['weekly', 'monthly'] as const;

export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export interface RecurringExpenseSchedule {
  id: string;
  description: string;
  amountCents: number;
  category: ExpenseCategory;
  frequency: RecurringFrequency;
  startDate: Timestamp;
  nextOccurrenceAt: Timestamp;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface RecurringExpenseDraft {
  description: string;
  amountCents: number;
  category: ExpenseCategory;
  frequency: RecurringFrequency;
  startDate: Timestamp;
}

export function nextRecurringDate(
  current: Date,
  frequency: RecurringFrequency,
  anchorDay = current.getDate(),
): Date {
  if (frequency === 'weekly') {
    const next = atLocalNoon(current);
    next.setDate(next.getDate() + 7);
    return next;
  }

  const nextMonth = new Date(
    current.getFullYear(),
    current.getMonth() + 1,
    1,
    12,
  );
  const lastDay = new Date(
    nextMonth.getFullYear(),
    nextMonth.getMonth() + 1,
    0,
    12,
  ).getDate();

  nextMonth.setDate(Math.min(anchorDay, lastDay));
  return nextMonth;
}

export function nextOccurrenceOnOrAfter(
  startDate: Date,
  targetDate: Date,
  frequency: RecurringFrequency,
): Date {
  let occurrence = atLocalNoon(startDate);
  const target = atLocalNoon(targetDate);
  const anchorDay = occurrence.getDate();

  while (occurrence < target) {
    occurrence = nextRecurringDate(occurrence, frequency, anchorDay);
  }

  return occurrence;
}

export function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function atLocalNoon(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}
