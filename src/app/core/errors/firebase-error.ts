const FIREBASE_ERROR_MESSAGES: Record<string, string> = {
  'auth/email-already-in-use': 'An account already exists for this email address.',
  'auth/invalid-credential': 'The email or password is incorrect.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/network-request-failed': 'Could not reach Firebase. Check your connection and try again.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled for this application.',
  'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow popups and try again.',
  'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
  'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
  'auth/unauthorized-domain': 'Google sign-in is not authorized for this domain.',
  'auth/weak-password': 'Use a password with at least 6 characters.',
  'permission-denied': 'You do not have permission to access this data.',
  unavailable: 'The service is temporarily unavailable. Check your connection.',
};

export function firebaseErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String(error.code);
    return FIREBASE_ERROR_MESSAGES[code] ?? 'Something went wrong. Please try again.';
  }

  return 'Something went wrong. Please try again.';
}
