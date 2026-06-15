import { z } from 'zod';
import { idSchema, isoDateSchema, isoDateTimeSchema } from './primitives.js';

/** Daily shift / planned capacity (Anhang A EmployeeShift). */
export const employeeShiftSchema = z.object({
  id: idSchema,
  employeeId: idSchema,
  date: isoDateSchema,
  plannedStart: isoDateTimeSchema,
  plannedEnd: isoDateTimeSchema,
  breakMinutes: z.number().int().nonnegative(),
  plannedHours: z.number().nonnegative(),
  netCapacityMinutes: z.number().nonnegative(),
  workstationId: idSchema.optional(),
  active: z.boolean(),
});
export type EmployeeShift = z.infer<typeof employeeShiftSchema>;

/** SEAK/PEP CSV import row (§13.2). */
export const shiftImportRowSchema = z.object({
  employeeNo: z.string(),
  date: isoDateSchema,
  plannedStart: isoDateTimeSchema,
  plannedEnd: isoDateTimeSchema,
  breakMinutes: z.number().int().nonnegative(),
  plannedHours: z.number().nonnegative(),
  workstationCode: z.string().optional(),
  active: z.boolean(),
});
export type ShiftImportRow = z.infer<typeof shiftImportRowSchema>;

/** Workstation assignment per employee/day (Anhang D). */
export const workstationAssignmentSchema = z.object({
  employeeId: idSchema,
  date: isoDateSchema,
  workstationLocationId: idSchema,
  assignedBy: z.enum(['seak', 'teamlead', 'default_rule']),
});
export type WorkstationAssignment = z.infer<typeof workstationAssignmentSchema>;
