import { Capacitor } from '@capacitor/core';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import {
  connectStorageEmulator,
  getStorage,
} from 'firebase/storage';

import { environment } from '../../../environments/environment';

const app = getApps().length ? getApp() : initializeApp(environment.firebase);

export const firebaseAuth = Capacitor.isNativePlatform()
  ? initializeAuth(app, { persistence: indexedDBLocalPersistence })
  : getAuth(app);
export const firestore = getFirestore(app);
export const firebaseStorage = getStorage(app);

if (environment.useEmulators) {
  connectAuthEmulator(firebaseAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
  connectStorageEmulator(firebaseStorage, '127.0.0.1', 9199);
}
