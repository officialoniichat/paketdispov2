import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './primitives.js';
import { issueScopeSchema, issueStatusSchema, issueTypeSchema } from './enums.js';
import { fileRefSchema } from './documents.js';

/** Problem case; blocking scope is per case/position/sku_line/transport_box. */
export const workIssueSchema = z.object({
  id: idSchema,
  caseId: idSchema,
  scope: issueScopeSchema,
  scopeId: idSchema.optional(),
  employeeId: idSchema,
  issueType: issueTypeSchema,
  description: z.string().optional(),
  photoRefs: z.array(fileRefSchema).optional(),
  reportedAt: isoDateTimeSchema,
  status: issueStatusSchema,
  resolution: z.string().optional(),
  releasedBy: idSchema.optional(),
  releasedAt: isoDateTimeSchema.optional(),
});
export type WorkIssue = z.infer<typeof workIssueSchema>;
