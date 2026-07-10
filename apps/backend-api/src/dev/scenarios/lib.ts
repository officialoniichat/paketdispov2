// Shared scenario-seeding primitives (extracted from the former monolithic
// prisma/seed.ts). Reset + master-data building blocks every scenario composes:
// idempotent upserts by natural keys (employeeNo, role name, location code,
// [employeeId,date]) for master data, and one deterministic wipe of the
// transactional case graph. All date math anchors on the caller's `baseDate`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Prisma } from '@prisma/client';
import type { RuleConfig } from '@paket/domain-types';
import {
  DEFAULT_INSPECTION_LEVELS,
  DEFAULT_RULE_CONFIG,
  DEFAULT_WGR_CATALOG,
  RULE_CONFIG_KEY,
} from '@paket/domain-types';
import { hashPin } from '../../auth/pin.js';
import { normaliseRole, requiresPin } from '../../auth/rbac.js';
import { LOCATIONS, PRIVILEGED_DEMO_PIN, USERS, type ShiftModel } from './seed-data.js';
import type { ScenarioContext, ScenarioPrisma, ScenarioSummary } from './types.js';

// --- Date helpers -----------------------------------------------------------

/** A @db.Date column wants a UTC midnight Date for the given calendar day. */
export function asDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** A shift/timestamp boundary on `day` at the given HH:mm (UTC). */
export function asTime(day: string, hhmm: string): Date {
  return new Date(`${day}T${hhmm}:00.000Z`);
}

/** `baseDate` shifted by `offset` calendar days, as a @db.Date UTC midnight. */
export function offsetDate(baseDate: string, offset: number): Date {
  const d = asDate(baseDate);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

/** Look up a previously-seeded id, failing loudly if a referenced key is missing. */
export function requireId(map: Record<string, string>, key: string, kind: string): string {
  const id = map[key];
  if (id === undefined) {
    throw new Error(`[scenario] missing ${kind} for key "${key}" — check seed ordering`);
  }
  return id;
}

// --- Deterministic reset of the case graph ----------------------------------
// The case graph is GENERATED, so its shape (count, weBelegNo set) changes across
// scenarios. To stay deterministic — exactly the scenario's cases, no orphans from
// a previous load — wipe the transactional graph up front, then rebuild. Master
// data (roles, users, locations, catalogs, rule config) is upserted, never wiped.
// ZstRecord has no cascade on case and a case points at its bundle, so the order
// below clears those refs before deleting the cases (whose other dependents cascade).

export async function resetCaseGraph(prisma: ScenarioPrisma): Promise<void> {
  await prisma.zstRecord.deleteMany({});
  await prisma.assignmentItem.deleteMany({});
  await prisma.goodsReceiptCase.updateMany({ data: { assignedBundleId: null } });
  await prisma.assignmentBundle.deleteMany({});
  // Cascades remove workInstruction, positions (+ sku lines), transport boxes and
  // issues for each removed case.
  await prisma.goodsReceiptCase.deleteMany({});
}

// --- Roles (RBAC) ------------------------------------------------------------

export async function seedRoles(prisma: ScenarioPrisma): Promise<Record<string, string>> {
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

// --- Workstations (Tische, A10) ----------------------------------------------

const WORKSTATIONS = Array.from({ length: 8 }, (_, i) => ({
  code: `T${i + 1}`,
  name: `Tisch ${i + 1}`,
}));

export async function seedWorkstations(prisma: ScenarioPrisma): Promise<Record<string, string>> {
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

// --- Users (identities live in seed-data.ts USERS; dev tokens must resolve) ---

/** Mo–Fr working with the model, weekend frei — matches weeklyPatternSchema. */
function buildWeeklyPattern(m?: ShiftModel): Prisma.InputJsonObject | null {
  if (!m) return null;
  const work = { working: true, shiftModel: m.model, start: m.start, end: m.end, breakMinutes: m.breakMinutes, partTimePct: 100 };
  const frei = { working: false, breakMinutes: 0, partTimePct: 100 };
  return { mon: work, tue: work, wed: work, thu: work, fri: work, sat: frei, sun: frei };
}

export async function seedUsers(
  prisma: ScenarioPrisma,
  roleIds: Record<string, string>,
  workstationIds: Record<string, string>,
): Promise<Record<string, string>> {
  const idByEmployeeNo: Record<string, string> = {};
  for (const u of USERS) {
    const weeklyPattern = buildWeeklyPattern(u.pattern);
    // Only the privileged roles carry a secret; a Mitarbeiter's pinHash stays
    // null, so no dead credential ever lingers in the database.
    const role = normaliseRole(u.role);
    const pinHash = role && requiresPin([role]) ? await hashPin(PRIVILEGED_DEMO_PIN) : null;
    const profile = {
      measured: u.measured ?? true,
      bereiche: u.bereiche ?? [],
      productivityFactor: u.productivityFactor ?? 1,
      skillTier: u.skillTier ?? ('profi' as const),
      workstationId: u.workstationCode ? requireId(workstationIds, u.workstationCode, 'workstation') : null,
      pinHash,
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

// --- Shifts (materialized from each employee's weekly pattern on the base day) ---

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function seedShifts(
  prisma: ScenarioPrisma,
  baseDate: string,
  userIds: Record<string, string>,
): Promise<void> {
  const date = asDate(baseDate);
  for (const u of USERS) {
    if (!u.pattern) continue;
    const employeeId = requireId(userIds, u.employeeNo, 'user');
    const prod = u.productivityFactor ?? 1;
    const windowMin = minutes(u.pattern.end) - minutes(u.pattern.start);
    const net = Math.round((windowMin - u.pattern.breakMinutes) * prod);
    const shiftData = {
      plannedStart: asTime(baseDate, u.pattern.start),
      plannedEnd: asTime(baseDate, u.pattern.end),
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

// --- Locations (storage master referenced by cases) ---------------------------
// A Lagerplatz's Bereich is derived from its `kind` (regal/lagerplatz_d → Regal,
// palette_* → Palette, haengebahn → Hängebahn), so it is not stored per location.

export async function seedLocations(prisma: ScenarioPrisma): Promise<Record<string, string>> {
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

// --- Mock-ERP catalogs (A2/A5/A8) ---------------------------------------------

export async function seedCatalogs(prisma: ScenarioPrisma): Promise<void> {
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
  // A8: Präferenzen für die Rot/Grün-Hervorhebung — einzige Quelle ist die
  // eingecheckte CSV-Fixture (identisches Format wie der Admin-CSV-Upload).
  await seedOnlineSizePreferences(prisma);
}

// --- Online-Größen-Präferenzen (A8) aus der CSV-Fixture -------------------------
// Single source: `fixtures/online-size-preferences.csv` ist exakt die Datei, die
// auch über POST /api/admin/online-size-preferences/upload hochladbar ist
// (`wgr;sizeVariant;preferredSize;alternativeSize`, Semikolon, mit Kopfzeile) —
// Seed und Upload-Demo können nie auseinanderlaufen.

interface OnlineSizePreferenceRow {
  wgr: string;
  sizeVariant: string;
  preferredSize: string;
  alternativeSize: string | null;
}

export function readOnlineSizePreferenceFixture(): {
  csv: string;
  rows: OnlineSizePreferenceRow[];
} {
  // Runs from src in every real execution path (swc-register dev server, prisma
  // seed, vitest); the dist fallback covers a built runtime with DEV_PANEL=1.
  const srcPath = fileURLToPath(new URL('./fixtures/online-size-preferences.csv', import.meta.url));
  let csv: string;
  try {
    csv = readFileSync(srcPath, 'utf8');
  } catch {
    csv = readFileSync(srcPath.replace('/dist/', '/src/'), 'utf8');
  }
  const rows = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !l.toLowerCase().startsWith('wgr'))
    .map((line): OnlineSizePreferenceRow => {
      const [wgr, sizeVariant, preferredSize, alternativeSize] = line.split(';').map((c) => c.trim());
      if (!wgr || !sizeVariant || !preferredSize) {
        throw new Error(`[scenario] invalid online-size-preference fixture line: "${line}"`);
      }
      return { wgr, sizeVariant, preferredSize, alternativeSize: alternativeSize || null };
    });
  return { csv, rows };
}

export async function seedOnlineSizePreferences(prisma: ScenarioPrisma): Promise<void> {
  const { rows } = readOnlineSizePreferenceFixture();
  for (const pref of rows) {
    await prisma.onlineSizePreference.upsert({
      where: { online_size_wgr_variant: { wgr: pref.wgr, sizeVariant: pref.sizeVariant } },
      update: { preferredSize: pref.preferredSize, alternativeSize: pref.alternativeSize },
      create: pref,
    });
  }
}

// --- App config (§11 structured rule config singleton) -------------------------
// Idempotent: only writes the default when no row exists yet, so re-running never
// clobbers a rule config a teamlead/admin has since edited via the API.

export async function seedRuleConfig(prisma: ScenarioPrisma): Promise<void> {
  const existing = await prisma.appConfig.findUnique({ where: { key: RULE_CONFIG_KEY } });
  if (existing) return;
  await prisma.appConfig.create({
    data: {
      key: RULE_CONFIG_KEY,
      value: DEFAULT_RULE_CONFIG as unknown as Prisma.InputJsonValue,
    },
  });
}

/**
 * Deterministic-world variant for the B2–B15 demo scenarios: FORCE the rule config
 * to the default merged with the scenario's overrides, clobbering prior edits. Every
 * non-standard scenario runs this so its behavior (grouping hold, Cutoff 50, Sonder-
 * Verladeplan, …) never depends on what an admin configured before the load — and a
 * config a previous scenario forced (e.g. B11's Sonderzeile) never leaks forward.
 */
export async function forceRuleConfig(
  prisma: ScenarioPrisma,
  overrides: Partial<RuleConfig> = {},
): Promise<void> {
  const value = { ...DEFAULT_RULE_CONFIG, ...overrides } as unknown as Prisma.InputJsonValue;
  await prisma.appConfig.upsert({
    where: { key: RULE_CONFIG_KEY },
    update: { value },
    create: { key: RULE_CONFIG_KEY, value },
  });
}

/** Ids of the upserted master data, for the case builders. */
export interface MasterDataIds {
  roleIds: Record<string, string>;
  workstationIds: Record<string, string>;
  userIds: Record<string, string>;
  locationIds: Record<string, string>;
}

/**
 * The shared master-data baseline every scenario starts from: roles, the team
 * (users + day shifts from their patterns), Tische, the location master, the
 * mock-ERP catalogs and the default rule config. All upserts — safe to re-run.
 */
export async function seedMasterData(ctx: ScenarioContext): Promise<MasterDataIds> {
  const roleIds = await seedRoles(ctx.prisma);
  const workstationIds = await seedWorkstations(ctx.prisma);
  const userIds = await seedUsers(ctx.prisma, roleIds, workstationIds);
  await seedShifts(ctx.prisma, ctx.baseDate, userIds);
  const locationIds = await seedLocations(ctx.prisma);
  await seedCatalogs(ctx.prisma);
  await seedRuleConfig(ctx.prisma);
  return { roleIds, workstationIds, userIds, locationIds };
}

/** Headline counts after a load — the POST …/load response + seed log line. */
export async function summarizeScenario(
  prisma: ScenarioPrisma,
  baseDate: string,
): Promise<ScenarioSummary> {
  const [users, shifts, activeLocations, readyCases, blockedCases, deliveryGroups, totalCases] =
    await Promise.all([
      prisma.user.count(),
      prisma.shift.count({ where: { date: asDate(baseDate), active: true } }),
      prisma.location.count({ where: { active: true } }),
      prisma.goodsReceiptCase.count({ where: { status: 'ready' } }),
      prisma.goodsReceiptCase.count({ where: { status: 'blocked' } }),
      prisma.goodsReceiptCase
        .findMany({ where: { status: 'ready' }, select: { deliveryNoteNo: true } })
        .then((rows) => new Set(rows.map((r) => r.deliveryNoteNo)).size),
      prisma.goodsReceiptCase.count(),
    ]);
  return { users, shifts, activeLocations, readyCases, blockedCases, deliveryGroups, totalCases };
}
