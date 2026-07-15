import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { classifyPriority, sortByPriority, type EnrichedCase } from '@paket/assignment-engine';
import type { GoodsReceiptCase, RuleConfig } from '@paket/domain-types';
import { RULE_CONFIG_KEY } from '@paket/domain-types';
import { SCENARIOS, loadScenario } from '../dev/scenarios/index.js';

/**
 * C3 smoke tests for the dev-scenario framework: every catalog key (B1–B15) is
 * loaded via the exported `loadScenario(prisma, key, { baseDate })` against a
 * Testcontainers Postgres, asserting each scenario's HEADLINE expectation from
 * its `expectedOutcome`, plus a determinism check (same key + baseDate ⇒
 * byte-identical case digest). All USERS in the framework carry a weeklyPattern,
 * so recalculate's shift materialization cannot rot these seeds (§4.3 gotcha).
 */

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Fixed anchor day (a Monday) so every relative date is reproducible. */
const BASE_DATE = '2026-06-15';

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();
  execSync('pnpm exec prisma migrate deploy', {
    cwd: BACKEND_DIR,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
  prisma = new PrismaClient({ datasourceUrl: url });
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

function load(key: string) {
  return loadScenario(prisma, key, { baseDate: BASE_DATE });
}

function isoDay(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** Stable digest over all case tuples (order-independent, timestamp-free). */
async function caseDigest(): Promise<string> {
  const rows = await prisma.goodsReceiptCase.findMany({
    orderBy: { weBelegNo: 'asc' },
    include: { storageLocation: { select: { code: true } } },
  });
  const tuples = rows.map((r) => [
    r.weBelegNo,
    r.status,
    r.totalQuantity,
    isoDay(r.bookingDate),
    r.deliveryNoteNo,
    r.section,
    r.goodsTypeText,
    r.storageLocation?.code ?? null,
    [...r.priorityFlags].sort(),
    [...r.missingFields].sort(),
    r.deliverySourceGroupKey,
    r.deliverySourceGroupSize,
    isoDay(r.loadPlanDate),
    r.effortPoints,
    r.estimatedMinutes,
    r.externalRef,
  ]);
  return createHash('sha256').update(JSON.stringify(tuples)).digest('hex');
}

describe('Szenario-Framework (C3): loadScenario lädt jedes Katalog-Szenario', () => {
  it('kennt alle 15 Szenario-Keys (B1–B15)', () => {
    expect(SCENARIOS.map((s) => s.key)).toEqual([
      'standard',
      'peak-tag',
      'gemischtes-buendel',
      'lieferung-zusammenhaengend',
      'lieferung-unvollstaendig',
      'datenqualitaet',
      'gross-beleg-knecki',
      'shop-31-nos',
      'prio-leiter',
      'schichtende',
      'feiertag-sonderregelung',
      'skill-tiers-crew',
      'online-groessen',
      'problemfaelle-ablage',
      'leerer-tag',
    ]);
  });

  it('B1 standard: 189 ready-Belege + 2 blockierte („zurück an Bucher")', async () => {
    const summary = await load('standard');

    expect(summary.readyCases).toBe(189);
    expect(summary.blockedCases).toBe(2);
    // Team + Schichten am Basistag vorhanden (Wochenplan-getrieben, §4.3-Gotcha).
    expect(summary.users).toBeGreaterThanOrEqual(12);
    expect(summary.shifts).toBeGreaterThanOrEqual(10);
    expect(summary.deliveryGroups).toBeGreaterThanOrEqual(50);
  });

  it('B2 peak-tag: 333 ready-Belege (Spitzen-Volumenprofil)', async () => {
    const summary = await load('peak-tag');

    expect(summary.readyCases).toBe(333);
    expect(summary.blockedCases).toBe(2);
  });

  it('B3 gemischtes-buendel: 40 gleich große Belege über alle drei Bereiche', async () => {
    const summary = await load('gemischtes-buendel');

    expect(summary.readyCases).toBe(40);
    const rows = await prisma.goodsReceiptCase.findMany({
      include: { storageLocation: { select: { kind: true } } },
    });
    const kinds = rows.map((r) => r.storageLocation?.kind ?? 'missing');
    expect(kinds.filter((k) => k === 'regal')).toHaveLength(16);
    expect(kinds.filter((k) => k === 'haengebahn')).toHaveLength(12);
    expect(kinds.filter((k) => k.startsWith('palette'))).toHaveLength(12);
    for (const r of rows) expect(r.totalQuantity).toBe(52);
  });

  it('B4 lieferung-zusammenhaengend: Run-, Lieferschein- und Brax-Signal gesät', async () => {
    const summary = await load('lieferung-zusammenhaengend');

    expect(summary.readyCases).toBe(13);
    // (a) T3-Run: fortlaufende Belegnummern, aber je eigener Lieferschein.
    const run = await prisma.goodsReceiptCase.findMany({
      where: { weBelegNo: { in: ['9.401.101', '9.401.102', '9.401.103'] } },
    });
    expect(run).toHaveLength(3);
    expect(new Set(run.map((r) => r.deliveryNoteNo)).size).toBe(3);
    // (b) T2: identischer Lieferschein LS-77001 auf drei nicht-fortlaufenden Belegen.
    const note = await prisma.goodsReceiptCase.findMany({ where: { deliveryNoteNo: 'LS-77001' } });
    expect(note.map((r) => r.weBelegNo).sort()).toEqual(['9.401.201', '9.401.215', '9.401.230']);
    // (c) Brax: Kartonnummern im externalRef durchlaufend, Lieferscheine verschieden.
    const brax = await prisma.goodsReceiptCase.findMany({
      where: { externalRef: { contains: 'brax-karton-4711' } },
    });
    expect(brax).toHaveLength(3);
    expect(new Set(brax.map((r) => r.deliveryNoteNo)).size).toBe(3);
  });

  it('B5 lieferung-unvollstaendig: Pool-Hold-Gruppe „2 von 4" + 3-von-3-Kontrast', async () => {
    const summary = await load('lieferung-unvollstaendig');

    expect(summary.readyCases).toBe(8);
    const withheld = await prisma.goodsReceiptCase.findMany({
      where: { deliverySourceGroupKey: 'PH-LFG-501' },
    });
    expect(withheld.map((r) => r.weBelegNo).sort()).toEqual(['9.402.501', '9.402.502']);
    for (const r of withheld) {
      expect(r.deliverySourceGroupSize).toBe(4); // „2 von 4 · 2 fehlen"
      expect(r.deliveryGroupReleased).toBe(false); // noch keine TL-Freigabe
      expect(r.status).toBe('ready');
    }
    const complete = await prisma.goodsReceiptCase.count({
      where: { deliverySourceGroupKey: 'PH-LFG-601', deliverySourceGroupSize: 3 },
    });
    expect(complete).toBe(3);
  });

  it('B6 datenqualitaet: 3 blockierte Belege + 1 nachgepflegter wieder ready', async () => {
    const summary = await load('datenqualitaet');

    expect(summary.blockedCases).toBe(3);
    expect(summary.readyCases).toBe(4);
    const blocked = await prisma.goodsReceiptCase.findMany({ where: { status: 'blocked' } });
    const byNo = new Map(blocked.map((r) => [r.weBelegNo, r]));
    expect(byNo.get('9.403.701')?.missingFields).toEqual(['Lagerplatz']);
    expect(byNo.get('9.403.705')?.missingFields).toEqual(['Lieferschein']);
    expect(byNo.get('9.403.709')?.missingFields).toEqual(['Lagerplatz', 'Lieferschein']);
    // Der nachgepflegte Fall ist wieder freigegeben und vollständig.
    const released = await prisma.goodsReceiptCase.findUnique({
      where: { weBelegNo: '9.403.713' },
    });
    expect(released?.status).toBe('ready');
    expect(released?.storageLocationId).not.toBeNull();
    expect(released?.deliveryNoteNo).not.toBeNull();
  });

  it('B7 gross-beleg-knecki: Monster-Beleg im Pool + Vortages-Fortsetzung ma-104', async () => {
    await load('gross-beleg-knecki');

    // Monster-Beleg über der 2000-Teile-Schwelle wartet unverteilt im Pool.
    const monster = await prisma.goodsReceiptCase.findUnique({
      where: { weBelegNo: '9.404.801' },
    });
    expect(monster?.status).toBe('ready');
    expect(monster?.totalQuantity).toBe(2400);
    expect(monster?.assignedBundleId).toBeNull();
    // Vortages-Bündel: gestern begonnener 2.600-Teile-Beleg hängt an Dirk Hansen.
    const carryover = await prisma.goodsReceiptCase.findUnique({
      where: { weBelegNo: '9.404.802' },
      include: { assignedBundle: { include: { employee: true } } },
    });
    expect(carryover?.status).toBe('in_progress');
    expect(carryover?.assignedBundle?.employee.employeeNo).toBe('ma-104');
    expect(isoDay(carryover?.assignedBundle?.date ?? null)).toBe('2026-06-14'); // baseDate − 1
  });

  it('B8 shop-31-nos: 22 NOS-Einzelanlieferungen für Shop 31 + 6 Kontrast-Belege', async () => {
    const summary = await load('shop-31-nos');

    expect(summary.readyCases).toBe(28);
    const nos = await prisma.goodsReceiptCase.findMany({ where: { goodsTypeText: 'NOS' } });
    expect(nos).toHaveLength(22);
    for (const r of nos) {
      expect(r.primaryShopAreaNo).toBe('31');
      expect(r.totalQuantity).toBe(10);
    }
    // Einzelanlieferungen: jede mit eigenem Lieferschein (keine Liefergruppen-Signale).
    expect(new Set(nos.map((r) => r.deliveryNoteNo)).size).toBe(22);
  });

  it('B9 prio-leiter: die reine Engine-Sortierung ergibt exakt die dokumentierte Reihenfolge', async () => {
    await load('prio-leiter');

    const rows = await prisma.goodsReceiptCase.findMany({
      include: { storageLocation: { select: { kind: true } } },
    });
    const enriched: EnrichedCase[] = rows.map((r) => {
      const domainCase = {
        id: r.id,
        weBelegNo: r.weBelegNo,
        status: r.status,
        bookingDate: isoDay(r.bookingDate),
        priorityFlags: r.priorityFlags,
        section: r.section,
        goodsTypeText: r.goodsTypeText ?? undefined,
        primaryShopAreaNo: r.primaryShopAreaNo ?? undefined,
        loadPlanDate: isoDay(r.loadPlanDate) ?? undefined,
        storageLocation: r.storageLocation ? { type: r.storageLocation.kind } : undefined,
      } as unknown as GoodsReceiptCase;
      return {
        case: domainCase,
        priority: classifyPriority(domainCase, { today: BASE_DATE }),
        teile: r.totalQuantity,
        effortMinutes: r.estimatedMinutes,
        effortPoints: r.effortPoints,
        wgrCodes: [],
        fromPreviousDays: false,
      };
    });

    const sorted = sortByPriority(enriched);
    const distributable = sorted.filter((c) => c.priority.class !== 'exclusion');
    expect(distributable.map((c) => c.case.weBelegNo)).toEqual([
      '9.405.905', // Rang 1: manuelle TL-Priorität
      '9.405.909', // Rang 2: Prio-Kennzeichen
      '9.405.913', // Rang 3: EB-Abschnitt 7
      '9.405.917', // Rang 3: Shopbereich 120
      '9.405.921', // Rang 3: Shopbereich 90
      '9.405.925', // Rang 4: NOS
      '9.405.929', // Rang 4: Hängeware
      '9.405.933', // Rang 5: Verladeplan Abschnitt 1, heute fällig
      '9.405.937', // Rang 5: Abschnitt 2, überfällig
      '9.405.941', // Rang 5: Abschnitt 3, heute fällig
      '9.405.945', // Rang 6: FIFO
    ]);
    // Rang 0: der geparkte Beleg ist ausgeschlossen und wird nie verteilt.
    const parked = enriched.find((c) => c.case.weBelegNo === '9.405.901');
    expect(parked?.priority.class).toBe('exclusion');
  });

  it('B10 schichtende: 12 Belege + beide Schichtmodelle (Früh 06:00, Spät 10:00)', async () => {
    const summary = await load('schichtende');

    expect(summary.readyCases).toBe(12);
    const shifts = await prisma.shift.findMany({
      where: { date: new Date(`${BASE_DATE}T00:00:00.000Z`), active: true },
    });
    const starts = new Set(shifts.map((s) => s.plannedStart.toISOString().slice(11, 16)));
    expect(starts.has('06:00')).toBe(true); // Frühschicht (Cutoff-Punkt 13:10)
    expect(starts.has('10:00')).toBe(true); // Spätschicht (Cutoff-Punkt 17:10)
  });

  it('B11 feiertag-sonderregelung: RuleConfig enthält die specialDay-Zeile DO→MI', async () => {
    await load('feiertag-sonderregelung');

    const row = await prisma.appConfig.findUnique({ where: { key: RULE_CONFIG_KEY } });
    const loadPlan = (row?.value as unknown as RuleConfig).loadPlan;
    // Nächster DO ab 2026-06-15 (Mo) = 2026-06-18, vorgezogener MI = 2026-06-17.
    const sonder = loadPlan.find((r) => r.specialDay);
    expect(sonder).toMatchObject({
      shopAreaNo: '23',
      floor: 'EG',
      weekday: 'Mi',
      validFrom: '2026-06-17',
      validTo: '2026-06-18',
    });
    // Die reguläre DO-Zeile für Shop 23 steht daneben im Wochenplan.
    expect(loadPlan.some((r) => r.shopAreaNo === '23' && r.weekday === 'Do' && !r.specialDay)).toBe(true);
    const betroffen = await prisma.goodsReceiptCase.findUnique({
      where: { weBelegNo: '9.407.010' },
    });
    expect(betroffen?.primaryShopAreaNo).toBe('23');
    expect(betroffen?.section).toBe(1);
  });

  it('B12 skill-tiers-crew: starter/dummy sind measured=false + Koffer-WGR 812770', async () => {
    const summary = await load('skill-tiers-crew');

    expect(summary.readyCases).toBe(13);
    // starter/dummy sind gesät wie erwartet: KEINE Auto-Pack-Voraussetzungen (das
    // Tier-Gate der Engine schließt genau diese Stufen von der Verteilung aus).
    const mara = await prisma.user.findUnique({ where: { employeeNo: 'ma-201' } });
    expect(mara).toMatchObject({ skillTier: 'starter', measured: false });
    const tom = await prisma.user.findUnique({ where: { employeeNo: 'ma-202' } });
    expect(tom).toMatchObject({ skillTier: 'dummy', measured: false });
    const autoTiers = await prisma.user.findMany({
      where: { skillTier: { in: ['profi', 'fortgeschritten', 'basis'] } },
    });
    expect(autoTiers.length).toBeGreaterThanOrEqual(10);
    // Koffer ist eine WGR (812770), kein Bereich: die Position trägt sie explizit.
    const koffer = await prisma.receiptPosition.findFirst({
      where: { case: { weBelegNo: '9.321.037' }, wgr: '812770' },
    });
    expect(koffer).not.toBeNull();
  });

  it('B13 online-groessen: drei Regel-Fälle mit gezielten Größen + CSV-Präferenzen', async () => {
    const summary = await load('online-groessen');

    expect(summary.readyCases).toBe(3);
    // Präferenzen kommen aus der CSV-Fixture (Single Source, admin-upload-kompatibel).
    const pref = await prisma.onlineSizePreference.findFirst({ where: { wgr: '218110' } });
    expect(pref?.preferredSize).toBe('38');
    // Fall 1: Wunschgröße 38 geliefert (38 grün, 40 rot).
    const sizes = await prisma.receiptSkuLine.findMany({
      where: { position: { case: { weBelegNo: '9.408.101' }, wgr: '218110' } },
    });
    expect(sizes.map((s) => s.size).sort()).toEqual(['38', '40']);
  });

  it('B14 problemfaelle-ablage: jede Ablage-Lane ist belegt', async () => {
    const summary = await load('problemfaelle-ablage');

    expect(summary.readyCases).toBe(4);
    const grouped = await prisma.goodsReceiptCase.groupBy({ by: ['status'], _count: true });
    const count = new Map(grouped.map((g) => [g.status, g._count]));
    expect(count.get('issue_open')).toBe(2);
    expect(count.get('parked')).toBe(4); // 2 geparkt + 2 weitergeleitet (parked)
    expect(count.get('problem_resolved')).toBe(1);
    expect(count.get('needs_review')).toBe(1);
    expect(count.get('in_progress')).toBe(1);
    expect(count.get('completed')).toBe(1);
    expect(count.get('zst_done')).toBe(1);
    expect(count.get('cancelled')).toBe(1);
    // Weiterleitungen an BEIDE Empfänger.
    const forwarded = await prisma.goodsReceiptCase.findMany({
      where: { forwardedTo: { not: null } },
    });
    expect(forwarded.map((r) => r.forwardedTo).sort()).toEqual([
      'lieferscheinbucher',
      'retourenabteilung',
    ]);
    // Offene Probleme mit unterschiedlicher Art (Deep-Link-Ziele): ein manuelles
    // Katalog-Problem + eine implizite Minderlieferung.
    const issues = await prisma.issue.findMany({ where: { status: 'open' } });
    expect(issues.map((i) => i.kind).sort()).toEqual(['manual', 'under_delivery']);
    expect(issues.find((i) => i.kind === 'manual')?.reasonLabel).toBe('falsche Farbe');
  });

  it('B15 leerer-tag: 0 Belege, aber Stammdaten (Team, Schichten, Lagerplätze) stehen', async () => {
    const summary = await load('leerer-tag');

    expect(summary.totalCases).toBe(0);
    expect(summary.readyCases).toBe(0);
    expect(summary.blockedCases).toBe(0);
    expect(summary.users).toBeGreaterThanOrEqual(12);
    expect(summary.shifts).toBeGreaterThanOrEqual(10);
    expect(summary.activeLocations).toBeGreaterThan(0);
  });

  it('unbekannter Key wirft mit der Liste der bekannten Szenarien', async () => {
    await expect(load('gibt-es-nicht')).rejects.toThrow(/unknown scenario "gibt-es-nicht"/);
  });
});

describe('Determinismus: gleicher Key + baseDate ⇒ identische Daten', () => {
  it('standard zweimal geladen ergibt denselben Case-Digest', async () => {
    const first = await load('standard');
    const digest1 = await caseDigest();

    const second = await load('standard');
    const digest2 = await caseDigest();

    expect(second).toEqual(first); // identische Headline-Summary
    expect(digest2).toBe(digest1); // identische Case-Tupel (Feld für Feld)
  });
});
