import { Timestamp } from 'firebase/firestore';

import { Expense } from './expense.model';
import {
  EMPTY_EXPENSE_LIST_FILTERS,
  buildExpenseList,
  hasExpenseListFilters,
} from './expense-list';

function expense(
  id: string,
  description: string,
  category: Expense['category'],
  occurredAt: string,
  createdAt: string,
): Expense {
  return {
    id,
    description,
    category,
    amountCents: 1000,
    occurredAt: Timestamp.fromDate(new Date(`${occurredAt}T12:00:00`)),
    createdAt: Timestamp.fromDate(new Date(createdAt)),
    updatedAt: Timestamp.fromDate(new Date(createdAt)),
  };
}

describe('expense list', () => {
  const expenses = [
    expense('older-entry', 'Supermarket', 'Food', '2026-06-12', '2026-06-12T10:00:00Z'),
    expense('new-backdated', 'Dental care', 'Health', '2025-01-10', '2026-06-13T11:00:00Z'),
    expense('middle-entry', 'Café', 'Food', '2026-06-13', '2026-06-13T09:00:00Z'),
  ];

  it('sorts by creation time instead of the expense date', () => {
    expect(
      buildExpenseList(expenses, EMPTY_EXPENSE_LIST_FILTERS).map(({ id }) => id),
    ).toEqual(['new-backdated', 'middle-entry', 'older-entry']);
  });

  it('searches descriptions case-insensitively and without accents', () => {
    expect(
      buildExpenseList(expenses, {
        ...EMPTY_EXPENSE_LIST_FILTERS,
        search: 'CAFE',
      }).map(({ id }) => id),
    ).toEqual(['middle-entry']);
  });

  it('combines category and inclusive expense-date filters', () => {
    expect(
      buildExpenseList(expenses, {
        ...EMPTY_EXPENSE_LIST_FILTERS,
        category: 'Food',
        dateFrom: '2026-06-12',
        dateTo: '2026-06-13',
      }).map(({ id }) => id),
    ).toEqual(['middle-entry', 'older-entry']);
  });

  it('reports whether any filter is active', () => {
    expect(hasExpenseListFilters(EMPTY_EXPENSE_LIST_FILTERS)).toBeFalse();
    expect(
      hasExpenseListFilters({
        ...EMPTY_EXPENSE_LIST_FILTERS,
        category: 'Home',
      }),
    ).toBeTrue();
  });
});
