import { z } from 'zod';
import { idSchema, isoDateSchema, isoDateTimeSchema } from './primitives.js';
import { skillTierSchema } from './enums.js';

/** Time of day HH:MM (24h), used for shift windows in the weekly pattern. */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected time of day (HH:MM)');
export type TimeOfDay = z.infer<typeof timeOfDaySchema>;

/** Canonical application roles (§5 / §16.1), wire-aligned with the backend RBAC enum. */
export const employeeRoleSchema = z.enum(['employee', 'teamlead', 'admin', 'it']);
export type EmployeeRole = z.infer<typeof employeeRoleSchema>;

/**
 * Daily shift / planned capacity the engine consumes (Anhang A EmployeeShift).
 * Provenance (`source`) and the applied per-head `productivityFactor` are persistence/
 * UI concerns and live on the Prisma `Shift` row — the engine only needs the derived
 * `netCapacityMinutes`, so they are intentionally NOT part of this domain type.
 */
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
  /**
   * Bereiche/Skills the employee handles (labels). The engine prefers assigning a
   * case to an employee whose Bereiche include the case's Bereich. Empty/absent =
   * Allrounder (no preference). Consumed by distribute() — not a persistence field.
   */
  bereiche: z.array(z.string()).optional(),
  /**
   * Skill-Stufe des Mitarbeiters (Teamlead-Feedback). Die Engine schließt
   * `starter`/`dummy` von der AUTO-Verteilung aus — sie erhalten nur manuell
   * zugeteilte Belege. Absent = `profi` (volle Berechtigung, rückwärtsneutral).
   */
  skillTier: skillTierSchema.optional(),
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

// ---------------------------------------------------------------------------
// Mitarbeiter-Einstellungen (Arbeitszeit & Einsatzplanung) — see
// docs/concept/employee-settings-ux-concept.md. Profile (wer), weekly pattern
// (wann), absence (Verfügbarkeit), per-head capacity/effort params.
// ---------------------------------------------------------------------------

/** Weekdays of the planning pattern (Mo..So). */
export const weekdaySchema = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
export type Weekday = z.infer<typeof weekdaySchema>;

/**
 * One day of the weekly pattern (concept §d Screen 3). A non-working day sets
 * `working: false`; a working day carries a named shift model + window + break +
 * Teilzeit-%. netCapacity is derived from these (never typed directly).
 */
export const weeklyDayPlanSchema = z.object({
  working: z.boolean(),
  /** Human label of the chosen shift model, e.g. "Frühschicht". */
  shiftModel: z.string().optional(),
  start: timeOfDaySchema.optional(),
  end: timeOfDaySchema.optional(),
  breakMinutes: z.number().int().nonnegative().default(0),
  /** Teilzeit share of the window (0..100); 100 = full window. */
  partTimePct: z.number().min(0).max(100).default(100),
});
export type WeeklyDayPlan = z.infer<typeof weeklyDayPlanSchema>;

/** A full Mo..So default pattern that generates concrete shifts. */
export const weeklyPatternSchema = z.object({
  mon: weeklyDayPlanSchema,
  tue: weeklyDayPlanSchema,
  wed: weeklyDayPlanSchema,
  thu: weeklyDayPlanSchema,
  fri: weeklyDayPlanSchema,
  sat: weeklyDayPlanSchema,
  sun: weeklyDayPlanSchema,
});
export type WeeklyPattern = z.infer<typeof weeklyPatternSchema>;

/**
 * Employee master/profile for the dispo (concept §c). Extends the minimal User
 * with the capacity-relevant fields the engine consumes indirectly: per-head
 * productivity (scales netCapacity), area/skill tags, overtime tolerance.
 */
export const employeeProfileSchema = z.object({
  id: idSchema,
  employeeNo: z.string().min(1),
  displayName: z.string().min(1),
  email: z.string().email().nullish(),
  roles: z.array(employeeRoleSchema),
  active: z.boolean(),
  /**
   * Whether this employee's performance is measured. Temporary workers (Azubis,
   * Saisonaushilfen) are `false`: they can still be assigned (manually or
   * automatically) but are excluded from productivity/ZST performance metrics so
   * they do not distort per-head KPIs. See docs/concept/temporary-workers-concept.md.
   */
  measured: z.boolean().default(true),
  /**
   * Bereiche/Skills this employee handles, as labels from the admin Bereich catalog
   * (RuleConfig.bereiche). Empty = Allrounder (handles everything, no routing penalty).
   */
  bereiche: z.array(z.string()).default([]),
  /** Per-head productivity factor (0,5…1,2; default 1,0) scaling netCapacity. */
  productivityFactor: z.number().min(0.5).max(1.2).default(1),
  /** Allowed overload before the load ⚠ warning fires, in percent (0…25). */
  overtimeTolerancePct: z.number().min(0).max(25).default(0),
  /**
   * Skill-Stufe (Teamlead-Feedback): profi = alles; fortgeschritten/basis =
   * Starter-Packs; starter/dummy = nur manuell zugeteilte Belege (kein Auto).
   */
  skillTier: skillTierSchema.default('profi'),
  /**
   * Arbeitsplatz/Tisch des Mitarbeiters (per Admin zuweisbar; Dummy-Mitarbeiter
   * flexibel umsetzbar). Referenziert die Workstation-Stammdaten.
   */
  workstationId: idSchema.nullish(),
  weeklyPattern: weeklyPatternSchema.nullish(),
});
export type EmployeeProfile = z.infer<typeof employeeProfileSchema>;
