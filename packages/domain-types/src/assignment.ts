import { z } from 'zod';
import { idSchema, isoDateSchema, isoDateTimeSchema } from './primitives.js';
import { assignmentStatusSchema, pickupSequenceModeSchema } from './enums.js';

/**
 * Ordered step inside a bundle route (Anhang D PickupStop shape).
 * This is the binding pickup order shown to the employee – not a route optimisation.
 */
export const routeStopSchema = z.object({
  sequence: z.number().int().nonnegative(),
  locationId: idSchema,
  locationCode: z.string(),
  orderIds: z.array(idSchema),
  scanRequired: z.boolean(),
  skipAllowedWithReason: z.boolean(),
});
export type RouteStop = z.infer<typeof routeStopSchema>;

/** A work package assigned to one employee for one day (Anhang A AssignmentBundle). */
export const assignmentBundleSchema = z.object({
  id: idSchema,
  employeeId: idSchema,
  date: isoDateSchema,
  caseIds: z.array(idSchema),
  plannedEffortMinutes: z.number().nonnegative(),
  effortPoints: z.number().nonnegative(),
  route: z.array(routeStopSchema),
  status: assignmentStatusSchema,
  createdBy: z.enum(['system', 'teamlead']),
});
export type AssignmentBundle = z.infer<typeof assignmentBundleSchema>;

/** Persisted pickup stop / scan record (Anhang A PickupStop). */
export const pickupStopSchema = z.object({
  id: idSchema,
  bundleId: idSchema,
  sequence: z.number().int().nonnegative(),
  storageLocationId: idSchema,
  caseIds: z.array(idSchema),
  scanRequired: z.boolean(),
  scannedAt: isoDateTimeSchema.optional(),
});
export type PickupStop = z.infer<typeof pickupStopSchema>;

/** Calculated pickup sequence for a bundle (Anhang D). */
export const bundlePickupSequenceSchema = z.object({
  bundleId: idSchema,
  employeeId: idSchema,
  startLocationId: idSchema,
  stops: z.array(routeStopSchema),
  calculationMode: pickupSequenceModeSchema,
  calculatedAt: isoDateTimeSchema,
});
export type BundlePickupSequence = z.infer<typeof bundlePickupSequenceSchema>;
