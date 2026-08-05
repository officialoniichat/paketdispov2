import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import { TeamleadReadService } from '../cases/teamlead-read.service.js';

/**
 * §10.2 Digitale Ablagen — Vollständigkeit des steuerbaren Pools.
 *
 * Regression (Kundenfeedback 05.08.2026): das Cockpit speiste die Ablagen aus
 * EINER Seite der Belege-Liste (`listPool({page:1, limit:200})`). Bei 688 Belegen
 * fielen dadurch ALLE Problemfälle aus dem Fenster — die Lane stand auf „Leer",
 * obwohl ein Mitarbeiter Meldungen geschickt hatte. Die Ablagen sind
 * Ausnahme-Queues; sie dürfen nichts abschneiden.
 */

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Über der alten 200er-Seitengrenze, damit der Regressionsfall echt greift. */
const FUELLER = 250;

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let readSvc: TeamleadReadService;

interface SeededIds {
  /** issue_open, sortiert JENSEITS der ersten 200 Zeilen. */
  problemHinten: string;
  /** assigned — auf dem Mitarbeiterboard, gehört in keine Lane. */
  zugewiesen: string;
  /** in_progress + weitergeleitet — C5: bleibt sichtbar, egal welcher Status. */
  weitergeleitetInArbeit: string;
}

async function seed(): Promise<SeededIds> {
  const regal = await prisma.location.create({
    data: { code: 'R1', displayName: 'Regal 1', kind: 'regal', sequenceIndex: 1 },
  });

  const base = {
    source: 'manual' as const,
    branchNo: '001',
    primaryShopNo: '21',
    totalQuantity: 10,
    effortPoints: 5,
    estimatedMinutes: 10,
    storageLocationId: regal.id,
  };

  // 250 ältere ready-Belege füllen die erste Seite der Belege-Liste komplett.
  await prisma.goodsReceiptCase.createMany({
    data: Array.from({ length: FUELLER }, (_, i) => ({
      ...base,
      externalRef: `ap-fill-${i}`,
      weBelegNo: `WE-AP-F${String(i).padStart(4, '0')}`,
      status: 'ready' as const,
      // Alle ÄLTER als die Sonderfälle → unter `bookingDate asc` stehen sie vorn.
      bookingDate: new Date('2026-06-01T00:00:00.000Z'),
    })),
  });

  const spaet = { ...base, bookingDate: new Date('2026-06-20T00:00:00.000Z') };

  const problemHinten = await prisma.goodsReceiptCase.create({
    data: { ...spaet, externalRef: 'ap-issue', weBelegNo: 'WE-AP-ISSUE', status: 'issue_open' },
  });
  const zugewiesen = await prisma.goodsReceiptCase.create({
    data: { ...spaet, externalRef: 'ap-assigned', weBelegNo: 'WE-AP-ASSIGNED', status: 'assigned' },
  });
  const weitergeleitetInArbeit = await prisma.goodsReceiptCase.create({
    data: {
      ...spaet,
      externalRef: 'ap-fwd',
      weBelegNo: 'WE-AP-FWD',
      status: 'in_progress',
      forwardedTo: 'Retoure',
    },
  });

  return {
    problemHinten: problemHinten.id,
    zugewiesen: zugewiesen.id,
    weitergeleitetInArbeit: weitergeleitetInArbeit.id,
  };
}

let ids: SeededIds;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();
  execSync('pnpm exec prisma migrate deploy', {
    cwd: BACKEND_DIR,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
  prisma = new PrismaClient({ datasourceUrl: url });
  readSvc = new TeamleadReadService(prisma as unknown as PrismaService);
  ids = await seed();
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe('§10.2 Digitale Ablagen — vollständiger Pool', () => {
  it('zeigt einen Problemfall, der jenseits der 200-Zeilen-Seite liegt', async () => {
    // Beweis, dass der Fall wirklich hinter der Seitengrenze liegt: die erste
    // Seite der Belege-Liste enthält ihn NICHT — genau der Produktionsfehler.
    const seite1 = await readSvc.listPool({ page: 1, limit: 200 });
    expect(seite1.items).toHaveLength(200);
    expect(seite1.items.some((i) => i.id === ids.problemHinten)).toBe(false);

    // Die Ablagen sehen ihn trotzdem.
    const ablagen = await readSvc.listAblagenPool();
    const problem = ablagen.items.find((i) => i.id === ids.problemHinten);
    expect(problem).toBeDefined();
    expect(problem?.status).toBe('issue_open');
  });

  it('nimmt jeden Pool-Residenten auf und schneidet nichts ab', async () => {
    const ablagen = await readSvc.listAblagenPool();
    // 250 ready + 1 issue_open + 1 weitergeleitet (assigned ist KEIN Resident).
    expect(ablagen.total).toBe(FUELLER + 2);
    expect(ablagen.items).toHaveLength(ablagen.total);
  });

  it('lässt zugewiesene Belege draußen — die gehören aufs Mitarbeiterboard', async () => {
    const ablagen = await readSvc.listAblagenPool();
    expect(ablagen.items.some((i) => i.id === ids.zugewiesen)).toBe(false);
  });

  it('behält weitergeleitete Belege unabhängig vom Status (C5)', async () => {
    const ablagen = await readSvc.listAblagenPool();
    const fwd = ablagen.items.find((i) => i.id === ids.weitergeleitetInArbeit);
    expect(fwd).toBeDefined();
    // in_progress wäre für sich genommen kein Resident — die Weiterleitung zählt.
    expect(fwd?.status).toBe('in_progress');
    expect(fwd?.forwardedTo).toBe('Retoure');
  });
});
