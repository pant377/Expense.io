import { Injectable, inject } from '@angular/core';
import {
  collection,
  doc,
  getDocs,
  writeBatch,
} from 'firebase/firestore';

import { firestore } from '../firebase/firebase.client';
import { ExpensePhotoService } from '../expenses/expense-photo';

const DELETE_BATCH_SIZE = 450;

@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly expensePhotoService = inject(ExpensePhotoService);

  async deleteUserData(userId: string): Promise<void> {
    await this.expensePhotoService.deleteUserPhotos(userId);

    const [expenses, recurringExpenses] = await Promise.all([
      getDocs(collection(firestore, `users/${userId}/expenses`)),
      getDocs(collection(firestore, `users/${userId}/recurring-expenses`)),
    ]);
    const references = [
      ...expenses.docs.map((expense) => expense.ref),
      ...recurringExpenses.docs.map((schedule) => schedule.ref),
    ];

    for (let index = 0; index < references.length; index += DELETE_BATCH_SIZE) {
      const batch = writeBatch(firestore);

      references
        .slice(index, index + DELETE_BATCH_SIZE)
        .forEach((reference) => batch.delete(reference));

      await batch.commit();
    }

    const finalBatch = writeBatch(firestore);
    finalBatch.delete(
      doc(firestore, `users/${userId}/settings/spending-limits`),
    );
    finalBatch.delete(doc(firestore, `users/${userId}`));
    await finalBatch.commit();
  }
}
