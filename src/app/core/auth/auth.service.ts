import { Injectable, NgZone, inject } from '@angular/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { Capacitor } from '@capacitor/core';
import {
  AuthCredential,
  EmailAuthProvider,
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithCredential,
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
  ).pipe(shareReplay({ bufferSize: 1, refCount: false }));

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

  async requestPasswordReset(email: string): Promise<void> {
    await sendPasswordResetEmail(firebaseAuth, email);
  }

  async loginWithGoogle(): Promise<void> {
    const credential = this.usesNativeGoogleSignIn()
      ? await signInWithCredential(
          firebaseAuth,
          await this.createNativeGoogleCredential(),
        )
      : await signInWithPopup(firebaseAuth, new GoogleAuthProvider());

    await credential.user.getIdToken();

    void this.syncGoogleProfile(credential.user);
  }

  async logout(): Promise<void> {
    if (this.usesNativeGoogleSignIn()) {
      try {
        await FirebaseAuthentication.signOut();
      } catch {
        // The web Firebase session still needs to be cleared if native sign-out fails.
      }
    }

    await signOut(firebaseAuth);
  }

  usesPasswordProvider(): boolean {
    const providers = firebaseAuth.currentUser?.providerData ?? [];
    const usesGoogle = providers.some(
      (provider) => provider.providerId === GoogleAuthProvider.PROVIDER_ID,
    );

    return (
      !usesGoogle &&
      providers.some(
        (provider) => provider.providerId === EmailAuthProvider.PROVIDER_ID,
      )
    );
  }

  async reauthenticateCurrentUser(password = ''): Promise<void> {
    const user = firebaseAuth.currentUser;

    if (!user) {
      throw { code: 'auth/user-not-found' };
    }

    const usesGoogle = user.providerData.some(
      (provider) => provider.providerId === GoogleAuthProvider.PROVIDER_ID,
    );

    if (usesGoogle) {
      if (this.usesNativeGoogleSignIn()) {
        await reauthenticateWithCredential(
          user,
          await this.createNativeGoogleCredential(),
        );
      } else {
        await reauthenticateWithPopup(user, new GoogleAuthProvider());
      }
      return;
    }

    if (user.email && this.usesPasswordProvider()) {
      await reauthenticateWithCredential(
        user,
        EmailAuthProvider.credential(user.email, password),
      );
      return;
    }

    throw { code: 'auth/requires-recent-login' };
  }

  async deleteCurrentUser(): Promise<void> {
    const user = firebaseAuth.currentUser;

    if (!user) {
      return;
    }

    await deleteUser(user);
  }

  private async syncGoogleProfile(user: User): Promise<void> {
    try {
      const profileReference = doc(firestore, `users/${user.uid}`);
      const profile = await getDoc(profileReference);

      await setDoc(
        profileReference,
        {
          displayName: user.displayName ?? 'Expense.io user',
          email: user.email ?? '',
          ...(profile.exists() ? {} : { createdAt: serverTimestamp() }),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch {
      // Profile synchronization is secondary and must not block a successful sign-in.
    }
  }

  private usesNativeGoogleSignIn(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  private async createNativeGoogleCredential(): Promise<AuthCredential> {
    const result = await FirebaseAuthentication.signInWithGoogle();
    const idToken = result.credential?.idToken;

    if (!idToken) {
      throw { code: 'auth/invalid-credential' };
    }

    return GoogleAuthProvider.credential(
      idToken,
      result.credential?.accessToken,
    );
  }
}
