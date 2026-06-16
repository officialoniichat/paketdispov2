import { z } from 'zod';
import { idSchema, isoDateSchema } from './primitives.js';
import { locationKindSchema, pickupSequenceModeSchema } from './enums.js';

/**
 * Simple location master (Anhang D). MVP does not model a routing graph or meters.
 */
export const locationMasterSchema = z.object({
  id: idSchema,
  code: z.string(), // e.g. "R27", "A-4", "HB-5/234", "D-3"
  displayName: z.string(),
  kind: locationKindSchema,
  zone: z.string().optional(),
  /** Bereich/Skill this Lagerplatz belongs to (a label from the admin catalog). */
  bereich: z.string().optional(),
  sequenceIndex: z.number().int().optional(), // fallback order without meter plan
  scanCode: z.string().optional(),
  active: z.boolean(),
});
export type LocationMaster = z.infer<typeof locationMasterSchema>;

/** Per-workstation pickup-order profile; no distance matrix in MVP. */
export const pickupSequenceProfileSchema = z.object({
  id: idSchema,
  startLocationId: idSchema,
  mode: pickupSequenceModeSchema,
  orderedLocationIds: z.array(idSchema).optional(),
  zoneOrder: z.array(z.string()).optional(),
  validFrom: isoDateSchema,
  active: z.boolean(),
});
export type PickupSequenceProfile = z.infer<typeof pickupSequenceProfileSchema>;
