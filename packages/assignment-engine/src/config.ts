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

/**
 * Bundling/distribution tuning (§8.3, Teamlead-Feedback C1/C2): Bündel werden nach
 * TEILEN dimensioniert — Starter-Pack ca. 200–250 Teile je Mitarbeiter zu Schichtbeginn,
 * Folge-Packs ca. 80–90 Teile per Self-Pull. Die Beleg-Obergrenze (Shop 31 = viele
 * NOS-Einzelanlieferungen) und die schwer/leicht-Gewichtung sind ersatzlos gestrichen.
 * MINUTEN bleiben die interne Kapazitätswährung: jedes Pack wird über das unveränderte
 * Aufwandsmodell gegen die Rest-Schichtminuten auf Machbarkeit geprüft.
 */
export const assignmentConfigSchema = z.object({
  /** Starter-Pack-Größe in Teilen (Pack schließt ab min, nimmt bis max auf). */
  starterPackMinTeile: z.number().int().positive(),
  starterPackMaxTeile: z.number().int().positive(),
  /** Folge-Pack-Größe in Teilen (Self-Pull über assignNextBundle). */
  followUpPackMinTeile: z.number().int().positive(),
  followUpPackMaxTeile: z.number().int().positive(),
  /**
   * Teile-Schwelle, ab der ein Beleg NICHT auto-verteilt wird, sondern als
   * Monster-Beleg zur manuellen Teamlead-Entscheidung markiert bleibt (C6).
   */
  largeBelegTeileThreshold: z.number().int().positive(),
});
export type AssignmentConfig = z.infer<typeof assignmentConfigSchema>;

export const DEFAULT_ASSIGNMENT_CONFIG: AssignmentConfig = {
  starterPackMinTeile: 200,
  starterPackMaxTeile: 250,
  followUpPackMinTeile: 80,
  followUpPackMaxTeile: 90,
  largeBelegTeileThreshold: 2000,
};

/**
 * Prioritäts-Tuning (§8.1, Leiter B2). Der Überfälligkeitsvorlauf ist ersatzlos
 * gestrichen (B1); konfigurierbar bleibt nur die Liste der täglichen Shopbereiche
 * (Tier 1 neben den Jeden-Tag-Abschnitten 7/4/8).
 */
export const priorityConfigSchema = z.object({
  /** Shopbereiche mit täglicher Verladung (Tier 1), z. B. ['120', '90']. */
  dailyShopAreas: z.array(z.string()),
});
export type PriorityConfig = z.infer<typeof priorityConfigSchema>;

export const DEFAULT_PRIORITY_CONFIG: PriorityConfig = {
  dailyShopAreas: ['120', '90'],
};

/**
 * Schichtende-Steuerung (Teamlead-Feedback Punkt 5). The batch auto-distribution
 * reserves the last `autoCutoffMinutes` of each shift so workers self-pull the tail
 * of the day instead of being pre-loaded into their final hours.
 *
 * The pure-engine DEFAULT is 0 (= no cutoff, no wall-clock dependence) so the
 * deterministic engine test suite stays time-independent. The APPLICATION layer
 * (backend recalculate) enables it from `RuleConfig.shiftEnd` (default 50) and feeds
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
