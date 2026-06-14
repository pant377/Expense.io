import {
  MAX_EXPENSE_PHOTO_BYTES,
  expensePhotoStoragePath,
  normalizeExpensePhotoFileName,
  validateExpensePhoto,
} from './expense-photo';

describe('expense photo', () => {
  it('accepts supported images within the size limit', () => {
    const photo = new File(['receipt'], 'receipt.jpg', {
      type: 'image/jpeg',
    });

    expect(validateExpensePhoto(photo)).toBeNull();
  });

  it('rejects unsupported, empty, and oversized images', () => {
    const pdf = new File(['receipt'], 'receipt.pdf', {
      type: 'application/pdf',
    });
    const emptyPhoto = new File([], 'empty.jpg', { type: 'image/jpeg' });
    const oversizedPhoto = new File(
      [new Uint8Array(MAX_EXPENSE_PHOTO_BYTES + 1)],
      'receipt.png',
      { type: 'image/png' },
    );

    expect(validateExpensePhoto(pdf)).toBe('type');
    expect(validateExpensePhoto(emptyPhoto)).toBe('size');
    expect(validateExpensePhoto(oversizedPhoto)).toBe('size');
  });

  it('builds a user-owned path and normalizes the display file name', () => {
    expect(expensePhotoStoragePath('user-1', 'expense-1')).toBe(
      'users/user-1/expenses/expense-1/receipt',
    );
    expect(normalizeExpensePhotoFileName('folder\\receipt\u0000.jpg')).toBe(
      'receipt.jpg',
    );
  });
});
