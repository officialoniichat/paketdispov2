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
import { PrismaClient, type LocationKind, type PriorityFlag } from '@prisma/client';

const prisma = new PrismaClient();

// Dates are YYYY-MM-DD. The day the engine + dev tokens target.
const SEED_DATE = '2026-06-15';

/** A @db.Date column wants a UTC midnight Date for the given calendar day. */
function asDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** A planned shift boundary on the seed day at the given HH:mm (UTC). */
function asTime(day: string, hhmm: string): Date {
  return new Date(`${day}T${hhmm}:00.000Z`);
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

interface SeedUser {
  employeeNo: string;
  displayName: string;
  email: string;
  role: 'teamlead' | 'employee';
}

const USERS: SeedUser[] = [
  { employeeNo: 'tl-001', displayName: 'TL Logistik', email: 'tl-001@dev.local', role: 'teamlead' },
  { employeeNo: 'ma-101', displayName: 'Anna', email: 'ma-101@dev.local', role: 'employee' },
  { employeeNo: 'ma-102', displayName: 'Bernd', email: 'ma-102@dev.local', role: 'employee' },
  { employeeNo: 'ma-103', displayName: 'Claudia', email: 'ma-103@dev.local', role: 'employee' },
];

async function seedUsers(roleIds: Record<string, string>): Promise<Record<string, string>> {
  const idByEmployeeNo: Record<string, string> = {};
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { employeeNo: u.employeeNo },
      update: { displayName: u.displayName, email: u.email, active: true },
      create: { employeeNo: u.employeeNo, displayName: u.displayName, email: u.email, active: true },
    });
    idByEmployeeNo[u.employeeNo] = user.id;
    // Link role idempotently (composite PK [userId, roleId]).
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: roleIds[u.role]! } },
      update: {},
      create: { userId: user.id, roleId: roleIds[u.role]! },
    });
  }
  return idByEmployeeNo;
}

// --- Shifts (three active employees on the seed day) -----------------------

interface SeedShift {
  employeeNo: string;
  start: string;
  end: string;
  breakMinutes: number;
  plannedHours: number;
  netCapacityMinutes: number;
}

const SHIFTS: SeedShift[] = [
  { employeeNo: 'ma-101', start: '07:00', end: '15:30', breakMinutes: 30, plannedHours: 8, netCapacityMinutes: 480 },
  { employeeNo: 'ma-102', start: '07:00', end: '12:30', breakMinutes: 30, plannedHours: 5, netCapacityMinutes: 300 },
  { employeeNo: 'ma-103', start: '07:00', end: '14:30', breakMinutes: 30, plannedHours: 7, netCapacityMinutes: 420 },
];

async function seedShifts(userIds: Record<string, string>): Promise<void> {
  const date = asDate(SEED_DATE);
  for (const s of SHIFTS) {
    const employeeId = userIds[s.employeeNo]!;
    await prisma.shift.upsert({
      where: { shift_employee_date: { employeeId, date } },
      update: {
        plannedStart: asTime(SEED_DATE, s.start),
        plannedEnd: asTime(SEED_DATE, s.end),
        breakMinutes: s.breakMinutes,
        plannedHours: s.plannedHours,
        netCapacityMinutes: s.netCapacityMinutes,
        active: true,
      },
      create: {
        employeeId,
        date,
        plannedStart: asTime(SEED_DATE, s.start),
        plannedEnd: asTime(SEED_DATE, s.end),
        breakMinutes: s.breakMinutes,
        plannedHours: s.plannedHours,
        netCapacityMinutes: s.netCapacityMinutes,
        active: true,
      },
    });
  }
}

// --- Locations (storage master referenced by cases) ------------------------

interface SeedLocation {
  code: string;
  displayName: string;
  kind: LocationKind;
  zone: string;
  sequenceIndex: number;
}

const LOCATIONS: SeedLocation[] = [
  { code: 'R7', displayName: 'Regal 7', kind: 'regal', zone: 'Zone A', sequenceIndex: 7 },
  { code: 'R18', displayName: 'Regal 18', kind: 'regal', zone: 'Zone A', sequenceIndex: 18 },
  { code: 'R27', displayName: 'Regal 27', kind: 'regal', zone: 'Zone B', sequenceIndex: 27 },
  { code: 'B-4', displayName: 'Palette B/4', kind: 'palette_b', zone: 'Zone C', sequenceIndex: 54 },
  { code: 'HB-5/234', displayName: 'Haengebahn 5/234', kind: 'haengebahn', zone: 'Zone D', sequenceIndex: 70 },
  { code: 'D-3', displayName: 'Lagerplatz D-3', kind: 'lagerplatz_d', zone: 'Zone D', sequenceIndex: 83 },
];

async function seedLocations(): Promise<Record<string, string>> {
  const idByCode: Record<string, string> = {};
  for (const l of LOCATIONS) {
    const loc = await prisma.location.upsert({
      where: { code: l.code },
      update: { displayName: l.displayName, kind: l.kind, zone: l.zone, sequenceIndex: l.sequenceIndex, scanCode: l.code, active: true },
      create: { code: l.code, displayName: l.displayName, kind: l.kind, zone: l.zone, sequenceIndex: l.sequenceIndex, scanCode: l.code, active: true },
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

    const storageLocationId = locationIds[c.storageCode]!;
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

async function main(): Promise<void> {
  const roleIds = await seedRoles();
  const userIds = await seedUsers(roleIds);
  await seedShifts(userIds);
  const locationIds = await seedLocations();
  await seedCases(locationIds);

  const [users, shifts, locations, readyCases] = await Promise.all([
    prisma.user.count(),
    prisma.shift.count({ where: { date: asDate(SEED_DATE), active: true } }),
    prisma.location.count({ where: { active: true } }),
    prisma.goodsReceiptCase.count({ where: { status: 'ready' } }),
  ]);
  // eslint-disable-next-line no-console
  console.log(
    `[seed] users=${users} shifts(${SEED_DATE})=${shifts} activeLocations=${locations} readyCases=${readyCases}`,
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
