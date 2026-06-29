import { z } from 'zod';
import { priorityFlagSchema } from '@paket/domain-types';
import { DEFAULT_GROUPING_CONFIG, type GroupingConfig } from './grouping/delivery-group.js';

/**
 * Engine rule parameters. These mirror the configurable "Regelparameter" from the
 * concept's Anhang B and are intentionally data-driven so Teamlead/Admin can tune
 * them without code changes (§11 Regelpflege). All defaults are taken verbatim from
 * the concept examples B.2 / B.3.
 */

/** Aufwandskonfiguration (Anhang B.3). Drives the §8.2 effort formula. */
export const effortConfigSchema = z.object({
  baseMinutesPerCase: z.number().nonnegative(),
  quantityBaseMinutes: z.number().nonnegative(),
  /** Warengruppen-Faktor lookup; `default` applies when a WGR code is unknown. */
  wgrFactors: z.record(z.string(), z.number().nonnegative()),
  priceLabelPrintMinutes: z.number().nonnegative(),
  labelAttachMinutesPerPosition: z.number().nonnegative(),
  securityMinutesPerPosition: z.number().nonnegative(),
  onlineHandlingMinutesPerPosition: z.number().nonnegative(),
  redPriceMinutesPerPosition: z.number().nonnegative(),
  boxSplitMinutesPerBox: z.number().nonnegative(),
  /** Multiplier on the quantity-derived checking effort per check mode. */
  checkModeFactors: z.object({
    quantity_only: z.number().nonnegative(),
    percentage_check: z.number().nonnegative(),
    full_check: z.number().nonnegative(),
  }),
  /** Füllmaterial/Handling factor per handling class (Anhang B.3 "Füllmaterial/Handling"). */
  handlingClassFactors: z.record(z.string(), z.number().nonnegative()),
  /** Conversion of effort-minutes into fairness points (default 1 point per minute). */
  pointsPerMinute: z.number().positive(),
});
export type EffortConfig = z.infer<typeof effortConfigSchema>;

/** Verbatim from Anhang B.3 (plus engine-only handling/points extensions). */
export const DEFAULT_EFFORT_CONFIG: EffortConfig = {
  baseMinutesPerCase: 3,
  quantityBaseMinutes: 0.35,
  wgrFactors: {
    '218110': 1.15,
    '111130': 1.0,
    default: 1.0,
  },
  priceLabelPrintMinutes: 2,
  labelAttachMinutesPerPosition: 0.45,
  securityMinutesPerPosition: 0.75,
  onlineHandlingMinutesPerPosition: 0.6,
  redPriceMinutesPerPosition: 0.5,
  boxSplitMinutesPerBox: 1.25,
  checkModeFactors: {
    quantity_only: 1.0,
    percentage_check: 1.25,
    full_check: 1.6,
  },
  handlingClassFactors: {
    normal: 1.0,
    small_parts: 1.1,
    hanging_goods: 1.2,
    bulky: 1.3,
    unknown: 1.0,
  },
  pointsPerMinute: 1,
};

/** Reserve-Regel (Anhang B.2). The eiserne Reserve held back for the next morning. */
export const reserveConfigSchema = z.object({
  enabled: z.boolean(),
  mode: z.literal('max_of_percentage_and_minutes_per_employee'),
  percentageOfNextMorningCapacity: z.number().min(0).max(1),
  minimumMinutesPerPlannedEmployee: z.number().nonnegative(),
  /** Priority flags that may consume the reserve (Prio/CatMan/overdue/Teamlead). */
  overrideAllowedFor: z.array(priorityFlagSchema),
});
export type ReserveConfig = z.infer<typeof reserveConfigSchema>;

/** Verbatim from Anhang B.2. */
export const DEFAULT_RESERVE_CONFIG: ReserveConfig = {
  enabled: true,
  mode: 'max_of_percentage_and_minutes_per_employee',
  percentageOfNextMorningCapacity: 0.2,
  minimumMinutesPerPlannedEmployee: 60,
  overrideAllowedFor: ['prio', 'catman_due', 'overdue', 'manual_teamlead_priority'],
};

/** Capacity derivation parameters (§4.3 / §13.2 import). */
export const capacityConfigSchema = z.object({
  /**
   * Share of net working minutes spent on belegbearbeitung (vs. moving, breaks
   * beyond the recorded pause, admin). Open point (#63) — defaults to 1.0 so that
   * planned IST time maps 1:1 to capacity until a real factor is calibrated.
   */
  productivityFactor: z.number().min(0).max(1),
  /** Fraction of a shift counted as "morning" capacity for starter packages. */
  morningCapacityFraction: z.number().min(0).max(1),
});
export type CapacityConfig = z.infer<typeof capacityConfigSchema>;

export const DEFAULT_CAPACITY_CONFIG: CapacityConfig = {
  productivityFactor: 1.0,
  morningCapacityFraction: 0.5,
};

/** Bundling/distribution tuning (§8.3, §8.4 Anti-Cherry-Picking). */
export const assignmentConfigSchema = z.object({
  /** Target effort-minutes per bundle; bundles close once they reach this. */
  targetBundleMinutes: z.number().positive(),
  /** Hard cap on cases per bundle (Rollwagen-/Kapazitätsgrenze, Anhang D.2). */
  maxCasesPerBundle: z.number().int().positive(),
  /** Effort-minutes threshold separating "heavy" from "light" cases for the mix. */
  heavyCaseMinutes: z.number().positive(),
});
export type AssignmentConfig = z.infer<typeof assignmentConfigSchema>;

export const DEFAULT_ASSIGNMENT_CONFIG: AssignmentConfig = {
  targetBundleMinutes: 55,
  maxCasesPerBundle: 6,
  heavyCaseMinutes: 45,
};

/** Prioritäts-Tuning (§8.1, Teamlead-Punkt 4). */
export const priorityConfigSchema = z.object({
  /**
   * Default Vorlauf in days before a Verladeplan loading day at which a case becomes
   * due/overdue (Teamlead-Punkt 4). 0 reproduces the legacy "due on/after loading day".
   */
  overdueLeadDays: z.number().int().nonnegative(),
  /** Shop-/section-specific overrides; most specific match wins. */
  overdueLeadDaysOverrides: z.array(
    z.object({
      shopAreaNo: z.string().optional(),
      section: z.number().int().optional(),
      leadDays: z.number().int().nonnegative(),
    }),
  ),
});
export type PriorityConfig = z.infer<typeof priorityConfigSchema>;

export const DEFAULT_PRIORITY_CONFIG: PriorityConfig = {
  overdueLeadDays: 0,
  overdueLeadDaysOverrides: [],
};

/** Aggregated engine configuration. */
export interface EngineConfig {
  effort: EffortConfig;
  reserve: ReserveConfig;
  capacity: CapacityConfig;
  assignment: AssignmentConfig;
  priority: PriorityConfig;
  /** Delivery-Group detection tuning (Teamlead-Anforderung Punkt 1). */
  grouping: GroupingConfig;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  effort: DEFAULT_EFFORT_CONFIG,
  reserve: DEFAULT_RESERVE_CONFIG,
  capacity: DEFAULT_CAPACITY_CONFIG,
  assignment: DEFAULT_ASSIGNMENT_CONFIG,
  priority: DEFAULT_PRIORITY_CONFIG,
  grouping: DEFAULT_GROUPING_CONFIG,
};
