import {
  Expense,
  ExpenseCategory,
  isExpenseTransaction,
} from './expense.model';
import { formatMonthName } from '../i18n/date-labels';

export type AnalyticsMode = 'month' | 'year';
export type AnalyticsCategory = ExpenseCategory | 'All';

export interface AnalyticsFilters {
  mode: AnalyticsMode;
  year: number;
  month: number;
  category: AnalyticsCategory;
}

export interface AnalyticsPoint {
  label: string;
  shortLabel: string;
  amountCents: number;
  percentage: number;
}

export interface CategoryBreakdown {
  category: ExpenseCategory;
  amountCents: number;
  count: number;
  percentage: number;
}

export interface ExpenseAnalytics {
  periodLabel: string;
  chartLabel: string;
  totalCents: number;
  previousTotalCents: number;
  changePercent: number | null;
  count: number;
  averageCents: number;
  topCategory: ExpenseCategory | null;
  points: AnalyticsPoint[];
  categories: CategoryBreakdown[];
}

export function availableExpenseYears(expenses: Expense[], currentYear = new Date().getFullYear()): number[] {
  const years = new Set<number>([currentYear]);

  expenses
    .filter(isExpenseTransaction)
    .forEach((expense) => years.add(expense.occurredAt.toDate().getFullYear()));

  return [...years].sort((left, right) => right - left);
}

export function buildExpenseAnalytics(
  expenses: Expense[],
  filters: AnalyticsFilters,
  locale = 'en-GB',
): ExpenseAnalytics {
  const periodExpenses = filterForPeriod(expenses, filters);
  const previousExpenses = filterForPeriod(expenses, previousPeriod(filters));
  const totalCents = sumExpenses(periodExpenses);
  const previousTotalCents = sumExpenses(previousExpenses);
  const categories = buildCategoryBreakdown(periodExpenses, totalCents);

  return {
    periodLabel:
      filters.mode === 'month'
        ? `${formatMonthName(locale, filters.month)} ${filters.year}`
        : String(filters.year),
    chartLabel:
      locale === 'el-GR'
        ? filters.mode === 'month'
          ? 'Ημερήσια έξοδα'
          : 'Μηνιαία έξοδα'
        : filters.mode === 'month'
          ? 'Daily spending'
          : 'Monthly spending',
    totalCents,
    previousTotalCents,
    changePercent: calculateChange(totalCents, previousTotalCents),
    count: periodExpenses.length,
    averageCents: periodExpenses.length ? Math.round(totalCents / periodExpenses.length) : 0,
    topCategory: categories[0]?.category ?? null,
    points:
      filters.mode === 'month'
        ? buildDailyPoints(periodExpenses, filters.year, filters.month, locale)
        : buildMonthlyPoints(periodExpenses, filters.year, locale),
    categories,
  };
}

function filterForPeriod(expenses: Expense[], filters: AnalyticsFilters): Expense[] {
  return expenses.filter((expense) => {
    if (!isExpenseTransaction(expense)) {
      return false;
    }

    const date = expense.occurredAt.toDate();
    const matchesPeriod =
      date.getFullYear() === filters.year &&
      (filters.mode === 'year' || date.getMonth() === filters.month);
    const matchesCategory =
      filters.category === 'All' || expense.category === filters.category;

    return matchesPeriod && matchesCategory;
  });
}

function previousPeriod(filters: AnalyticsFilters): AnalyticsFilters {
  if (filters.mode === 'year') {
    return { ...filters, year: filters.year - 1 };
  }

  const previousMonth = new Date(filters.year, filters.month - 1, 1);
  return {
    ...filters,
    year: previousMonth.getFullYear(),
    month: previousMonth.getMonth(),
  };
}

function buildDailyPoints(
  expenses: Expense[],
  year: number,
  month: number,
  locale: string,
): AnalyticsPoint[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totals = new Array<number>(daysInMonth).fill(0);

  expenses.forEach((expense) => {
    const day = expense.occurredAt.toDate().getDate();
    totals[day - 1] += expense.amountCents;
  });

  return normalizePoints(
    totals.map((amountCents, index) => ({
      label: locale.startsWith('el')
        ? `${index + 1} ${formatMonthName(locale, month, 'long', 'date')}`
        : `${formatMonthName(locale, month)} ${index + 1}`,
      shortLabel: String(index + 1),
      amountCents,
    })),
  );
}

function buildMonthlyPoints(
  expenses: Expense[],
  year: number,
  locale: string,
): AnalyticsPoint[] {
  const totals = new Array<number>(12).fill(0);

  expenses.forEach((expense) => {
    totals[expense.occurredAt.toDate().getMonth()] += expense.amountCents;
  });

  return normalizePoints(
    totals.map((amountCents, month) => ({
      label: `${formatMonthName(locale, month)} ${year}`,
      shortLabel: formatMonthName(locale, month, 'short'),
      amountCents,
    })),
  );
}

function normalizePoints(
  points: Array<Omit<AnalyticsPoint, 'percentage'>>,
): AnalyticsPoint[] {
  const maximum = Math.max(...points.map((point) => point.amountCents), 0);

  return points.map((point) => ({
    ...point,
    percentage: maximum ? Math.max((point.amountCents / maximum) * 100, 3) : 0,
  }));
}

function buildCategoryBreakdown(
  expenses: Expense[],
  totalCents: number,
): CategoryBreakdown[] {
  const categories = new Map<ExpenseCategory, { amountCents: number; count: number }>();

  expenses.forEach((expense) => {
    const current = categories.get(expense.category) ?? { amountCents: 0, count: 0 };
    categories.set(expense.category, {
      amountCents: current.amountCents + expense.amountCents,
      count: current.count + 1,
    });
  });

  return [...categories.entries()]
    .map(([category, values]) => ({
      category,
      ...values,
      percentage: totalCents ? (values.amountCents / totalCents) * 100 : 0,
    }))
    .sort((left, right) => right.amountCents - left.amountCents);
}

function sumExpenses(expenses: Expense[]): number {
  return expenses.reduce((total, expense) => total + expense.amountCents, 0);
}

function calculateChange(current: number, previous: number): number | null {
  if (!previous) {
    return current ? null : 0;
  }

  return Math.round(((current - previous) / previous) * 100);
}
