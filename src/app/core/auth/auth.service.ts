import { Injectable, NgZone, inject } from '@angular/core';
import {
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Observable, shareReplay } from 'rxjs';

import { firebaseAuth, firestore } from '../firebase/firebase.client';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly zone = inject(NgZone);

  readonly user$: Observable<User | null> = new Observable<User | null>((subscriber) =>
    onAuthStateChanged(
      firebaseAuth,
      (user) => this.zone.run(() => subscriber.next(user)),
      (error) => this.zone.run(() => subscriber.error(error)),
      () => this.zone.run(() => subscriber.complete()),
    ),
  ).pipe(shareReplay({ bufferSize: 1, refCount: true }));

  get currentUser(): User | null {
    return firebaseAuth.currentUser;
  }

  async register(displayName: string, email: string, password: string): Promise<void> {
    const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
    const normalizedName = displayName.trim();

    await updateProfile(credential.user, { displayName: normalizedName });
    await setDoc(doc(firestore, `users/${credential.user.uid}`), {
      displayName: normalizedName,
      email: credential.user.email ?? email,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async login(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(firebaseAuth, email, password);
  }

  async loginWithGoogle(): Promise<void> {
    const credential = await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
    const profileReference = doc(firestore, `users/${credential.user.uid}`);
    const profile = await getDoc(profileReference);

    await setDoc(
      profileReference,
      {
        displayName: credential.user.displayName ?? 'Expense.io user',
        email: credential.user.email ?? '',
        ...(profile.exists() ? {} : { createdAt: serverTimestamp() }),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  async logout(): Promise<void> {
    await signOut(firebaseAuth);
  }
}
