import type { CaseStatus, GoodsReceiptCase, ISODate, SectionCode } from '@paket/domain-types';
import { PRIORITY_RANK, type EnrichedCase, type PriorityClassification } from '../types.js';

/**
 * §8.1 Prioritätsklassen. Cases are classified into ranks 0–6 and then ordered
 * Ausschluss → Manuell → Prio → CatMan → Jeden-Tag (7/4/8) → Verladeplan (1/2/3) → FIFO.
 * Classification returns the FIRST matching class, so e.g. a Prio case in section 7
 * is ranked as Prio, not Jeden-Tag.
 */

const EVERY_DAY_SECTIONS: readonly SectionCode[] = [7, 4, 8];
const LOAD_PLAN_SECTIONS: readonly SectionCode[] = [1, 2, 3];

/** Statuses eligible for assignment. Everything else is class 0 (Ausschluss). */
const DEFAULT_ELIGIBLE_STATUSES: readonly CaseStatus[] = ['ready', 'partially_completed'];

export interface PriorityContext {
  /** The planning date; CatMan/Verladeplan dates are compared against it. */
  today: ISODate;
  eligibleStatuses?: readonly CaseStatus[];
}

/** Classify one case against §8.1. */
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

  const catManDue =
    flags.includes('catman_due') ||
    flags.includes('overdue') ||
    (goodsCase.catManDate !== undefined && goodsCase.catManDate <= ctx.today);
  if (catManDue) {
    return { rank: PRIORITY_RANK.catManDue, class: 'catman_due', reason: 'CatMan fällig/überfällig' };
  }

  const section = goodsCase.section;
  if (section !== null && EVERY_DAY_SECTIONS.includes(section)) {
    return {
      rank: PRIORITY_RANK.everyDay,
      class: 'every_day',
      reason: `Jeden-Tag-Ware (Abschnitt ${section})`,
    };
  }

  if (
    section !== null &&
    LOAD_PLAN_SECTIONS.includes(section) &&
    goodsCase.loadPlanDate !== undefined &&
    goodsCase.loadPlanDate <= ctx.today
  ) {
    return {
      rank: PRIORITY_RANK.loadPlanToday,
      class: 'load_plan_today',
      reason: `Verladeplan-Ware heute (Abschnitt ${section})`,
    };
  }

  return { rank: PRIORITY_RANK.fifo, class: 'fifo', reason: 'FIFO (älteste Buchungsdaten zuerst)' };
}

/**
 * §8.3 `sortByPriorityCatManLoadPlanFifo`: order by rank, then FIFO (oldest booking
 * date first), with deterministic tie-breaks so simulation/recalculate is reproducible.
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
