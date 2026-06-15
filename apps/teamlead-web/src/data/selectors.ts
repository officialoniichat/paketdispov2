/**
 * Pure selectors deriving the cockpit view-models from an OperationsDataset
 * (§10/§11, Anhang E.4). No React, no I/O – so they are trivially unit-tested
 * and reused by hooks, tables and the simulation.
 */
import type {
  GoodsReceiptCase,
  ReceiptPosition,
  TransportBox,
  WorkIssue,
  WorkflowEvent,
} from '@paket/domain-types';
import type {
  BoardRow,
  CockpitSummary,
  DocumentRef,
  Lane,
  LaneCard,
  LaneId,
  OperationsDataset,
  SimulationResult,
} from './types.js';

/** Statuses that count as "done" and drop out of the open pool / lanes. */
const DONE_STATUSES: ReadonlySet<GoodsReceiptCase['status']> = new Set([
  'completed',
  'zst_done',
  'cancelled',
]);

/** A heavy case (for the schwer/leicht mix on the board, §8.4). */
const HEAVY_MINUTES_THRESHOLD = 30;

const OPEN_ISSUE_STATUSES: ReadonlySet<WorkIssue['status']> = new Set([
  'open',
  'in_review',
  'waiting_external',
]);

export function isOpenCase(c: GoodsReceiptCase): boolean {
  return !DONE_STATUSES.has(c.status);
}

export function isHeavyCase(c: GoodsReceiptCase): boolean {
  return c.estimatedMinutes >= HEAVY_MINUTES_THRESHOLD;
}

// ---------------------------------------------------------------------------
// §10.1 Tagescockpit
// ---------------------------------------------------------------------------

export function buildCockpitSummary(ds: OperationsDataset): CockpitSummary {
  const netCapacityMinutes = ds.shifts
    .filter((s) => s.active)
    .reduce((sum, s) => sum + s.netCapacityMinutes, 0);
  const plannedMinutes = ds.bundles
    .filter((b) => b.status !== 'cancelled' && b.status !== 'completed')
    .reduce((sum, b) => sum + b.plannedEffortMinutes, 0);
  const reserveMinutes = Math.max(0, netCapacityMinutes - plannedMinutes);
  const utilisationPct =
    netCapacityMinutes === 0 ? 0 : round1((plannedMinutes / netCapacityMinutes) * 100);

  const openCases = ds.cases.filter(isOpenCase);
  const openIssues = ds.issues.filter((i) => OPEN_ISSUE_STATUSES.has(i.status)).length;

  const completed = ds.cases.filter((c) => DONE_STATUSES.has(c.status));
  const dayKpi = ds.kpis.find((k) => k.granularity === 'day');

  return {
    date: ds.date,
    capacity: {
      plannedEmployees: ds.shifts.filter((s) => s.active).length,
      netCapacityMinutes,
      plannedMinutes,
      reserveMinutes,
      utilisationPct,
    },
    pool: {
      openCases: openCases.length,
      overdue: openCases.filter((c) => c.priorityFlags.includes('overdue')).length,
      prio: openCases.filter((c) => c.priorityFlags.includes('prio')).length,
      catManDue: openCases.filter((c) => c.priorityFlags.includes('catman_due')).length,
      openIssues,
    },
    zst: {
      completedCases: completed.length,
      totalCases: ds.cases.length,
      completedParts: dayKpi?.completedParts ?? completed.reduce((s, c) => s + c.totalQuantity, 0),
      effortPoints: dayKpi?.effortPoints ?? completed.reduce((s, c) => s + c.effortPoints, 0),
      partsPerHour: dayKpi?.partsPerHour ?? 0,
      effortPointsPerHour: dayKpi?.effortPointsPerHour ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// §10.2 Digitale Ablagen
// ---------------------------------------------------------------------------

const LANE_META: Record<LaneId, { title: string; description: string }> = {
  prio: { title: 'Prio', description: 'Manuell priorisiert oder Prio-Kennzeichen' },
  jeden_tag: { title: 'Jeden-Tag-Ware', description: 'Abschnitt 7, 4, 8' },
  verladeplan_heute: {
    title: 'Verladeplan heute',
    description: 'Abschnitt 1, 2, 3 – heutiger Verladetag',
  },
  verladeplan_morgen: {
    title: 'Verladeplan morgen',
    description: 'Vorausschau für Starterpakete/Reserve',
  },
  reserve: { title: 'Reserve', description: 'Eiserne Reserve schützen' },
  geparkt: { title: 'Geparkt', description: 'Aus Automatik ausgeschlossen' },
  needs_review: { title: 'Prüfen', description: 'Parser/Validierung unsicher' },
  probleme: { title: 'Problemfälle', description: 'Offene Issues' },
};

const LANE_ORDER: LaneId[] = [
  'probleme',
  'needs_review',
  'geparkt',
  'prio',
  'verladeplan_heute',
  'verladeplan_morgen',
  'jeden_tag',
  'reserve',
];

const VERLADEPLAN_SECTIONS = new Set([1, 2, 3]);
const JEDEN_TAG_SECTIONS = new Set([7, 4, 8]);

/** Deterministic single-lane assignment (precedence = LANE_ORDER). */
export function laneForCase(c: GoodsReceiptCase, ds: OperationsDataset): LaneId | null {
  if (DONE_STATUSES.has(c.status)) return null;
  const hasOpenIssue =
    c.status === 'issue_open' ||
    ds.issues.some((i) => i.caseId === c.id && OPEN_ISSUE_STATUSES.has(i.status));
  if (hasOpenIssue) return 'probleme';
  if (c.status === 'needs_review') return 'needs_review';
  if (c.status === 'parked') return 'geparkt';
  if (c.priorityFlags.includes('prio') || c.priorityFlags.includes('manual_teamlead_priority')) {
    return 'prio';
  }
  if (c.section !== null && VERLADEPLAN_SECTIONS.has(c.section)) {
    if (c.loadPlanDate === ds.date) return 'verladeplan_heute';
    if (c.loadPlanDate && c.loadPlanDate > ds.date) return 'verladeplan_morgen';
    return 'reserve';
  }
  if (c.section !== null && JEDEN_TAG_SECTIONS.has(c.section)) return 'jeden_tag';
  return 'reserve';
}

export function buildLanes(ds: OperationsDataset): Lane[] {
  const buckets = new Map<LaneId, LaneCard[]>(LANE_ORDER.map((id) => [id, []]));
  for (const c of ds.cases) {
    const lane = laneForCase(c, ds);
    if (!lane) continue;
    buckets.get(lane)!.push(toLaneCard(c, ds));
  }
  return LANE_ORDER.map((id) => {
    const cards = buckets.get(id)!;
    return {
      id,
      title: LANE_META[id].title,
      description: LANE_META[id].description,
      cards,
      totalEffortMinutes: cards.reduce((s, card) => s + card.estimatedMinutes, 0),
    };
  });
}

function toLaneCard(c: GoodsReceiptCase, ds: OperationsDataset): LaneCard {
  const bundle = ds.bundles.find((b) => b.caseIds.includes(c.id));
  const employee = bundle && ds.employees.find((e) => e.id === bundle.employeeId);
  const issue = ds.issues.find((i) => i.caseId === c.id && OPEN_ISSUE_STATUSES.has(i.status));
  return {
    caseId: c.id,
    weBelegNo: c.weBelegNo,
    status: c.status,
    section: c.section,
    goodsTypeText: c.goodsTypeText,
    priorityFlags: c.priorityFlags,
    totalQuantity: c.totalQuantity,
    effortPoints: c.effortPoints,
    estimatedMinutes: c.estimatedMinutes,
    storageCode: c.storageLocation.code,
    assignedTo: employee?.displayName,
    issueStatus: issue?.status,
  };
}

// ---------------------------------------------------------------------------
// §10.3 Mitarbeitenden-Board
// ---------------------------------------------------------------------------

export function buildBoardRows(ds: OperationsDataset): BoardRow[] {
  return ds.employees.map((emp) => {
    const shift = ds.shifts.find((s) => s.employeeId === emp.id);
    const bundle = ds.bundles.find((b) => b.employeeId === emp.id);
    const net = shift?.netCapacityMinutes ?? 0;
    const assigned = bundle?.plannedEffortMinutes ?? 0;
    const bundleCases = (bundle?.caseIds ?? [])
      .map((id) => ds.cases.find((c) => c.id === id))
      .filter((c): c is GoodsReceiptCase => Boolean(c));
    const openIssues = ds.issues.filter(
      (i) => i.employeeId === emp.id && OPEN_ISSUE_STATUSES.has(i.status),
    ).length;
    const currentCaseIndex = bundleCases.findIndex(isOpenCase);
    return {
      employeeId: emp.id,
      displayName: emp.displayName,
      plannedHours: shift?.plannedHours ?? 0,
      utilisationPct: net === 0 ? 0 : round1((assigned / net) * 100),
      assignedMinutes: assigned,
      netCapacityMinutes: net,
      effortPoints: bundle?.effortPoints ?? 0,
      heavyCaseCount: bundleCases.filter(isHeavyCase).length,
      lightCaseCount: bundleCases.filter((c) => !isHeavyCase(c)).length,
      openIssues,
      currentCaseIndex: currentCaseIndex >= 0 ? currentCaseIndex : undefined,
      bundleSize: bundle?.caseIds.length,
      bundleId: bundle?.id,
      paused: bundle?.status === 'paused',
      cases: bundleCases.map((c) => ({
        caseId: c.id,
        weBelegNo: c.weBelegNo,
        status: c.status,
        estimatedMinutes: c.estimatedMinutes,
        effortPoints: c.effortPoints,
        storageCode: c.storageLocation.code,
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// §E.4 Simulation „Neu berechnen" (human-in-the-loop, greedy fill)
// ---------------------------------------------------------------------------

export function simulateRecalculation(ds: OperationsDataset): SimulationResult {
  const net = new Map(
    ds.shifts.filter((s) => s.active).map((s) => [s.employeeId, s.netCapacityMinutes]),
  );
  const before = new Map<string, number>();
  for (const emp of ds.employees) {
    const bundle = ds.bundles.find((b) => b.employeeId === emp.id);
    before.set(emp.id, bundle?.plannedEffortMinutes ?? 0);
  }
  const after = new Map(before);

  // Unassigned, ready cases sorted by priority then effort (greedy, deterministic).
  const assignedCaseIds = new Set(ds.bundles.flatMap((b) => b.caseIds));
  const pool = ds.cases
    .filter((c) => isOpenCase(c) && c.status === 'ready' && !assignedCaseIds.has(c.id))
    .sort((a, b) => priorityRank(b) - priorityRank(a) || b.effortPoints - a.effortPoints);

  let newlyAssigned = 0;
  let unassignedRemaining = 0;
  for (const c of pool) {
    const target = pickEmployeeWithCapacity(after, net, c.estimatedMinutes);
    if (!target) {
      unassignedRemaining += 1;
      continue;
    }
    after.set(target, (after.get(target) ?? 0) + c.estimatedMinutes);
    newlyAssigned += 1;
  }

  const netTotal = [...net.values()].reduce((s, n) => s + n, 0);
  const plannedBefore = [...before.values()].reduce((s, n) => s + n, 0);
  const plannedAfter = [...after.values()].reduce((s, n) => s + n, 0);

  return {
    newlyAssigned,
    reassigned: 0,
    reserveBeforeMinutes: Math.max(0, netTotal - plannedBefore),
    reserveAfterMinutes: Math.max(0, netTotal - plannedAfter),
    reserveDeltaMinutes: plannedBefore - plannedAfter,
    utilisationBeforePct: netTotal === 0 ? 0 : round1((plannedBefore / netTotal) * 100),
    utilisationAfterPct: netTotal === 0 ? 0 : round1((plannedAfter / netTotal) * 100),
    unassignedRemaining,
    perEmployee: ds.employees.map((emp) => ({
      employeeId: emp.id,
      displayName: emp.displayName,
      beforeMinutes: before.get(emp.id) ?? 0,
      afterMinutes: after.get(emp.id) ?? 0,
      deltaMinutes: (after.get(emp.id) ?? 0) - (before.get(emp.id) ?? 0),
    })),
  };
}

function priorityRank(c: GoodsReceiptCase): number {
  if (c.priorityFlags.includes('prio') || c.priorityFlags.includes('same_day_required')) return 3;
  if (c.priorityFlags.includes('overdue')) return 2;
  if (c.priorityFlags.includes('catman_due')) return 1;
  return 0;
}

function pickEmployeeWithCapacity(
  assigned: Map<string, number>,
  net: Map<string, number>,
  minutes: number,
): string | null {
  let best: string | null = null;
  let bestRemaining = -Infinity;
  for (const [empId, cap] of net) {
    const remaining = cap - (assigned.get(empId) ?? 0);
    if (remaining >= minutes && remaining > bestRemaining) {
      best = empId;
      bestRemaining = remaining;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Belegdetails lookups (§10.4)
// ---------------------------------------------------------------------------

export function getCaseById(ds: OperationsDataset, caseId: string): GoodsReceiptCase | undefined {
  return ds.cases.find((c) => c.id === caseId);
}

export function getPositionsForCase(ds: OperationsDataset, caseId: string): ReceiptPosition[] {
  return ds.positions.filter((p) => p.caseId === caseId);
}

export function getBoxesForCase(ds: OperationsDataset, caseId: string): TransportBox[] {
  return ds.boxes.filter((b) => b.caseId === caseId);
}

export function getIssuesForCase(ds: OperationsDataset, caseId: string): WorkIssue[] {
  return ds.issues.filter((i) => i.caseId === caseId);
}

export function getDocumentsForCase(ds: OperationsDataset, caseId: string): DocumentRef[] {
  return ds.documents.filter((d) => d.caseId === caseId);
}

/** Events touching a case or any of its issues/boxes, newest first (Historie). */
export function getHistoryForCase(ds: OperationsDataset, caseId: string): WorkflowEvent[] {
  const issueIds = new Set(getIssuesForCase(ds, caseId).map((i) => i.id));
  const boxIds = new Set(getBoxesForCase(ds, caseId).map((b) => b.id));
  return ds.events
    .filter((e) => e.entityId === caseId || issueIds.has(e.entityId) || boxIds.has(e.entityId))
    .slice()
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
