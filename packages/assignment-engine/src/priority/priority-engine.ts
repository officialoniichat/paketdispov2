import type { CaseStatus, GoodsReceiptCase, ISODate, SectionCode } from '@paket/domain-types';
import { PRIORITY_RANK, type EnrichedCase, type PriorityClassification } from '../types.js';

/**
 * Shop-/Abschnitts-spezifischer Vorlauf-Override (Teamlead-Punkt 4). A case matches
 * an override when every specified field equals the case's; `undefined` fields are
 * wildcards. The most specific match wins (see {@link resolveLeadDays}).
 */
export interface LoadPlanLeadOverride {
  shopAreaNo?: string;
  /** SectionCode value (1/2/3/4/7/8); typed `number` to match the engine config schema. */
  section?: number;
  leadDays: number;
}

/**
 * §8.1 Prioritätsklassen. Cases are classified into ranks 0–6 and then ordered
 * Ausschluss → Manuell → Prio → Überfällig → Jeden-Tag (7/4/8) → Verladeplan (1/2/3) → FIFO.
 * Classification returns the FIRST matching class, so e.g. a Prio case in section 7
 * is ranked as Prio, not Jeden-Tag.
 */

const EVERY_DAY_SECTIONS: readonly SectionCode[] = [7, 4, 8];
const LOAD_PLAN_SECTIONS: readonly SectionCode[] = [1, 2, 3];

/** Statuses eligible for assignment. Everything else is class 0 (Ausschluss). */
const DEFAULT_ELIGIBLE_STATUSES: readonly CaseStatus[] = ['ready', 'partially_completed'];

export interface PriorityContext {
  /** The planning date; Verladeplan dates are compared against it. */
  today: ISODate;
  eligibleStatuses?: readonly CaseStatus[];
  /**
   * §Teamlead-Punkt 4: default Vorlauf in days. A Verladeplan case (section 1/2/3)
   * counts as due/overdue once `today >= loadPlanDate − overdueLeadDays` — i.e. it is
   * within `overdueLeadDays` days BEFORE its loading day, or the loading day passed.
   * Defaults to 0, which reproduces the legacy "Verladeplan-Ware heute" behaviour
   * (due only on/after the loading day). The loading day itself (`loadPlanDate`) is
   * resolved upstream from the Verladeplan calendar — the engine stays pure.
   */
  overdueLeadDays?: number;
  /** Shop-/section-specific lead-day overrides; most specific match wins. */
  overdueLeadDaysOverrides?: readonly LoadPlanLeadOverride[];
}

const MS_PER_DAY = 86_400_000;

/** Shift an ISO date (YYYY-MM-DD) by `days` (may be negative), returning a new ISO date. */
function addDays(date: ISODate, days: number): ISODate {
  const shifted = new Date(`${date}T00:00:00.000Z`).getTime() + days * MS_PER_DAY;
  return new Date(shifted).toISOString().slice(0, 10) as ISODate;
}

/**
 * Resolve the effective Vorlauf for a case: the most specific matching override wins,
 * otherwise the context default (or 0). Specificity = number of fields the override
 * pins (shopAreaNo and/or section); ties keep the first listed override (deterministic).
 */
export function resolveLeadDays(goodsCase: GoodsReceiptCase, ctx: PriorityContext): number {
  const overrides = ctx.overdueLeadDaysOverrides ?? [];
  let best: LoadPlanLeadOverride | undefined;
  let bestScore = -1;
  for (const o of overrides) {
    if (o.shopAreaNo !== undefined && o.shopAreaNo !== goodsCase.primaryShopAreaNo) continue;
    if (o.section !== undefined && o.section !== goodsCase.section) continue;
    const score = (o.shopAreaNo !== undefined ? 1 : 0) + (o.section !== undefined ? 1 : 0);
    if (score > bestScore) {
      best = o;
      bestScore = score;
    }
  }
  return best?.leadDays ?? ctx.overdueLeadDays ?? 0;
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

  // Rank-3 tier is driven by overdue only. CatMan (the `catman_due` flag and
  // `catManDate`) is deliberately NOT a priority driver — it stays a purely
  // informational field shown in the UIs. (Tier name kept for the overdue task.)
  if (flags.includes('overdue')) {
    return { rank: PRIORITY_RANK.catManDue, class: 'catman_due', reason: 'überfällig' };
  }

  const section = goodsCase.section;
  if (section !== null && EVERY_DAY_SECTIONS.includes(section)) {
    return {
      rank: PRIORITY_RANK.everyDay,
      class: 'every_day',
      reason: `Jeden-Tag-Ware (Abschnitt ${section})`,
    };
  }

  // §Teamlead-Punkt 4: a Verladeplan case becomes due/overdue relative to its loading
  // day, not via an hour-difference threshold. It is due once today is within the
  // (shop-/section-configurable) Vorlauf before the loading day, or the day has passed.
  if (section !== null && LOAD_PLAN_SECTIONS.includes(section) && goodsCase.loadPlanDate !== undefined) {
    const leadDays = resolveLeadDays(goodsCase, ctx);
    const dueFrom = addDays(goodsCase.loadPlanDate, -leadDays);
    if (ctx.today >= dueFrom) {
      const overdue = ctx.today > goodsCase.loadPlanDate;
      const reason = overdue
        ? `Verladeplan-Ware überfällig (Abschnitt ${section}, Verladetag ${goodsCase.loadPlanDate})`
        : `Verladeplan-Ware fällig (Abschnitt ${section}, Verladetag ${goodsCase.loadPlanDate}, Vorlauf ${leadDays} Tage)`;
      return { rank: PRIORITY_RANK.loadPlanDue, class: 'load_plan_due', reason };
    }
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
