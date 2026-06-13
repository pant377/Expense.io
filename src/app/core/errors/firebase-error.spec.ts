import { firebaseErrorMessage } from './firebase-error';

describe('firebaseErrorMessage', () => {
  it('maps known Firebase errors', () => {
    expect(firebaseErrorMessage({ code: 'auth/invalid-credential' })).toContain('incorrect');
  });

  it('does not expose unknown error details', () => {
    expect(firebaseErrorMessage(new Error('private backend detail'))).toBe(
      'Something went wrong. Please try again.',
    );
  });
});
