import { Injectable, NgZone, inject } from '@angular/core';
import {
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { Observable } from 'rxjs';

import { firestore } from '../firebase/firebase.client';
import {
  BalanceBaseline,
  BalanceBaselineSource,
  BalanceInstitution,
  EMPTY_BALANCE_BASELINE,
} from './balance-baseline.model';

@Injectable({ providedIn: 'root' })
export class BalanceBaselineService {
  private readonly zone = inject(NgZone);

  watchBaseline(userId: string): Observable<BalanceBaseline> {
    const baselineReference = doc(
      firestore,
      `users/${userId}/settings/balance-baseline`,
    );

    return new Observable<BalanceBaseline>((subscriber) =>
      onSnapshot(
        baselineReference,
        (snapshot) =>
          this.zone.run(() => {
            if (!snapshot.exists()) {
              subscriber.next({ ...EMPTY_BALANCE_BASELINE });
              return;
            }

            const data = snapshot.data();
            subscriber.next({
              amountCents:
                typeof data['amountCents'] === 'number'
                  ? data['amountCents']
                  : null,
              currency:
                typeof data['currency'] === 'string' ? data['currency'] : 'EUR',
              effectiveDate:
                typeof data['effectiveDate'] === 'string'
                  ? data['effectiveDate']
                  : '',
              source: isBalanceBaselineSource(data['source'])
                ? data['source']
                : 'manual',
              institution: isBalanceInstitution(data['institution'])
                ? data['institution']
                : null,
            });
          }),
        (error) => this.zone.run(() => subscriber.error(error)),
        () => this.zone.run(() => subscriber.complete()),
      ),
    );
  }

  async saveBaseline(
    userId: string,
    baseline: BalanceBaseline,
  ): Promise<void> {
    const baselineReference = doc(
      firestore,
      `users/${userId}/settings/balance-baseline`,
    );

    await setDoc(
      baselineReference,
      {
        ...baseline,
        institution: baseline.institution ?? null,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  async clearBaseline(userId: string): Promise<void> {
    await deleteDoc(doc(firestore, `users/${userId}/settings/balance-baseline`));
  }
}

function isBalanceBaselineSource(value: unknown): value is BalanceBaselineSource {
  return value === 'manual' || value === 'statement';
}

function isBalanceInstitution(value: unknown): value is BalanceInstitution {
  return (
    value === 'alpha' ||
    value === 'ethniki' ||
    value === 'eurobank' ||
    value === 'piraeus' ||
    value === 'unknown'
  );
}
