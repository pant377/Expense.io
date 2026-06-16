import { Injectable, NgZone, inject } from '@angular/core';
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { Observable, BehaviorSubject } from 'rxjs';

import { firestore } from '../firebase/firebase.client';

export interface ExchangeRatesData {
  rates: Record<string, number>;
  updatedAt: Timestamp | null;
}

export const DEFAULT_EXCHANGE_RATES: Record<string, number> = {
  EUR: 1.0,
  USD: 1.08,
  GBP: 0.85,
  CHF: 0.96,
  JPY: 168.0,
  CAD: 1.48,
  AUD: 1.62,
};

@Injectable({ providedIn: 'root' })
export class CurrencyService {
  private readonly zone = inject(NgZone);
  private readonly rates$ = new BehaviorSubject<Record<string, number>>({ ...DEFAULT_EXCHANGE_RATES });

  /**
   * Watch the user's exchange rates in Firestore and trigger sync if outdated.
   */
  watchAndSyncRates(userId: string): Observable<Record<string, number>> {
    const ratesReference = doc(
      firestore,
      `users/${userId}/settings/exchange-rates`,
    );

    return new Observable<Record<string, number>>((subscriber) =>
      onSnapshot(
        ratesReference,
        (snapshot) =>
          this.zone.run(() => {
            if (!snapshot.exists()) {
              // Document doesn't exist, trigger immediate sync and use defaults temporarily
              this.syncRatesFromApi(userId).catch(console.error);
              subscriber.next({ ...DEFAULT_EXCHANGE_RATES });
              return;
            }

            const data = snapshot.data();
            const rates = data['rates'] as Record<string, number>;
            const updatedAt = data['updatedAt'] as Timestamp | null;

            subscriber.next(rates || { ...DEFAULT_EXCHANGE_RATES });
            this.rates$.next(rates || { ...DEFAULT_EXCHANGE_RATES });

            // Check if last sync was more than 24 hours ago
            const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
            if (!updatedAt || updatedAt.toDate().getTime() < oneDayAgo) {
              this.syncRatesFromApi(userId).catch(console.error);
            }
          }),
        (error) => this.zone.run(() => subscriber.error(error)),
        () => this.zone.run(() => subscriber.complete()),
      ),
    );
  }

  /**
   * Retrieve the current cached rates synchronously.
   */
  getCurrentRates(): Record<string, number> {
    return this.rates$.getValue();
  }

  /**
   * Fetch exchange rates from public API and write them to Firestore.
   */
  private async syncRatesFromApi(userId: string): Promise<void> {
    try {
      console.log('Fetching exchange rates from Frankfurter API...');
      const response = await fetch('https://api.frankfurter.app/latest?from=EUR');
      
      if (!response.ok) {
        throw new Error(`Frankfurter API returned status: ${response.status}`);
      }

      const data = await response.json();
      const apiRates = data.rates as Record<string, number>;

      if (apiRates) {
        const rates: Record<string, number> = {
          EUR: 1.0,
          USD: apiRates['USD'] || DEFAULT_EXCHANGE_RATES['USD'],
          GBP: apiRates['GBP'] || DEFAULT_EXCHANGE_RATES['GBP'],
          CHF: apiRates['CHF'] || DEFAULT_EXCHANGE_RATES['CHF'],
          JPY: apiRates['JPY'] || DEFAULT_EXCHANGE_RATES['JPY'],
          CAD: apiRates['CAD'] || DEFAULT_EXCHANGE_RATES['CAD'],
          AUD: apiRates['AUD'] || DEFAULT_EXCHANGE_RATES['AUD'],
        };

        const ratesReference = doc(
          firestore,
          `users/${userId}/settings/exchange-rates`,
        );

        await setDoc(ratesReference, {
          rates,
          updatedAt: serverTimestamp(),
        });
        console.log('Successfully synced exchange rates to Firestore.');
      }
    } catch (error) {
      console.warn('Failed to sync exchange rates from API, using cached or default values:', error);
    }
  }
}
