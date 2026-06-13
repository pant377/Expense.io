import { AppLanguage } from '../i18n/translations';

const FIREBASE_ERROR_MESSAGES: Record<AppLanguage, Record<string, string>> = {
  en: {
    'auth/email-already-in-use': 'An account already exists for this email address.',
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/network-request-failed': 'Could not reach Firebase. Check your connection and try again.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled for this application.',
    'auth/popup-blocked':
      'Your browser blocked the Google sign-in window. Allow popups and try again.',
    'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
    'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
    'auth/unauthorized-domain': 'Google sign-in is not authorized for this domain.',
    'auth/weak-password': 'Use a password with at least 6 characters.',
    'permission-denied': 'You do not have permission to access this data.',
    unavailable: 'The service is temporarily unavailable. Check your connection.',
  },
  el: {
    'auth/email-already-in-use': 'Υπάρχει ήδη λογαριασμός με αυτή τη διεύθυνση email.',
    'auth/invalid-credential': 'Το email ή ο κωδικός πρόσβασης είναι λανθασμένα.',
    'auth/invalid-email': 'Συμπλήρωσε μια έγκυρη διεύθυνση email.',
    'auth/network-request-failed':
      'Δεν ήταν δυνατή η σύνδεση με το Firebase. Έλεγξε τη σύνδεσή σου και δοκίμασε ξανά.',
    'auth/operation-not-allowed':
      'Αυτή η μέθοδος σύνδεσης δεν είναι ενεργοποιημένη για την εφαρμογή.',
    'auth/popup-blocked':
      'Ο browser απέκλεισε το παράθυρο σύνδεσης Google. Επίτρεψε τα αναδυόμενα παράθυρα και δοκίμασε ξανά.',
    'auth/popup-closed-by-user': 'Η σύνδεση μέσω Google ακυρώθηκε.',
    'auth/too-many-requests': 'Έγιναν πολλές προσπάθειες. Περίμενε λίγο και δοκίμασε ξανά.',
    'auth/unauthorized-domain':
      'Η σύνδεση Google δεν είναι εξουσιοδοτημένη για αυτό το domain.',
    'auth/weak-password': 'Χρησιμοποίησε κωδικό με τουλάχιστον 6 χαρακτήρες.',
    'permission-denied': 'Δεν έχεις δικαίωμα πρόσβασης σε αυτά τα δεδομένα.',
    unavailable: 'Η υπηρεσία δεν είναι προσωρινά διαθέσιμη. Έλεγξε τη σύνδεσή σου.',
  },
};

const FALLBACK_MESSAGES: Record<AppLanguage, string> = {
  en: 'Something went wrong. Please try again.',
  el: 'Κάτι πήγε στραβά. Δοκίμασε ξανά.',
};

export function firebaseErrorMessage(
  error: unknown,
  language: AppLanguage = 'en',
): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String(error.code);
    return FIREBASE_ERROR_MESSAGES[language][code] ?? FALLBACK_MESSAGES[language];
  }

  return FALLBACK_MESSAGES[language];
}
