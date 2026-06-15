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
import {
  actorTypeSchema,
  caseStatusSchema,
  priorityFlagSchema,
  sectionCodeSchema,
  workflowEventTypeSchema,
} from '@paket/domain-types';
import type { components } from '@paket/api-client';
import { api } from './api.js';
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
  recentOverrides: WorkflowEvent[];
  /** Ready, unassigned cases that can be added to a bundle (§10.3 manual add). */
  pool: PoolCase[];
}

const HEAVY_MINUTES_THRESHOLD = 30;

// ---------------------------------------------------------------------------
// Boundary narrowing: the generated DTOs type enum-ish fields as plain
// `string`/`number`, so we validate them against the domain Zod schemas before
// projecting onto the view-model unions instead of asserting with a bare `as`.
// An unexpected backend value fails fast (throws) rather than corrupting state.
// ---------------------------------------------------------------------------

/** Narrow a DTO status string to the domain `CaseStatus`, throwing on an unknown value. */
function toCaseStatus(value: string): BoardCase['status'] {
  return caseStatusSchema.parse(value);
}

/** Narrow a DTO actorType string to the domain `ActorType`. */
function toActorType(value: string): WorkflowEvent['actorType'] {
  return actorTypeSchema.parse(value);
}

/** Narrow a DTO eventType string to the domain `WorkflowEventType`. */
function toEventType(value: string): WorkflowEvent['eventType'] {
  return workflowEventTypeSchema.parse(value);
}

/**
 * Narrow a DTO section to the domain `SectionCode`, or null when absent/invalid.
 * The generated `section` type widens to `Record<string, never> | null` (an
 * openapi-typescript nullable-number artifact), so we accept `unknown` and gate
 * on `typeof === 'number'` before validating.
 */
function toSectionCode(value: unknown): LaneCard['section'] {
  if (typeof value !== 'number') return null;
  const parsed = sectionCodeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Keep only the DTO priority flags that are members of the domain `PriorityFlag` union. */
function toPriorityFlags(values: readonly string[]): LaneCard['priorityFlags'] {
  return values.filter(
    (flag): flag is LaneCard['priorityFlags'][number] => priorityFlagSchema.safeParse(flag).success,
  );
}

/** Unwrap an openapi-fetch `{ data, error }` result, throwing so React Query sees it. */
function unwrap<T>(result: { data?: T; error?: unknown }, label: string): T {
  if (result.error || result.data === undefined) {
    throw new Error(`Backend request failed: ${label} (${JSON.stringify(result.error)})`);
  }
  return result.data;
}

export async function fetchCockpit(date: string): Promise<CockpitSnapshot> {
  const [capacity, dashboard, kpis, board, events, pool] = await Promise.all([
    api.GET('/api/teamlead/capacity', { params: { query: { date } } }),
    api.GET('/api/teamlead/dashboard'),
    api.GET('/api/teamlead/kpis', { params: { query: { date } } }),
    api.GET('/api/teamlead/board', { params: { query: { date } } }),
    api.GET('/api/teamlead/events', { params: { query: { actorType: 'teamlead', limit: 50 } } }),
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
    reserveMinutes: dto.reserveMinutes,
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
  const heavyCaseCount = row.cases.filter(
    (c) => c.estimatedMinutes >= HEAVY_MINUTES_THRESHOLD,
  ).length;
  const currentCaseIndex = row.cases.findIndex((c) => !isDoneStatus(c.status));
  return {
    employeeId: row.employeeNo,
    displayName: row.employeeName,
    plannedHours: round1(net / 60),
    utilisationPct: net === 0 ? 0 : round1((assigned / net) * 100),
    assignedMinutes: assigned,
    netCapacityMinutes: net,
    effortPoints: row.cases.reduce((sum, c) => sum + c.effortPoints, 0),
    heavyCaseCount,
    lightCaseCount: row.cases.length - heavyCaseCount,
    openIssues: 0,
    currentCaseIndex: currentCaseIndex >= 0 ? currentCaseIndex : undefined,
    bundleSize: row.cases.length,
    bundleId: row.bundleId,
    paused: row.bundleStatus === 'paused',
    cases: row.cases.map(toBoardCase),
  };
}

function toBoardCase(c: BoardCaseDto): BoardCase {
  return {
    caseId: c.id,
    weBelegNo: c.weBelegNo,
    status: toCaseStatus(c.status),
    estimatedMinutes: c.estimatedMinutes,
    effortPoints: c.effortPoints,
    // BoardCaseDto carries no storage code; the board caption hides it when empty.
    storageCode: '',
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

/** Deterministic single-lane bucketing for a pool item (precedence = LANE_ORDER). */
function laneForPoolItem(item: PoolItemDto): LaneId {
  if (item.status === 'issue_open') return 'probleme';
  if (item.status === 'needs_review') return 'needs_review';
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
  return 'reserve';
}

/**
 * The Ablagen board (§10.2) is the steerable pool — cases that are still
 * park-/release-/prioritise-able. A case the engine already placed (`assigned`) or
 * that an employee has started belongs on the Mitarbeiterboard, NOT in a pool lane:
 * showing it here would offer "Parken", which the §7.1 state machine rejects (park is
 * only legal from `ready`/`needs_review`). Restrict lanes to genuine pool residents.
 */
const POOL_LANE_STATUSES = new Set<PoolItemDto['status']>([
  'ready',
  'parked',
  'needs_review',
  'issue_open',
]);

function isPoolResident(item: PoolItemDto): boolean {
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
    storageCode: item.storageLocationCode,
    assignedTo: typeof item.assignedEmployeeNo === 'string' ? item.assignedEmployeeNo : undefined,
  };
}

// ---------------------------------------------------------------------------
// §8.4 Audit feed
// ---------------------------------------------------------------------------

function mapEvent(dto: AuditEventDto): WorkflowEvent {
  return {
    id: dto.id,
    eventType: toEventType(dto.eventType),
    entityType: dto.entityType,
    entityId: dto.entityId,
    actorType: toActorType(dto.actorType),
    actorId: dto.actorId,
    timestamp: dto.at,
    payload: { action: dto.action, reason: dto.reason },
  };
}

function isDoneStatus(status: string): boolean {
  return status === 'completed' || status === 'zst_done' || status === 'cancelled';
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
