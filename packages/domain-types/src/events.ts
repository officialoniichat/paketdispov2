import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './primitives.js';
import { actorTypeSchema, workflowEventTypeSchema } from './enums.js';

/**
 * Immutable audit event (Anhang A WorkflowEvent). The event log is the basis for
 * audit, anti-cherry-picking, reporting and effort calibration.
 */
export const workflowEventSchema = z.object({
  id: idSchema,
  eventType: workflowEventTypeSchema,
  entityType: z.string(),
  entityId: idSchema,
  actorType: actorTypeSchema,
  actorId: idSchema.optional(),
  timestamp: isoDateTimeSchema,
  payload: z.unknown(),
  correlationId: z.string().optional(),
});

/** Generic-payload variant of WorkflowEvent for typed producers/consumers. */
export type WorkflowEvent<TPayload = unknown> = Omit<
  z.infer<typeof workflowEventSchema>,
  'payload'
> & { payload: TPayload };
