import { Expense } from './expense.model';

export interface ExpenseCsvLabels {
  description: string;
  amount: string;
  category: string;
  transactionType: string;
  paymentMethod: string;
  date: string;
  createdAt: string;
}

export function buildExpenseCsv(
  expenses: Expense[],
  labels: ExpenseCsvLabels,
  categoryLabel: (category: Expense['category']) => string,
  transactionTypeLabel: (type: Expense['transactionType']) => string,
  paymentMethodLabel: (method: Expense['paymentMethod']) => string,
): string {
  const rows = [
    [
      labels.description,
      labels.amount,
      labels.category,
      labels.transactionType,
      labels.paymentMethod,
      labels.date,
      labels.createdAt,
    ],
    ...expenses.map((expense) => [
      expense.description,
      (expense.amountCents / 100).toFixed(2),
      categoryLabel(expense.category),
      transactionTypeLabel(expense.transactionType),
      paymentMethodLabel(expense.paymentMethod),
      localDateKey(expense.occurredAt.toDate()),
      (expense.createdAt?.toDate?.() ?? expense.occurredAt.toDate()).toISOString(),
    ]),
  ];

  return `\uFEFF${rows
    .map((row) => row.map(escapeCsvValue).join(','))
    .join('\r\n')}`;
}

function escapeCsvValue(value: string): string {
  const spreadsheetSafeValue = /^[=+\-@]/.test(value) ? `'${value}` : value;

  return `"${spreadsheetSafeValue.replaceAll('"', '""')}"`;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
