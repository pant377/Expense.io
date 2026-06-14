import {
  Expense,
  ExpenseCategory,
  PaymentMethod,
  TransactionType,
} from './expense.model';

export type ExpenseListCategory = ExpenseCategory | 'All';
export type ExpenseListTransactionType = TransactionType | 'All';
export type ExpenseListPaymentMethod = PaymentMethod | 'All';

export interface ExpenseListFilters {
  search: string;
  category: ExpenseListCategory;
  transactionType: ExpenseListTransactionType;
  paymentMethod: ExpenseListPaymentMethod;
  dateFrom: string;
  dateTo: string;
}

export const EMPTY_EXPENSE_LIST_FILTERS: ExpenseListFilters = {
  search: '',
  category: 'All',
  transactionType: 'All',
  paymentMethod: 'All',
  dateFrom: '',
  dateTo: '',
};

export function buildExpenseList(
  expenses: Expense[],
  filters: ExpenseListFilters,
): Expense[] {
  const search = normalizeSearch(filters.search);

  return expenses
    .filter((expense) => {
      const occurredOn = localDateKey(expense.occurredAt.toDate());
      const matchesSearch =
        !search || normalizeSearch(expense.description).includes(search);
      const matchesCategory =
        filters.category === 'All' || expense.category === filters.category;
      const matchesTransactionType =
        filters.transactionType === 'All' ||
        expense.transactionType === filters.transactionType;
      const matchesPaymentMethod =
        filters.paymentMethod === 'All' ||
        expense.paymentMethod === filters.paymentMethod;
      const matchesDateFrom = !filters.dateFrom || occurredOn >= filters.dateFrom;
      const matchesDateTo = !filters.dateTo || occurredOn <= filters.dateTo;

      return (
        matchesSearch &&
        matchesCategory &&
        matchesTransactionType &&
        matchesPaymentMethod &&
        matchesDateFrom &&
        matchesDateTo
      );
    })
    .sort((left, right) => {
      const createdDifference = createdAtMillis(right) - createdAtMillis(left);

      return createdDifference || right.id.localeCompare(left.id);
    });
}

export function hasExpenseListFilters(filters: ExpenseListFilters): boolean {
  return Boolean(
      filters.search.trim() ||
      filters.category !== 'All' ||
      filters.transactionType !== 'All' ||
      filters.paymentMethod !== 'All' ||
      filters.dateFrom ||
      filters.dateTo,
  );
}

function createdAtMillis(expense: Expense): number {
  return expense.createdAt?.toMillis?.() ?? expense.occurredAt.toMillis();
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function normalizeSearch(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
