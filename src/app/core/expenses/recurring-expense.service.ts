import { Injectable, NgZone, inject } from '@angular/core';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { Observable } from 'rxjs';

import { firestore } from '../firebase/firebase.client';
import {
  RecurringExpenseDraft,
  RecurringExpenseSchedule,
  dateKey,
  nextOccurrenceOnOrAfter,
  nextRecurringDate,
} from './recurring-expense.model';

const MAX_OCCURRENCES_PER_SYNC = 400;

@Injectable({ providedIn: 'root' })
export class RecurringExpenseService {
  private readonly zone = inject(NgZone);

  watchSchedules(userId: string): Observable<RecurringExpenseSchedule[]> {
    const schedules = collection(
      firestore,
      `users/${userId}/recurring-expenses`,
    );

    return new Observable<RecurringExpenseSchedule[]>((subscriber) =>
      onSnapshot(
        schedules,
        (snapshot) =>
          this.zone.run(() =>
            subscriber.next(
              snapshot.docs
                .map((scheduleDocument) => ({
                  id: scheduleDocument.id,
                  ...scheduleDocument.data({ serverTimestamps: 'estimate' }),
                }) as RecurringExpenseSchedule)
                .sort(
                  (left, right) =>
                    (right.createdAt?.toMillis?.() ?? 0) -
                    (left.createdAt?.toMillis?.() ?? 0),
                ),
            ),
          ),
        (error) => this.zone.run(() => subscriber.error(error)),
        () => this.zone.run(() => subscriber.complete()),
      ),
    );
  }

  async addSchedule(
    userId: string,
    draft: RecurringExpenseDraft,
  ): Promise<void> {
    const scheduleReference = doc(
      collection(firestore, `users/${userId}/recurring-expenses`),
    );
    const batch = writeBatch(firestore);

    const nextOccurrence = this.appendDueExpenseWrites(
      batch,
      userId,
      {
        id: scheduleReference.id,
        ...draft,
        nextOccurrenceAt: draft.startDate,
        active: true,
        createdAt: draft.startDate,
        updatedAt: draft.startDate,
      },
      endOfLocalDay(new Date()),
    );

    batch.set(scheduleReference, {
      ...draft,
      nextOccurrenceAt: Timestamp.fromDate(nextOccurrence),
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  }

  async syncDueExpenses(
    userId: string,
    schedules: RecurringExpenseSchedule[],
  ): Promise<void> {
    const today = endOfLocalDay(new Date());

    for (const schedule of schedules) {
      if (!schedule.active || schedule.nextOccurrenceAt.toDate() > today) {
        continue;
      }

      const batch = writeBatch(firestore);
      const scheduleReference = doc(
        firestore,
        `users/${userId}/recurring-expenses/${schedule.id}`,
      );

      const nextOccurrence = this.appendDueExpenseWrites(
        batch,
        userId,
        schedule,
        today,
      );
      batch.update(scheduleReference, {
        nextOccurrenceAt: Timestamp.fromDate(nextOccurrence),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    }
  }

  async setActive(
    userId: string,
    schedule: RecurringExpenseSchedule,
    active: boolean,
  ): Promise<void> {
    const scheduleReference = doc(
      firestore,
      `users/${userId}/recurring-expenses/${schedule.id}`,
    );
    const batch = writeBatch(firestore);
    const update: Record<string, unknown> = {
      active,
      updatedAt: serverTimestamp(),
    };

    if (active) {
      update['nextOccurrenceAt'] = Timestamp.fromDate(
        nextOccurrenceOnOrAfter(
          schedule.startDate.toDate(),
          new Date(),
          schedule.frequency,
        ),
      );
    }

    batch.update(scheduleReference, update);
    await batch.commit();
  }

  async deleteSchedule(userId: string, scheduleId: string): Promise<void> {
    await deleteDoc(
      doc(firestore, `users/${userId}/recurring-expenses/${scheduleId}`),
    );
  }

  private appendDueExpenseWrites(
    batch: ReturnType<typeof writeBatch>,
    userId: string,
    schedule: RecurringExpenseSchedule,
    throughDate: Date,
  ): Date {
    let occurrence = schedule.nextOccurrenceAt.toDate();
    const anchorDay = schedule.startDate.toDate().getDate();
    let generated = 0;

    while (
      occurrence <= throughDate &&
      generated < MAX_OCCURRENCES_PER_SYNC
    ) {
      const occurrenceKey = dateKey(occurrence);
      const expenseReference = doc(
        firestore,
        `users/${userId}/expenses/recurring_${schedule.id}_${occurrenceKey}`,
      );

      batch.set(expenseReference, {
        description: schedule.description,
        amountCents: schedule.amountCents,
        category: schedule.category,
        occurredAt: Timestamp.fromDate(occurrence),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      occurrence = nextRecurringDate(
        occurrence,
        schedule.frequency,
        anchorDay,
      );
      generated += 1;
    }

    return occurrence;
  }
}

function endOfLocalDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  );
}
