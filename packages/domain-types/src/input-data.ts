import { z } from 'zod';
import { idSchema } from './primitives.js';

/** Catalogue of required/missing input fields per domain (Anhang D InputDataRequirement). */
export const inputDataRequirementSchema = z.object({
  id: idSchema,
  domain: z.enum(['documents', 'route', 'assignment', 'effort', 'box', 'issue', 'zst', 'print']),
  fieldName: z.string(),
  requiredForMvp: z.boolean(),
  sourceSystem: z.enum([
    'arbeitsanweisung',
    'wareneingangsbeleg',
    'lieferschein',
    'seak_pep',
    'teamlead_ui',
    'admin_masterdata',
    'unknown',
  ]),
  exampleValue: z.string().optional(),
  missingDecision: z.string().optional(),
  fallbackRule: z.string().optional(),
  validationRule: z.string().optional(),
});
export type InputDataRequirement = z.infer<typeof inputDataRequirementSchema>;
