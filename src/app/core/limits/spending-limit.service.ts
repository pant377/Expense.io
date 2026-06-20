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
  EMPTY_SPENDING_LIMITS,
  SpendingLimits,
} from './spending-limit.model';

@Injectable({ providedIn: 'root' })
export class SpendingLimitService {
  private readonly zone = inject(NgZone);

  watchLimits(userId: string): Observable<SpendingLimits> {
    const limitsReference = doc(
      firestore,
      `users/${userId}/settings/spending-limits`,
    );

    return new Observable<SpendingLimits>((subscriber) =>
      onSnapshot(
        limitsReference,
        (snapshot) =>
          this.zone.run(() => {
            if (!snapshot.exists()) {
              subscriber.next({ ...EMPTY_SPENDING_LIMITS });
              return;
            }

            const data = snapshot.data();
            subscriber.next({
              showOnDashboard:
                typeof data['showOnDashboard'] === 'boolean'
                  ? data['showOnDashboard']
                  : typeof data['dailyLimitCents'] === 'number' ||
                    typeof data['monthlyLimitCents'] === 'number',
              dailyLimitCents:
                typeof data['dailyLimitCents'] === 'number'
                  ? data['dailyLimitCents']
                  : null,
              monthlyLimitCents:
                typeof data['monthlyLimitCents'] === 'number'
                  ? data['monthlyLimitCents']
                  : null,
              excludeIncome:
                typeof data['excludeIncome'] === 'boolean'
                  ? data['excludeIncome']
                  : true,
              emailAlertsEnabled:
                typeof data['emailAlertsEnabled'] === 'boolean'
                  ? data['emailAlertsEnabled']
                  : false,
              alertThresholds:
                Array.isArray(data['alertThresholds'])
                  ? data['alertThresholds']
                  : [],
              baseCurrency:
                typeof data['baseCurrency'] === 'string'
                  ? data['baseCurrency']
                  : 'EUR',
            });
          }),
        (error) => this.zone.run(() => subscriber.error(error)),
        () => this.zone.run(() => subscriber.complete()),
      ),
    );
  }

  async saveLimits(userId: string, limits: SpendingLimits): Promise<void> {
    const limitsReference = doc(
      firestore,
      `users/${userId}/settings/spending-limits`,
    );

    await setDoc(limitsReference, {
      ...limits,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
}
