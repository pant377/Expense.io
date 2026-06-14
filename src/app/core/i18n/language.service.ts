import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

import {
  ExpenseCategory,
  PaymentMethod,
  TransactionType,
} from '../expenses/expense.model';
import { formatMonthName } from './date-labels';
import { AppLanguage, TranslationKey, translate } from './translations';

const LANGUAGE_STORAGE_KEY = 'expense-io-language';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly document = inject(DOCUMENT);

  readonly current = signal<AppLanguage>(this.storedLanguage());
  readonly locale = computed(() => this.localeFor(this.current()));

  constructor() {
    this.document.documentElement.lang = this.current();
  }

  toggle(): void {
    this.setLanguage(this.current() === 'en' ? 'el' : 'en');
  }

  setLanguage(language: AppLanguage): void {
    this.current.set(language);
    this.document.documentElement.lang = language;

    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // The language still changes for the current session when storage is unavailable.
    }
  }

  t(
    key: TranslationKey,
    parameters: Record<string, string | number> = {},
  ): string {
    return translate(this.current(), key, parameters);
  }

  category(category: ExpenseCategory | 'All'): string {
    return this.t(`category.${category}` as TranslationKey);
  }

  transactionType(type: TransactionType | 'All'): string {
    return this.t(`transaction.${type}` as TranslationKey);
  }

  paymentMethod(method: PaymentMethod | null | 'All'): string {
    return this.t(
      `payment.${method ?? 'unspecified'}` as TranslationKey,
    );
  }

  month(month: number): string {
    return formatMonthName(this.locale(), month);
  }

  localeFor(language: AppLanguage): string {
    return language === 'el' ? 'el-GR' : 'en-GB';
  }

  private storedLanguage(): AppLanguage {
    try {
      const storedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);

      if (storedLanguage === 'el' || storedLanguage === 'en') {
        return storedLanguage;
      }
    } catch {
      // Fall through to browser language detection.
    }

    return typeof navigator !== 'undefined' && navigator.language.startsWith('el')
      ? 'el'
      : 'en';
  }
}
