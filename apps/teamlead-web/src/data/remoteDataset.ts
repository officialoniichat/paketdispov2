/**
 * Live cockpit fetch + DTO→view-model mapping (Phase 2 of automatik-wiring).
 *
 * Replaces `loadMockDataset()` selectors: fans out the teamlead read endpoints
 * (§10.1 capacity/dashboard/kpis, §10.3 board, §8.4 events, §10.2 pool) and maps
 * each DTO field-by-field onto the SAME shapes the cockpit components already
 * read (`CockpitSummary`, `BoardRow[]`, `Lane[]`, `WorkflowEvent[]`), so the
 * feature components don't change.
 */
import type { WorkflowEvent } from '@paket/domain-types';
import type { components } from '@paket/api-client';
import { api } from './api.js';
import { unwrap } from './http.js';
import { toOverrideAction, type AuditPayload } from './audit.js';
import {
  toActorType,
  toCaseStatus,
  toEventType,
  toPriorityFlags,
  toSectionCode,
  toSkillTier,
} from './narrow.js';
import type {
  BoardCase,
  BoardRow,
  CapacitySummary,
  CockpitSummary,
  Lane,
  LaneCard,
  LaneId,
  PoolCase,
  PoolSummary,
  ZstProgress,
} from './types.js';

type CapacityDto = components['schemas']['CapacityDto'];
type DashboardDto = components['schemas']['DashboardDto'];
type KpiDto = components['schemas']['KpiDto'];
type BoardDto = components['schemas']['BoardDto'];
type BoardRowDto = components['schemas']['BoardRowDto'];
type BoardCaseDto = components['schemas']['BoardCaseDto'];
type AuditEventDto = components['schemas']['AuditEventDto'];
type PoolItemDto = components['schemas']['PoolItemDto'];
type PoolListDto = components['schemas']['PoolListDto'];

/** The whole cockpit snapshot the provider exposes (mirrors the old selectors). */
export interface CockpitSnapshot {
  cockpit: CockpitSummary;
  board: BoardRow[];
  lanes: Lane[];
  recentOverrides: WorkflowEvent<AuditPayload>[];
  /** Ready, unassigned cases that can be added to a bundle (§10.3 manual add). */
  pool: PoolCase[];
}

/**
 * The §8.4 events that represent a genuine human teamlead intervention — the only
 * ones the "Letzte Teamlead-Eingriffe" feed should show. Sent to the backend as
 * an explicit allowlist so the feed never relies solely on actorType.
 */
const GENUINE_INTERVENTION_EVENT_TYPES =
  'assignment.overridden,case.prioritized,case.parked,case.ready';

export async function fetchCockpit(date: string): Promise<CockpitSnapshot> {
  const [capacity, dashboard, kpis, board, events, pool] = await Promise.all([
    api.GET('/api/teamlead/capacity', { params: { query: { date } } }),
    api.GET('/api/teamlead/dashboard'),
    api.GET('/api/teamlead/kpis', { params: { query: { date } } }),
    api.GET('/api/teamlead/board', { params: { query: { date } } }),
    api.GET('/api/teamlead/events', {
      params: {
        query: {
          // Explicit genuine-intervention allowlist (§8.4): the feed shows real
          // human overrides, not engine/system events. actorType=teamlead is the
          // belt; this eventType allowlist is the braces, so an accidentally
          // teamlead-tagged system event can never leak into the feed.
          actorType: 'teamlead',
          eventType: GENUINE_INTERVENTION_EVENT_TYPES,
          limit: 50,
        },
      },
    }),
    api.GET('/api/teamlead/cases', { params: { query: { page: 1, limit: 200 } } }),
  ]);

  const capacityDto = unwrap<CapacityDto>(capacity, 'capacity');
  const dashboardDto = unwrap<DashboardDto>(dashboard, 'dashboard');
  const kpiDto = unwrap<KpiDto>(kpis, 'kpis');
  const boardDto = unwrap<BoardDto>(board, 'board');
  const eventDtos = unwrap<AuditEventDto[]>(events, 'events');
  const poolDto = unwrap<PoolListDto>(pool, 'cases');

  return {
    cockpit: {
      date: capacityDto.date,
      capacity: mapCapacity(capacityDto),
      pool: mapPool(dashboardDto, poolDto.items),
      zst: mapZst(kpiDto),
    },
    board: boardDto.rows.map(mapBoardRow),
    lanes: buildLanes(poolDto.items),
    recentOverrides: eventDtos.map(mapEvent),
    pool: poolDto.items.filter(isAddablePoolItem).map(toPoolCase),
  };
}

/** Ready, not-yet-assigned cases are the only ones a teamlead can add to a bundle. */
function isAddablePoolItem(item: PoolItemDto): boolean {
  return item.status === 'ready' && item.assignedEmployeeNo == null;
}

function toPoolCase(item: PoolItemDto): PoolCase {
  return {
    caseId: item.id,
    weBelegNo: item.weBelegNo,
    estimatedMinutes: item.estimatedMinutes,
    bereich: item.bereich ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// §10.1 Tagescockpit
// ---------------------------------------------------------------------------

function mapCapacity(dto: CapacityDto): CapacitySummary {
  return {
    plannedEmployees: dto.plannedEmployees,
    netCapacityMinutes: dto.netCapacityMinutes,
    plannedMinutes: dto.plannedMinutes,
    freeCapacityMinutes: dto.freeCapacityMinutes,
    utilisationPct: dto.utilisationPct,
  };
}

function mapPool(dto: DashboardDto, items: PoolItemDto[]): PoolSummary {
  return {
    openCases: dto.poolSize,
    prio: dto.prioOpen,
    overdue: items.filter((i) => i.priorityFlags.includes('overdue')).length,
    catManDue: items.filter((i) => i.priorityFlags.includes('catman_due')).length,
    openIssues: items.filter((i) => i.status === 'issue_open').length,
    endOfShiftOpen: dto.endOfShiftOpenCount,
  };
}

function mapZst(dto: KpiDto): ZstProgress {
  return {
    completedCases: dto.completedCases,
    totalCases: dto.totalCases,
    completedParts: dto.completedParts,
    effortPoints: dto.effortPoints,
    partsPerHour: dto.partsPerHour,
    effortPointsPerHour: dto.effortPointsPerHour,
  };
}

// ---------------------------------------------------------------------------
// §10.3 Mitarbeitenden-Board
// ---------------------------------------------------------------------------

function mapBoardRow(row: BoardRowDto): BoardRow {
  const net = row.capacityMinutes;
  const assigned = row.plannedEffortMinutes;
  const currentCaseIndex = row.cases.findIndex((c) => !isDoneStatus(c.status));
  return {
    employeeId: row.employeeNo,
    displayName: row.employeeName,
    skillTier: toSkillTier(row.skillTier),
    plannedTeile: row.plannedTeile,
    plannedHours: round1(net / 60),
    utilisationPct: net === 0 ? 0 : round1((assigned / net) * 100),
    assignedMinutes: assigned,
    netCapacityMinutes: net,
    effortPoints: row.cases.reduce((sum, c) => sum + c.effortPoints, 0),
    openIssues: 0,
    currentCaseIndex: currentCaseIndex >= 0 ? currentCaseIndex : undefined,
    bundleSize: row.cases.length,
    bundleId: row.bundleId ?? undefined,
    paused: row.bundleStatus === 'paused',
    bereiche: row.bereiche,
    cases: row.cases.map(toBoardCase),
  };
}

function toBoardCase(c: BoardCaseDto): BoardCase {
  return {
    caseId: c.id,
    weBelegNo: c.weBelegNo,
    status: toCaseStatus(c.status),
    totalQuantity: c.totalQuantity,
    estimatedMinutes: c.estimatedMinutes,
    effortPoints: c.effortPoints,
    // BoardCaseDto carries no storage code; the board caption hides it when empty.
    storageCode: '',
    deliveryGroup: c.deliveryGroup ?? null,
  };
}

// ---------------------------------------------------------------------------
// §10.2 Digitale Ablagen (lanes derived from the open pool)
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
    description: 'Vorausschau für Starterpakete',
  },
  sonstige: { title: 'Sonstige', description: 'Übrige Ware ohne festen Verladetag' },
  geparkt: { title: 'Geparkt', description: 'Aus Automatik ausgeschlossen' },
  weitergeleitet: {
    title: 'Weitergeleitet',
    description: 'An Abteilung weitergeleitet (mock-Queue)',
  },
  probleme: { title: 'Problemfälle', description: 'Offene Issues' },
};

/**
 * Default lane precedence (C5): probleme → weitergeleitet → geparkt → rest, so a
 * forwarded Beleg with an OPEN issue stays visible as Problemfall (the banner
 * covers the Weiterleitung). The user may re-order the *display* (C2, persisted),
 * but bucketing precedence stays fixed here.
 */
export const LANE_ORDER: LaneId[] = [
  'probleme',
  'weitergeleitet',
  'geparkt',
  'prio',
  'verladeplan_heute',
  'verladeplan_morgen',
  'jeden_tag',
  'sonstige',
];

const VERLADEPLAN_SECTIONS = new Set([1, 2, 3]);
const JEDEN_TAG_SECTIONS = new Set([7, 4, 8]);

/** Deterministic single-lane bucketing for a pool item (precedence = LANE_ORDER). */
function laneForPoolItem(item: PoolItemDto): LaneId {
  if (item.status === 'issue_open') return 'probleme';
  if (item.forwardedTo != null) return 'weitergeleitet';
  if (item.status === 'parked') return 'geparkt';
  if (
    item.priorityFlags.includes('prio') ||
    item.priorityFlags.includes('manual_teamlead_priority')
  ) {
    return 'prio';
  }
  const section = typeof item.section === 'number' ? item.section : null;
  if (section !== null && VERLADEPLAN_SECTIONS.has(section)) return 'verladeplan_heute';
  if (section !== null && JEDEN_TAG_SECTIONS.has(section)) return 'jeden_tag';
  return 'sonstige';
}

/**
 * The Ablagen board (§10.2) is the steerable pool — cases that are still
 * park-/release-/prioritise-able. A case the engine already placed (`assigned`) or
 * that an employee has started belongs on the Mitarbeiterboard, NOT in a pool lane:
 * showing it here would offer "Parken", which the §7.1 state machine rejects (park is
 * only legal from `ready`). Restrict lanes to genuine pool residents.
 */
const POOL_LANE_STATUSES = new Set<PoolItemDto['status']>([
  'ready',
  'parked',
  'issue_open',
]);

function isPoolResident(item: PoolItemDto): boolean {
  // C5: a forwarded Beleg stays visible in its lane WHATEVER its pool-resident
  // status — forwarding is status-neutral and the lane is the mocked queue.
  if (item.forwardedTo != null) return true;
  return POOL_LANE_STATUSES.has(item.status);
}

function buildLanes(items: PoolItemDto[]): Lane[] {
  const buckets = new Map<LaneId, LaneCard[]>(LANE_ORDER.map((id) => [id, []]));
  for (const item of items) {
    if (!isPoolResident(item)) continue;
    buckets.get(laneForPoolItem(item))!.push(toLaneCard(item));
  }
  return LANE_ORDER.map((id) => {
    const cards = buckets.get(id)!;
    return {
      id,
      title: LANE_META[id].title,
      description: LANE_META[id].description,
      cards,
      totalEffortMinutes: cards.reduce((sum, card) => sum + card.estimatedMinutes, 0),
    };
  });
}

function toLaneCard(item: PoolItemDto): LaneCard {
  return {
    caseId: item.id,
    weBelegNo: item.weBelegNo,
    status: toCaseStatus(item.status),
    section: toSectionCode(item.section),
    priorityFlags: toPriorityFlags(item.priorityFlags),
    totalQuantity: item.totalQuantity,
    effortPoints: item.effortPoints,
    estimatedMinutes: item.estimatedMinutes,
    storageCode: item.storageLocationCode ?? '–',
    assignedTo: typeof item.assignedEmployeeNo === 'string' ? item.assignedEmployeeNo : undefined,
    openIssue: item.openIssue ? { kind: item.openIssue.kind, note: item.openIssue.note ?? null } : null,
    forwardedTo: item.forwardedTo ?? null,
  };
}

// ---------------------------------------------------------------------------
// §8.4 Audit feed
// ---------------------------------------------------------------------------

function mapEvent(dto: AuditEventDto): WorkflowEvent<AuditPayload> {
  return {
    id: dto.id,
    eventType: toEventType(dto.eventType),
    entityType: dto.entityType,
    entityId: dto.entityId,
    actorType: toActorType(dto.actorType),
    actorId: dto.actorId,
    timestamp: dto.at,
    payload: { action: toOverrideAction(dto.action), reason: dto.reason ?? undefined },
  };
}

function isDoneStatus(status: string): boolean {
  return status === 'completed' || status === 'zst_done' || status === 'cancelled';
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
