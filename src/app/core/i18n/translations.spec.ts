import { translate } from './translations';

describe('translate', () => {
  it('returns Greek translations', () => {
    expect(translate('el', 'dashboard.signOut')).toBe('Αποσύνδεση');
  });

  it('interpolates translation parameters', () => {
    expect(translate('en', 'dashboard.recordedTransactions', { count: 12 })).toBe(
      '12 recorded transactions',
    );
  });
});
