import type { CaseStatus, GoodsReceiptCase, ISODate, SectionCode } from '@paket/domain-types';
import { PRIORITY_RANK, type EnrichedCase, type PriorityClassification } from '../types.js';

/**
 * §8.1 Prioritätsklassen — Leiter nach Teamlead-Feedback 03.07.2026 (B2):
 *
 *   0 Ausschluss → 1 Manuell → 2 Prio →
 *   3 TIER 1 „tägliche Verladung" (Jeden-Tag-Abschnitte 7/4/8 inkl. EB-Abschnitt 7
 *     PLUS die täglichen Shopbereiche, standardmäßig 120 und 90 — diese Shops kommen
 *     damit VOR NOS) →
 *   4 TIER 2 NOS + Hängeware (NOS-Kennzeichen und Hängeware-Bereich sind ECHTE
 *     Prioritätstreiber) →
 *   5 TIER 3 Verladeplan (Abschnitte 1/2/3, fällig ab dem Verladetag) →
 *   6 FIFO.
 *
 * Der Überfälligkeitsvorlauf (overdueLeadDays) ist ersatzlos gestrichen (B1): ein
 * Verladeplan-Case ist fällig, sobald `today >= loadPlanDate` — keine Vorlauf-Tage,
 * keine Shop-/Abschnitts-Overrides. CatMan bleibt reines Anzeige-Datum (deaktiviert).
 * Classification returns the FIRST matching class, so e.g. a Prio case in section 7
 * is ranked as Prio, not tägliche Verladung.
 */

const EVERY_DAY_SECTIONS: readonly SectionCode[] = [7, 4, 8];
const LOAD_PLAN_SECTIONS: readonly SectionCode[] = [1, 2, 3];

/** Warenarten, die als NOS zählen (nie ausverkauft — Tier 2). */
const NOS_GOODS_TYPES: readonly string[] = ['NOS', 'NOS-Nachorder', 'NOOS'];

/** Default: Shopbereiche mit täglicher Verladung (Tier 1, konfigurierbar). */
export const DEFAULT_DAILY_SHOP_AREAS: readonly string[] = ['120', '90'];

/** Statuses eligible for assignment. Everything else is class 0 (Ausschluss). */
const DEFAULT_ELIGIBLE_STATUSES: readonly CaseStatus[] = ['ready', 'partially_completed'];

export interface PriorityContext {
  /** The planning date; Verladeplan dates are compared against it. */
  today: ISODate;
  eligibleStatuses?: readonly CaseStatus[];
  /**
   * Shopbereiche mit täglicher Verladung (Tier 1 neben den Jeden-Tag-Abschnitten).
   * Default {@link DEFAULT_DAILY_SHOP_AREAS} (120, 90).
   */
  dailyShopAreas?: readonly string[];
}

/** NOS-Erkennung auf Beleg-Ebene: Warenart des Kopfes. */
function isNosCase(goodsCase: GoodsReceiptCase): boolean {
  return goodsCase.goodsTypeText !== undefined && NOS_GOODS_TYPES.includes(goodsCase.goodsTypeText);
}

/** Hängeware: der Bereich ist durch die Lagerklasse des Lagerplatzes fixiert. */
function isHaengeware(goodsCase: GoodsReceiptCase): boolean {
  return goodsCase.storageLocation?.type === 'haengebahn';
}

/** Classify one case against the §8.1 ladder (B2). */
export function classifyPriority(
  goodsCase: GoodsReceiptCase,
  ctx: PriorityContext,
): PriorityClassification {
  const eligible = ctx.eligibleStatuses ?? DEFAULT_ELIGIBLE_STATUSES;
  if (!eligible.includes(goodsCase.status)) {
    return {
      rank: PRIORITY_RANK.exclusion,
      class: 'exclusion',
      reason: `status "${goodsCase.status}" is not eligible for assignment`,
    };
  }

  const flags = goodsCase.priorityFlags;
  if (flags.includes('manual_teamlead_priority')) {
    return {
      rank: PRIORITY_RANK.manualTeamlead,
      class: 'manual_teamlead',
      reason: 'manual Teamlead priority',
    };
  }
  if (flags.includes('prio')) {
    return { rank: PRIORITY_RANK.prioFlag, class: 'prio_flag', reason: 'Prio-Kennzeichen' };
  }

  // TIER 1 tägliche Verladung: Jeden-Tag-Abschnitte 7/4/8 + tägliche Shopbereiche.
  const section = goodsCase.section;
  if (section !== null && EVERY_DAY_SECTIONS.includes(section)) {
    return {
      rank: PRIORITY_RANK.dailyLoading,
      class: 'daily_loading',
      reason: `tägliche Verladung (Abschnitt ${section})`,
    };
  }
  const dailyShopAreas = ctx.dailyShopAreas ?? DEFAULT_DAILY_SHOP_AREAS;
  if (
    goodsCase.primaryShopAreaNo !== undefined &&
    dailyShopAreas.includes(goodsCase.primaryShopAreaNo)
  ) {
    return {
      rank: PRIORITY_RANK.dailyLoading,
      class: 'daily_loading',
      reason: `tägliche Verladung (Shopbereich ${goodsCase.primaryShopAreaNo})`,
    };
  }

  // TIER 2 NOS + Hängeware — echte Prioritätstreiber (B2).
  if (isNosCase(goodsCase)) {
    return {
      rank: PRIORITY_RANK.nosHaengeware,
      class: 'nos_haengeware',
      reason: `NOS-Ware (${goodsCase.goodsTypeText})`,
    };
  }
  if (isHaengeware(goodsCase)) {
    return {
      rank: PRIORITY_RANK.nosHaengeware,
      class: 'nos_haengeware',
      reason: 'Hängeware (Bereich Hängebahn)',
    };
  }

  // TIER 3 Verladeplan: Abschnitte 1/2/3, fällig ab dem Verladetag (kein Vorlauf, B1).
  if (
    section !== null &&
    LOAD_PLAN_SECTIONS.includes(section) &&
    goodsCase.loadPlanDate !== undefined &&
    ctx.today >= goodsCase.loadPlanDate
  ) {
    const overdue = ctx.today > goodsCase.loadPlanDate;
    const reason = overdue
      ? `Verladeplan-Ware überfällig (Abschnitt ${section}, Verladetag ${goodsCase.loadPlanDate})`
      : `Verladeplan-Ware fällig (Abschnitt ${section}, Verladetag ${goodsCase.loadPlanDate})`;
    return { rank: PRIORITY_RANK.loadPlanDue, class: 'load_plan_due', reason };
  }

  return { rank: PRIORITY_RANK.fifo, class: 'fifo', reason: 'FIFO (älteste Buchungsdaten zuerst)' };
}

/**
 * §8.3 Sortierung: order by rank, then FIFO (oldest booking date first), with
 * deterministic tie-breaks so simulation/recalculate is reproducible.
 */
export function comparePriority(a: EnrichedCase, b: EnrichedCase): number {
  if (a.priority.rank !== b.priority.rank) return a.priority.rank - b.priority.rank;
  if (a.case.bookingDate !== b.case.bookingDate) return a.case.bookingDate < b.case.bookingDate ? -1 : 1;
  if (a.case.weBelegNo !== b.case.weBelegNo) return a.case.weBelegNo < b.case.weBelegNo ? -1 : 1;
  if (a.case.id === b.case.id) return 0;
  return a.case.id < b.case.id ? -1 : 1;
}

/** Return a new array sorted by §8.1 priority (input is not mutated). */
export function sortByPriority(cases: readonly EnrichedCase[]): EnrichedCase[] {
  return [...cases].sort(comparePriority);
}
