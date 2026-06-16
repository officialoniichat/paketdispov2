// Prisma dev seed (§14.1). Idempotent fixture so the assignment engine has a
// realistic ready-pool + day shifts + location master to bundle. Re-running is
// safe: every row is upserted by its natural key (employeeNo, role name,
// location code, document importKey, case weBelegNo, shift [employeeId,date]).
//
// Consumers of this data:
//   - AssignmentService.recalculate (src/assignment/assignment.service.ts):
//       reads goods_receipt_cases status='ready', active shifts for the day,
//       and active locations, then produces bundles.
//   - CasesService.resolveEmployee (src/cases/cases.service.ts):
//       requires an active User whose employeeNo matches the token claim.
//
// Run from apps/backend-api so prisma.config.ts loads DATABASE_URL:
//   pnpm --filter @paket/backend-api exec prisma db seed
import { PrismaClient, type LocationKind, type PriorityFlag, type Prisma } from '@prisma/client';
import { DEFAULT_RULE_CONFIG, RULE_CONFIG_KEY } from '@paket/domain-types';

const prisma = new PrismaClient();

// Dates are YYYY-MM-DD. Seed targets "today" so the cockpit/board (which query the
// current day) always have data after a reseed — no stale fixed demo date.
const SEED_DATE = new Date().toISOString().slice(0, 10);

/** A @db.Date column wants a UTC midnight Date for the given calendar day. */
function asDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** A planned shift boundary on the seed day at the given HH:mm (UTC). */
function asTime(day: string, hhmm: string): Date {
  return new Date(`${day}T${hhmm}:00.000Z`);
}

/** Look up a previously-seeded id, failing loudly if a referenced key is missing. */
function requireId(map: Record<string, string>, key: string, kind: string): string {
  const id = map[key];
  if (id === undefined) {
    throw new Error(`[seed] missing ${kind} for key "${key}" — check seed ordering`);
  }
  return id;
}

// --- Roles (RBAC) ----------------------------------------------------------

async function seedRoles(): Promise<Record<string, string>> {
  const names = ['teamlead', 'employee'] as const;
  const ids: Record<string, string> = {};
  for (const name of names) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, description: `${name} role (dev seed)` },
    });
    ids[name] = role.id;
  }
  return ids;
}

// --- Users (match the dev tokens) ------------------------------------------

/** A shift model used Mo–Fr in an employee's weekly pattern (weekend = frei). */
interface ShiftModel {
  model: string;
  start: string;
  end: string;
  breakMinutes: number;
}

interface SeedUser {
  employeeNo: string;
  displayName: string;
  email: string;
  role: 'teamlead' | 'employee';
  /** Mitarbeiter-Einstellungen demo fields (concept employee-settings-ux). */
  bereiche?: string[];
  productivityFactor?: number;
  /** Mo–Fr shift model; capacity is derived from this (Wochenplan drives capacity). */
  pattern?: ShiftModel;
}

const FRUEH: ShiftModel = { model: 'Frühschicht', start: '06:00', end: '14:00', breakMinutes: 30 };
const SPAET: ShiftModel = { model: 'Spätschicht', start: '10:00', end: '18:00', breakMinutes: 30 };

const USERS: SeedUser[] = [
  { employeeNo: 'tl-001', displayName: 'TL Logistik', email: 'tl-001@dev.local', role: 'teamlead' },
  { employeeNo: 'ma-101', displayName: 'Anna', email: 'ma-101@dev.local', role: 'employee', bereiche: ['Hängebahn'], productivityFactor: 1.0, pattern: FRUEH },
  { employeeNo: 'ma-102', displayName: 'Bernd', email: 'ma-102@dev.local', role: 'employee', bereiche: ['Palette'], productivityFactor: 0.9, pattern: SPAET },
  { employeeNo: 'ma-103', displayName: 'Claudia', email: 'ma-103@dev.local', role: 'employee', productivityFactor: 1.0, pattern: FRUEH },
];

/** Mo–Fr working with the model, weekend frei — matches weeklyPatternSchema. */
function buildWeeklyPattern(m?: ShiftModel): Record<string, unknown> | null {
  if (!m) return null;
  const work = { working: true, shiftModel: m.model, start: m.start, end: m.end, breakMinutes: m.breakMinutes, partTimePct: 100 };
  const frei = { working: false, breakMinutes: 0, partTimePct: 100 };
  return { mon: work, tue: work, wed: work, thu: work, fri: work, sat: frei, sun: frei };
}

async function seedUsers(roleIds: Record<string, string>): Promise<Record<string, string>> {
  const idByEmployeeNo: Record<string, string> = {};
  for (const u of USERS) {
    const weeklyPattern = buildWeeklyPattern(u.pattern);
    const profile = {
      bereiche: u.bereiche ?? [],
      productivityFactor: u.productivityFactor ?? 1,
      ...(weeklyPattern ? { weeklyPattern } : {}),
    };
    const user = await prisma.user.upsert({
      where: { employeeNo: u.employeeNo },
      update: { displayName: u.displayName, email: u.email, active: true, ...profile },
      create: {
        employeeNo: u.employeeNo,
        displayName: u.displayName,
        email: u.email,
        active: true,
        ...profile,
      },
    });
    idByEmployeeNo[u.employeeNo] = user.id;
    // Link role idempotently (composite PK [userId, roleId]).
    const roleId = requireId(roleIds, u.role, 'role');
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId } },
      update: {},
      create: { userId: user.id, roleId },
    });
  }
  return idByEmployeeNo;
}

// --- Shifts (materialized from each employee's weekly pattern on the seed day) ---

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

async function seedShifts(userIds: Record<string, string>): Promise<void> {
  const date = asDate(SEED_DATE);
  for (const u of USERS) {
    if (!u.pattern) continue;
    const employeeId = requireId(userIds, u.employeeNo, 'user');
    const prod = u.productivityFactor ?? 1;
    const windowMin = minutes(u.pattern.end) - minutes(u.pattern.start);
    const net = Math.round((windowMin - u.pattern.breakMinutes) * prod);
    const shiftData = {
      plannedStart: asTime(SEED_DATE, u.pattern.start),
      plannedEnd: asTime(SEED_DATE, u.pattern.end),
      breakMinutes: u.pattern.breakMinutes,
      plannedHours: round2(windowMin / 60),
      netCapacityMinutes: net,
      active: true,
      source: 'pattern' as const,
      productivityFactor: prod,
    };
    await prisma.shift.upsert({
      where: { shift_employee_date: { employeeId, date } },
      update: shiftData,
      create: { employeeId, date, ...shiftData },
    });
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// --- Locations (storage master referenced by cases) ------------------------

interface SeedLocation {
  code: string;
  displayName: string;
  kind: LocationKind;
  zone: string;
  sequenceIndex: number;
  /** Bereich/Skill label (matches the admin catalog) for engine routing. */
  bereich: string;
}

const LOCATIONS: SeedLocation[] = [
  { code: 'R7', displayName: 'Regal 7', kind: 'regal', zone: 'Zone A', sequenceIndex: 7, bereich: 'Regal' },
  { code: 'R18', displayName: 'Regal 18', kind: 'regal', zone: 'Zone A', sequenceIndex: 18, bereich: 'Regal' },
  { code: 'R27', displayName: 'Regal 27', kind: 'regal', zone: 'Zone B', sequenceIndex: 27, bereich: 'Regal' },
  { code: 'B-4', displayName: 'Palette B/4', kind: 'palette_b', zone: 'Zone C', sequenceIndex: 54, bereich: 'Palette' },
  { code: 'HB-5/234', displayName: 'Haengebahn 5/234', kind: 'haengebahn', zone: 'Zone D', sequenceIndex: 70, bereich: 'Hängebahn' },
  { code: 'D-3', displayName: 'Lagerplatz D-3', kind: 'lagerplatz_d', zone: 'Zone D', sequenceIndex: 83, bereich: 'Regal' },
];

async function seedLocations(): Promise<Record<string, string>> {
  const idByCode: Record<string, string> = {};
  for (const l of LOCATIONS) {
    const loc = await prisma.location.upsert({
      where: { code: l.code },
      update: { displayName: l.displayName, kind: l.kind, zone: l.zone, bereich: l.bereich, sequenceIndex: l.sequenceIndex, scanCode: l.code, active: true },
      create: { code: l.code, displayName: l.displayName, kind: l.kind, zone: l.zone, bereich: l.bereich, sequenceIndex: l.sequenceIndex, scanCode: l.code, active: true },
    });
    idByCode[l.code] = loc.id;
  }
  return idByCode;
}

// --- Goods receipt cases (the ready pool the engine bundles) ---------------

interface SeedCase {
  weBelegNo: string;
  storageCode: string;
  section: number | null;
  goodsTypeText:
    | 'Vororder'
    | 'Nachorder'
    | 'Sonderposten'
    | 'NOS'
    | 'NOOS'
    | 'Extrabestellung'
    | 'NOS_Nachorder'
    | 'Prio'
    | null;
  priorityFlags: PriorityFlag[];
  totalQuantity: number;
  effortPoints: number;
  estimatedMinutes: number;
  bookingDate: string;
}

// 14 ready cases spread across the storage master. Effort sums to ~330 min,
// comfortably below the ~1200 min net capacity even after the iron reserve,
// so the engine forms multiple bundles across the three shifts. A mix of
// prio/overdue/catman_due exercises the priority + reserve-override paths.
const CASES: SeedCase[] = [
  { weBelegNo: 'WE-2026-000123', storageCode: 'R27', section: null, goodsTypeText: 'Prio', priorityFlags: ['prio'], totalQuantity: 84, effortPoints: 18.5, estimatedMinutes: 42, bookingDate: '2026-06-15' },
  { weBelegNo: 'WE-2026-000124', storageCode: 'R7', section: null, goodsTypeText: 'Prio', priorityFlags: ['prio'], totalQuantity: 31, effortPoints: 9, estimatedMinutes: 26, bookingDate: '2026-06-15' },
  { weBelegNo: 'WE-2026-000125', storageCode: 'R18', section: 7, goodsTypeText: 'NOS', priorityFlags: ['overdue'], totalQuantity: 56, effortPoints: 12, estimatedMinutes: 30, bookingDate: '2026-06-12' },
  { weBelegNo: 'WE-2026-000126', storageCode: 'B-4', section: 4, goodsTypeText: 'Nachorder', priorityFlags: ['catman_due'], totalQuantity: 22, effortPoints: 6.5, estimatedMinutes: 18, bookingDate: '2026-06-14' },
  { weBelegNo: 'WE-2026-000127', storageCode: 'D-3', section: 8, goodsTypeText: 'NOS_Nachorder', priorityFlags: [], totalQuantity: 40, effortPoints: 10, estimatedMinutes: 24, bookingDate: '2026-06-15' },
  { weBelegNo: 'WE-2026-000128', storageCode: 'HB-5/234', section: 1, goodsTypeText: 'Vororder', priorityFlags: [], totalQuantity: 64, effortPoints: 14, estimatedMinutes: 28, bookingDate: '2026-06-15' },
  { weBelegNo: 'WE-2026-000129', storageCode: 'R7', section: 2, goodsTypeText: 'NOS', priorityFlags: [], totalQuantity: 18, effortPoints: 5, estimatedMinutes: 14, bookingDate: '2026-06-15' },
  { weBelegNo: 'WE-2026-000130', storageCode: 'R18', section: 3, goodsTypeText: 'Sonderposten', priorityFlags: [], totalQuantity: 27, effortPoints: 7, estimatedMinutes: 16, bookingDate: '2026-06-13' },
  { weBelegNo: 'WE-2026-000131', storageCode: 'R27', section: 7, goodsTypeText: 'Nachorder', priorityFlags: [], totalQuantity: 35, effortPoints: 8, estimatedMinutes: 20, bookingDate: '2026-06-15' },
  { weBelegNo: 'WE-2026-000132', storageCode: 'B-4', section: 8, goodsTypeText: 'NOS', priorityFlags: [], totalQuantity: 12, effortPoints: 4, estimatedMinutes: 12, bookingDate: '2026-06-15' },
  { weBelegNo: 'WE-2026-000133', storageCode: 'D-3', section: 4, goodsTypeText: 'Extrabestellung', priorityFlags: [], totalQuantity: 48, effortPoints: 11, estimatedMinutes: 26, bookingDate: '2026-06-15' },
  { weBelegNo: 'WE-2026-000134', storageCode: 'HB-5/234', section: 1, goodsTypeText: 'Vororder', priorityFlags: [], totalQuantity: 73, effortPoints: 15, estimatedMinutes: 32, bookingDate: '2026-06-15' },
  { weBelegNo: 'WE-2026-000135', storageCode: 'R7', section: 2, goodsTypeText: 'NOOS', priorityFlags: [], totalQuantity: 21, effortPoints: 6, estimatedMinutes: 15, bookingDate: '2026-06-15' },
  { weBelegNo: 'WE-2026-000136', storageCode: 'R18', section: 3, goodsTypeText: 'Nachorder', priorityFlags: [], totalQuantity: 29, effortPoints: 7.5, estimatedMinutes: 19, bookingDate: '2026-06-14' },
];

async function seedCases(locationIds: Record<string, string>): Promise<void> {
  for (const c of CASES) {
    // One DocumentSet per case, keyed by a stable importKey for idempotency.
    const importKey = `dev-seed:${c.weBelegNo}`;
    const documentSet = await prisma.documentSet.upsert({
      where: { importKey },
      update: { bookingDate: asDate(c.bookingDate) },
      create: {
        importKey,
        source: 'erp_export',
        bookingDate: asDate(c.bookingDate),
        weBelegNo: c.weBelegNo,
        parseConfidence: 1,
        status: 'parsed',
      },
    });

    const storageLocationId = requireId(locationIds, c.storageCode, 'location');
    const caseData = {
      documentSetId: documentSet.id,
      deliveryNoteNo: c.weBelegNo.replace('WE', 'LS'),
      bookingDate: asDate(c.bookingDate),
      weDate: asDate(c.bookingDate),
      branchNo: '001',
      primaryShopAreaNo: '21',
      primaryFloor: 'EG',
      storageLocationId,
      section: c.section,
      goodsTypeText: c.goodsTypeText,
      priorityFlags: c.priorityFlags,
      catManDate: c.priorityFlags.includes('catman_due') ? asDate(SEED_DATE) : null,
      totalQuantity: c.totalQuantity,
      status: 'ready' as const,
      effortPoints: c.effortPoints,
      estimatedMinutes: c.estimatedMinutes,
    };

    await prisma.goodsReceiptCase.upsert({
      where: { weBelegNo: c.weBelegNo },
      // Re-runs reset the case back into the ready pool (clears any prior bundle
      // link from a previous recalculate) so the seed stays deterministic.
      update: { ...caseData, assignedBundleId: null },
      create: { weBelegNo: c.weBelegNo, ...caseData },
    });
  }
}

// --- Case details (header + positions + box targets for the PWA aggregate) -
// The /api/me/cases/:id/aggregate endpoint (§14.2) needs a non-empty aggregate,
// and a FULL ZST-Teilabschluss requires every box verplombt / position confirmed,
// which is impossible with zero boxes/positions. So EVERY ready case gets a
// work-instruction header, 1-2 receipt positions and 1-2 transport boxes whose
// planned quantities sum to the case totalQuantity (so the full-ZST gate can be
// satisfied in the UI). Idempotent via natural keys: WorkInstructionHeader
// (PK caseId), ReceiptPosition (@@unique [caseId, positionNo]), TransportBox
// (@@unique [caseId, boxNo]).

/** Split a total into 1-2 positive box quantities (deterministic from total). */
function splitQuantity(total: number): number[] {
  if (total <= 1) return [Math.max(total, 1)];
  const first = Math.ceil(total / 2);
  return [first, total - first];
}

async function seedCaseDetails(): Promise<void> {
  // Cover every case that benefits from a detail aggregate: the ready pool (so any
  // engine-assigned case is completable in the PWA) AND the terminal/issue
  // lifecycle cases (so their Belegdetail Positionen/Boxen tabs are populated, not
  // empty). Cancelled cases get no detail — there is nothing to show.
  const cases = await prisma.goodsReceiptCase.findMany({
    where: {
      status: { in: ['ready', 'completed', 'partially_completed', 'zst_done', 'issue_open'] },
    },
  });

  for (const c of cases) {
    await prisma.workInstructionHeader.upsert({
      where: { caseId: c.id },
      update: {
        priceLabelPrintRequired: true,
        goodsReceiptCheckMode: 'percentage_check',
        goodsReceiptCheckPercentage: 20,
        boxLabelRequired: true,
        zstRequired: true,
      },
      create: {
        caseId: c.id,
        priceLabelPrintRequired: true,
        goodsReceiptCheckMode: 'percentage_check',
        goodsReceiptCheckPercentage: 20,
        boxLabelRequired: true,
        zstRequired: true,
      },
    });

    // 1-2 positions; larger cases get a second position to exercise multi-pos UI.
    const positions = [
      { positionNo: 1, wgr: '4711', supplierArticleNo: 'ART-001', supplierColor: 'schwarz' },
    ];
    if (c.totalQuantity >= 24) {
      positions.push({ positionNo: 2, wgr: '4712', supplierArticleNo: 'ART-002', supplierColor: 'blau' });
    }
    for (const p of positions) {
      const position = await prisma.receiptPosition.upsert({
        where: { position_case_no: { caseId: c.id, positionNo: p.positionNo } },
        update: { wgr: p.wgr, supplierArticleNo: p.supplierArticleNo, supplierColor: p.supplierColor },
        create: {
          caseId: c.id,
          positionNo: p.positionNo,
          wgr: p.wgr,
          supplierArticleNo: p.supplierArticleNo,
          supplierColor: p.supplierColor,
          branchNo: '001',
          shopNo: '21',
        },
      });

      // Two EAN/size lines per position so the Belegdetail "Positionen" SKU table
      // (EAN · Größe · Soll · Ist · Status) is populated. Soll splits the case's
      // quantity across the lines; Ist stays open (null) until confirmed.
      const skuQuantities = splitQuantity(Math.max(2, Math.round(c.totalQuantity / positions.length)));
      const sizes = ['38', '40'];
      for (const [skuIndex, expectedQuantity] of skuQuantities.entries()) {
        const size = sizes[skuIndex] ?? String(40 + skuIndex * 2);
        const ean = `40123${p.positionNo}${skuIndex}${c.weBelegNo.slice(-5)}`;
        await prisma.receiptSkuLine.upsert({
          where: { sku_position_ean_size: { receiptPositionId: position.id, ean, size } },
          update: { expectedQuantity },
          create: { receiptPositionId: position.id, ean, size, expectedQuantity },
        });
      }
    }

    // 1-2 boxes whose planned quantities sum to totalQuantity (full-ZST gate).
    const boxQuantities = splitQuantity(c.totalQuantity);
    for (const [index, plannedQuantity] of boxQuantities.entries()) {
      const boxNo = index + 1;
      await prisma.transportBox.upsert({
        where: { box_case_no: { caseId: c.id, boxNo } },
        update: { plannedQuantity, branchNo: '001', shopAreaNo: '21' },
        create: {
          caseId: c.id,
          boxNo,
          branchNo: '001',
          shopAreaNo: '21',
          plannedQuantity,
        },
      });
    }
  }
}

// --- Lifecycle cases (populate the Belege scopes Abgeschlossen / Archiv) ----
// The 14 ready cases above feed the engine. These extra cases sit in terminal /
// completion / issue states so the §10.4 Belege view's scope switcher (Aktiv /
// Abgeschlossen heute / Archiv) and the Problemfälle lane are non-empty in dev.
// They are NOT status='ready', so the assignment engine ignores them.
// See docs/concept/beleg-lifecycle-completion-concept.md.

type LifecycleStatus = 'completed' | 'partially_completed' | 'zst_done' | 'cancelled' | 'issue_open';

interface SeedLifecycleCase {
  weBelegNo: string;
  storageCode: string;
  section: number | null;
  goodsTypeText: 'Vororder' | 'Nachorder' | 'NOS' | 'Sonderposten' | 'Prio';
  totalQuantity: number;
  effortPoints: number;
  estimatedMinutes: number;
  status: LifecycleStatus;
  employeeNo: 'ma-101' | 'ma-102' | 'ma-103';
  /** Confirmed quantity booked into a ZstRecord (omit for cancelled/issue_open). */
  completedQuantity?: number;
  /** HH:mm the ZST/abschluss happened (UTC, on the seed day). */
  completedAt?: string;
  /** Set for zst_done: the day the ZST batch was exported to the legacy system. */
  exportedAt?: string;
  /** issue_open only: the open problem reported against the case. */
  issue?: { issueType: 'wrong_color' | 'damaged_goods' | 'missing_quantity'; description: string };
}

const LIFECYCLE_CASES: SeedLifecycleCase[] = [
  {
    weBelegNo: 'WE-2026-000201', storageCode: 'R7', section: 2, goodsTypeText: 'Vororder',
    totalQuantity: 60, effortPoints: 14, estimatedMinutes: 28, status: 'completed',
    employeeNo: 'ma-101', completedQuantity: 60, completedAt: '14:32',
  },
  {
    weBelegNo: 'WE-2026-000202', storageCode: 'R18', section: 3, goodsTypeText: 'Nachorder',
    totalQuantity: 100, effortPoints: 20, estimatedMinutes: 40, status: 'partially_completed',
    employeeNo: 'ma-102', completedQuantity: 40, completedAt: '14:05',
  },
  {
    weBelegNo: 'WE-2026-000203', storageCode: 'R27', section: 7, goodsTypeText: 'NOS',
    totalQuantity: 45, effortPoints: 11, estimatedMinutes: 22, status: 'zst_done',
    employeeNo: 'ma-101', completedQuantity: 45, completedAt: '13:40', exportedAt: '17:00',
  },
  {
    weBelegNo: 'WE-2026-000204', storageCode: 'B-4', section: 4, goodsTypeText: 'Sonderposten',
    totalQuantity: 18, effortPoints: 5, estimatedMinutes: 12, status: 'cancelled',
    employeeNo: 'ma-103',
  },
  {
    weBelegNo: 'WE-2026-000205', storageCode: 'D-3', section: 8, goodsTypeText: 'Prio',
    totalQuantity: 33, effortPoints: 8, estimatedMinutes: 20, status: 'issue_open',
    employeeNo: 'ma-103',
    issue: { issueType: 'wrong_color', description: 'Farbe weicht von Arbeitsanweisung ab' },
  },
];

async function seedLifecycleCases(
  locationIds: Record<string, string>,
  userIds: Record<string, string>,
): Promise<void> {
  for (const c of LIFECYCLE_CASES) {
    const importKey = `dev-seed:${c.weBelegNo}`;
    const documentSet = await prisma.documentSet.upsert({
      where: { importKey },
      update: { bookingDate: asDate(SEED_DATE) },
      create: {
        importKey,
        source: 'erp_export',
        bookingDate: asDate(SEED_DATE),
        weBelegNo: c.weBelegNo,
        parseConfidence: 1,
        status: 'parsed',
      },
    });

    const storageLocationId = requireId(locationIds, c.storageCode, 'location');
    const employeeId = requireId(userIds, c.employeeNo, 'user');
    const caseData = {
      documentSetId: documentSet.id,
      deliveryNoteNo: c.weBelegNo.replace('WE', 'LS'),
      bookingDate: asDate(SEED_DATE),
      weDate: asDate(SEED_DATE),
      branchNo: '001',
      primaryShopAreaNo: '21',
      primaryFloor: 'EG',
      storageLocationId,
      section: c.section,
      goodsTypeText: c.goodsTypeText,
      priorityFlags: [],
      catManDate: null,
      totalQuantity: c.totalQuantity,
      status: c.status,
      effortPoints: c.effortPoints,
      estimatedMinutes: c.estimatedMinutes,
    };
    const gcase = await prisma.goodsReceiptCase.upsert({
      where: { weBelegNo: c.weBelegNo },
      update: { ...caseData, assignedBundleId: null },
      create: { weBelegNo: c.weBelegNo, ...caseData },
    });

    // ZST record for the completion-bearing states (drives the §15 KPI tile +
    // future Tagesjournal). exportedAt is set only once the case reached zst_done.
    if (c.completedQuantity !== undefined && c.completedAt) {
      await prisma.zstRecord.upsert({
        where: { idempotencyKey: `seed-zst:${c.weBelegNo}` },
        update: {
          completedQuantity: c.completedQuantity,
          effortPoints: c.effortPoints,
          completedAt: asTime(SEED_DATE, c.completedAt),
          exportedAt: c.exportedAt ? asTime(SEED_DATE, c.exportedAt) : null,
        },
        create: {
          idempotencyKey: `seed-zst:${c.weBelegNo}`,
          caseId: gcase.id,
          employeeId,
          completedQuantity: c.completedQuantity,
          effortPoints: c.effortPoints,
          startedAt: asTime(SEED_DATE, '11:00'),
          completedAt: asTime(SEED_DATE, c.completedAt),
          source: 'mobile_app',
          exportedAt: c.exportedAt ? asTime(SEED_DATE, c.exportedAt) : null,
        },
      });
    }

    // Open problem for the issue_open case (Problemfälle lane). Idempotent: only
    // create when this case has no open issue yet.
    if (c.issue) {
      const existing = await prisma.issue.findFirst({
        where: { caseId: gcase.id, status: 'open' },
      });
      if (!existing) {
        await prisma.issue.create({
          data: {
            caseId: gcase.id,
            scope: 'case',
            employeeId,
            issueType: c.issue.issueType,
            description: c.issue.description,
            status: 'open',
          },
        });
      }
    }
  }
}

// --- App config (§11 structured rule config singleton) ---------------------
// Idempotent: only writes the default when no row exists yet, so re-running the
// seed never clobbers a rule config a teamlead/admin has since edited via the API.

async function seedRuleConfig(): Promise<void> {
  const existing = await prisma.appConfig.findUnique({ where: { key: RULE_CONFIG_KEY } });
  if (existing) return;
  await prisma.appConfig.create({
    data: {
      key: RULE_CONFIG_KEY,
      value: DEFAULT_RULE_CONFIG as unknown as Prisma.InputJsonValue,
    },
  });
}

async function main(): Promise<void> {
  const roleIds = await seedRoles();
  const userIds = await seedUsers(roleIds);
  await seedShifts(userIds);
  const locationIds = await seedLocations();
  await seedCases(locationIds);
  await seedLifecycleCases(locationIds, userIds);
  // After both case sets exist, attach detail (positions/boxes/SKU) to every case
  // that should show it — ready pool + lifecycle cases.
  await seedCaseDetails();
  await seedRuleConfig();

  const [users, shifts, locations, readyCases, positions, boxes, lifecycleCases, zstRecords] =
    await Promise.all([
      prisma.user.count(),
      prisma.shift.count({ where: { date: asDate(SEED_DATE), active: true } }),
      prisma.location.count({ where: { active: true } }),
      prisma.goodsReceiptCase.count({ where: { status: 'ready' } }),
      prisma.receiptPosition.count(),
      prisma.transportBox.count(),
      prisma.goodsReceiptCase.count({
        where: { status: { in: ['completed', 'partially_completed', 'zst_done', 'cancelled', 'issue_open'] } },
      }),
      prisma.zstRecord.count(),
    ]);
  // eslint-disable-next-line no-console
  console.log(
    `[seed] users=${users} shifts(${SEED_DATE})=${shifts} activeLocations=${locations} readyCases=${readyCases} positions=${positions} boxes=${boxes} lifecycleCases=${lifecycleCases} zstRecords=${zstRecords}`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error('[seed] failed', err);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
