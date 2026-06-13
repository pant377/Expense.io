import { eurosToCents } from './expense.model';

describe('eurosToCents', () => {
  it('converts decimal euro values without floating point drift', () => {
    expect(eurosToCents(12.34)).toBe(1234);
    expect(eurosToCents('0.10')).toBe(10);
  });

  it('rejects invalid amounts', () => {
    expect(() => eurosToCents(0)).toThrow();
    expect(() => eurosToCents('not-a-number')).toThrow();
  });
});
