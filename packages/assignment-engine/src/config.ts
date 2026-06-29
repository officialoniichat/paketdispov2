import { z } from 'zod';
import {
  effortRuleConfigSchema,
  DEFAULT_EFFORT_RULE_CONFIG,
  type EffortRuleConfig,
} from '@paket/domain-types';
import { DEFAULT_GROUPING_CONFIG, type GroupingConfig } from './grouping/delivery-group.js';

/**
 * Engine rule parameters. These mirror the configurable "Regelparameter" from the
 * concept's Anhang B and are intentionally data-driven so Teamlead/Admin can tune
 * them without code changes (§11 Regelpflege). All defaults are taken verbatim from
 * the concept examples B.2 / B.3.
 */

/**
 * Aufwandskonfiguration (Anhang B.3) — the §8.2 effort formula parameters. The SHAPE
 * and defaults live in `@paket/domain-types` (single source of truth) because the
 * teamlead cockpit edits them as `RuleConfig.effort`; the engine re-exports them under
 * its historical names so internal call sites stay unchanged.
 */
export const effortConfigSchema = effortRuleConfigSchema;
export type EffortConfig = EffortRuleConfig;
export const DEFAULT_EFFORT_CONFIG: EffortConfig = DEFAULT_EFFORT_RULE_CONFIG;

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

/**
 * Schichtende-Steuerung (Teamlead-Feedback Punkt 5). The batch auto-distribution
 * reserves the last `autoCutoffMinutes` of each shift so workers self-pull the tail
 * of the day instead of being pre-loaded into their final hours.
 *
 * The pure-engine DEFAULT is 0 (= no cutoff, no wall-clock dependence) so the
 * deterministic engine test suite stays time-independent. The APPLICATION layer
 * (backend recalculate) enables it from `RuleConfig.shiftEnd` (default 120) and feeds
 * a real `now`. See docs/concept/shift-end-handling-concept.md.
 */
export const shiftEndConfigSchema = z.object({
  /** Minutes before plannedEnd at which AUTO distribution stops (0 = disabled). */
  autoCutoffMinutes: z.number().int().nonnegative(),
});
export type ShiftEndConfig = z.infer<typeof shiftEndConfigSchema>;

export const DEFAULT_SHIFT_END_CONFIG: ShiftEndConfig = {
  autoCutoffMinutes: 0,
};

/** Aggregated engine configuration. */
export interface EngineConfig {
  effort: EffortConfig;
  capacity: CapacityConfig;
  assignment: AssignmentConfig;
  priority: PriorityConfig;
  /** Delivery-Group detection tuning (Teamlead-Anforderung Punkt 1). */
  grouping: GroupingConfig;
  shiftEnd: ShiftEndConfig;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  effort: DEFAULT_EFFORT_CONFIG,
  capacity: DEFAULT_CAPACITY_CONFIG,
  assignment: DEFAULT_ASSIGNMENT_CONFIG,
  priority: DEFAULT_PRIORITY_CONFIG,
  grouping: DEFAULT_GROUPING_CONFIG,
  shiftEnd: DEFAULT_SHIFT_END_CONFIG,
};
