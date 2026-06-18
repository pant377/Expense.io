import { Injectable, NgZone, inject } from '@angular/core';
import {
  Timestamp,
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { Observable } from 'rxjs';

import { firestore } from '../firebase/firebase.client';
import { Expense, ExpenseDraft, normalizeExpense } from './expense.model';
import {
  ExpensePhotoMetadata,
  ExpensePhotoService,
} from './expense-photo';

export type ExpensePhotoUpdate =
  | { action: 'keep' }
  | { action: 'remove' }
  | { action: 'replace'; file: File };

@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private readonly zone = inject(NgZone);
  private readonly expensePhotoService = inject(ExpensePhotoService);

  watchExpenses(userId: string): Observable<Expense[]> {
    const expenses = collection(firestore, `users/${userId}/expenses`);

    return new Observable<Expense[]>((subscriber) =>
      onSnapshot(
        expenses,
        (snapshot) =>
          this.zone.run(() =>
            subscriber.next(
              snapshot.docs.map((expenseDocument) =>
                normalizeExpense(
                  expenseDocument.id,
                  expenseDocument.data({ serverTimestamps: 'estimate' }),
                ),
              ),
            ),
          ),
        (error) => this.zone.run(() => subscriber.error(error)),
        () => this.zone.run(() => subscriber.complete()),
      ),
    );
  }

  async addExpense(
    userId: string,
    expense: ExpenseDraft,
    photo: File | null = null,
  ): Promise<void> {
    const expenses = collection(firestore, `users/${userId}/expenses`);
    const expenseReference = doc(expenses);
    let photoMetadata: ExpensePhotoMetadata | null = null;

    try {
      if (photo) {
        photoMetadata = await this.expensePhotoService.upload(
          userId,
          expenseReference.id,
          photo,
        );
      }

      await setDoc(expenseReference, {
        ...expense,
        ...(photoMetadata ?? {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error: unknown) {
      if (photoMetadata) {
        await this.expensePhotoService
          .delete(photoMetadata.photoStoragePath)
          .catch(() => undefined);
      }

      throw error;
    }
  }

  async deleteExpense(
    userId: string,
    expenseId: string,
    photoStoragePath: string | null = null,
  ): Promise<void> {
    await deleteDoc(doc(firestore, `users/${userId}/expenses/${expenseId}`));

    if (photoStoragePath) {
      await this.expensePhotoService.delete(photoStoragePath).catch(() => undefined);
    }
  }

  async deleteExpenses(
    userId: string,
    expenses: readonly Expense[],
  ): Promise<void> {
    const batchSize = 450;

    for (let index = 0; index < expenses.length; index += batchSize) {
      const batch = writeBatch(firestore);

      for (const expense of expenses.slice(index, index + batchSize)) {
        batch.delete(doc(firestore, `users/${userId}/expenses/${expense.id}`));
      }

      await batch.commit();
    }

    await Promise.all(
      expenses
        .map((expense) => expense.photoStoragePath)
        .filter(
          (path): path is string =>
            typeof path === 'string' && path.length > 0,
        )
        .map((path) =>
          this.expensePhotoService.delete(path).catch(() => undefined),
        ),
    );
  }

  async updateExpense(
    userId: string,
    expenseId: string,
    expense: ExpenseDraft,
    photoUpdate: ExpensePhotoUpdate = { action: 'keep' },
  ): Promise<void> {
    let photoFields: {
      photoStoragePath?: unknown;
      photoFileName?: unknown;
      photoContentType?: unknown;
    } = {};

    if (photoUpdate.action === 'replace') {
      photoFields = await this.expensePhotoService.upload(
        userId,
        expenseId,
        photoUpdate.file,
      );
    } else if (photoUpdate.action === 'remove') {
      photoFields = {
        photoStoragePath: deleteField(),
        photoFileName: deleteField(),
        photoContentType: deleteField(),
      };
    }

    await updateDoc(doc(firestore, `users/${userId}/expenses/${expenseId}`), {
      ...expense,
      ...photoFields,
      updatedAt: serverTimestamp(),
    });

    if (photoUpdate.action === 'remove') {
      await this.expensePhotoService
        .delete(
          `users/${userId}/expenses/${expenseId}/receipt`,
        )
        .catch(() => undefined);
    }
  }

  dateToTimestamp(date: string): Timestamp {
    return Timestamp.fromDate(new Date(`${date}T12:00:00`));
  }
}
