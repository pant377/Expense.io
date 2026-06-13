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
import { ExpenseService } from '../../core/expenses/expense.service';

@Component({
  selector: 'app-dashboard',
  imports: [AsyncPipe, CurrencyPipe, DatePipe, ReactiveFormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly authService = inject(AuthService);
  private readonly expenseService = inject(ExpenseService);
  private readonly router = inject(Router);

  readonly categories = EXPENSE_CATEGORIES;
  readonly months = Array.from({ length: 12 }, (_, month) => ({
    value: month,
    label: new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(2026, month, 1)),
  }));
  readonly isSaving = signal(false);
  readonly isDeleting = signal(false);
  readonly actionError = signal('');
  readonly deleteError = signal('');
  readonly loadError = signal('');
  readonly categoryMenuOpen = signal(false);
  readonly expensePendingDelete = signal<Expense | null>(null);
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
          this.loadError.set(firebaseErrorMessage(error));
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
  ]).pipe(
    map(([viewModel, filters]) => {
      if (!viewModel) {
        return null;
      }

      return {
        ...viewModel,
        analytics: buildExpenseAnalytics(viewModel.expenses, filters),
        analyticsFilters: filters,
        availableYears: availableExpenseYears(viewModel.expenses),
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
      this.expenseForm.reset({
        description: '',
        amount: null,
        category: 'Food',
        occurredAt: this.today(),
      });
    } catch (error: unknown) {
      this.actionError.set(firebaseErrorMessage(error));
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
      this.deleteError.set(firebaseErrorMessage(error));
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

  private today(): string {
    const now = new Date();
    const timezoneOffset = now.getTimezoneOffset() * 60_000;
    return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
  }
}
