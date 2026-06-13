import { Timestamp } from 'firebase/firestore';

import { buildExpenseCsv } from './expense-export';
import { Expense } from './expense.model';

describe('buildExpenseCsv', () => {
  it('exports localized categories and safely escapes spreadsheet values', () => {
    const expense: Expense = {
      id: 'expense-1',
      description: 'Market, "weekly"',
      amountCents: 1234,
      category: 'Food',
      occurredAt: Timestamp.fromDate(new Date(2026, 5, 13, 12)),
      createdAt: Timestamp.fromDate(new Date('2026-06-13T10:00:00Z')),
      updatedAt: Timestamp.fromDate(new Date('2026-06-13T10:00:00Z')),
    };

    const csv = buildExpenseCsv(
      [expense],
      {
        description: 'Description',
        amount: 'Amount',
        category: 'Category',
        date: 'Date',
        createdAt: 'Created',
      },
      () => 'Τρόφιμα',
    );

    expect(csv.startsWith('\uFEFF')).toBeTrue();
    expect(csv).toContain('"Market, ""weekly"""');
    expect(csv).toContain('"12.34"');
    expect(csv).toContain('"Τρόφιμα"');
    expect(csv).toContain('"2026-06-13"');
  });

  it('neutralizes values that spreadsheet apps could treat as formulas', () => {
    const expense: Expense = {
      id: 'expense-2',
      description: '=HYPERLINK("https://example.com")',
      amountCents: 100,
      category: 'Other',
      occurredAt: Timestamp.fromDate(new Date(2026, 5, 13, 12)),
      createdAt: Timestamp.fromDate(new Date('2026-06-13T10:00:00Z')),
      updatedAt: Timestamp.fromDate(new Date('2026-06-13T10:00:00Z')),
    };

    const csv = buildExpenseCsv(
      [expense],
      {
        description: 'Description',
        amount: 'Amount',
        category: 'Category',
        date: 'Date',
        createdAt: 'Created',
      },
      () => 'Other',
    );

    expect(csv).toContain(`"'=HYPERLINK(""https://example.com"")"`);
  });
});
