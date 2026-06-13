import { Injectable, NgZone, inject } from '@angular/core';
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import { Observable } from 'rxjs';

import { firestore } from '../firebase/firebase.client';
import { Expense, ExpenseDraft } from './expense.model';

@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private readonly zone = inject(NgZone);

  watchExpenses(userId: string): Observable<Expense[]> {
    const expenses = collection(firestore, `users/${userId}/expenses`);
    const orderedExpenses = query(expenses, orderBy('occurredAt', 'desc'));

    return new Observable<Expense[]>((subscriber) =>
      onSnapshot(
        orderedExpenses,
        (snapshot) =>
          this.zone.run(() =>
            subscriber.next(
              snapshot.docs.map((expenseDocument) => ({
                id: expenseDocument.id,
                ...expenseDocument.data(),
              })) as Expense[],
            ),
          ),
        (error) => this.zone.run(() => subscriber.error(error)),
        () => this.zone.run(() => subscriber.complete()),
      ),
    );
  }

  async addExpense(userId: string, expense: ExpenseDraft): Promise<void> {
    const expenses = collection(firestore, `users/${userId}/expenses`);

    await addDoc(expenses, {
      ...expense,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async deleteExpense(userId: string, expenseId: string): Promise<void> {
    await deleteDoc(doc(firestore, `users/${userId}/expenses/${expenseId}`));
  }

  dateToTimestamp(date: string): Timestamp {
    return Timestamp.fromDate(new Date(`${date}T12:00:00`));
  }
}
