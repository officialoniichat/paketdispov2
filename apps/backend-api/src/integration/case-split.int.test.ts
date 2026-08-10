import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import { EventLogService } from '../events/event-log.service.js';
import { WorkflowService } from '../workflow/workflow.service.js';
import { LiveStatusService } from '../live/live.module.js';
import { TeamleadService } from '../cases/teamlead.service.js';
import { TeamleadReadService } from '../cases/teamlead-read.service.js';
import { Role, type Principal } from '../auth/rbac.js';

/**
 * Beleg-Aufteilung in ECHTE Teil-Belege gegen eine reale Postgres (Testcontainers) —
 * also inklusive der Migration, die `parentCaseId`/`partNo` und den Status
 * `split_container` einführt.
 *
 * Geprüft wird das, was die Modellentscheidung tragen muss: die Teile sind
 * eigenständige Belege mit eigenen Positionen und Größenzeilen, das Original ist
 * danach nur noch Klammer (nicht zuteilbar, nicht im Pool, nicht in den Ablagen),
 * es geht keine Ware verloren, und „mit Zuweisung" ist derselbe Mechanismus plus
 * ein normaler Zuweisungsschritt.
 */

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATE = '2026-06-15';
const NOW = new Date(`${DATE}T08:00:00.000Z`);

const teamlead: Principal = {
  sub: 'oidc-tl-1',
  employeeNo: 'tl-001',
  roles: [Role.Teamlead],
  claims: {},
};

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let teamleadSvc: TeamleadService;
let read: TeamleadReadService;
let locationId: string;

function asDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/**
 * Ein Monster-Beleg mit `positions` Positionen à `sizes` Größenzeilen à `each` Stück.
 * Eigene Belegnummer je Fall, damit die Tests einander nicht beeinflussen.
 */
async function seedMonster(
  weBelegNo: string,
  positions: number,
  sizes: number,
  each: number,
): Promise<{ id: string; totalQuantity: number }> {
  const totalQuantity = positions * sizes * each;
  const created = await prisma.goodsReceiptCase.create({
    data: {
      source: 'manual',
      externalRef: `split-${weBelegNo}`,
      weBelegNo,
      bookingDate: asDay(DATE),
      branchNo: '1',
      storageLocationId: locationId,
      section: 2,
      totalQuantity,
      status: 'ready',
      effortPoints: 600,
      estimatedMinutes: 600,
      workInstruction: { create: { priceLabelPrintRequired: true, zstRequired: true } },
    },
  });
  for (let p = 1; p <= positions; p += 1) {
    await prisma.receiptPosition.create({
      data: {
        caseId: created.id,
        positionNo: p,
        wgr: '218110',
        supplierArticleNo: `ART-${p}`,
        supplierColor: 'schwarz',
        branchNo: '1',
        shopNo: '21',
        instruction: { create: { securityRequired: true, securityLocation: 'Etikett innen' } },
        skuLines: {
          create: Array.from({ length: sizes }, (_, i) => ({
            ean: `40000${p}${i}`,
            size: `${36 + i}`,
            expectedQuantity: each,
          })),
        },
      },
    });
  }
  return { id: created.id, totalQuantity };
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();
  execSync('pnpm exec prisma migrate deploy', {
    cwd: BACKEND_DIR,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
  prisma = new PrismaClient({ datasourceUrl: url });
  const p = prisma as unknown as PrismaService;
  const events = new EventLogService(p);
  const workflow = new WorkflowService(p, events);
  teamleadSvc = new TeamleadService(p, workflow, events, new LiveStatusService());
  read = new TeamleadReadService(p);

  const loc = await prisma.location.create({
    data: { code: 'PA-9', displayName: 'Palette A/9', kind: 'palette_a', sequenceIndex: 59 },
  });
  locationId = loc.id;
  await prisma.user.create({ data: { employeeNo: 'tl-001', displayName: 'TL' } });
  const anna = await prisma.user.create({
    data: { employeeNo: 'ma-301', displayName: 'Anna', bereiche: ['Palette'] },
  });
  await prisma.shift.create({
    data: {
      employeeId: anna.id,
      date: asDay(DATE),
      plannedStart: new Date(`${DATE}T07:00:00.000Z`),
      plannedEnd: new Date(`${DATE}T15:00:00.000Z`),
      plannedHours: 8,
      netCapacityMinutes: 480,
    },
  });
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe('Aufteilen ohne Zuweisung', () => {
  it('legt eigenständige Teil-Belege an, die die Automatik regulär verteilen kann', async () => {
    // 2.400 Teile: 12 Positionen × 8 Größen × 25 Stück — der Monster-Fall.
    const source = await seedMonster('WE-SPLIT-1', 12, 8, 25);
    expect(source.totalQuantity).toBe(2400);

    const result = await teamleadSvc.splitCase(
      teamlead,
      source.id,
      { parts: [{ quantity: 800 }, { quantity: 800 }, { quantity: 800 }], reason: 'Zu groß' },
      NOW,
    );

    expect(result.parts).toHaveLength(3);
    expect(result.parts.map((p) => p.partNo)).toEqual([1, 2, 3]);
    expect(result.parts.map((p) => p.weBelegNo)).toEqual([
      'WE-SPLIT-1 (1)',
      'WE-SPLIT-1 (2)',
      'WE-SPLIT-1 (3)',
    ]);
    expect(result.parts.every((p) => p.assignedEmployeeNo === null)).toBe(true);

    // Keine Ware verloren.
    expect(result.parts.reduce((sum, p) => sum + p.quantity, 0)).toBe(2400);

    const parts = await prisma.goodsReceiptCase.findMany({
      where: { parentCaseId: source.id },
      orderBy: { partNo: 'asc' },
      include: {
        workInstruction: true,
        positions: { include: { instruction: true, skuLines: true } },
      },
    });
    expect(parts).toHaveLength(3);

    // Jeder Teil ist ein vollwertiger Beleg: bereit, unzugeteilt, mit eigener
    // Arbeitsanweisung, eigenen Positionen und eigenen Größenzeilen.
    for (const part of parts) {
      expect(part.status).toBe('ready');
      expect(part.assignedBundleId).toBeNull();
      expect(part.workInstruction?.priceLabelPrintRequired).toBe(true);
      expect(part.positions.length).toBeGreaterThan(0);
      expect(part.positions.every((p) => p.instruction?.securityRequired === true)).toBe(true);
      const lineSum = part.positions.reduce(
        (sum, p) => sum + p.skuLines.reduce((s, l) => s + l.expectedQuantity, 0),
        0,
      );
      expect(lineSum).toBe(part.totalQuantity);
      // Positions-Nummern starten je Teil wieder bei 1 und sind lückenlos.
      expect(part.positions.map((p) => p.positionNo).sort((a, b) => a - b)).toEqual(
        part.positions.map((_, i) => i + 1),
      );
    }

    // Der Aufwand ist mengenproportional umgelegt und summiert sich exakt auf.
    const minutes = parts.reduce((sum, p) => sum + p.estimatedMinutes, 0);
    expect(Math.round(minutes * 100) / 100).toBe(600);

    // Das Original ist nur noch Klammer.
    const containerCase = await prisma.goodsReceiptCase.findUniqueOrThrow({
      where: { id: source.id },
      include: { positions: true },
    });
    expect(containerCase.status).toBe('split_container');
    expect(containerCase.assignedBundleId).toBeNull();
    expect(containerCase.positions).toHaveLength(0);

    // Und fällt aus den Ablagen heraus, während die Teile dort auftauchen.
    const ablagen = await read.listAblagenPool();
    const weBelegNos = ablagen.items.map((i) => i.weBelegNo);
    expect(weBelegNos).not.toContain('WE-SPLIT-1');
    expect(weBelegNos).toContain('WE-SPLIT-1 (1)');

    // Teile unter der Schwelle sind wieder normal auto-verteilbar.
    const monsterFlags = ablagen.items
      .filter((i) => i.weBelegNo.startsWith('WE-SPLIT-1'))
      .map((i) => i.isMonster);
    expect(monsterFlags).toEqual([false, false, false]);

    // Das Original referenziert seine Teile, die Teile zeigen zurück.
    const page = await read.listPool({ scope: 'alle', q: 'WE-SPLIT-1', limit: 50 });
    const containerItem = page.items.find((i) => i.weBelegNo === 'WE-SPLIT-1');
    expect(containerItem?.partCount).toBe(3);
    const firstPart = page.items.find((i) => i.weBelegNo === 'WE-SPLIT-1 (1)');
    expect(firstPart?.parentCaseId).toBe(source.id);
    expect(firstPart?.partNo).toBe(1);

    // Audit.
    const event = await prisma.workflowEvent.findFirstOrThrow({
      where: { eventType: 'case.split', entityId: source.id },
    });
    expect(event.actorType).toBe('teamlead');
  });
});

describe('Aufteilen mit Zuweisung', () => {
  it('nutzt denselben Mechanismus und hängt den Teil zusätzlich ins Bündel', async () => {
    const source = await seedMonster('WE-SPLIT-2', 4, 5, 30);

    const result = await teamleadSvc.splitCase(
      teamlead,
      source.id,
      {
        parts: [{ quantity: 300, employeeNo: 'ma-301' }, { quantity: 300 }],
        reason: 'Anna übernimmt die Hälfte',
      },
      NOW,
    );

    expect(result.parts[0]?.assignedEmployeeNo).toBe('ma-301');
    expect(result.parts[1]?.assignedEmployeeNo).toBeNull();

    const assigned = await prisma.goodsReceiptCase.findUniqueOrThrow({
      where: { id: result.parts[0]!.caseId },
      include: { assignedBundle: { include: { employee: true } } },
    });
    expect(assigned.status).toBe('assigned');
    expect(assigned.assignedBundle?.employee.employeeNo).toBe('ma-301');

    const free = await prisma.goodsReceiptCase.findUniqueOrThrow({
      where: { id: result.parts[1]!.caseId },
    });
    expect(free.status).toBe('ready');
    expect(free.assignedBundleId).toBeNull();
  });
});

describe('Schutzregeln', () => {
  it('lehnt eine Aufteilung ab, deren Teilmengen den Beleg nicht abdecken', async () => {
    const source = await seedMonster('WE-SPLIT-3', 3, 4, 20);
    await expect(
      teamleadSvc.splitCase(
        teamlead,
        source.id,
        { parts: [{ quantity: 100 }, { quantity: 50 }], reason: 'unvollständig' },
        NOW,
      ),
    ).rejects.toThrow(/vollständig aufgeteilt/);
  });

  it('lehnt das erneute Aufteilen eines Teil-Belegs ab', async () => {
    const source = await seedMonster('WE-SPLIT-4', 4, 4, 25);
    const result = await teamleadSvc.splitCase(
      teamlead,
      source.id,
      { parts: [{ quantity: 200 }, { quantity: 200 }], reason: 'geteilt' },
      NOW,
    );
    await expect(
      teamleadSvc.splitCase(
        teamlead,
        result.parts[0]!.caseId,
        { parts: [{ quantity: 100 }, { quantity: 100 }], reason: 'nochmal' },
        NOW,
      ),
    ).rejects.toThrow(/bereits ein Teil-Beleg/);
  });

  it('lehnt mehr Teile ab, als es Größenzeilen gibt', async () => {
    const source = await seedMonster('WE-SPLIT-5', 1, 2, 10);
    await expect(
      teamleadSvc.splitCase(
        teamlead,
        source.id,
        { parts: [{ quantity: 7 }, { quantity: 7 }, { quantity: 6 }], reason: 'zu fein' },
        NOW,
      ),
    ).rejects.toThrow(/Größenzeilen/);
  });
});
