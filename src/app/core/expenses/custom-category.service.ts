import { Injectable, NgZone, inject } from '@angular/core';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { Observable } from 'rxjs';

import { firestore } from '../firebase/firebase.client';

@Injectable({ providedIn: 'root' })
export class CustomCategoryService {
  private readonly zone = inject(NgZone);

  watchCustomCategories(userId: string): Observable<string[]> {
    const documentReference = doc(firestore, `users/${userId}/settings/custom-categories`);

    return new Observable<string[]>((subscriber) =>
      onSnapshot(
        documentReference,
        (snapshot) => {
          this.zone.run(() => {
            if (snapshot.exists()) {
              const data = snapshot.data();
              subscriber.next((data['categories'] as string[]) ?? []);
            } else {
              subscriber.next([]);
            }
          });
        },
        (error) => this.zone.run(() => subscriber.error(error)),
        () => this.zone.run(() => subscriber.complete()),
      ),
    );
  }

  async saveCustomCategories(userId: string, categories: string[]): Promise<void> {
    const documentReference = doc(firestore, `users/${userId}/settings/custom-categories`);
    await setDoc(documentReference, {
      categories,
      updatedAt: serverTimestamp(),
    });
  }
}
