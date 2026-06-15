/**
 * Synthetic operational snapshot for the cockpit (anonymised, Anhang E.6).
 *
 * Stands in for the EPIC 3/6 read APIs so the cockpit, selectors and tests have
 * one deterministic dataset. All values are made up; nothing here is production
 * data. Replace `loadMockDataset()` with @paket/api-client calls once the
 * backend read endpoints ship.
 */
import type {
  AssignmentBundle,
  EmployeeShift,
  GoodsReceiptCase,
  KpiSnapshot,
  LocationMaster,
  ReceiptPosition,
  TransportBox,
  WorkIssue,
  WorkflowEvent,
} from '@paket/domain-types';
import type { DocumentRef, Employee, OperationsDataset, RuleConfig } from './types.js';

export const TODAY = '2026-06-15';
const TZ = '2026-06-15T';

const employees: Employee[] = [
  { id: 'emp-anna', displayName: 'Anna', workstationCode: 'T4' },
  { id: 'emp-bernd', displayName: 'Bernd', workstationCode: 'T5' },
  { id: 'emp-claudia', displayName: 'Claudia', workstationCode: 'T6' },
];

function shift(
  id: string,
  employeeId: string,
  start: string,
  end: string,
  breakMinutes: number,
  plannedHours: number,
  netCapacityMinutes: number,
  workstationId: string,
): EmployeeShift {
  return {
    id,
    employeeId,
    date: TODAY,
    plannedStart: `${TZ}${start}:00.000Z`,
    plannedEnd: `${TZ}${end}:00.000Z`,
    breakMinutes,
    plannedHours,
    netCapacityMinutes,
    workstationId,
    active: true,
  };
}

const shifts: EmployeeShift[] = [
  shift('sh-anna', 'emp-anna', '07:00', '15:30', 30, 8, 480, 'loc-t4'),
  shift('sh-bernd', 'emp-bernd', '07:00', '12:30', 30, 5, 300, 'loc-t5'),
  shift('sh-claudia', 'emp-claudia', '07:00', '14:30', 30, 7, 420, 'loc-t6'),
];

function loc(
  id: string,
  code: string,
  displayName: string,
  kind: LocationMaster['kind'],
  zone: string,
  sequenceIndex: number,
): LocationMaster {
  return { id, code, displayName, kind, zone, sequenceIndex, scanCode: code, active: true };
}

const locations: LocationMaster[] = [
  loc('loc-r7', 'R7', 'Regal 7', 'regal', 'Zone A', 7),
  loc('loc-r18', 'R18', 'Regal 18', 'regal', 'Zone A', 18),
  loc('loc-r27', 'R27', 'Regal 27', 'regal', 'Zone B', 27),
  loc('loc-pb4', 'B-4', 'Palette B/4', 'palette_b', 'Zone C', 54),
  loc('loc-hb5', 'HB-5/234', 'Hängebahn 5/234', 'haengebahn', 'Zone D', 70),
  loc('loc-d3', 'D-3', 'Lagerplatz D-3', 'lagerplatz_d', 'Zone D', 83),
  loc('loc-t4', 'T4', 'Tisch 4', 'workstation', 'Tische', 100),
  loc('loc-t5', 'T5', 'Tisch 5', 'workstation', 'Tische', 101),
  loc('loc-t6', 'T6', 'Tisch 6', 'workstation', 'Tische', 102),
  loc('loc-prn1', 'PRN-1', 'Drucker 1', 'printer', 'Tische', 110),
];

function mkCase(
  id: string,
  weBelegNo: string,
  storageCode: string,
  storageId: string,
  section: GoodsReceiptCase['section'],
  goodsTypeText: GoodsReceiptCase['goodsTypeText'] | undefined,
  priorityFlags: GoodsReceiptCase['priorityFlags'],
  totalQuantity: number,
  status: GoodsReceiptCase['status'],
  effortPoints: number,
  estimatedMinutes: number,
  assignedBundleId?: string,
  loadPlanDate?: string,
  bookingDate: string = TODAY,
): GoodsReceiptCase {
  const type: GoodsReceiptCase['storageLocation']['type'] = storageId.includes('pb')
    ? 'palette'
    : storageId.includes('hb')
      ? 'haengebahn'
      : storageId.includes('d3')
        ? 'lagerplatz_d'
        : 'regal';
  return {
    id,
    documentSetId: `ds-${id}`,
    weBelegNo,
    deliveryNoteNo: weBelegNo.replace('WE', 'LS'),
    bookingDate,
    weDate: bookingDate,
    branchNo: '001',
    primaryShopAreaNo: '21',
    primaryFloor: 'EG',
    storageLocation: { id: storageId, type, code: storageCode, active: true },
    section,
    goodsTypeText,
    priorityFlags,
    catManDate: priorityFlags.includes('catman_due') ? TODAY : undefined,
    loadPlanDate,
    totalQuantity,
    status,
    effortPoints,
    estimatedMinutes,
    assignedBundleId,
    version: 0,
  };
}

const cases: GoodsReceiptCase[] = [
  mkCase(
    'case-01',
    'WE-2026-000123',
    'R27',
    'loc-r27',
    null,
    'Prio',
    ['prio'],
    84,
    'ready',
    18.5,
    42,
  ),
  mkCase(
    'case-02',
    'WE-2026-000131',
    'R7',
    'loc-r7',
    null,
    'Prio',
    ['prio', 'same_day_required'],
    31,
    'assigned',
    9,
    26,
    'bnd-anna',
  ),
  mkCase(
    'case-03',
    'WE-2026-000140',
    'R18',
    'loc-r18',
    7,
    'NOS',
    [],
    56,
    'assigned',
    12,
    30,
    'bnd-anna',
  ),
  mkCase(
    'case-04',
    'WE-2026-000141',
    'B-4',
    'loc-pb4',
    4,
    'Nachorder',
    [],
    22,
    'picking',
    6.5,
    18,
    'bnd-bernd',
  ),
  mkCase('case-05', 'WE-2026-000142', 'D-3', 'loc-d3', 8, 'NOS-Nachorder', [], 40, 'ready', 10, 24),
  mkCase(
    'case-06',
    'WE-2026-000150',
    'HB-5/234',
    'loc-hb5',
    1,
    'Vororder',
    [],
    120,
    'ready',
    28,
    64,
    undefined,
    TODAY,
  ),
  mkCase(
    'case-07',
    'WE-2026-000151',
    'R7',
    'loc-r7',
    2,
    'Vororder',
    ['catman_due'],
    68,
    'ready',
    15,
    38,
    undefined,
    TODAY,
  ),
  mkCase(
    'case-08',
    'WE-2026-000160',
    'R18',
    'loc-r18',
    3,
    'Vororder',
    [],
    90,
    'ready',
    20,
    50,
    undefined,
    '2026-06-16',
  ),
  mkCase(
    'case-09',
    'WE-2026-000099',
    'B-4',
    'loc-pb4',
    2,
    'Sonderposten',
    ['overdue'],
    47,
    'ready',
    13,
    33,
    undefined,
    undefined,
    '2026-06-11',
  ),
  mkCase(
    'case-10',
    'WE-2026-000170',
    'D-3',
    'loc-d3',
    4,
    'Extrabestellung',
    [],
    18,
    'parked',
    5,
    14,
  ),
  mkCase(
    'case-11',
    'WE-2026-000171',
    'R27',
    'loc-r27',
    null,
    undefined,
    [],
    0,
    'needs_review',
    0,
    0,
  ),
  mkCase(
    'case-12',
    'WE-2026-000180',
    'R7',
    'loc-r7',
    7,
    'NOS',
    [],
    35,
    'issue_open',
    8,
    22,
    'bnd-claudia',
  ),
  mkCase(
    'case-13',
    'WE-2026-000080',
    'R18',
    'loc-r18',
    7,
    'NOS',
    [],
    60,
    'completed',
    14,
    36,
    'bnd-claudia',
  ),
  mkCase(
    'case-14',
    'WE-2026-000081',
    'B-4',
    'loc-pb4',
    8,
    'Nachorder',
    [],
    28,
    'zst_done',
    7,
    20,
    'bnd-anna',
  ),
];

function mkPosition(
  id: string,
  caseId: string,
  positionNo: number,
  wgr: string,
  supplierArticleNo: string,
  supplierColor: string,
  securityRequired: boolean,
  priceLabelRequired: boolean,
  onlineHandlingRequired: boolean,
): ReceiptPosition {
  return {
    id,
    caseId,
    positionNo,
    wgr,
    supplierArticleNo,
    supplierColor,
    branchNo: '001',
    shopNo: '21',
    floor: 'EG',
    onlineRelevant: onlineHandlingRequired,
    instruction: {
      priceLabelRequired,
      priceLabelAttachRequired: priceLabelRequired,
      securityRequired,
      securityLocation: securityRequired ? 'Tisch 4' : undefined,
      onlineHandlingRequired,
    },
    skuLines: [
      {
        id: `${id}-s1`,
        receiptPositionId: id,
        ean: '40090000001',
        size: '38',
        expectedQuantity: 12,
        status: 'open',
      },
      {
        id: `${id}-s2`,
        receiptPositionId: id,
        ean: '40090000002',
        size: '40',
        expectedQuantity: 8,
        confirmedQuantity: 8,
        status: 'confirmed',
      },
    ],
    status: 'open',
  };
}

const positions: ReceiptPosition[] = [
  mkPosition('pos-01a', 'case-01', 1, '0815', '6131', 'schwarz', false, true, false),
  mkPosition('pos-01b', 'case-01', 2, '0815', '6132', 'blau', true, false, true),
  mkPosition('pos-06a', 'case-06', 1, '0420', '7001', 'rot', true, true, false),
];

function bundle(
  id: string,
  employeeId: string,
  caseIds: string[],
  plannedEffortMinutes: number,
  effortPoints: number,
): AssignmentBundle {
  return {
    id,
    employeeId,
    date: TODAY,
    caseIds,
    plannedEffortMinutes,
    effortPoints,
    route: caseIds.map((cid, i) => ({
      sequence: i,
      locationId: `loc-${cid}`,
      locationCode: `R${i + 7}`,
      orderIds: [cid],
      scanRequired: true,
      skipAllowedWithReason: true,
    })),
    status: 'active',
    createdBy: 'system',
  };
}

const bundles: AssignmentBundle[] = [
  bundle('bnd-anna', 'emp-anna', ['case-02', 'case-03', 'case-14'], 76, 30.5),
  bundle('bnd-bernd', 'emp-bernd', ['case-04'], 18, 6.5),
  bundle('bnd-claudia', 'emp-claudia', ['case-12', 'case-13'], 58, 22),
];

const issues: WorkIssue[] = [
  {
    id: 'iss-01',
    caseId: 'case-12',
    scope: 'position',
    scopeId: 'pos-12a',
    employeeId: 'emp-claudia',
    issueType: 'missing_quantity',
    description: 'Fehlmenge 3 Teile in Position 2',
    reportedAt: `${TZ}09:12:00.000Z`,
    status: 'open',
  },
  {
    id: 'iss-02',
    caseId: 'case-04',
    scope: 'sku_line',
    scopeId: 'pos-04a-s1',
    employeeId: 'emp-bernd',
    issueType: 'wrong_size',
    description: 'Größe 42 statt 40 geliefert',
    reportedAt: `${TZ}08:40:00.000Z`,
    status: 'in_review',
  },
  {
    id: 'iss-03',
    caseId: 'case-12',
    scope: 'transport_box',
    employeeId: 'emp-claudia',
    issueType: 'label_problem',
    description: 'Boxetikett unleserlich',
    reportedAt: `${TZ}10:05:00.000Z`,
    status: 'open',
  },
];

const boxes: TransportBox[] = [
  {
    id: 'box-01',
    caseId: 'case-13',
    boxNo: 1,
    branchNo: '001',
    shopAreaNo: '21',
    floor: 'EG',
    goodsTypeText: 'NOS',
    positionIds: ['pos-13a'],
    quantity: 30,
    labelPrinted: true,
    sealed: true,
    completedAt: `${TZ}11:20:00.000Z`,
  },
  {
    id: 'box-02',
    caseId: 'case-13',
    boxNo: 2,
    branchNo: '001',
    shopAreaNo: '22',
    floor: 'OG',
    goodsTypeText: 'NOS',
    positionIds: ['pos-13b'],
    quantity: 30,
    labelPrinted: true,
    sealed: false,
  },
];

const documents: DocumentRef[] = [
  {
    id: 'doc-01',
    caseId: 'case-01',
    kind: 'work_instruction',
    fileName: 'AA_WE-2026-000123.pdf',
    url: '#/preview/doc-01',
  },
  {
    id: 'doc-02',
    caseId: 'case-01',
    kind: 'goods_receipt',
    fileName: 'WE-2026-000123.pdf',
    url: '#/preview/doc-02',
  },
  {
    id: 'doc-03',
    caseId: 'case-01',
    kind: 'delivery_note',
    fileName: 'LS-2026-000123.pdf',
    url: '#/preview/doc-03',
  },
];

function ev(
  id: string,
  eventType: WorkflowEvent['eventType'],
  entityId: string,
  actorType: WorkflowEvent['actorType'],
  timestamp: string,
  payload: unknown = {},
): WorkflowEvent {
  return { id, eventType, entityType: 'case', entityId, actorType, timestamp, payload };
}

const events: WorkflowEvent[] = [
  ev('evt-01', 'case.ready', 'case-01', 'system', `${TZ}07:01:00.000Z`),
  ev('evt-02', 'bundle.assigned', 'bnd-anna', 'system', `${TZ}07:05:00.000Z`),
  ev('evt-03', 'assignment.overridden', 'case-02', 'teamlead', `${TZ}07:30:00.000Z`, {
    reason: 'Kunde wartet – vorgezogen',
    newBundleId: 'bnd-anna',
  }),
  ev('evt-04', 'issue.created', 'iss-01', 'employee', `${TZ}09:12:00.000Z`),
  ev('evt-05', 'case.completed', 'case-13', 'employee', `${TZ}11:20:00.000Z`),
  ev('evt-06', 'zst.created', 'case-14', 'employee', `${TZ}11:50:00.000Z`),
];

const kpis: KpiSnapshot[] = [
  {
    granularity: 'day',
    periodStart: `${TZ}07:00:00.000Z`,
    periodEnd: `${TZ}15:30:00.000Z`,
    completedCases: 2,
    completedParts: 88,
    effortPoints: 21,
    workedMinutes: 240,
    partsPerHour: 22,
    effortPointsPerHour: 5.25,
    avgThroughputMinutes: 54,
    avgPoolAgeHours: 6.5,
    problemRate: 0.21,
    overrideRate: 0.07,
  },
];

const rules: RuleConfig = {
  priority: {
    catManWeight: 1.5,
    overdueThresholdHours: 48,
    fifoEnabled: true,
    manualPriorityWins: true,
  },
  reserve: { nextShiftCapacityPct: 15, minMinutesPerEmployee: 30 },
  bundle: { minMinutes: 45, maxMinutes: 90, maxCases: 6, maxHeavyCases: 2 },
  effort: {
    priceLabelPrintFactor: 1.2,
    securingFactor: 1.3,
    onlineFactor: 1.15,
    redPriceFactor: 1.1,
    checkShareFactor: 1.25,
    boxSplittingFactor: 1.1,
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
      weekday: 'Di',
      validFrom: '2026-01-01',
      specialDay: false,
    },
  ],
  parserTemplates: [
    {
      id: 'pt-1',
      name: 'Arbeitsanweisung Standard',
      requiredFields: ['weBelegNo', 'lagerplatz', 'menge'],
      detectionThreshold: 0.85,
      fallbackToManual: true,
    },
    {
      id: 'pt-2',
      name: 'Lieferschein',
      requiredFields: ['deliveryNoteNo', 'positionen'],
      detectionThreshold: 0.8,
      fallbackToManual: true,
    },
  ],
};

/** Returns the full synthetic snapshot. Swap for api-client calls in EPIC 3/6. */
export function loadMockDataset(): OperationsDataset {
  return {
    date: TODAY,
    employees,
    shifts,
    cases,
    positions,
    bundles,
    issues,
    boxes,
    locations,
    events,
    documents,
    kpis,
    rules,
  };
}
