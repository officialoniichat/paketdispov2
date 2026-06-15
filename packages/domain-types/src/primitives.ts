import { z } from 'zod';

/**
 * Scalar primitives (Anhang A).
 * Kept as validated plain strings/numbers so they map cleanly across API/DB/UI.
 */

/** YYYY-MM-DD */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected ISO date (YYYY-MM-DD)');
export type ISODate = z.infer<typeof isoDateSchema>;

/** ISO 8601 date-time, with or without timezone offset. */
export const isoDateTimeSchema = z.string().datetime({ offset: true });
export type ISODateTime = z.infer<typeof isoDateTimeSchema>;

/** Monetary amount. Currency handling is out of MVP scope. */
export const moneySchema = z.number();
export type Money = z.infer<typeof moneySchema>;

/** Opaque entity id (UUID/ULID/string). */
export const idSchema = z.string().min(1);
export type Id = z.infer<typeof idSchema>;
