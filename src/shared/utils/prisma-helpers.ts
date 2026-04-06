/**
 * Convert undefined to null for Prisma nullable fields.
 *
 * Prisma differentiates between `undefined` (skip this field) and `null`
 * (set to NULL). When a caller intentionally passes `undefined` to clear a
 * nullable column this helper converts it to `null`.
 */
export function n<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}
