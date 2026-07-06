import { z } from 'zod';
import { idSchema, isoDateSchema } from './primitives.js';
import { inspectionSourceSchema, sectionCodeSchema } from './enums.js';

/**
 * §11 Admin / Regelpflege — the one cohesive, structured rule configuration the
 * teamlead/admin cockpit edits. This is the SINGLE SOURCE OF TRUTH for the shape:
 * the backend validates writes against {@link ruleConfigSchema} before persisting
 * it as a singleton JSON document (AppConfig key `rule_config`), and the frontend
 * projects the read/write payload through the same schema.
 *
 * `loadPlan` is a read-only list in the UI (master-data the cockpit displays but
 * does not edit here), kept in the same object so a single GET/PUT round-trips the
 * whole config.
 */

/**
 * Prioritäts-Konfiguration (§8.1, Leiter nach Teamlead-Feedback B1/B2). Der
 * Überfälligkeitsvorlauf (overdueLeadDays + Overrides) ist ersatzlos gestrichen;
 * ein Verladeplan-Case ist fällig, sobald der Verladetag erreicht ist. Konfigurierbar
 * bleibt die Liste der Shopbereiche mit täglicher Verladung (Tier 1).
 */
export const priorityRuleConfigSchema = z.object({
  /** Shopbereiche mit täglicher Verladung (Tier 1 neben Abschnitten 7/4/8). */
  dailyShopAreas: z.array(z.string()),
  fifoEnabled: z.boolean(),
  manualPriorityWins: z.boolean(),
});
export type PriorityRuleConfig = z.infer<typeof priorityRuleConfigSchema>;

/**
 * Bündel-Dimensionierung in TEILEN (§8.3, Teamlead-Feedback C1/C2): Starter-Pack
 * ca. 200–250 Teile je Mitarbeiter zu Schichtbeginn, Folge-Packs ca. 80–90 Teile per
 * Self-Pull. Ersetzt die min/max-Minuten-Regler; die Beleg-Obergrenze und die
 * schwer/leicht-Gewichtung sind ersatzlos gestrichen. Minuten bleiben die INTERNE
 * Kapazitätswährung (Aufwandsmodell unverändert) — hier wird nur die Pack-GRÖSSE
 * konfiguriert.
 */
export const bundleRuleConfigSchema = z.object({
  starterPackMinTeile: z.number().int().positive(),
  starterPackMaxTeile: z.number().int().positive(),
  followUpPackMinTeile: z.number().int().positive(),
  followUpPackMaxTeile: z.number().int().positive(),
  /** Teile-Schwelle für Monster-Belege → keine Auto-Verteilung, manuelle TL-Entscheidung (C6). */
  largeBelegTeileThreshold: z.number().int().positive(),
});
export type BundleRuleConfig = z.infer<typeof bundleRuleConfigSchema>;

/**
 * Delivery-Group detection (Teamlead-Anforderung Punkt 1). Recognises Belege of one
 * physical delivery so the distribution keeps them on one person — otherwise a
 * colleague hunts for a Paket someone else already took.
 *
 * Three RANKED signals, highest hit sets the group's confidence (mirrors the engine's
 * `GroupingConfig`):
 *   - source key  „Lieferschein X von N" aus ProHandel  → bestätigt (T1)
 *   - gleiche Lieferschein-Nr (deliveryNoteNo)          → wahrscheinlich (T2)
 *   - fortlaufender Belegnummern-Lauf                    → vermutet (T3, gehärtet)
 * A Teamlead-Korrektur (manualDeliveryGroupKey on the case) always wins.
 */
export const groupingRuleConfigSchema = z.object({
  /** Master switch — when false, no groups are detected at all. */
  enabled: z.boolean(),
  /** T1: trust the source group key / „X von N" from ProHandel (bestätigt). */
  useSourceKey: z.boolean(),
  /** T2: link Belege that share the same deliveryNoteNo (wahrscheinlich). */
  useDeliveryNote: z.boolean(),
  /** T3: link a consecutive weBelegNo run (vermutet). */
  useBelegRun: z.boolean(),
  /** Max numeric gap between consecutive weBelegNo to still count as one run (1 = strict). */
  maxWeBelegGap: z.number().int().nonnegative(),
  /** Harden T3: a run only links Belege booked on the SAME day (kills daily-sequence over-grouping). */
  runRequiresSameDay: z.boolean(),
  /** Harden T3: a run only links Belege of the SAME Bereich/section. */
  runRequiresSameSection: z.boolean(),
  /** When false, only confirmed/likely groups auto-distribute; suspected (T3) wait for Teamlead confirm. */
  autoDistributeSuspected: z.boolean(),
});
export type GroupingRuleConfig = z.infer<typeof groupingRuleConfigSchema>;

/**
 * Schichtende-Steuerung (Teamlead-Feedback Punkt 5). `autoCutoffMinutes` is how long
 * before plannedEnd the BATCH auto-distribution stops; the tail is left for self-pull.
 * `0` disables the cutoff (auto-distribution runs to the very end).
 */
export const shiftEndRuleConfigSchema = z.object({
  autoCutoffMinutes: z.number().int().nonnegative(),
});
export type ShiftEndRuleConfig = z.infer<typeof shiftEndRuleConfigSchema>;

/**
 * Aufwands-Konfiguration (§8.2 / Anhang B.3) — die ECHTEN Engine-Parameter, die der
 * Teamlead im Cockpit editiert. Diese Form ist IDENTISCH zur `EngineConfig.effort`, sodass
 * sie 1:1 in die Engine durchgereicht wird (single source of truth: dieselbe Formel
 * `computeEffort` rechnet damit). Es gibt KEINE abstrakten Multiplikator-Faktoren mehr —
 * der Teamlead stellt die tatsächlichen Minuten je Tätigkeit ein.
 *
 * Minutenwerte sind ZUSATZ-MINUTEN je Tätigkeit; Prüf- und Handling-Anteile sind
 * Multiplikatoren auf den mengenabhängigen Aufwand (1,0 = kein Mehraufwand).
 */
export const effortRuleConfigSchema = z.object({
  /** Grundzeit je Beleg (fixe Rüstzeit, mengenunabhängig). */
  baseMinutesPerCase: z.number().nonnegative(),
  /** Minuten je Teil für die Mengenerfassung (× Warengruppen-Faktor). */
  quantityBaseMinutes: z.number().nonnegative(),
  /** Minuten für das Drucken von Preisetiketten (einmal je Beleg). */
  priceLabelPrintMinutes: z.number().nonnegative(),
  /** Minuten je Position für das Anbringen von Preisetiketten. */
  labelAttachMinutesPerPosition: z.number().nonnegative(),
  /** Minuten je Position für die Warensicherung. */
  securityMinutesPerPosition: z.number().nonnegative(),
  /** Minuten je Position für die Online-Behandlung. */
  onlineHandlingMinutesPerPosition: z.number().nonnegative(),
  /** Minuten für die Rotpreis-Auszeichnung (einmal je Beleg). */
  redPriceMinutesPerPosition: z.number().nonnegative(),
  /** Minuten je zusätzlicher Transportbox (greift nachgelagert beim Aufteilen). */
  boxSplitMinutesPerBox: z.number().nonnegative(),
  /** Prüf-Multiplikator je Prüfmodus auf den mengenabhängigen Aufwand (1,0 = keiner). */
  checkModeFactors: z.object({
    quantity_only: z.number().nonnegative(),
    percentage_check: z.number().nonnegative(),
    full_check: z.number().nonnegative(),
  }),
  /** Handling-Multiplikator je Handling-Klasse auf den mengenabhängigen Aufwand. */
  handlingClassFactors: z.record(z.string(), z.number().nonnegative()),
  /** Warengruppen-Faktor-Tabelle (Stammdaten); `default` greift bei unbekannter WGR. */
  wgrFactors: z.record(z.string(), z.number().nonnegative()),
  /** Umrechnung Minuten → Aufwandspunkte (Last/Fairness); Standard 1 Punkt/Minute. */
  pointsPerMinute: z.number().positive(),
});
export type EffortRuleConfig = z.infer<typeof effortRuleConfigSchema>;

/** Default-Aufwandsparameter (Anhang B.3). Single source für Engine + Cockpit-Seed. */
export const DEFAULT_EFFORT_RULE_CONFIG: EffortRuleConfig = {
  baseMinutesPerCase: 3,
  quantityBaseMinutes: 0.35,
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
  wgrFactors: {
    '218110': 1.15,
    '111130': 1.0,
    default: 1.0,
  },
  pointsPerMinute: 1,
};

/**
 * Prüfstufen-Steuerung (Teamlead-Feedback A5). Die Prüfstufe eines Belegs kommt aus
 * dem Katalog (Nein/10 %/20 %/Voll); `source` legt fest, ob der Wert aus ProHandel
 * übernommen oder im Dashboard gepflegt wird (beides mock, aber konfigurierbar).
 */
export const inspectionRuleConfigSchema = z.object({
  source: inspectionSourceSchema,
});
export type InspectionRuleConfig = z.infer<typeof inspectionRuleConfigSchema>;

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

/** The whole structured rule config persisted under AppConfig `rule_config`. */
export const ruleConfigSchema = z.object({
  priority: priorityRuleConfigSchema,
  bundle: bundleRuleConfigSchema,
  effort: effortRuleConfigSchema,
  grouping: groupingRuleConfigSchema,
  shiftEnd: shiftEndRuleConfigSchema,
  inspection: inspectionRuleConfigSchema,
  loadPlan: z.array(loadPlanRowSchema),
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
    dailyShopAreas: ['120', '90'],
    fifoEnabled: true,
    manualPriorityWins: true,
  },
  bundle: {
    starterPackMinTeile: 200,
    starterPackMaxTeile: 250,
    followUpPackMinTeile: 80,
    followUpPackMaxTeile: 90,
    largeBelegTeileThreshold: 2000,
  },
  effort: DEFAULT_EFFORT_RULE_CONFIG,
  grouping: {
    enabled: true,
    useSourceKey: true,
    useDeliveryNote: true,
    useBelegRun: true,
    maxWeBelegGap: 1,
    runRequiresSameDay: true,
    runRequiresSameSection: true,
    autoDistributeSuspected: false,
  },
  // Autostopp-Default 50 min (C5): am Cutoff wird nicht mehr vorverteilt; bereits
  // zugeteilte, nicht begonnene Bündel lösen sich beim nächsten Recalculate in den
  // Pool auf (clearPriorPlanForDate) und die Cutoff-effektive Kapazität ist 0.
  shiftEnd: {
    autoCutoffMinutes: 50,
  },
  inspection: {
    source: 'prohandel',
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
};
