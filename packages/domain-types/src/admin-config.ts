import { z } from 'zod';
import { idSchema, isoDateSchema } from './primitives.js';

/**
 * §11 Admin / Regelpflege — the one cohesive, structured rule configuration the
 * teamlead/admin cockpit edits. This is the SINGLE SOURCE OF TRUTH for the shape:
 * the backend validates writes against {@link ruleConfigSchema} before persisting
 * it as a singleton JSON document (AppConfig key `rule_config`), and the frontend
 * projects the read/write payload through the same schema.
 *
 * `loadPlan` and `parserTemplates` are read-only lists in the UI (master-data the
 * cockpit displays but does not edit here), kept in the same object so a single
 * GET/PUT round-trips the whole config.
 */

/** Priority weighting + thresholds (§8.1). */
export const priorityRuleConfigSchema = z.object({
  catManWeight: z.number().nonnegative(),
  overdueThresholdHours: z.number().nonnegative(),
  fifoEnabled: z.boolean(),
  manualPriorityWins: z.boolean(),
});
export type PriorityRuleConfig = z.infer<typeof priorityRuleConfigSchema>;

/** Iron-reserve protection (§8.3 / B.2). */
export const reserveRuleConfigSchema = z.object({
  nextShiftCapacityPct: z.number().min(0).max(100),
  minMinutesPerEmployee: z.number().nonnegative(),
});
export type ReserveRuleConfig = z.infer<typeof reserveRuleConfigSchema>;

/** Bundle-size guardrails (§8.3). */
export const bundleRuleConfigSchema = z.object({
  minMinutes: z.number().nonnegative(),
  maxMinutes: z.number().nonnegative(),
  maxCases: z.number().int().nonnegative(),
  maxHeavyCases: z.number().int().nonnegative(),
});
export type BundleRuleConfig = z.infer<typeof bundleRuleConfigSchema>;

/** Effort-point driver factors (Anhang D / B.3). */
export const effortRuleConfigSchema = z.object({
  priceLabelPrintFactor: z.number().nonnegative(),
  securingFactor: z.number().nonnegative(),
  onlineFactor: z.number().nonnegative(),
  redPriceFactor: z.number().nonnegative(),
  checkShareFactor: z.number().nonnegative(),
  boxSplittingFactor: z.number().nonnegative(),
});
export type EffortRuleConfig = z.infer<typeof effortRuleConfigSchema>;

/** One Verladeplan row (read-only in the cockpit). */
export const loadPlanRowSchema = z.object({
  id: idSchema,
  shopAreaNo: z.string(),
  floor: z.string(),
  weekday: z.string(),
  validFrom: isoDateSchema,
  validTo: isoDateSchema.optional(),
  specialDay: z.boolean(),
});
export type LoadPlanRow = z.infer<typeof loadPlanRowSchema>;

/** One parser template row (read-only in the cockpit). */
export const parserTemplateRowSchema = z.object({
  id: idSchema,
  name: z.string(),
  requiredFields: z.array(z.string()),
  detectionThreshold: z.number().min(0).max(1),
  fallbackToManual: z.boolean(),
});
export type ParserTemplateRow = z.infer<typeof parserTemplateRowSchema>;

/** The whole structured rule config persisted under AppConfig `rule_config`. */
export const ruleConfigSchema = z.object({
  priority: priorityRuleConfigSchema,
  reserve: reserveRuleConfigSchema,
  bundle: bundleRuleConfigSchema,
  effort: effortRuleConfigSchema,
  loadPlan: z.array(loadPlanRowSchema),
  parserTemplates: z.array(parserTemplateRowSchema),
});
export type RuleConfig = z.infer<typeof ruleConfigSchema>;

/** Fixed AppConfig key under which the structured rule config is stored. */
export const RULE_CONFIG_KEY = 'rule_config';

/**
 * Sensible default rule config, used to seed AppConfig idempotently and as the
 * fallback the backend returns when no row exists yet. Numbers mirror the prior
 * in-memory mock so the cockpit behaves identically against the live backend.
 */
export const DEFAULT_RULE_CONFIG: RuleConfig = {
  priority: {
    catManWeight: 1.5,
    overdueThresholdHours: 48,
    fifoEnabled: true,
    manualPriorityWins: true,
  },
  reserve: {
    nextShiftCapacityPct: 20,
    minMinutesPerEmployee: 30,
  },
  bundle: {
    minMinutes: 20,
    maxMinutes: 90,
    maxCases: 8,
    maxHeavyCases: 2,
  },
  effort: {
    priceLabelPrintFactor: 1.2,
    securingFactor: 1.3,
    onlineFactor: 1.15,
    redPriceFactor: 1.1,
    checkShareFactor: 1.25,
    boxSplittingFactor: 1.4,
  },
  loadPlan: [
    {
      id: 'lp-1',
      shopAreaNo: '21',
      floor: 'EG',
      weekday: 'Mo',
      validFrom: '2026-01-01',
      specialDay: false,
    },
    {
      id: 'lp-2',
      shopAreaNo: '22',
      floor: 'OG',
      weekday: 'Mi',
      validFrom: '2026-01-01',
      specialDay: false,
    },
  ],
  parserTemplates: [
    {
      id: 'pt-1',
      name: 'WE-Beleg Standard',
      requiredFields: ['weBelegNo', 'bookingDate', 'positions'],
      detectionThreshold: 0.8,
      fallbackToManual: true,
    },
    {
      id: 'pt-2',
      name: 'Arbeitsanweisung',
      requiredFields: ['caseId', 'checkMode'],
      detectionThreshold: 0.75,
      fallbackToManual: true,
    },
  ],
};
