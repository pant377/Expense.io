import { AsyncPipe, CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Timestamp } from 'firebase/firestore';
import { catchError, combineLatest, map, of, shareReplay, switchMap } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { firebaseErrorMessage } from '../../core/errors/firebase-error';
import {
  AnalyticsCategory,
  AnalyticsFilters,
  AnalyticsMode,
  availableExpenseYears,
  buildExpenseAnalytics,
} from '../../core/expenses/expense-analytics';
import {
  EXPENSE_CATEGORIES,
  Expense,
  ExpenseCategory,
  eurosToCents,
} from '../../core/expenses/expense.model';
import {
  EMPTY_EXPENSE_LIST_FILTERS,
  ExpenseListCategory,
  ExpenseListFilters,
  buildExpenseList,
  hasExpenseListFilters,
} from '../../core/expenses/expense-list';
import { ExpenseService } from '../../core/expenses/expense.service';
import { LanguageService } from '../../core/i18n/language.service';
import { LanguageToggleComponent } from '../../core/i18n/language-toggle.component';
import { TranslationKey } from '../../core/i18n/translations';
import { paginateItems } from '../../core/pagination/pagination';

@Component({
  selector: 'app-dashboard',
  imports: [
    AsyncPipe,
    CurrencyPipe,
    DatePipe,
    LanguageToggleComponent,
    ReactiveFormsModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly authService = inject(AuthService);
  private readonly expenseService = inject(ExpenseService);
  private readonly router = inject(Router);
  readonly language = inject(LanguageService);

  readonly categories = EXPENSE_CATEGORIES;
  readonly months = Array.from({ length: 12 }, (_, value) => value);
  readonly isSaving = signal(false);
  readonly isDeleting = signal(false);
  readonly actionError = signal('');
  readonly deleteError = signal('');
  readonly loadError = signal('');
  readonly categoryMenuOpen = signal(false);
  readonly expensePendingDelete = signal<Expense | null>(null);
  readonly expensePage = signal(1);
  readonly expensePageSize = 12;
  readonly expenseListFilters = signal<ExpenseListFilters>({
    ...EMPTY_EXPENSE_LIST_FILTERS,
  });
  readonly analyticsFilters = signal<AnalyticsFilters>({
    mode: 'month',
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    category: 'All',
  });

  readonly expenseForm = this.formBuilder.group({
    description: ['', [Validators.required, Validators.maxLength(120)]],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    category: ['Food' as ExpenseCategory, Validators.required],
    occurredAt: [this.today(), Validators.required],
  });

  private readonly expenseViewModel$ = this.authService.user$.pipe(
    switchMap((user) => {
      if (!user) {
        return of(null);
      }

      return this.expenseService.watchExpenses(user.uid).pipe(
        map((expenses) => ({
          user,
          expenses,
          totalCents: expenses.reduce((total, expense) => total + expense.amountCents, 0),
          monthCents: this.currentMonthTotal(expenses),
        })),
        catchError((error: unknown) => {
          this.loadError.set(firebaseErrorMessage(error, this.language.current()));
          return of({
            user,
            expenses: [] as Expense[],
            totalCents: 0,
            monthCents: 0,
          });
        }),
      );
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly viewModel$ = combineLatest([
    this.expenseViewModel$,
    toObservable(this.analyticsFilters),
    toObservable(this.expensePage),
    toObservable(this.expenseListFilters),
    toObservable(this.language.current),
  ]).pipe(
    map(([viewModel, filters, expensePage, expenseListFilters, language]) => {
      if (!viewModel) {
        return null;
      }

      const filteredExpenses = buildExpenseList(
        viewModel.expenses,
        expenseListFilters,
      );

      return {
        ...viewModel,
        analytics: buildExpenseAnalytics(
          viewModel.expenses,
          filters,
          this.language.localeFor(language),
        ),
        analyticsFilters: filters,
        availableYears: availableExpenseYears(viewModel.expenses),
        expenseListFilters,
        hasExpenseListFilters: hasExpenseListFilters(expenseListFilters),
        expensePagination: paginateItems(
          filteredExpenses,
          expensePage,
          this.expensePageSize,
        ),
      };
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  async addExpense(): Promise<void> {
    if (this.expenseForm.invalid) {
      this.expenseForm.markAllAsTouched();
      return;
    }

    const user = this.authService.currentUser;
    const { description, amount, category, occurredAt } = this.expenseForm.getRawValue();

    if (!user || amount === null) {
      return;
    }

    this.isSaving.set(true);
    this.actionError.set('');

    try {
      await this.expenseService.addExpense(user.uid, {
        description: description.trim(),
        amountCents: eurosToCents(amount),
        category,
        occurredAt: this.expenseService.dateToTimestamp(occurredAt),
      });
      this.expensePage.set(1);
      this.expenseForm.reset({
        description: '',
        amount: null,
        category: 'Food',
        occurredAt: this.today(),
      });
    } catch (error: unknown) {
      this.actionError.set(firebaseErrorMessage(error, this.language.current()));
    } finally {
      this.isSaving.set(false);
    }
  }

  toggleCategoryMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.categoryMenuOpen.update((open) => !open);
  }

  selectCategory(category: ExpenseCategory, event: MouseEvent): void {
    event.stopPropagation();
    this.expenseForm.controls.category.setValue(category);
    this.expenseForm.controls.category.markAsDirty();
    this.categoryMenuOpen.set(false);
  }

  updateAnalyticsMode(mode: AnalyticsMode): void {
    this.analyticsFilters.update((filters) => ({ ...filters, mode }));
  }

  updateAnalyticsYear(value: string): void {
    this.analyticsFilters.update((filters) => ({ ...filters, year: Number(value) }));
  }

  updateAnalyticsMonth(value: string): void {
    this.analyticsFilters.update((filters) => ({ ...filters, month: Number(value) }));
  }

  updateAnalyticsCategory(value: string): void {
    this.analyticsFilters.update((filters) => ({
      ...filters,
      category: value as AnalyticsCategory,
    }));
  }

  goToExpensePage(page: number): void {
    this.expensePage.set(page);
  }

  updateExpenseSearch(value: string): void {
    this.updateExpenseListFilters({ search: value });
  }

  updateExpenseListCategory(value: string): void {
    this.updateExpenseListFilters({
      category: value as ExpenseListCategory,
    });
  }

  updateExpenseDateFrom(value: string): void {
    this.updateExpenseListFilters({ dateFrom: value });
  }

  updateExpenseDateTo(value: string): void {
    this.updateExpenseListFilters({ dateTo: value });
  }

  clearExpenseListFilters(): void {
    this.expenseListFilters.set({ ...EMPTY_EXPENSE_LIST_FILTERS });
    this.expensePage.set(1);
  }

  requestDelete(expense: Expense): void {
    this.deleteError.set('');
    this.expensePendingDelete.set(expense);
  }

  cancelDelete(): void {
    if (!this.isDeleting()) {
      this.expensePendingDelete.set(null);
      this.deleteError.set('');
    }
  }

  async confirmDelete(): Promise<void> {
    const user = this.authService.currentUser;
    const expense = this.expensePendingDelete();

    if (!user || !expense) {
      return;
    }

    this.isDeleting.set(true);
    this.deleteError.set('');

    try {
      await this.expenseService.deleteExpense(user.uid, expense.id);
      this.expensePendingDelete.set(null);
    } catch (error: unknown) {
      this.deleteError.set(firebaseErrorMessage(error, this.language.current()));
    } finally {
      this.isDeleting.set(false);
    }
  }

  async logout(): Promise<void> {
    await this.authService.logout();
    await this.router.navigateByUrl('/auth');
  }

  timestampToDate(timestamp: Timestamp): Date {
    return timestamp.toDate();
  }

  t(
    key: TranslationKey,
    parameters: Record<string, string | number> = {},
  ): string {
    return this.language.t(key, parameters);
  }

  categoryLabel(category: ExpenseCategory | 'All'): string {
    return this.language.category(category);
  }

  categoryInitial(category: ExpenseCategory): string {
    return this.categoryLabel(category).charAt(0);
  }

  monthLabel(month: number): string {
    return this.language.month(month);
  }

  @HostListener('document:click')
  closeCategoryMenu(): void {
    this.categoryMenuOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    this.categoryMenuOpen.set(false);
    this.cancelDelete();
  }

  private currentMonthTotal(expenses: Expense[]): number {
    const now = new Date();

    return expenses.reduce((total, expense) => {
      const occurredAt = expense.occurredAt.toDate();
      const isCurrentMonth =
        occurredAt.getFullYear() === now.getFullYear() &&
        occurredAt.getMonth() === now.getMonth();

      return isCurrentMonth ? total + expense.amountCents : total;
    }, 0);
  }

  private updateExpenseListFilters(
    update: Partial<ExpenseListFilters>,
  ): void {
    this.expenseListFilters.update((filters) => ({
      ...filters,
      ...update,
    }));
    this.expensePage.set(1);
  }

  private today(): string {
    const now = new Date();
    const timezoneOffset = now.getTimezoneOffset() * 60_000;
    return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
  }
}
