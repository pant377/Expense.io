import { Injectable, NgZone, inject } from '@angular/core';
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { Observable } from 'rxjs';

import { firestore } from '../firebase/firebase.client';
import {
  AnalyticsFilters,
  AnalyticsMode,
  AnalyticsTransactionType,
} from './expense-analytics';

@Injectable({ providedIn: 'root' })
export class AnalyticsPreferencesService {
  private readonly zone = inject(NgZone);

  watchPreferences(
    userId: string,
    defaults: AnalyticsFilters,
  ): Observable<AnalyticsFilters> {
    const preferencesReference = doc(
      firestore,
      `users/${userId}/settings/analytics-preferences`,
    );

    return new Observable<AnalyticsFilters>((subscriber) =>
      onSnapshot(
        preferencesReference,
        (snapshot) =>
          this.zone.run(() => {
            if (!snapshot.exists()) {
              subscriber.next(defaults);
              return;
            }

            subscriber.next(
              normalizeAnalyticsPreferences(snapshot.data(), defaults),
            );
          }),
        (error) => this.zone.run(() => subscriber.error(error)),
        () => this.zone.run(() => subscriber.complete()),
      ),
    );
  }

  async savePreferences(
    userId: string,
    filters: AnalyticsFilters,
  ): Promise<void> {
    const preferencesReference = doc(
      firestore,
      `users/${userId}/settings/analytics-preferences`,
    );

    await setDoc(
      preferencesReference,
      {
        mode: filters.mode,
        year: filters.year,
        month: filters.month,
        category: filters.category,
        transactionType: filters.transactionType,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }
}

function normalizeAnalyticsPreferences(
  data: Record<string, unknown>,
  defaults: AnalyticsFilters,
): AnalyticsFilters {
  return {
    mode: isAnalyticsMode(data['mode']) ? data['mode'] : defaults.mode,
    year: isYear(data['year']) ? data['year'] : defaults.year,
    month: isMonth(data['month']) ? data['month'] : defaults.month,
    category: isCategory(data['category'])
      ? data['category']
      : defaults.category,
    transactionType: isAnalyticsTransactionType(data['transactionType'])
      ? data['transactionType']
      : defaults.transactionType,
  };
}

function isAnalyticsMode(value: unknown): value is AnalyticsMode {
  return value === 'month' || value === 'year';
}

function isAnalyticsTransactionType(
  value: unknown,
): value is AnalyticsTransactionType {
  return value === 'expense' || value === 'income' || value === 'merged';
}

function isYear(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1900 &&
    value <= 2200
  );
}

function isMonth(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 11
  );
}

function isCategory(value: unknown): value is AnalyticsFilters['category'] {
  return typeof value === 'string' && value.length > 0 && value.length <= 50;
}
