// Prisma dev seed (§14.1). Idempotent fixture so the assignment engine has a
// REALISTIC ready-pool + day shifts + location master to bundle. Re-running is
// safe: every row is upserted by its natural key (employeeNo, role name,
// location code, case weBelegNo, shift [employeeId,date]).
//
// The ready-pool volume is generated from the customer's real historical profile
// (docs/data/belege-history-per-day.csv): a typical day ≈ 171 Belege, a peak day
// ≈ 315. Pick the scenario with SEED_SCENARIO=typical|peak (default typical). The
// generator (prisma/seed-data.ts) is fully deterministic — a reseed reproduces the
// exact same pool.
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
//   SEED_SCENARIO=peak pnpm --filter @paket/backend-api exec prisma db seed
import { PrismaClient, type PriorityFlag, type Prisma } from '@prisma/client';
import {
  DEFAULT_INSPECTION_LEVELS,
  DEFAULT_RULE_CONFIG,
  DEFAULT_WGR_CATALOG,
  RULE_CONFIG_KEY,
} from '@paket/domain-types';
import { generateBelege } from '../src/prohandel/beleg-generator.js';
import { persistGeneratedBeleg } from '../src/prohandel/beleg-persist.js';
import {
  LOCATIONS,
  SCENARIO_TARGET,
  USERS,
  generateReadyCases,
  resolveScenario,
  type GeneratedCase,
  type ShiftModel,
} from './seed-data.js';

const prisma = new PrismaClient();

const SCENARIO = resolveScenario(process.env.SEED_SCENARIO);

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

/** SEED_DATE shifted by `offset` calendar days, as a @db.Date UTC midnight. */
function offsetDate(offset: number): Date {
  const d = asDate(SEED_DATE);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
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

// --- Deterministic reset of the case graph --------------------------------
// The ready pool is GENERATED, so its shape (count, weBelegNo set) changes when
// the scenario or generator changes. To stay deterministic — exactly N ready
// cases per scenario, no orphans from a previous seed shape — wipe the seed-owned
// transactional graph up front, then rebuild. Master data the seed only upserts
// (roles, users, locations, rule config) is left intact. ZstRecord has no cascade
// on case and a case points at its bundle, so the order below clears those refs
// before deleting the cases (whose other dependents cascade).

async function resetCaseGraph(): Promise<void> {
  await prisma.zstRecord.deleteMany({});
  await prisma.assignmentItem.deleteMany({});
  await prisma.goodsReceiptCase.updateMany({ data: { assignedBundleId: null } });
  await prisma.assignmentBundle.deleteMany({});
  // Cascades remove workInstruction, positions (+ sku lines), transport boxes and
  // issues for each removed case.
  await prisma.goodsReceiptCase.deleteMany({});
}

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

// The team itself (identities, Bereiche, skill tiers, workstation assignments,
// shift patterns) lives in prisma/seed-data.ts (USERS) so scenarios and team
// stay in one deterministic place.

// --- Workstations (Tische, A10) ---------------------------------------------

const WORKSTATIONS = [
  { code: 'T1', name: 'Tisch 1' },
  { code: 'T2', name: 'Tisch 2' },
  { code: 'T3', name: 'Tisch 3' },
  { code: 'T4', name: 'Tisch 4' },
  { code: 'T5', name: 'Tisch 5' },
  { code: 'T6', name: 'Tisch 6' },
  { code: 'T7', name: 'Tisch 7' },
  { code: 'T8', name: 'Tisch 8' },
];

async function seedWorkstations(): Promise<Record<string, string>> {
  const idByCode: Record<string, string> = {};
  for (const w of WORKSTATIONS) {
    const ws = await prisma.workstation.upsert({
      where: { code: w.code },
      update: { name: w.name, active: true },
      create: { code: w.code, name: w.name, active: true },
    });
    idByCode[w.code] = ws.id;
  }
  return idByCode;
}

/** Mo–Fr working with the model, weekend frei — matches weeklyPatternSchema. */
function buildWeeklyPattern(m?: ShiftModel): Record<string, unknown> | null {
  if (!m) return null;
  const work = { working: true, shiftModel: m.model, start: m.start, end: m.end, breakMinutes: m.breakMinutes, partTimePct: 100 };
  const frei = { working: false, breakMinutes: 0, partTimePct: 100 };
  return { mon: work, tue: work, wed: work, thu: work, fri: work, sat: frei, sun: frei };
}

async function seedUsers(
  roleIds: Record<string, string>,
  workstationIds: Record<string, string>,
): Promise<Record<string, string>> {
  const idByEmployeeNo: Record<string, string> = {};
  for (const u of USERS) {
    const weeklyPattern = buildWeeklyPattern(u.pattern);
    const profile = {
      measured: u.measured ?? true,
      bereiche: u.bereiche ?? [],
      productivityFactor: u.productivityFactor ?? 1,
      skillTier: u.skillTier ?? ('profi' as const),
      workstationId: u.workstationCode ? requireId(workstationIds, u.workstationCode, 'workstation') : null,
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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
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

// --- Locations (storage master referenced by cases) ------------------------
// A Lagerplatz's Bereich is derived from its `kind` (regal/lagerplatz_d → Regal,
// palette_* → Palette, haengebahn → Hängebahn), so it is not stored per location.

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
  // Deactivate any location left over from a previous seed shape so the storage
  // master matches the current set exactly (no legacy ghost Lagerplätze).
  await prisma.location.updateMany({
    where: { code: { notIn: LOCATIONS.map((l) => l.code) } },
    data: { active: false },
  });
  return idByCode;
}

// --- Goods receipt cases (the ready pool the engine bundles) ---------------
// Generated from the real historical volume profile for the chosen scenario.
// Cases arrive in delivery runs (shared deliveryNoteNo + consecutive weBelegNo)
// so the Pkt.1 delivery-grouping fires and the board shows "Lieferung ×n" clusters.

async function seedCases(locationIds: Record<string, string>, cases: GeneratedCase[]): Promise<void> {
  for (const c of cases) {
    const storageLocationId = requireId(locationIds, c.storageCode, 'location');
    const bookingDate = offsetDate(-c.bookingOffsetDays);
    const caseData = {
      source: 'prohandel_api' as const,
      externalRef: `dev-seed:${c.weBelegNo}`,
      deliveryNoteNo: c.deliveryNoteNo,
      bookingDate,
      weDate: bookingDate,
      branchNo: c.branchNo,
      primaryShopAreaNo: c.shopAreaNo,
      primaryShopNo: c.shopAreaNo,
      primaryFloor: c.floor,
      storageLocationId,
      section: c.section,
      goodsTypeText: c.goodsTypeText,
      priorityFlags: c.priorityFlags,
      catManDate: c.catManDue ? asDate(SEED_DATE) : null,
      loadPlanDate: c.loadPlanOffsetDays === null ? null : offsetDate(c.loadPlanOffsetDays),
      totalQuantity: c.totalQuantity,
      // A6: Kartonanzahl der Anlieferung (~25 Teile je Karton).
      inboundCartonCount: Math.max(1, Math.ceil(c.totalQuantity / 25)),
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
// which is impossible with zero boxes/positions. So EVERY case gets a work-
// instruction header, 1+ receipt positions and 1+ transport boxes whose planned
// quantities sum to totalQuantity. Idempotent via natural keys: WorkInstructionHeader
// (PK caseId), ReceiptPosition (@@unique [caseId, positionNo]), TransportBox
// (@@unique [caseId, boxNo]). Detail params (check mode, position count) come from
// the generated case spec; lifecycle cases without a spec fall back to defaults.

/** Split a total into 1-2 positive box quantities (deterministic from total). */
function splitQuantity(total: number): number[] {
  if (total <= 1) return [Math.max(total, 1)];
  const first = Math.ceil(total / 2);
  return [first, total - first];
}

/** Beleg-Kopf-Warenart → Boxzettel-Warenart (Box trägt die Warenart ihres Belegs). */
function boxGoodsTypeFromCase(
  text: import('@prisma/client').GoodsTypeText | null,
): import('@prisma/client').BoxGoodsType | null {
  switch (text) {
    case 'Vororder': return 'vororder';
    case 'Nachorder': return 'nachorder';
    case 'Sonderposten': return 'sopo';
    case 'NOS': case 'NOOS': return 'nos';
    case 'Extrabestellung': return 'extrabestellung';
    case 'NOS_Nachorder': return 'nos_nachorder';
    case 'Prio': return 'prio';
    default: return null;
  }
}

interface DetailParams {
  checkMode: 'quantity_only' | 'percentage_check' | 'full_check';
  checkPercentage: number | null;
  positionCount: number;
}

function detailParamsFor(spec: GeneratedCase | undefined, totalQuantity: number): DetailParams {
  if (spec) {
    return { checkMode: spec.checkMode, checkPercentage: spec.checkPercentage, positionCount: spec.positionCount };
  }
  // Lifecycle/fallback default: 2 positions for larger cases, percentage check.
  return {
    checkMode: 'percentage_check',
    checkPercentage: 20,
    positionCount: totalQuantity >= 24 ? 2 : 1,
  };
}

/** A5: Prüfstufe aus dem Katalog, abgeleitet aus dem Prüfmodus des Belegs. */
function inspectionLevelFor(params: DetailParams): 'none' | 'p10' | 'p20' | 'full' {
  if (params.checkMode === 'quantity_only') return 'none';
  if (params.checkMode === 'full_check') return 'full';
  return params.checkPercentage === 10 ? 'p10' : 'p20';
}

async function seedCaseDetails(specByWeBelegNo: Map<string, GeneratedCase>): Promise<void> {
  // Cover every case that benefits from a detail aggregate: the ready pool (so any
  // engine-assigned case is completable in the PWA) AND the terminal/issue
  // lifecycle cases (so their Belegdetail Positionen/Boxen tabs are populated, not
  // empty). Cancelled cases get no detail — there is nothing to show.
  const cases = await prisma.goodsReceiptCase.findMany({
    where: {
      // Only the handcrafted fixtures — generated mock-ProHandel Belege carry their
      // own richer positions/boxes and must not be clobbered on re-runs.
      externalRef: { startsWith: 'dev-seed:' },
      status: {
        in: [
          'needs_review',
          'ready',
          'parked',
          'assigned',
          'in_progress',
          'completed',
          'partially_completed',
          'zst_done',
          'issue_open',
        ],
      },
    },
  });

  for (const c of cases) {
    const params = detailParamsFor(specByWeBelegNo.get(c.weBelegNo), c.totalQuantity);
    const headerData = {
      priceLabelPrintRequired: true,
      goodsReceiptCheckMode: params.checkMode,
      goodsReceiptCheckPercentage: params.checkPercentage,
      // A5: Prüfstufe aus dem Katalog, konsistent zum Prüfmodus des Belegs.
      inspectionLevelCode: inspectionLevelFor(params),
      boxLabelRequired: true,
      zstRequired: true,
    };
    await prisma.workInstructionHeader.upsert({
      where: { caseId: c.id },
      update: headerData,
      create: { caseId: c.id, ...headerData },
    });

    // Positions carry a destination: Filiale / Shopbereich / Etage. Most Belege ship
    // to ONE Etage → one Transportbox. A deterministic subset puts a second position
    // on another Etage to demo the real split (one box per Shopbereich/Shop/Etage).
    const positionCount = Math.min(params.positionCount, Math.max(1, Math.floor(c.totalQuantity / 4) || 1));
    const splitAcrossEtagen = positionCount >= 2 && c.totalQuantity % 2 === 0;
    const secondQty = Math.floor(c.totalQuantity / positionCount);
    // WGRs kommen aus dem gesäten WGR-Katalog (A2), damit Katalog-Beschreibung und
    // A8-Größen-Präferenzen auf echten Positionen greifen.
    const POSITION_WGRS = ['218110', '111130', '214520', '312400', '415210'] as const;
    const posMeta = Array.from({ length: positionCount }, (_, idx) => ({
      positionNo: idx + 1,
      wgr: POSITION_WGRS[idx] ?? '218110',
      supplierArticleNo: `ART-${String(idx + 1).padStart(3, '0')}`,
      supplierColor: ['schwarz', 'blau', 'rot', 'grün', 'weiß'][idx] ?? 'schwarz',
      floor: idx === 0 ? c.primaryFloor ?? 'EG' : splitAcrossEtagen ? '1.OG' : c.primaryFloor ?? 'EG',
      qty: idx === 0 ? c.totalQuantity - secondQty * (positionCount - 1) : secondQty,
      // A4: Position 1 trägt CatMan + Sicherungstyp-Piktogramm, Folgepositionen nicht.
      catMan: idx === 0,
      securityTypeCode: idx === 0 ? 'hard-tag' : null,
    }));

    // Ältere Seed-Generationen hinterlassen überzählige Positionen (upsert löscht nie)
    // — wegräumen, damit Beleg, Boxen und Warenart konsistent sind.
    await prisma.receiptPosition.deleteMany({
      where: { caseId: c.id, positionNo: { gt: posMeta.length } },
    });
    const positionIdsByFloor = new Map<string, string[]>();
    for (const p of posMeta) {
      const position = await prisma.receiptPosition.upsert({
        where: { position_case_no: { caseId: c.id, positionNo: p.positionNo } },
        update: {
          wgr: p.wgr, supplierArticleNo: p.supplierArticleNo, supplierColor: p.supplierColor,
          floor: p.floor, catMan: p.catMan, shopNo: '21', branchNo: '001',
        },
        create: {
          caseId: c.id,
          positionNo: p.positionNo,
          wgr: p.wgr,
          supplierArticleNo: p.supplierArticleNo,
          supplierColor: p.supplierColor,
          branchNo: c.branchNo,
          shopNo: c.primaryShopAreaNo ?? '21',
          floor: p.floor,
          catMan: p.catMan,
        },
      });

      positionIdsByFloor.set(p.floor, [...(positionIdsByFloor.get(p.floor) ?? []), position.id]);

      // Positionsanweisung inkl. Sicherungstyp-Piktogramm (A4).
      const instruction = {
        priceLabelRequired: true,
        priceLabelAttachRequired: p.positionNo === 1,
        securityRequired: p.securityTypeCode !== null,
        securityTypeCode: p.securityTypeCode,
        onlineHandlingRequired: false,
      };
      await prisma.positionInstruction.upsert({
        where: { positionId: position.id },
        update: instruction,
        create: { positionId: position.id, ...instruction },
      });

      // Two EAN/size lines per position so the Belegdetail "Positionen" SKU table
      // (EAN · Größe · Soll · Ist · Status) is populated; Soll splits this position's
      // quantity across the lines, Ist stays open (null) until confirmed.
      const skuQuantities = splitQuantity(Math.max(2, p.qty));
      const sizes = ['38', '40'];
      for (const [skuIndex, expectedQuantity] of skuQuantities.entries()) {
        const size = sizes[skuIndex] ?? String(40 + skuIndex * 2);
        // Beleg-Nummern sind gepunktet („3.540.001") — nur Ziffern in die EAN.
        const ean = `40123${p.positionNo}${skuIndex}${c.weBelegNo.replace(/\D/g, '').slice(-5)}`;
        // A1: EK/VK/VK-Etikett je EAN/Größen-Zeile — wie auf dem WE-Beleg-Papier.
        const ekPrice = 12.5 + p.positionNo * 2;
        const vkPrice = round2(ekPrice * 2.4);
        const prices = { ekPrice, vkPrice, vkLabelPrice: vkPrice };
        await prisma.receiptSkuLine.upsert({
          where: { sku_position_ean_size: { receiptPositionId: position.id, ean, size } },
          update: { expectedQuantity, ...prices },
          create: { receiptPositionId: position.id, ean, size, expectedQuantity, ...prices },
        });
      }
    }

    // Boxes BY DESTINATION, not by piece count (§ box label = Shopbereich/Shop/Etage):
    // one Transportbox per distinct Etage across the positions. Rebuilt each run so a
    // case that no longer splits drops its extra box. Quantities sum to totalQuantity
    // (the full-ZST gate). Single-destination Beleg → exactly one box.
    await prisma.transportBox.deleteMany({ where: { caseId: c.id } });
    const qtyByFloor = new Map<string, number>();
    for (const p of posMeta) {
      qtyByFloor.set(p.floor, (qtyByFloor.get(p.floor) ?? 0) + p.qty);
    }
    let boxNo = 0;
    for (const [floor, plannedQuantity] of qtyByFloor) {
      boxNo += 1;
      await prisma.transportBox.create({
        data: {
          caseId: c.id,
          boxNo,
          branchNo: c.branchNo,
          shopAreaNo: c.primaryShopAreaNo ?? '21',
          shopNo: c.primaryShopAreaNo ?? '21',
          floor,
          plannedQuantity,
          // Boxzettel vollständig: Positionen der Box + Warenart des Belegs (nie
          // nichtssagendes „Gemischt" ohne Aufschlüsselung).
          positionIds: positionIdsByFloor.get(floor) ?? [],
          goodsType: boxGoodsTypeFromCase(c.goodsTypeText),
          goodsTypeText: c.goodsTypeText,
        },
      });
    }
  }
}

// --- Lifecycle cases (populate the Belege scopes Abgeschlossen / Archiv) ----
// A handful of cases in terminal / completion / issue states so the §10.4 Belege
// view's scope switcher (Aktiv / Abgeschlossen heute / Archiv) and the Problemfälle
// lane are non-empty in dev. They are NOT status='ready', so the engine ignores them.

type LifecycleStatus =
  | 'needs_review'
  | 'parked'
  | 'in_progress'
  | 'completed'
  | 'partially_completed'
  | 'zst_done'
  | 'cancelled'
  | 'issue_open';

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
  completedQuantity?: number;
  completedAt?: string;
  exportedAt?: string;
  issue?: { issueType: 'wrong_color' | 'damaged_goods' | 'missing_quantity'; description: string };
  /** A7 TL-Topf: „Besondere Aufmerksamkeit"-Flag mit Notiz (Bucherinnen-Inlet mock). */
  attentionNote?: string;
  /** C5 Digitale Ablage: Weiterleitungs-Empfänger (retourenabteilung|lieferscheinbucher). */
  forwardedTo?: 'retourenabteilung' | 'lieferscheinbucher';
}

/** True for completion states — these get completedAt + the DocuWare archive link (A6). */
function isCompletionStatus(status: LifecycleStatus): boolean {
  return status === 'completed' || status === 'zst_done';
}

/** Mock DocuWare-Langzeitarchiv link (A6) for a completed Beleg. */
function docuWareUrlFor(weBelegNo: string): string {
  return `https://docuware.example.com/lt-archiv/${weBelegNo}`;
}

const LIFECYCLE_CASES: SeedLifecycleCase[] = [
  {
    weBelegNo: 'WE-2026-000201', storageCode: 'R7', section: 2, goodsTypeText: 'Vororder',
    totalQuantity: 60, effortPoints: 14, estimatedMinutes: 28, status: 'completed',
    employeeNo: 'ma-101', completedQuantity: 60, completedAt: '14:32',
  },
  {
    weBelegNo: 'WE-2026-000202', storageCode: 'R19', section: 3, goodsTypeText: 'Nachorder',
    totalQuantity: 100, effortPoints: 20, estimatedMinutes: 40, status: 'partially_completed',
    employeeNo: 'ma-102', completedQuantity: 40, completedAt: '14:05',
  },
  {
    weBelegNo: 'WE-2026-000203', storageCode: 'R27', section: 7, goodsTypeText: 'NOS',
    totalQuantity: 45, effortPoints: 11, estimatedMinutes: 22, status: 'zst_done',
    employeeNo: 'ma-101', completedQuantity: 45, completedAt: '13:40', exportedAt: '17:00',
  },
  {
    weBelegNo: 'WE-2026-000204', storageCode: 'PB-4', section: 4, goodsTypeText: 'Sonderposten',
    totalQuantity: 18, effortPoints: 5, estimatedMinutes: 12, status: 'cancelled',
    employeeNo: 'ma-103',
  },
  {
    weBelegNo: 'WE-2026-000205', storageCode: 'D-3', section: 8, goodsTypeText: 'Prio',
    totalQuantity: 33, effortPoints: 8, estimatedMinutes: 20, status: 'issue_open',
    employeeNo: 'ma-103',
    issue: { issueType: 'wrong_color', description: 'Farbe weicht von Arbeitsanweisung ab' },
  },
  {
    weBelegNo: 'WE-2026-000206', storageCode: 'R7', section: 7, goodsTypeText: 'NOS',
    totalQuantity: 28, effortPoints: 7, estimatedMinutes: 16, status: 'needs_review',
    employeeNo: 'ma-101',
    attentionNote: 'Bucherin: Preisangaben unklar — bitte vor Freigabe prüfen.',
  },
  {
    weBelegNo: 'WE-2026-000207', storageCode: 'R19', section: 4, goodsTypeText: 'Nachorder',
    totalQuantity: 52, effortPoints: 12, estimatedMinutes: 26, status: 'parked',
    employeeNo: 'ma-102',
    attentionNote: 'Bucherin: Lieferant hat Nachlieferung angekündigt.',
  },
  {
    weBelegNo: 'WE-2026-000208', storageCode: 'R27', section: 1, goodsTypeText: 'Vororder',
    totalQuantity: 41, effortPoints: 10, estimatedMinutes: 22, status: 'in_progress',
    employeeNo: 'ma-103',
  },
  // C5 Digitale Ablage: ein weitergeleiteter Beleg (parked, damit die Engine ihn
  // ignoriert) — landet in der „weitergeleitet"-Lane, gruppiert nach Empfänger.
  {
    weBelegNo: 'WE-2026-000209', storageCode: 'PB-4', section: 3, goodsTypeText: 'Nachorder',
    totalQuantity: 22, effortPoints: 6, estimatedMinutes: 14, status: 'parked',
    employeeNo: 'ma-102',
    forwardedTo: 'retourenabteilung',
  },
];

async function seedLifecycleCases(
  locationIds: Record<string, string>,
  userIds: Record<string, string>,
): Promise<void> {
  for (const c of LIFECYCLE_CASES) {
    const storageLocationId = requireId(locationIds, c.storageCode, 'location');
    const employeeId = requireId(userIds, c.employeeNo, 'user');
    const caseData = {
      source: 'manual' as const,
      externalRef: `dev-seed:${c.weBelegNo}`,
      deliveryNoteNo: c.weBelegNo.replace('WE', 'LS'),
      bookingDate: asDate(SEED_DATE),
      weDate: asDate(SEED_DATE),
      branchNo: '001',
      primaryShopAreaNo: '21',
      primaryShopNo: '21',
      primaryFloor: 'EG',
      storageLocationId,
      section: c.section,
      goodsTypeText: c.goodsTypeText,
      priorityFlags: [],
      catManDate: null,
      totalQuantity: c.totalQuantity,
      inboundCartonCount: Math.max(1, Math.ceil(c.totalQuantity / 25)),
      status: c.status,
      effortPoints: c.effortPoints,
      estimatedMinutes: c.estimatedMinutes,
      // A6 Archiv: Abschlusszeitpunkt + DocuWare-Link für abgeschlossene Belege.
      completedAt:
        isCompletionStatus(c.status) && c.completedAt ? asTime(SEED_DATE, c.completedAt) : null,
      docuWareUrl: isCompletionStatus(c.status) ? docuWareUrlFor(c.weBelegNo) : null,
      // A7 TL-Topf: Aufmerksamkeitsflag (Bucherinnen-Inlet mock).
      attentionFlag: c.attentionNote !== undefined,
      attentionNote: c.attentionNote ?? null,
      // C5 Digitale Ablage: Weiterleitung (status-neutral).
      forwardedTo: c.forwardedTo ?? null,
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

// --- Mock-ERP catalogs (A2/A5/A8) -------------------------------------------

async function seedCatalogs(): Promise<void> {
  for (const entry of DEFAULT_WGR_CATALOG) {
    await prisma.wgrCatalog.upsert({
      where: { wgr: entry.wgr },
      update: { description: entry.description },
      create: entry,
    });
  }
  for (const level of DEFAULT_INSPECTION_LEVELS) {
    await prisma.inspectionLevel.upsert({
      where: { code: level.code },
      update: { label: level.label, percentage: level.percentage, description: level.description },
      create: level,
    });
  }
  // A8: Beispiel-Präferenzen für die Rot/Grün-Hervorhebung (per Admin-CSV erweiterbar).
  const preferences = [
    { wgr: '218110', sizeVariant: 'konfektion', preferredSize: '38', alternativeSize: '40' },
    { wgr: '312400', sizeVariant: 'jeans-inch', preferredSize: '32/32', alternativeSize: '31/32' },
    { wgr: '511100', sizeVariant: 'konfektion', preferredSize: '40', alternativeSize: null },
  ];
  for (const pref of preferences) {
    await prisma.onlineSizePreference.upsert({
      where: { online_size_wgr_variant: { wgr: pref.wgr, sizeVariant: pref.sizeVariant } },
      update: { preferredSize: pref.preferredSize, alternativeSize: pref.alternativeSize },
      create: pref,
    });
  }
}

// --- Generated mock-ProHandel batch (A9) -------------------------------------
// Same generator + persistence sink as the "Jetzt pullen" connector, so the seed pool
// carries every ERP field (prices, WGR, CatMan, Sicherungstyp, Prüfstufe, Kartons,
// Shops, Liefergruppen). Deterministic: fixed seed + fixed number range.

async function seedGeneratedBelege(locationIds: Record<string, string>): Promise<void> {
  const storageCodes = LOCATIONS.map((l) => l.code);
  const belege = generateBelege({
    seed: 42,
    count: 16,
    startNo: 300,
    bookingDate: SEED_DATE,
    storageCodes,
  });
  const locationIdByCode = new Map(Object.entries(locationIds));
  for (const beleg of belege) {
    await persistGeneratedBeleg(prisma, beleg, locationIdByCode);
  }
}

// --- Intake-Gate + Lieferungs-Hold demo fixtures (D1/D2) ---------------------
// Zwei blockierte Belege („zurück an Bucher": ohne Lagerplatz bzw. ohne
// Lieferschein) und eine UNVOLLSTÄNDIGE bestätigte Lieferung (2 von 3 da) —
// deren Mitglieder hält die Engine zurück, bis der dritte Beleg gebucht ist
// oder der Teamlead „trotzdem bearbeiten" freigibt.

async function seedIntakeGateFixtures(locationIds: Record<string, string>): Promise<void> {
  const base = {
    source: 'prohandel_api' as const,
    bookingDate: asDate(SEED_DATE),
    weDate: asDate(SEED_DATE),
    branchNo: '001',
    primaryShopAreaNo: '22',
    primaryShopNo: '22',
    primaryFloor: 'EG',
    section: 2,
    goodsTypeText: 'Nachorder' as const,
    priorityFlags: [] as PriorityFlag[],
    totalQuantity: 30,
    inboundCartonCount: 2,
    effortPoints: 8,
    estimatedMinutes: 8,
  };

  // D1: ohne Lagerplatz.
  await prisma.goodsReceiptCase.upsert({
    where: { weBelegNo: 'WE-2026-000401' },
    update: { status: 'blocked', missingFields: ['Lagerplatz'], storageLocationId: null },
    create: {
      weBelegNo: 'WE-2026-000401',
      externalRef: 'prohandel:WE-2026-000401',
      deliveryNoteNo: 'LS-2026-000401',
      ...base,
      storageLocationId: null,
      status: 'blocked',
      missingFields: ['Lagerplatz'],
    },
  });
  // D1: ohne Lieferschein.
  await prisma.goodsReceiptCase.upsert({
    where: { weBelegNo: 'WE-2026-000402' },
    update: { status: 'blocked', missingFields: ['Lieferschein'], deliveryNoteNo: null },
    create: {
      weBelegNo: 'WE-2026-000402',
      externalRef: 'prohandel:WE-2026-000402',
      deliveryNoteNo: null,
      ...base,
      storageLocationId: requireId(locationIds, 'R7', 'location'),
      status: 'blocked',
      missingFields: ['Lieferschein'],
    },
  });
  // D2: bestätigte Lieferung „2 von 3" — Mitglieder ready, aber im Pool-Hold.
  for (const [i, no] of (['WE-2026-000403', 'WE-2026-000404'] as const).entries()) {
    await prisma.goodsReceiptCase.upsert({
      where: { weBelegNo: no },
      update: { status: 'ready', assignedBundleId: null, deliveryGroupReleased: false },
      create: {
        weBelegNo: no,
        externalRef: `prohandel:${no}`,
        deliveryNoteNo: 'LS-2026-000403',
        deliverySourceGroupKey: 'PH-LFG-403',
        deliverySourceGroupSize: 3,
        ...base,
        totalQuantity: 24 + i * 6,
        storageLocationId: requireId(locationIds, 'R19', 'location'),
        status: 'ready',
      },
    });
  }
}

/**
 * A7 TL-Topf: flag ONE ready pool case for „Besondere Aufmerksamkeit" so the Topf
 * also shows a plan-/zuweisbarer Beleg (not only triage states). Deterministic:
 * always the first ready case by weBelegNo, so re-running flags the same Beleg.
 */
async function seedReadyAttentionFlag(): Promise<void> {
  const target = await prisma.goodsReceiptCase.findFirst({
    where: { status: 'ready' },
    orderBy: { weBelegNo: 'asc' },
    select: { id: true },
  });
  if (!target) return;
  await prisma.goodsReceiptCase.update({
    where: { id: target.id },
    data: {
      attentionFlag: true,
      attentionNote: 'Bucherin: Ware bitte gesondert prüfen (Reklamation beim letzten Mal).',
    },
  });
}

async function main(): Promise<void> {
  const readyCases = generateReadyCases(SCENARIO);
  const specByWeBelegNo = new Map(readyCases.map((c) => [c.weBelegNo, c]));

  await resetCaseGraph();
  const roleIds = await seedRoles();
  const workstationIds = await seedWorkstations();
  const userIds = await seedUsers(roleIds, workstationIds);
  await seedShifts(userIds);
  const locationIds = await seedLocations();
  await seedCatalogs();
  await seedCases(locationIds, readyCases);
  await seedLifecycleCases(locationIds, userIds);
  // After both case sets exist, attach detail (positions/boxes/SKU) to every case
  // that should show it — generated ready pool + lifecycle cases.
  await seedCaseDetails(specByWeBelegNo);
  // Generated mock-ProHandel batch ON TOP of the generated pool (runs after
  // seedCaseDetails so its richer positions/boxes are not overwritten).
  await seedGeneratedBelege(locationIds);
  await seedIntakeGateFixtures(locationIds);
  await seedReadyAttentionFlag();
  await seedRuleConfig();

  const [users, shifts, locations, readyCount, deliveryGroups, positions, boxes, lifecycleCases, zstRecords] =
    await Promise.all([
      prisma.user.count(),
      prisma.shift.count({ where: { date: asDate(SEED_DATE), active: true } }),
      prisma.location.count({ where: { active: true } }),
      prisma.goodsReceiptCase.count({ where: { status: 'ready' } }),
      prisma.goodsReceiptCase
        .findMany({ where: { status: 'ready' }, select: { deliveryNoteNo: true } })
        .then((rows) => new Set(rows.map((r) => r.deliveryNoteNo)).size),
      prisma.receiptPosition.count(),
      prisma.transportBox.count(),
      prisma.goodsReceiptCase.count({
        where: { status: { in: ['completed', 'partially_completed', 'zst_done', 'cancelled', 'issue_open'] } },
      }),
      prisma.zstRecord.count(),
    ]);
  console.log(
    `[seed] scenario=${SCENARIO} (target=${SCENARIO_TARGET[SCENARIO]}) users=${users} ` +
      `shifts(${SEED_DATE})=${shifts} activeLocations=${locations} readyCases=${readyCount} ` +
      `deliveryGroups=${deliveryGroups} positions=${positions} boxes=${boxes} ` +
      `lifecycleCases=${lifecycleCases} zstRecords=${zstRecords}`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error('[seed] failed', err);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
