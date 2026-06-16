import { Timestamp } from 'firebase/firestore';

import { buildExpenseCsv } from './expense-export';
import { Expense } from './expense.model';

describe('buildExpenseCsv', () => {
  it('exports transaction metadata and safely escapes spreadsheet values', () => {
    const expense: Expense = {
      id: 'expense-1',
      description: 'Market, "weekly"',
      amountCents: 1234,
      category: 'Food',
      transactionType: 'expense',
      paymentMethod: 'card',
      currency: 'EUR',
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
        transactionType: 'Type',
        paymentMethod: 'Payment method',
        date: 'Date',
        createdAt: 'Created',
      },
      () => 'Food',
      () => 'Expense',
      () => 'Card',
    );

    expect(csv.startsWith('\uFEFF')).toBeTrue();
    expect(csv).toContain('"Market, ""weekly"""');
    expect(csv).toContain('"12.34"');
    expect(csv).toContain('"Food"');
    expect(csv).toContain('"Expense"');
    expect(csv).toContain('"Card"');
    expect(csv).toContain('"2026-06-13"');
  });

  it('neutralizes values that spreadsheet apps could treat as formulas', () => {
    const income: Expense = {
      id: 'income-1',
      description: '=HYPERLINK("https://example.com")',
      amountCents: 100,
      category: 'Other',
      transactionType: 'income',
      paymentMethod: null,
      currency: 'EUR',
      occurredAt: Timestamp.fromDate(new Date(2026, 5, 13, 12)),
      createdAt: Timestamp.fromDate(new Date('2026-06-13T10:00:00Z')),
      updatedAt: Timestamp.fromDate(new Date('2026-06-13T10:00:00Z')),
    };

    const csv = buildExpenseCsv(
      [income],
      {
        description: 'Description',
        amount: 'Amount',
        category: 'Category',
        transactionType: 'Type',
        paymentMethod: 'Payment method',
        date: 'Date',
        createdAt: 'Created',
      },
      () => 'Other',
      () => 'Income',
      () => 'Not specified',
    );

    expect(csv).toContain(`"'=HYPERLINK(""https://example.com"")"`);
    expect(csv).toContain('"Not specified"');
  });
});
