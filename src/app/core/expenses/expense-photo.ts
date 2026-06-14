import { Injectable } from '@angular/core';
import {
  deleteObject,
  getDownloadURL,
  listAll,
  ref,
  uploadBytes,
} from 'firebase/storage';

import { firebaseStorage } from '../firebase/firebase.client';

export const MAX_EXPENSE_PHOTO_BYTES = 8 * 1024 * 1024;
export const EXPENSE_PHOTO_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type ExpensePhotoContentType =
  (typeof EXPENSE_PHOTO_CONTENT_TYPES)[number];

export interface ExpensePhotoMetadata {
  photoStoragePath: string;
  photoFileName: string;
  photoContentType: ExpensePhotoContentType;
}

export type ExpensePhotoValidationError = 'size' | 'type';

export function validateExpensePhoto(
  file: File,
): ExpensePhotoValidationError | null {
  if (!isExpensePhotoContentType(file.type)) {
    return 'type';
  }

  return file.size === 0 || file.size > MAX_EXPENSE_PHOTO_BYTES
    ? 'size'
    : null;
}

export function expensePhotoStoragePath(
  userId: string,
  expenseId: string,
): string {
  return `users/${userId}/expenses/${expenseId}/receipt`;
}

export function normalizeExpensePhotoFileName(fileName: string): string {
  const normalized = fileName
    .replaceAll('\\', '/')
    .split('/')
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();

  return (normalized || 'receipt').slice(0, 120);
}

export function isExpensePhotoContentType(
  value: unknown,
): value is ExpensePhotoContentType {
  return EXPENSE_PHOTO_CONTENT_TYPES.some(
    (contentType) => contentType === value,
  );
}

@Injectable({ providedIn: 'root' })
export class ExpensePhotoService {
  async upload(
    userId: string,
    expenseId: string,
    file: File,
  ): Promise<ExpensePhotoMetadata> {
    const validationError = validateExpensePhoto(file);

    if (validationError) {
      throw { code: `expense-photo/${validationError}` };
    }

    const photoStoragePath = expensePhotoStoragePath(userId, expenseId);
    const photoContentType = file.type as ExpensePhotoContentType;

    await uploadBytes(ref(firebaseStorage, photoStoragePath), file, {
      contentType: photoContentType,
      cacheControl: 'private,max-age=3600',
    });

    return {
      photoStoragePath,
      photoFileName: normalizeExpensePhotoFileName(file.name),
      photoContentType,
    };
  }

  async downloadUrl(storagePath: string): Promise<string> {
    return getDownloadURL(ref(firebaseStorage, storagePath));
  }

  async delete(storagePath: string): Promise<void> {
    try {
      await deleteObject(ref(firebaseStorage, storagePath));
    } catch (error: unknown) {
      if (!this.isObjectNotFound(error)) {
        throw error;
      }
    }
  }

  async deleteUserPhotos(userId: string): Promise<void> {
    await this.deleteRecursively(`users/${userId}`);
  }

  private async deleteRecursively(storagePath: string): Promise<void> {
    const result = await listAll(ref(firebaseStorage, storagePath));

    await Promise.all([
      ...result.items.map((item) => deleteObject(item)),
      ...result.prefixes.map((prefix) => this.deleteRecursively(prefix.fullPath)),
    ]);
  }

  private isObjectNotFound(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'storage/object-not-found'
    );
  }
}
