import { AsyncPipe, CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  inject,
  signal,
  effect,
} from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Timestamp } from 'firebase/firestore';
import {
  catchError,
  combineLatest,
  map,
  of,
  shareReplay,
  switchMap,
  tap,
} from 'rxjs';

import { CustomCategoryService } from '../../core/expenses/custom-category.service';

import { AccountService } from '../../core/account/account.service';
import { AuthService } from '../../core/auth/auth.service';
import {
  BalanceBaseline,
  EMPTY_BALANCE_BASELINE,
  amountToSignedCents,
  buildEstimatedBalanceCents,
} from '../../core/balance/balance-baseline.model';
import { BalanceBaselineService } from '../../core/balance/balance-baseline.service';
import { firebaseErrorMessage } from '../../core/errors/firebase-error';
import {
  AnalyticsCategory,
  CategoryBreakdown,
  AnalyticsFilters,
  AnalyticsMode,
  AnalyticsTransactionType,
  availableTransactionYears,
  buildExpenseAnalytics,
} from '../../core/expenses/expense-analytics';
import { AnalyticsPreferencesService } from '../../core/expenses/analytics-preferences.service';
import {
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  TRANSACTION_TYPES,
  Expense,
  ExpenseCategory,
  PaymentMethod,
  TransactionType,
  eurosToCents,
} from '../../core/expenses/expense.model';
import { CategoryIconComponent } from '../../core/expenses/category-icon.component';
import { buildExpenseCsv } from '../../core/expenses/expense-export';
import {
  PdfStatementTransactionDraft,
  PdfStatementBalanceSnapshot,
  parsePdfStatement,
} from '../../core/expenses/pdf-statement-import';
import {
  EMPTY_EXPENSE_LIST_FILTERS,
  ExpenseListCategory,
  ExpenseListFilters,
  ExpenseListPaymentMethod,
  ExpenseListTransactionType,
  buildExpenseList,
  hasExpenseListFilters,
} from '../../core/expenses/expense-list';
import {
  ExpensePhotoUpdate,
  ExpenseService,
} from '../../core/expenses/expense.service';
import {
  ExpensePhotoService,
  ExpensePhotoValidationError,
  validateExpensePhoto,
} from '../../core/expenses/expense-photo';
import {
  RecurringExpenseSchedule,
  RecurringFrequency,
} from '../../core/expenses/recurring-expense.model';
import { RecurringExpenseService } from '../../core/expenses/recurring-expense.service';
import { LanguageService } from '../../core/i18n/language.service';
import { LanguageToggleComponent } from '../../core/i18n/language-toggle.component';
import { TranslationKey } from '../../core/i18n/translations';
import { DismissibleMessageComponent } from '../../core/messages/dismissible-message.component';
import {
  EMPTY_SPENDING_LIMITS,
  SpendingLimits,
  buildSpendingLimitSummary,
  convertCurrency,
} from '../../core/limits/spending-limit.model';
import { SpendingLimitService } from '../../core/limits/spending-limit.service';
import { CurrencyService } from '../../core/currency/currency.service';
import { paginateItems } from '../../core/pagination/pagination';
import { ThemeService } from '../../core/theme/theme.service';

interface PieSegment extends CategoryBreakdown {
  path: string;
}

interface StatementImportReviewItem extends PdfStatementTransactionDraft {
  selected: boolean;
}

interface ChartPointSelection {
  index: number;
  label: string;
}

interface PdfTextItem {
  str: string;
  transform?: readonly unknown[];
}

type DashboardSection =
  | 'summary'
  | 'transaction'
  | 'limits'
  | 'analytics'
  | 'activity';

@Component({
  selector: 'app-dashboard',
  imports: [
    AsyncPipe,
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    CategoryIconComponent,
    DismissibleMessageComponent,
    LanguageToggleComponent,
    ReactiveFormsModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly mobileViewport = window.matchMedia('(max-width: 600px)');
  private readonly handleMobileViewportChange = (event: MediaQueryListEvent): void => {
    if (!event.matches) {
      this.collapsedSections.set(new Set());
    }
  };
  private readonly categoryColors: Record<ExpenseCategory, string> = {
    Food: '#e0a33c',
    Transport: '#8a67b1',
    Vehicle: '#d97b42',
    Home: '#4d9ac8',
    Health: '#d76a77',
    Leisure: '#5fa98f',
    Subscriptions: '#b06aa5',
    FinancialExpenses: '#b65f55',
    Investments: '#238f85',
    Gift: '#d45d96',
    Other: '#718096',
  };
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly accountService = inject(AccountService);
  private readonly authService = inject(AuthService);
  private readonly balanceBaselineService = inject(BalanceBaselineService);
  private readonly expenseService = inject(ExpenseService);
  private readonly expensePhotoService = inject(ExpensePhotoService);
  private readonly recurringExpenseService = inject(RecurringExpenseService);
  private readonly spendingLimitService = inject(SpendingLimitService);
  private readonly analyticsPreferencesService = inject(
    AnalyticsPreferencesService,
  );
  private readonly customCategoryService = inject(CustomCategoryService);
  private readonly currencyService = inject(CurrencyService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly language = inject(LanguageService);
  readonly theme = inject(ThemeService);

  readonly customCategories = signal<string[]>([]);
  get allCategories(): string[] {
    return [...EXPENSE_CATEGORIES, ...this.customCategories()];
  }

  readonly categories = EXPENSE_CATEGORIES;
  readonly transactionTypes = TRANSACTION_TYPES;
  readonly currencies = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'];
  readonly analyticsTransactionTypes = [
    'expense',
    'income',
    'merged',
  ] as const;
  readonly paymentMethods = PAYMENT_METHODS;
  readonly months = Array.from({ length: 12 }, (_, value) => value);
  readonly isSaving = signal(false);
  readonly isSavingLimits = signal(false);
  readonly isSavingBalanceBaseline = signal(false);
  readonly isDeleting = signal(false);
  readonly isUpdatingExpense = signal(false);
  readonly isReadingStatement = signal(false);
  readonly isSavingStatementImport = signal(false);
  readonly isErasingChartPoint = signal(false);
  readonly isDeletingAccount = signal(false);
  readonly isResettingExpenses = signal(false);
  readonly recurringActionId = signal<string | null>(null);
  readonly actionError = signal('');
  readonly limitError = signal('');
  readonly limitSuccess = signal('');
  readonly balanceBaselineError = signal('');
  readonly balanceBaselineSuccess = signal('');
  readonly deleteError = signal('');
  readonly editError = signal('');
  readonly statementImportError = signal('');
  readonly statementImportSuccess = signal('');
  readonly chartPointDeleteError = signal('');
  readonly recurringError = signal('');
  readonly accountDeleteError = signal('');
  readonly loadError = signal('');
  readonly settingsOpen = signal(false);
  readonly deleteAccountOpen = signal(false);
  readonly recurringOpen = signal(false);
  readonly statementImportOpen = signal(false);
  readonly categoryMenuOpen = signal(false);
  readonly expensePendingDelete = signal<Expense | null>(null);
  readonly expensePendingEdit = signal<Expense | null>(null);
  readonly recurringSchedules = signal<RecurringExpenseSchedule[]>([]);
  readonly statementImportFileName = signal('');
  readonly statementImportDrafts = signal<StatementImportReviewItem[]>([]);
  readonly detectedStatementBalance = signal<PdfStatementBalanceSnapshot | null>(
    null,
  );
  readonly currentBalanceBaseline = signal<BalanceBaseline>({
    ...EMPTY_BALANCE_BASELINE,
  });
  readonly hoveredPieCategory = signal<CategoryBreakdown | null>(null);
  readonly expensePage = signal(1);
  readonly expensePageSize = signal(5);
  readonly expenseFiltersOpen = signal(false);
  readonly collapsedSections = signal<ReadonlySet<DashboardSection>>(new Set());
  readonly expenseListFilters = signal<ExpenseListFilters>({
    ...EMPTY_EXPENSE_LIST_FILTERS,
  });
  readonly analyticsFilters = signal<AnalyticsFilters>(
    this.defaultAnalyticsFilters(),
  );
  readonly breakdownView = signal<'bars' | 'pie'>('bars');
  readonly selectedBreakdownCategory = signal<ExpenseCategory | null>(null);
  readonly selectedChartPoint = signal<ChartPointSelection | null>(null);
  readonly newExpensePhoto = signal<File | null>(null);
  readonly newExpensePhotoPreviewUrl = signal('');
  readonly newExpensePhotoError =
    signal<ExpensePhotoValidationError | null>(null);
  readonly editExpensePhoto = signal<File | null>(null);
  readonly editExpensePhotoPreviewUrl = signal('');
  readonly editExpensePhotoError =
    signal<ExpensePhotoValidationError | null>(null);
  readonly editExpensePhotoRemoved = signal(false);
  private readonly currentExpenses = signal<Expense[]>([]);
  private readonly expensePhotoUrls = signal<Record<string, string>>({});
  private readonly photoUrlRequests = new Set<string>();
  private activePhotoPaths = new Set<string>();
  private readonly maxStatementPdfBytes = 12 * 1024 * 1024;

  readonly expenseForm = this.formBuilder.group({
    description: [
      '',
      [
        Validators.required,
        Validators.pattern(/\S/),
        Validators.maxLength(120),
      ],
    ],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    category: ['Food' as ExpenseCategory, Validators.required],
    transactionType: ['expense' as TransactionType, Validators.required],
    paymentMethod: ['' as PaymentMethod | '', Validators.required],
    occurredAt: [this.today(), Validators.required],
    recurring: [false],
    frequency: ['monthly' as RecurringFrequency, Validators.required],
    currency: ['EUR', Validators.required],
  });

  readonly editExpenseForm = this.formBuilder.group({
    description: [
      '',
      [
        Validators.required,
        Validators.pattern(/\S/),
        Validators.maxLength(120),
      ],
    ],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    category: ['Food' as ExpenseCategory, Validators.required],
    transactionType: ['expense' as TransactionType, Validators.required],
    paymentMethod: ['' as PaymentMethod | '', Validators.required],
    occurredAt: ['', Validators.required],
    currency: ['EUR', Validators.required],
  });

  readonly spendingLimitForm = this.formBuilder.group({
    dailyLimit: [
      null as number | null,
      [Validators.min(0.01), Validators.max(1_000_000_000)],
    ],
    monthlyLimit: [
      null as number | null,
      [Validators.min(0.01), Validators.max(1_000_000_000)],
    ],
    excludeIncome: [true],
    emailAlertsEnabled: [false],
    alertThreshold50: [false],
    alertThreshold80: [false],
    alertThreshold99: [false],
    baseCurrency: ['EUR', Validators.required],
  });

  readonly balanceBaselineForm = this.formBuilder.group({
    amount: [
      null as number | null,
      [Validators.required, Validators.min(-1_000_000_000), Validators.max(1_000_000_000)],
    ],
    currency: ['EUR', Validators.required],
    effectiveDate: [this.today(), Validators.required],
  });

  readonly deleteAccountForm = this.formBuilder.group({
    confirmation: ['', Validators.required],
    password: [''],
  });

  constructor() {
    this.mobileViewport.addEventListener('change', this.handleMobileViewportChange);

    this.destroyRef.onDestroy(() => {
      this.mobileViewport.removeEventListener('change', this.handleMobileViewportChange);
      this.revokePreviewUrl(this.newExpensePhotoPreviewUrl());
      this.revokePreviewUrl(this.editExpensePhotoPreviewUrl());
      document.body.classList.remove('modal-open');
    });

    effect(() => {
      const isAnyModalOpen =
        this.settingsOpen() ||
        this.deleteAccountOpen() ||
        this.recurringOpen() ||
        this.statementImportOpen() ||
        this.expensePendingDelete() !== null ||
        this.expensePendingEdit() !== null ||
        this.selectedBreakdownCategory() !== null ||
        this.selectedChartPoint() !== null;

      if (isAnyModalOpen) {
        document.body.classList.add('modal-open');
      } else {
        document.body.classList.remove('modal-open');
      }
    });
  }

  private readonly expenseViewModel$ = this.authService.user$.pipe(
    switchMap((user) => {
      if (!user) {
        this.analyticsFilters.set(this.defaultAnalyticsFilters());
        return of(null);
      }

      const limits$ = this.spendingLimitService.watchLimits(user.uid).pipe(
        tap((limits) => {
          this.syncSpendingLimitForm(limits);
          if (!this.expenseForm.controls.currency.dirty) {
            this.expenseForm.controls.currency.setValue(limits.baseCurrency || 'EUR');
          }
        }),
        catchError((error: unknown) => {
          this.limitError.set(firebaseErrorMessage(error, this.language.current()));
          return of({ ...EMPTY_SPENDING_LIMITS });
        }),
      );

      const rates$ = this.currencyService.watchAndSyncRates(user.uid).pipe(
        catchError(() => of({ EUR: 1.0, USD: 1.08, GBP: 0.85, CHF: 0.96, JPY: 168.0, CAD: 1.48, AUD: 1.62 })),
      );

      const balanceBaseline$ = this.balanceBaselineService
        .watchBaseline(user.uid)
        .pipe(
          tap((baseline) => {
            this.currentBalanceBaseline.set(baseline);
            this.syncBalanceBaselineForm(baseline);
          }),
          catchError((error: unknown) => {
            this.balanceBaselineError.set(
              firebaseErrorMessage(error, this.language.current()),
            );
            return of({ ...EMPTY_BALANCE_BASELINE });
          }),
        );

      const recurringSchedules$ = this.recurringExpenseService
        .watchSchedules(user.uid)
        .pipe(
          tap((schedules) => {
            this.recurringSchedules.set(schedules);
            void this.syncRecurringExpenses(user.uid, schedules);
          }),
          catchError((error: unknown) => {
            this.recurringError.set(
              firebaseErrorMessage(error, this.language.current()),
            );
            return of([] as RecurringExpenseSchedule[]);
          }),
        );

      const customCategories$ = this.customCategoryService
        .watchCustomCategories(user.uid)
        .pipe(
          tap((categories) => this.customCategories.set(categories)),
          catchError(() => of([] as string[])),
        );

      const analyticsPreferences$ = this.analyticsPreferencesService
        .watchPreferences(user.uid, this.defaultAnalyticsFilters())
        .pipe(
          tap((filters) => this.analyticsFilters.set(filters)),
          catchError((error: unknown) => {
            this.loadError.set(
              firebaseErrorMessage(error, this.language.current()),
            );
            return of(this.analyticsFilters());
          }),
        );

      return combineLatest([
        this.expenseService.watchExpenses(user.uid).pipe(
          tap((expenses) => {
            this.currentExpenses.set(expenses);
            this.syncExpensePhotoUrls(expenses);
          }),
        ),
        limits$,
        rates$,
        balanceBaseline$,
        recurringSchedules$,
        customCategories$,
        analyticsPreferences$,
      ]).pipe(
        map(([
          expenses,
          limits,
          rates,
          balanceBaseline,
          recurringSchedules,
          customCategories,
        ]) => {
          const baseCurrency = limits.baseCurrency || 'EUR';

          const totalExpenseCents = expenses.reduce((sum, exp) => 
            exp.transactionType === 'expense'
              ? sum + convertCurrency(exp.amountCents, exp.currency, baseCurrency, rates)
              : sum, 0);

          const totalIncomeCents = expenses.reduce((sum, exp) => 
            exp.transactionType === 'income'
              ? sum + convertCurrency(exp.amountCents, exp.currency, baseCurrency, rates)
              : sum, 0);

          const now = new Date();
          const currentMonthExpenses = expenses.filter(exp => {
            const expDate = exp.occurredAt.toDate();
            return expDate.getFullYear() === now.getFullYear() && expDate.getMonth() === now.getMonth();
          });

          const monthExpenseCents = currentMonthExpenses.reduce((sum, exp) => 
            exp.transactionType === 'expense'
              ? sum + convertCurrency(exp.amountCents, exp.currency, baseCurrency, rates)
              : sum, 0);

          const monthIncomeCents = currentMonthExpenses.reduce((sum, exp) => 
            exp.transactionType === 'income'
              ? sum + convertCurrency(exp.amountCents, exp.currency, baseCurrency, rates)
              : sum, 0);

          return {
            user,
            expenses,
            limits,
            rates,
            balanceBaseline,
            recurringSchedules,
            customCategories,
            totalExpenseCents,
            totalIncomeCents,
            monthExpenseCents,
            monthIncomeCents,
            monthBalanceCents: monthIncomeCents - monthExpenseCents,
            balanceCents: totalIncomeCents - totalExpenseCents,
            estimatedBalanceCents: buildEstimatedBalanceCents(
              expenses,
              balanceBaseline,
              rates,
            ),
          };
        }),
        catchError((error: unknown) => {
          this.loadError.set(firebaseErrorMessage(error, this.language.current()));
          return of({
            user,
            expenses: [] as Expense[],
            limits: { ...EMPTY_SPENDING_LIMITS },
            rates: { EUR: 1.0, USD: 1.08, GBP: 0.85, CHF: 0.96, JPY: 168.0, CAD: 1.48, AUD: 1.62 } as Record<string, number>,
            balanceBaseline: { ...EMPTY_BALANCE_BASELINE },
            recurringSchedules: [] as RecurringExpenseSchedule[],
            customCategories: [] as string[],
            totalExpenseCents: 0,
            totalIncomeCents: 0,
            monthExpenseCents: 0,
            monthIncomeCents: 0,
            monthBalanceCents: 0,
            balanceCents: 0,
            estimatedBalanceCents: null,
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
    toObservable(this.expensePageSize),
    toObservable(this.expenseListFilters),
    toObservable(this.language.current),
  ]).pipe(
    map(([viewModel, filters, expensePage, expensePageSize, expenseListFilters, language]) => {
      if (!viewModel) {
        return null;
      }

      const filteredExpenses = buildExpenseList(
        viewModel.expenses,
        expenseListFilters,
      );

      return {
        ...viewModel,
        limitSummary: buildSpendingLimitSummary(
          viewModel.expenses,
          viewModel.limits,
          viewModel.rates,
        ),
        analytics: buildExpenseAnalytics(
          viewModel.expenses,
          filters,
          viewModel.limits.baseCurrency || 'EUR',
          viewModel.rates,
          this.language.localeFor(language),
        ),
        analyticsFilters: filters,
        availableYears: availableTransactionYears(
          viewModel.expenses,
          filters.transactionType,
          new Date().getFullYear(),
          filters.year,
        ),
        expenseListFilters,
        filteredExpenses,
        hasExpenseListFilters: hasExpenseListFilters(expenseListFilters),
        expensePagination: paginateItems(
          filteredExpenses,
          expensePage,
          expensePageSize,
        ),
      };
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  changePageSize(size: string): void {
    this.expensePageSize.set(Number(size));
    this.expensePage.set(1);
  }

  async addExpense(): Promise<void> {
    if (this.expenseForm.invalid) {
      this.expenseForm.markAllAsTouched();
      return;
    }

    const user = this.authService.currentUser;
    const {
      description,
      amount,
      category,
      transactionType,
      paymentMethod,
      occurredAt,
      recurring,
      frequency,
      currency,
    } = this.expenseForm.getRawValue();

    if (!user || amount === null || !paymentMethod) {
      return;
    }

    this.isSaving.set(true);
    this.actionError.set('');

    try {
      const draft = {
        description: description.trim(),
        amountCents: eurosToCents(amount),
        category,
        transactionType,
        paymentMethod,
        currency,
        occurredAt: this.expenseService.dateToTimestamp(occurredAt),
      };

      if (recurring) {
        await this.recurringExpenseService.addSchedule(user.uid, {
          description: draft.description,
          amountCents: draft.amountCents,
          category: draft.category,
          transactionType: draft.transactionType,
          paymentMethod: draft.paymentMethod,
          frequency,
          currency,
          startDate: draft.occurredAt,
        });
      } else {
        await this.expenseService.addExpense(
          user.uid,
          draft,
          this.newExpensePhoto(),
        );
      }
      this.expensePage.set(1);
      this.clearNewExpensePhoto();
      this.expenseForm.reset({
        description: '',
        amount: null,
        category: 'Food',
        transactionType: 'expense',
        paymentMethod: '',
        occurredAt: this.today(),
        recurring: false,
        frequency: 'monthly',
        currency: this.spendingLimitForm.get('baseCurrency')?.value || 'EUR',
      });
    } catch (error: unknown) {
      this.actionError.set(firebaseErrorMessage(error, this.language.current()));
    } finally {
      this.isSaving.set(false);
    }
  }

  async saveSpendingLimits(): Promise<void> {
    if (this.spendingLimitForm.invalid) {
      this.spendingLimitForm.markAllAsTouched();
      return;
    }

    const user = this.authService.currentUser;

    if (!user) {
      return;
    }

    const {
      dailyLimit,
      monthlyLimit,
      excludeIncome,
      emailAlertsEnabled,
      alertThreshold50,
      alertThreshold80,
      alertThreshold99,
      baseCurrency,
    } = this.spendingLimitForm.getRawValue();

    const alertThresholds: number[] = [];
    if (alertThreshold50) alertThresholds.push(50);
    if (alertThreshold80) alertThresholds.push(80);
    if (alertThreshold99) alertThresholds.push(99);

    this.isSavingLimits.set(true);
    this.limitError.set('');
    this.limitSuccess.set('');

    try {
      await this.spendingLimitService.saveLimits(user.uid, {
        dailyLimitCents:
          dailyLimit === null ? null : eurosToCents(dailyLimit),
        monthlyLimitCents:
          monthlyLimit === null ? null : eurosToCents(monthlyLimit),
        excludeIncome: excludeIncome ?? true,
        emailAlertsEnabled: emailAlertsEnabled ?? false,
        alertThresholds,
        baseCurrency: baseCurrency || 'EUR',
      });
      this.spendingLimitForm.markAsPristine();
      this.limitSuccess.set(this.t('limits.saved'));
    } catch (error: unknown) {
      this.limitError.set(firebaseErrorMessage(error, this.language.current()));
    } finally {
      this.isSavingLimits.set(false);
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

  selectExpensePhoto(event: Event, target: 'create' | 'edit'): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';

    if (!file) {
      return;
    }

    const validationError = validateExpensePhoto(file);

    if (target === 'create') {
      if (validationError) {
        this.clearNewExpensePhoto();
        this.newExpensePhotoError.set(validationError);
        return;
      }

      this.newExpensePhotoError.set(null);
      this.setNewExpensePhoto(file);
      return;
    }

    if (validationError) {
      this.clearEditExpensePhoto();
      this.editExpensePhotoRemoved.set(false);
      this.editExpensePhotoError.set(validationError);
      return;
    }

    this.editExpensePhotoError.set(null);
    this.setEditExpensePhoto(file);
    this.editExpensePhotoRemoved.set(false);
  }

  clearNewExpensePhoto(): void {
    this.revokePreviewUrl(this.newExpensePhotoPreviewUrl());
    this.newExpensePhoto.set(null);
    this.newExpensePhotoPreviewUrl.set('');
    this.newExpensePhotoError.set(null);
  }

  clearEditExpensePhoto(): void {
    this.revokePreviewUrl(this.editExpensePhotoPreviewUrl());
    this.editExpensePhoto.set(null);
    this.editExpensePhotoPreviewUrl.set('');
    this.editExpensePhotoError.set(null);
  }

  removeEditExpensePhoto(): void {
    this.clearEditExpensePhoto();
    this.editExpensePhotoRemoved.set(true);
  }

  expensePhotoErrorMessage(error: ExpensePhotoValidationError): string {
    return error === 'size'
      ? this.t('expense.photoSizeError')
      : this.t('expense.photoTypeError');
  }

  expensePhotoUrl(expense: Expense): string {
    if (!expense.photoStoragePath) {
      return '';
    }

    const baseUrl = this.expensePhotoUrls()[expense.photoStoragePath];

    if (!baseUrl) {
      return '';
    }

    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}v=${expense.updatedAt.toMillis()}`;
  }

  selectStatementPdf(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';

    if (!file) {
      return;
    }

    this.statementImportSuccess.set('');
    this.statementImportError.set('');

    if (!this.isPdfFile(file)) {
      this.statementImportError.set(this.t('import.pdfTypeError'));
      return;
    }

    if (file.size <= 0 || file.size > this.maxStatementPdfBytes) {
      this.statementImportError.set(this.t('import.pdfSizeError'));
      return;
    }

    void this.readStatementPdf(file);
  }

  toggleStatementImportDraft(importId: string, selected: boolean): void {
    this.updateStatementImportDraft(importId, { selected });
  }

  updateStatementImportDate(importId: string, value: string): void {
    this.updateStatementImportDraft(importId, { occurredOn: value });
  }

  updateStatementImportDescription(importId: string, value: string): void {
    this.updateStatementImportDraft(importId, { description: value });
  }

  updateStatementImportAmount(importId: string, value: string): void {
    try {
      this.updateStatementImportDraft(importId, {
        amountCents: eurosToCents(value),
      });
    } catch {
      this.updateStatementImportDraft(importId, { amountCents: 0 });
    }
  }

  async saveBalanceBaseline(
    source: BalanceBaseline['source'] = 'manual',
    institution: BalanceBaseline['institution'] = null,
  ): Promise<void> {
    if (this.balanceBaselineForm.invalid) {
      this.balanceBaselineForm.markAllAsTouched();
      return;
    }

    const user = this.authService.currentUser;
    const { amount, currency, effectiveDate } =
      this.balanceBaselineForm.getRawValue();

    if (!user || amount === null) {
      return;
    }

    this.isSavingBalanceBaseline.set(true);
    this.balanceBaselineError.set('');
    this.balanceBaselineSuccess.set('');

    try {
      await this.balanceBaselineService.saveBaseline(user.uid, {
        amountCents: amountToSignedCents(amount),
        currency: currency || 'EUR',
        effectiveDate,
        source,
        institution,
      });
      this.balanceBaselineForm.markAsPristine();
      this.balanceBaselineSuccess.set(this.t('balance.saved'));
    } catch (error: unknown) {
      this.balanceBaselineError.set(
        firebaseErrorMessage(error, this.language.current()),
      );
    } finally {
      this.isSavingBalanceBaseline.set(false);
    }
  }

  async clearBalanceBaseline(): Promise<void> {
    const user = this.authService.currentUser;

    if (!user) {
      return;
    }

    this.isSavingBalanceBaseline.set(true);
    this.balanceBaselineError.set('');
    this.balanceBaselineSuccess.set('');

    try {
      await this.balanceBaselineService.clearBaseline(user.uid);
      this.balanceBaselineForm.reset({
        amount: null,
        currency: this.spendingLimitForm.controls.baseCurrency.value || 'EUR',
        effectiveDate: this.today(),
      });
      this.balanceBaselineSuccess.set(this.t('balance.cleared'));
    } catch (error: unknown) {
      this.balanceBaselineError.set(
        firebaseErrorMessage(error, this.language.current()),
      );
    } finally {
      this.isSavingBalanceBaseline.set(false);
    }
  }

  async useDetectedStatementBalance(): Promise<void> {
    const balance = this.detectedStatementBalance();
    if (!balance) {
      return;
    }

    this.balanceBaselineForm.setValue({
      amount: balance.amountCents / 100,
      currency: balance.currency,
      effectiveDate: balance.effectiveDate,
    });
    await this.saveBalanceBaseline('statement', balance.institution);
  }

  updateStatementImportCurrency(importId: string, value: string): void {
    this.updateStatementImportDraft(importId, {
      currency: this.currencies.includes(value) ? value : 'EUR',
    });
  }

  updateStatementImportType(importId: string, value: string): void {
    this.updateStatementImportDraft(importId, {
      transactionType: value as TransactionType,
    });
  }

  updateStatementImportCategory(importId: string, value: string): void {
    this.updateStatementImportDraft(importId, {
      category: value as ExpenseCategory,
    });
  }

  updateStatementImportPaymentMethod(importId: string, value: string): void {
    this.updateStatementImportDraft(importId, {
      paymentMethod: value as PaymentMethod,
    });
  }

  selectedStatementImportCount(): number {
    return this.statementImportDrafts().filter((draft) => draft.selected).length;
  }

  isStatementImportDraftInvalid(draft: StatementImportReviewItem): boolean {
    return (
      !draft.description.trim() ||
      draft.amountCents <= 0 ||
      !draft.occurredOn ||
      !draft.currency ||
      !draft.paymentMethod
    );
  }

  cancelStatementImport(): void {
    if (!this.isSavingStatementImport()) {
      this.statementImportOpen.set(false);
      this.statementImportDrafts.set([]);
      this.detectedStatementBalance.set(null);
      this.statementImportFileName.set('');
      this.statementImportError.set('');
    }
  }

  async importStatementTransactions(): Promise<void> {
    const user = this.authService.currentUser;
    const selectedDrafts = this.statementImportDrafts().filter(
      (draft) => draft.selected,
    );
    const existingTransactionCounts = this.existingTransactionDuplicateCounts();
    const uniqueDrafts = selectedDrafts.filter((draft) => {
      const duplicateKey = this.statementDraftDuplicateKey(draft);

      return !this.consumeExistingTransactionDuplicate(
        existingTransactionCounts,
        duplicateKey,
      );
    });
    const duplicateCount = selectedDrafts.length - uniqueDrafts.length;

    if (!user) {
      return;
    }

    if (!selectedDrafts.length) {
      this.statementImportError.set(this.t('import.noneSelected'));
      return;
    }

    if (selectedDrafts.some((draft) => this.isStatementImportDraftInvalid(draft))) {
      this.statementImportError.set(this.t('import.invalidDraft'));
      return;
    }

    if (!uniqueDrafts.length) {
      this.statementImportError.set(
        this.t('import.onlyDuplicates', { count: duplicateCount }),
      );
      return;
    }

    this.isSavingStatementImport.set(true);
    this.statementImportError.set('');

    try {
      for (const draft of uniqueDrafts) {
        await this.expenseService.addExpense(user.uid, {
          description: draft.description.trim(),
          amountCents: draft.amountCents,
          category: draft.category,
          transactionType: draft.transactionType,
          paymentMethod: draft.paymentMethod,
          currency: draft.currency || 'EUR',
          occurredAt: this.expenseService.dateToTimestamp(draft.occurredOn),
        });
      }

      this.expensePage.set(1);
      this.statementImportOpen.set(false);
      this.statementImportDrafts.set([]);
      this.detectedStatementBalance.set(null);
      this.statementImportFileName.set('');
      this.statementImportSuccess.set(
        duplicateCount
          ? this.t('import.successWithSkipped', {
              count: uniqueDrafts.length,
              skipped: duplicateCount,
            })
          : this.t('import.success', { count: uniqueDrafts.length }),
      );
    } catch (error: unknown) {
      this.statementImportError.set(
        firebaseErrorMessage(error, this.language.current()),
      );
    } finally {
      this.isSavingStatementImport.set(false);
    }
  }

  updateAnalyticsMode(mode: AnalyticsMode): void {
    this.updateAndSaveAnalyticsFilters({ mode });
  }

  updateAnalyticsTransactionType(
    transactionType: AnalyticsTransactionType,
  ): void {
    this.updateAndSaveAnalyticsFilters({ transactionType });
    this.hoveredPieCategory.set(null);
  }

  updateAnalyticsYear(value: string): void {
    this.updateAndSaveAnalyticsFilters({ year: Number(value) });
  }

  updateAnalyticsMonth(value: string): void {
    this.updateAndSaveAnalyticsFilters({ month: Number(value) });
  }

  updateAnalyticsCategory(value: string): void {
    this.updateAndSaveAnalyticsFilters({ category: value as AnalyticsCategory });
  }

  updateBreakdownView(view: 'bars' | 'pie'): void {
    this.breakdownView.set(view);
    this.hoveredPieCategory.set(null);
  }

  pieSegments(categories: CategoryBreakdown[]): PieSegment[] {
    let startAngle = -90;

    return categories.map((item, index) => {
      const sweep = item.percentage * 3.6;
      const endAngle =
        index === categories.length - 1
          ? Math.min(startAngle + sweep, 269.999)
          : startAngle + sweep;
      const segment = {
        ...item,
        path: this.donutSegmentPath(startAngle, endAngle),
      };

      startAngle += sweep;
      return segment;
    });
  }

  categoryColor(category: ExpenseCategory): string {
    return this.categoryColors[category as keyof typeof this.categoryColors] || '#718096';
  }

  readonly categoryError = signal('');
  readonly dropdownCategoryError = signal('');
  readonly isSavingCategory = signal(false);

  async addCustomCategoryFromDropdown(nameInput: HTMLInputElement, event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!name || name.length > 50) {
      this.dropdownCategoryError.set(this.t('settings.categoryInvalid'));
      return;
    }

    const exists = this.allCategories.some(
      (cat) => cat.toLowerCase() === name.toLowerCase(),
    );
    if (exists) {
      this.dropdownCategoryError.set(this.t('settings.categoryExists'));
      return;
    }

    const user = this.authService.currentUser;
    if (!user) {
      return;
    }

    this.dropdownCategoryError.set('');

    try {
      const updated = [...this.customCategories(), name];
      await this.customCategoryService.saveCustomCategories(user.uid, updated);
      nameInput.value = '';
      this.expenseForm.controls.category.setValue(name);
      this.categoryMenuOpen.set(false);
    } catch (error: unknown) {
      this.dropdownCategoryError.set(
        firebaseErrorMessage(error, this.language.current()),
      );
    }
  }

  async addCustomCategory(nameInput: HTMLInputElement): Promise<void> {
    const name = nameInput.value.trim();
    if (!name || name.length > 50) {
      this.categoryError.set(this.t('settings.categoryInvalid'));
      return;
    }

    const exists = this.allCategories.some(
      (cat) => cat.toLowerCase() === name.toLowerCase(),
    );
    if (exists) {
      this.categoryError.set(this.t('settings.categoryExists'));
      return;
    }

    const user = this.authService.currentUser;
    if (!user) {
      return;
    }

    this.isSavingCategory.set(true);
    this.categoryError.set('');

    try {
      const updated = [...this.customCategories(), name];
      await this.customCategoryService.saveCustomCategories(user.uid, updated);
      nameInput.value = '';
    } catch (error: unknown) {
      this.categoryError.set(
        firebaseErrorMessage(error, this.language.current()),
      );
    } finally {
      this.isSavingCategory.set(false);
    }
  }

  async deleteCustomCategory(category: string): Promise<void> {
    const user = this.authService.currentUser;
    if (!user) {
      return;
    }

    this.isSavingCategory.set(true);
    this.categoryError.set('');

    try {
      const updated = this.customCategories().filter((cat) => cat !== category);
      await this.customCategoryService.saveCustomCategories(user.uid, updated);
    } catch (error: unknown) {
      this.categoryError.set(
        firebaseErrorMessage(error, this.language.current()),
      );
    } finally {
      this.isSavingCategory.set(false);
    }
  }

  setHoveredPieCategory(category: CategoryBreakdown | null): void {
    this.hoveredPieCategory.set(category);
  }

  openSettings(): void {
    this.limitError.set('');
    this.limitSuccess.set('');
    this.balanceBaselineError.set('');
    this.balanceBaselineSuccess.set('');
    this.settingsOpen.set(true);
  }

  closeSettings(): void {
    if (!this.isSavingLimits() && !this.isSavingBalanceBaseline()) {
      this.settingsOpen.set(false);
    }
  }

  openDeleteAccount(): void {
    this.settingsOpen.set(false);
    this.accountDeleteError.set('');
    this.deleteAccountForm.reset({
      confirmation: '',
      password: '',
    });
    this.deleteAccountOpen.set(true);
  }

  cancelDeleteAccount(): void {
    if (!this.isDeletingAccount()) {
      this.deleteAccountOpen.set(false);
      this.accountDeleteError.set('');
    }
  }

  requiresAccountPassword(): boolean {
    return this.authService.usesPasswordProvider();
  }

  async confirmDeleteAccount(): Promise<void> {
    const user = this.authService.currentUser;
    const { confirmation, password } = this.deleteAccountForm.getRawValue();

    if (!user) {
      return;
    }

    if (
      confirmation.trim().toUpperCase() !== 'DELETE' ||
      (this.requiresAccountPassword() && !password)
    ) {
      this.deleteAccountForm.markAllAsTouched();
      this.accountDeleteError.set(this.t('settings.deleteValidation'));
      return;
    }

    this.isDeletingAccount.set(true);
    this.accountDeleteError.set('');

    try {
      await this.authService.reauthenticateCurrentUser(password);
      await this.accountService.deleteUserData(user.uid);
      await this.authService.deleteCurrentUser();
      await this.router.navigateByUrl('/auth');
    } catch (error: unknown) {
      this.accountDeleteError.set(
        firebaseErrorMessage(error, this.language.current()),
      );
    } finally {
      this.isDeletingAccount.set(false);
    }
  }

  async confirmResetExpenses(): Promise<void> {
    const user = this.authService.currentUser;
    if (!user) {
      return;
    }

    const confirmed = window.confirm(this.t('settings.resetConfirmation'));
    if (!confirmed) {
      return;
    }

    this.isResettingExpenses.set(true);
    try {
      await this.accountService.resetUserExpenses(user.uid);
      this.closeSettings();
    } catch (error: unknown) {
      window.alert(firebaseErrorMessage(error, this.language.current()));
    } finally {
      this.isResettingExpenses.set(false);
    }
  }

  async eraseChartPointTransactions(
    transactions: readonly Expense[],
    periodLabel: string,
  ): Promise<void> {
    const user = this.authService.currentUser;

    if (!user || !transactions.length) {
      return;
    }

    const confirmed = window.confirm(
      this.t('analytics.eraseBarConfirmation', {
        count: transactions.length,
        period: periodLabel,
      }),
    );

    if (!confirmed) {
      return;
    }

    this.isErasingChartPoint.set(true);
    this.chartPointDeleteError.set('');

    try {
      await this.expenseService.deleteExpenses(user.uid, transactions);
      this.expensePage.set(1);
      this.selectedChartPoint.set(null);
    } catch (error: unknown) {
      this.chartPointDeleteError.set(
        firebaseErrorMessage(error, this.language.current()),
      );
    } finally {
      this.isErasingChartPoint.set(false);
    }
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

  updateExpenseListTransactionType(value: string): void {
    this.updateExpenseListFilters({
      transactionType: value as ExpenseListTransactionType,
    });
  }

  updateExpenseListPaymentMethod(value: string): void {
    this.updateExpenseListFilters({
      paymentMethod: value as ExpenseListPaymentMethod,
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

  openEditExpense(expense: Expense): void {
    this.editError.set('');
    this.clearEditExpensePhoto();
    this.editExpensePhotoRemoved.set(false);
    this.expensePendingEdit.set(expense);
    this.editExpenseForm.reset({
      description: expense.description,
      amount: expense.amountCents / 100,
      category: expense.category,
      transactionType: expense.transactionType,
      paymentMethod: expense.paymentMethod ?? '',
      occurredAt: this.dateInputValue(expense.occurredAt.toDate()),
      currency: expense.currency || 'EUR',
    });
  }

  cancelEditExpense(): void {
    if (!this.isUpdatingExpense()) {
      this.clearEditExpensePhoto();
      this.editExpensePhotoRemoved.set(false);
      this.expensePendingEdit.set(null);
      this.editError.set('');
    }
  }

  async saveEditedExpense(): Promise<void> {
    if (this.editExpenseForm.invalid) {
      this.editExpenseForm.markAllAsTouched();
      return;
    }

    const user = this.authService.currentUser;
    const expense = this.expensePendingEdit();
    const {
      description,
      amount,
      category,
      transactionType,
      paymentMethod,
      occurredAt,
      currency,
    } =
      this.editExpenseForm.getRawValue();

    if (!user || !expense || amount === null || !paymentMethod) {
      return;
    }

    this.isUpdatingExpense.set(true);
    this.editError.set('');

    try {
      const replacementPhoto = this.editExpensePhoto();
      const photoUpdate: ExpensePhotoUpdate = replacementPhoto
        ? { action: 'replace', file: replacementPhoto }
        : this.editExpensePhotoRemoved() && expense.photoStoragePath
          ? { action: 'remove' }
          : { action: 'keep' };

      await this.expenseService.updateExpense(
        user.uid,
        expense.id,
        {
          description: description.trim(),
          amountCents: eurosToCents(amount),
          category,
          transactionType,
          paymentMethod,
          currency: currency || 'EUR',
          occurredAt: this.expenseService.dateToTimestamp(occurredAt),
        },
        photoUpdate,
      );

      if (photoUpdate.action === 'replace') {
        this.refreshExpensePhotoUrl(
          `users/${user.uid}/expenses/${expense.id}/receipt`,
        );
      }

      this.clearEditExpensePhoto();
      this.editExpensePhotoRemoved.set(false);
      this.expensePendingEdit.set(null);
    } catch (error: unknown) {
      this.editError.set(firebaseErrorMessage(error, this.language.current()));
    } finally {
      this.isUpdatingExpense.set(false);
    }
  }

  openRecurringExpenses(): void {
    this.recurringError.set('');
    this.recurringOpen.set(true);
  }

  closeRecurringExpenses(): void {
    if (!this.recurringActionId()) {
      this.recurringOpen.set(false);
    }
  }

  async toggleRecurringSchedule(
    schedule: RecurringExpenseSchedule,
  ): Promise<void> {
    const user = this.authService.currentUser;

    if (!user) {
      return;
    }

    this.recurringActionId.set(schedule.id);
    this.recurringError.set('');

    try {
      await this.recurringExpenseService.setActive(
        user.uid,
        schedule,
        !schedule.active,
      );
    } catch (error: unknown) {
      this.recurringError.set(
        firebaseErrorMessage(error, this.language.current()),
      );
    } finally {
      this.recurringActionId.set(null);
    }
  }

  async deleteRecurringSchedule(
    schedule: RecurringExpenseSchedule,
  ): Promise<void> {
    const user = this.authService.currentUser;

    if (!user) {
      return;
    }

    this.recurringActionId.set(schedule.id);
    this.recurringError.set('');

    try {
      await this.recurringExpenseService.deleteSchedule(user.uid, schedule.id);
    } catch (error: unknown) {
      this.recurringError.set(
        firebaseErrorMessage(error, this.language.current()),
      );
    } finally {
      this.recurringActionId.set(null);
    }
  }

  recurringFrequencyLabel(frequency: RecurringFrequency): string {
    return this.t(`recurring.${frequency}` as TranslationKey);
  }

  exportExpenses(expenses: Expense[]): void {
    if (!expenses.length) {
      return;
    }

    const csv = buildExpenseCsv(
      expenses,
      {
        description: this.t('export.description'),
        amount: this.t('export.amount'),
        category: this.t('export.category'),
        transactionType: this.t('export.transactionType'),
        paymentMethod: this.t('export.paymentMethod'),
        date: this.t('export.date'),
        createdAt: this.t('export.createdAt'),
      },
      (category) => this.categoryLabel(category),
      (type) => this.transactionTypeLabel(type),
      (method) => this.paymentMethodLabel(method),
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `expense-io-${this.today()}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url));
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
      await this.expenseService.deleteExpense(
        user.uid,
        expense.id,
        expense.photoStoragePath,
      );
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

  isSectionCollapsed(section: DashboardSection): boolean {
    return this.collapsedSections().has(section);
  }

  toggleSection(section: DashboardSection): void {
    if (!this.mobileViewport.matches) {
      return;
    }

    this.collapsedSections.update((current) => {
      const next = new Set(current);

      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }

      return next;
    });
  }

  toggleExpenseFilters(): void {
    this.expenseFiltersOpen.update((open) => !open);
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

  private defaultAnalyticsFilters(): AnalyticsFilters {
    const now = new Date();

    return {
      mode: 'month',
      year: now.getFullYear(),
      month: now.getMonth(),
      category: 'All',
      transactionType: 'expense',
    };
  }

  currencySymbol(code: string): string {
    switch (code) {
      case 'EUR':
        return '€';
      case 'USD':
        return '$';
      case 'GBP':
        return '£';
      case 'CHF':
        return 'CHF';
      case 'JPY':
        return '¥';
      case 'CAD':
        return 'C$';
      case 'AUD':
        return 'A$';
      default:
        return code || '€';
    }
  }

  categoryLabel(category: ExpenseCategory | 'All'): string {
    return this.language.category(category);
  }

  transactionTypeLabel(type: TransactionType | 'All'): string {
    return this.language.transactionType(type);
  }

  paymentMethodLabel(method: PaymentMethod | null | 'All'): string {
    return this.language.paymentMethod(method);
  }

  monthLabel(month: number): string {
    return this.language.month(month);
  }

  analyticsComparisonPeriod(filters: AnalyticsFilters): string {
    if (filters.mode === 'month') {
      return this.t('analytics.previousMonth');
    }

    return filters.year === new Date().getFullYear()
      ? this.t('analytics.previousYearToDate')
      : this.t('analytics.previousYear');
  }

  formatDateKey(dateKey: string): string {
    const [year, month, day] = dateKey.split('-').map(Number);

    if (!year || !month || !day) {
      return dateKey;
    }

    return new Intl.DateTimeFormat(this.language.locale(), {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(year, month - 1, day, 12));
  }

  @HostListener('document:click')
  closeCategoryMenu(): void {
    this.categoryMenuOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    this.categoryMenuOpen.set(false);
    this.cancelDelete();
    this.closeSettings();
    this.cancelDeleteAccount();
    this.cancelEditExpense();
    this.closeRecurringExpenses();
    this.cancelStatementImport();
    this.closeBreakdownTransactions();
    this.closeChartPointTransactions();
  }

  private currentMonthTotal(
    expenses: Expense[],
    type: TransactionType,
  ): number {
    const now = new Date();

    return expenses.reduce((total, expense) => {
      if (expense.transactionType !== type) {
        return total;
      }

      const occurredAt = expense.occurredAt.toDate();
      const isCurrentMonth =
        occurredAt.getFullYear() === now.getFullYear() &&
        occurredAt.getMonth() === now.getMonth();

      return isCurrentMonth ? total + expense.amountCents : total;
    }, 0);
  }

  private totalForType(expenses: Expense[], type: TransactionType): number {
    return expenses.reduce(
      (total, expense) =>
        expense.transactionType === type
          ? total + expense.amountCents
          : total,
      0,
    );
  }

  private syncSpendingLimitForm(limits: SpendingLimits): void {
    if (this.spendingLimitForm.dirty) {
      return;
    }

    this.spendingLimitForm.setValue(
      {
        dailyLimit:
          limits.dailyLimitCents === null
            ? null
            : limits.dailyLimitCents / 100,
        monthlyLimit:
          limits.monthlyLimitCents === null
            ? null
            : limits.monthlyLimitCents / 100,
        excludeIncome: limits.excludeIncome,
        emailAlertsEnabled: limits.emailAlertsEnabled || false,
        alertThreshold50: (limits.alertThresholds || []).includes(50),
        alertThreshold80: (limits.alertThresholds || []).includes(80),
        alertThreshold99: (limits.alertThresholds || []).includes(99),
        baseCurrency: limits.baseCurrency || 'EUR',
      },
      { emitEvent: false },
    );
  }

  private syncBalanceBaselineForm(baseline: BalanceBaseline): void {
    if (this.balanceBaselineForm.dirty) {
      return;
    }

    this.balanceBaselineForm.setValue(
      {
        amount:
          baseline.amountCents === null ? null : baseline.amountCents / 100,
        currency: baseline.currency || 'EUR',
        effectiveDate: baseline.effectiveDate || this.today(),
      },
      { emitEvent: false },
    );
  }

  private setNewExpensePhoto(file: File): void {
    this.revokePreviewUrl(this.newExpensePhotoPreviewUrl());
    this.newExpensePhoto.set(file);
    this.newExpensePhotoPreviewUrl.set(URL.createObjectURL(file));
  }

  private setEditExpensePhoto(file: File): void {
    this.revokePreviewUrl(this.editExpensePhotoPreviewUrl());
    this.editExpensePhoto.set(file);
    this.editExpensePhotoPreviewUrl.set(URL.createObjectURL(file));
  }

  private revokePreviewUrl(url: string): void {
    if (url) {
      URL.revokeObjectURL(url);
    }
  }

  private syncExpensePhotoUrls(expenses: Expense[]): void {
    this.activePhotoPaths = new Set(
      expenses.flatMap((expense) =>
        expense.photoStoragePath ? [expense.photoStoragePath] : [],
      ),
    );
    this.expensePhotoUrls.update((urls) =>
      Object.fromEntries(
        Object.entries(urls).filter(([path]) =>
          this.activePhotoPaths.has(path),
        ),
      ),
    );

    for (const storagePath of this.activePhotoPaths) {
      if (
        this.expensePhotoUrls()[storagePath] ||
        this.photoUrlRequests.has(storagePath)
      ) {
        continue;
      }

      this.loadExpensePhotoUrl(storagePath);
    }
  }

  private refreshExpensePhotoUrl(storagePath: string): void {
    this.expensePhotoUrls.update((urls) =>
      Object.fromEntries(
        Object.entries(urls).filter(([path]) => path !== storagePath),
      ),
    );
    this.loadExpensePhotoUrl(storagePath);
  }

  private loadExpensePhotoUrl(storagePath: string): void {
    if (this.photoUrlRequests.has(storagePath)) {
      return;
    }

    this.photoUrlRequests.add(storagePath);
    void this.expensePhotoService
      .downloadUrl(storagePath)
      .then((url) => {
        if (this.activePhotoPaths.has(storagePath)) {
          this.expensePhotoUrls.update((urls) => ({
            ...urls,
            [storagePath]: url,
          }));
        }
      })
      .catch(() => undefined)
      .finally(() => this.photoUrlRequests.delete(storagePath));
  }

  private async readStatementPdf(file: File): Promise<void> {
    this.isReadingStatement.set(true);
    this.statementImportOpen.set(false);
    this.statementImportDrafts.set([]);
    this.detectedStatementBalance.set(null);
    this.statementImportFileName.set(file.name);
    this.statementImportError.set('');

    try {
      const text = await this.extractPdfText(file);
      const statement = parsePdfStatement(text, {
        defaultCurrency: this.spendingLimitForm.controls.baseCurrency.value || 'EUR',
        defaultYear: new Date().getFullYear(),
      });
      const existingTransactionCounts =
        this.existingTransactionDuplicateCounts();
      let duplicateCount = 0;
      const drafts: StatementImportReviewItem[] = [];

      for (const draft of statement.transactions) {
        const duplicateKey = this.statementDraftDuplicateKey(draft);

        if (
          this.consumeExistingTransactionDuplicate(
            existingTransactionCounts,
            duplicateKey,
          )
        ) {
          duplicateCount += 1;
          continue;
        }

        drafts.push({
          ...draft,
          selected: true,
        });
      }

      if (!drafts.length) {
        this.statementImportError.set(
          duplicateCount
            ? this.t('import.onlyDuplicates', { count: duplicateCount })
            : this.t('import.empty'),
        );
        this.statementImportFileName.set('');
        return;
      }

      this.statementImportDrafts.set(drafts);
      this.detectedStatementBalance.set(statement.balance);
      this.statementImportOpen.set(true);
      if (duplicateCount) {
        this.statementImportSuccess.set(
          this.t('import.duplicatesSkipped', { count: duplicateCount }),
        );
      }
    } catch (error: unknown) {
      console.error('Statement PDF import failed.', error);
      this.statementImportError.set(this.t('import.readError'));
      this.statementImportFileName.set('');
    } finally {
      this.isReadingStatement.set(false);
    }
  }

  private async extractPdfText(file: File): Promise<string> {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'build/pdf.worker.mjs',
      window.document.baseURI,
    ).toString();

    const pdfDocument = await pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
    }).promise;
    const pages: string[] = [];

    try {
      for (
        let pageNumber = 1;
        pageNumber <= pdfDocument.numPages;
        pageNumber += 1
      ) {
        const page = await pdfDocument.getPage(pageNumber);
        const textContent = await page.getTextContent();
        pages.push(this.pdfTextRows(textContent.items));
        page.cleanup();
      }
    } finally {
      await pdfDocument.destroy();
    }

    return pages.join('\n');
  }

  private pdfTextRows(items: readonly unknown[]): string {
    const rows: {
      y: number;
      parts: { x: number; text: string }[];
    }[] = [];

    for (const item of items) {
      if (!this.isPdfTextItem(item)) {
        continue;
      }

      const text = item.str.replace(/\s+/g, ' ').trim();
      if (!text) {
        continue;
      }

      const x =
        typeof item.transform?.[4] === 'number' ? item.transform[4] : 0;
      const y =
        typeof item.transform?.[5] === 'number' ? item.transform[5] : 0;
      let row = rows.find((candidate) => Math.abs(candidate.y - y) < 2);

      if (!row) {
        row = { y, parts: [] };
        rows.push(row);
      }

      row.parts.push({ x, text });
    }

    return rows
      .sort((left, right) => right.y - left.y)
      .map((row) => this.renderPdfTextRow(row.parts))
      .join('\n');
  }

  private renderPdfTextRow(parts: { x: number; text: string }[]): string {
    return parts
      .sort((left, right) => left.x - right.x)
      .reduce((line, part) => {
        const column = Math.max(0, Math.round(part.x / 4));
        const spacing = Math.max(line ? 1 : 0, column - line.length);

        return `${line}${' '.repeat(spacing)}${part.text}`;
      }, '')
      .trimEnd();
  }

  private isPdfTextItem(item: unknown): item is PdfTextItem {
    return (
      typeof item === 'object' &&
      item !== null &&
      typeof (item as { str?: unknown }).str === 'string'
    );
  }

  private isPdfFile(file: File): boolean {
    return (
      file.type === 'application/pdf' ||
      file.name.toLocaleLowerCase().endsWith('.pdf')
    );
  }

  private existingTransactionDuplicateCounts(): Map<string, number> {
    const counts = new Map<string, number>();

    for (const expense of this.currentExpenses()) {
      const key = this.expenseDuplicateKey(expense);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return counts;
  }

  private consumeExistingTransactionDuplicate(
    counts: Map<string, number>,
    key: string,
  ): boolean {
    const count = counts.get(key) ?? 0;

    if (count <= 0) {
      return false;
    }

    counts.set(key, count - 1);
    return true;
  }

  private expenseDuplicateKey(expense: Expense): string {
    return this.transactionDuplicateKey(
      this.dateInputValue(expense.occurredAt.toDate()),
      expense.description,
      expense.amountCents,
    );
  }

  private statementDraftDuplicateKey(
    draft: Pick<
      PdfStatementTransactionDraft,
      'occurredOn' | 'description' | 'amountCents'
    >,
  ): string {
    return this.transactionDuplicateKey(
      draft.occurredOn,
      draft.description,
      draft.amountCents,
    );
  }

  private transactionDuplicateKey(
    occurredOn: string,
    description: string,
    amountCents: number,
  ): string {
    return [occurredOn, description.trim(), amountCents].join('\u001f');
  }

  private updateStatementImportDraft(
    importId: string,
    update: Partial<StatementImportReviewItem>,
  ): void {
    this.statementImportDrafts.update((drafts) =>
      drafts.map((draft) =>
        draft.importId === importId ? { ...draft, ...update } : draft,
      ),
    );
  }

  private donutSegmentPath(startAngle: number, endAngle: number): string {
    const outerStart = this.polarPoint(100, 100, 84, startAngle);
    const outerEnd = this.polarPoint(100, 100, 84, endAngle);
    const innerEnd = this.polarPoint(100, 100, 49, endAngle);
    const innerStart = this.polarPoint(100, 100, 49, startAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;

    return [
      `M ${outerStart.x} ${outerStart.y}`,
      `A 84 84 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
      `L ${innerEnd.x} ${innerEnd.y}`,
      `A 49 49 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
      'Z',
    ].join(' ');
  }

  private polarPoint(
    centerX: number,
    centerY: number,
    radius: number,
    angle: number,
  ): { x: number; y: number } {
    const radians = this.toRadians(angle);

    return {
      x: centerX + radius * Math.cos(radians),
      y: centerY + radius * Math.sin(radians),
    };
  }

  private toRadians(angle: number): number {
    return (angle * Math.PI) / 180;
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

  private updateAndSaveAnalyticsFilters(
    update: Partial<AnalyticsFilters>,
  ): void {
    const filters = {
      ...this.analyticsFilters(),
      ...update,
    };

    this.analyticsFilters.set(filters);
    this.saveAnalyticsPreferences(filters);
  }

  private saveAnalyticsPreferences(filters: AnalyticsFilters): void {
    const user = this.authService.currentUser;

    if (!user) {
      return;
    }

    void this.analyticsPreferencesService
      .savePreferences(user.uid, filters)
      .catch((error: unknown) => {
        this.loadError.set(
          firebaseErrorMessage(error, this.language.current()),
        );
      });
  }

  private recurringSyncInFlight = false;
  private pendingRecurringSync: {
    userId: string;
    schedules: RecurringExpenseSchedule[];
  } | null = null;

  private async syncRecurringExpenses(
    userId: string,
    schedules: RecurringExpenseSchedule[],
  ): Promise<void> {
    if (!schedules.length) {
      return;
    }

    if (this.recurringSyncInFlight) {
      this.pendingRecurringSync = { userId, schedules };
      return;
    }

    this.recurringSyncInFlight = true;

    try {
      await this.recurringExpenseService.syncDueExpenses(userId, schedules);
    } catch (error: unknown) {
      this.recurringError.set(
        firebaseErrorMessage(error, this.language.current()),
      );
    } finally {
      this.recurringSyncInFlight = false;

      const pendingSync = this.pendingRecurringSync;
      this.pendingRecurringSync = null;

      if (pendingSync) {
        void this.syncRecurringExpenses(
          pendingSync.userId,
          pendingSync.schedules,
        );
      }
    }
  }

  private dateInputValue(date: Date): string {
    const timezoneOffset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 10);
  }

  private today(): string {
    const now = new Date();
    const timezoneOffset = now.getTimezoneOffset() * 60_000;
    return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
  }

  openBreakdownTransactions(category: ExpenseCategory): void {
    this.selectedBreakdownCategory.set(category);
  }

  closeBreakdownTransactions(): void {
    this.selectedBreakdownCategory.set(null);
  }

  openChartPointTransactions(index: number, label: string): void {
    this.chartPointDeleteError.set('');
    this.selectedChartPoint.set({ index, label });
  }

  closeChartPointTransactions(): void {
    if (!this.isErasingChartPoint()) {
      this.chartPointDeleteError.set('');
      this.selectedChartPoint.set(null);
    }
  }

  getChartPointTransactions(
    expenses: Expense[],
    selection: ChartPointSelection,
    filters: AnalyticsFilters,
  ): Expense[] {
    return expenses
      .filter((expense) => {
        if (
          filters.transactionType !== 'merged' &&
          expense.transactionType !== filters.transactionType
        ) {
          return false;
        }
        if (filters.category !== 'All' && expense.category !== filters.category) {
          return false;
        }

        const date = expense.occurredAt.toDate();
        const matchesYear = date.getFullYear() === filters.year;
        const matchesPoint =
          filters.mode === 'month'
            ? date.getMonth() === filters.month &&
              date.getDate() === selection.index + 1
            : date.getMonth() === selection.index;

        return matchesYear && matchesPoint;
      })
      .sort((a, b) => b.occurredAt.toMillis() - a.occurredAt.toMillis());
  }

  getBreakdownTransactions(
    expenses: Expense[],
    category: ExpenseCategory,
    filters: AnalyticsFilters,
  ): Expense[] {
    return expenses
      .filter((expense) => {
        if (expense.category !== category) {
          return false;
        }
        if (expense.transactionType !== filters.transactionType) {
          return false;
        }
        const date = expense.occurredAt.toDate();
        const matchesPeriod =
          date.getFullYear() === filters.year &&
          (filters.mode === 'year' || date.getMonth() === filters.month);

        return matchesPeriod;
      })
      .sort((a, b) => b.occurredAt.toMillis() - a.occurredAt.toMillis());
  }
}
