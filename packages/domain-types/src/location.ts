import { z } from 'zod';
import { idSchema, isoDateSchema } from './primitives.js';
import { locationKindSchema, pickupSequenceModeSchema, type LocationKind } from './enums.js';

/**
 * Simple location master (Anhang D). MVP does not model a routing graph or meters.
 */
export const locationMasterSchema = z.object({
  id: idSchema,
  code: z.string(), // e.g. "R27", "A-4", "HB-5/234", "D-3"
  displayName: z.string(),
  kind: locationKindSchema,
  zone: z.string().optional(),
  sequenceIndex: z.number().int().optional(), // fallback order without meter plan
  scanCode: z.string().optional(),
  active: z.boolean(),
});
export type LocationMaster = z.infer<typeof locationMasterSchema>;

/**
 * Bereiche/Skills are NOT free text — they are the FIXED warehouse handling classes,
 * derived from the physical Lagerklasse (LocationKind). A Beleg's Bereich is therefore
 * fixed by where its goods are stored; employees can only be assigned these values.
 */
export const BEREICHE = ['Hängebahn', 'Palette', 'Regal'] as const;
export type Bereich = (typeof BEREICHE)[number];

/** Map a Lagerplatz's storage class to its fixed Bereich (undefined for non-pickup kinds). */
export function bereichFromLocationKind(kind: LocationKind): Bereich | undefined {
  switch (kind) {
    case 'haengebahn':
      return 'Hängebahn';
    case 'palette_a':
    case 'palette_b':
    case 'palette_c':
    case 'palette_e':
      return 'Palette';
    case 'regal':
    case 'lagerplatz_d':
      return 'Regal';
    default:
      return undefined; // workstation/printer/conveyor: not a pickup storage class
  }
}

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
