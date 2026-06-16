import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import { EventLogService } from '../events/event-log.service.js';
import { WorkflowService } from '../workflow/workflow.service.js';
import { LiveStatusService } from '../live/live.module.js';
import { TeamleadReadService } from '../cases/teamlead-read.service.js';
import { TeamleadService } from '../cases/teamlead.service.js';
import { Role, type Principal } from '../auth/rbac.js';

/**
 * §10.4 GET /api/teamlead/cases/:caseId — the rich Belegdetails read backing the
 * teamlead detail page. Seeds a case with positions (+ SKU lines + instruction
 * flags), a transport box, linked documents, an assignment + a teamlead event,
 * and asserts the detail returns the header, positions, boxes, documents, and
 * history; a missing case 404s.
 */

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATE = '2026-06-15';

const teamlead: Principal = {
  sub: 'oidc-tl-1',
  employeeNo: 'tl-001',
  roles: [Role.Teamlead],
  claims: {},
};

function asDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let readSvc: TeamleadReadService;
let teamleadSvc: TeamleadService;

async function seed(): Promise<{ caseId: string }> {
  const emp = await prisma.user.create({ data: { employeeNo: 'ma-201', displayName: 'Dora' } });
  const loc = await prisma.location.create({
    data: { code: 'R12', displayName: 'Regal 12', kind: 'regal', sequenceIndex: 12 },
  });
  const docSet = await prisma.documentSet.create({
    data: { source: 'pdf_folder', importKey: 'det-set-1', status: 'parsed' },
  });
  await prisma.document.createMany({
    data: [
      {
        documentSetId: docSet.id,
        kind: 'work_instruction',
        fileName: 'arbeitsanweisung.pdf',
        mimeType: 'application/pdf',
        storageKey: 'det/ai.pdf',
      },
      {
        documentSetId: docSet.id,
        kind: 'goods_receipt',
        fileName: 'we-beleg.pdf',
        mimeType: 'application/pdf',
        storageKey: 'det/we.pdf',
      },
    ],
  });

  const c = await prisma.goodsReceiptCase.create({
    data: {
      documentSetId: docSet.id,
      weBelegNo: 'WE-DET-1',
      deliveryNoteNo: 'LS-9001',
      bookingDate: asDate(DATE),
      branchNo: '1',
      primaryShopAreaNo: '21',
      primaryFloor: 'EG',
      storageLocationId: loc.id,
      section: 2,
      goodsTypeText: 'Vororder',
      catManDate: asDate(DATE),
      loadPlanDate: asDate(DATE),
      totalQuantity: 30,
      status: 'assigned',
      effortPoints: 12,
      estimatedMinutes: 24,
    },
  });

  await prisma.workInstructionHeader.create({
    data: {
      caseId: c.id,
      priceLabelPrintRequired: true,
      goodsReceiptCheckMode: 'percentage_check',
      goodsReceiptCheckPercentage: 20,
      boxLabelRequired: true,
      zstRequired: true,
    },
  });

  await prisma.receiptPosition.create({
    data: {
      caseId: c.id,
      positionNo: 1,
      wgr: '4711',
      supplierArticleNo: 'ART-001',
      supplierColor: 'schwarz',
      branchNo: '1',
      shopNo: '21',
      status: 'open',
      instruction: { create: { priceLabelRequired: true, securityRequired: true } },
      skuLines: {
        create: [
          { ean: '4000000000011', size: '38', expectedQuantity: 10, confirmedQuantity: 8 },
          { ean: '4000000000028', size: '40', expectedQuantity: 10, confirmedQuantity: 10 },
        ],
      },
    },
  });
  await prisma.receiptPosition.create({
    data: {
      caseId: c.id,
      positionNo: 2,
      wgr: '4712',
      supplierArticleNo: 'ART-002',
      supplierColor: 'blau',
      branchNo: '1',
      shopNo: '21',
      status: 'open',
      instruction: { create: { onlineHandlingRequired: true } },
      skuLines: { create: [{ ean: '4000000000035', size: 'M', expectedQuantity: 10 }] },
    },
  });

  await prisma.transportBox.create({
    data: { caseId: c.id, boxNo: 1, branchNo: '1', shopAreaNo: '21', plannedQuantity: 30 },
  });

  const bundle = await prisma.assignmentBundle.create({
    data: { employeeId: emp.id, date: asDate(DATE), status: 'assigned' },
  });
  await prisma.goodsReceiptCase.update({
    where: { id: c.id },
    data: { assignedBundleId: bundle.id },
  });
  await prisma.assignmentItem.create({ data: { bundleId: bundle.id, caseId: c.id } });

  // A genuine teamlead event so history is non-empty.
  await teamleadSvc.prioritize(teamlead, c.id, { reason: 'CatMan heute' });

  return { caseId: c.id };
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
  const live = new LiveStatusService();
  readSvc = new TeamleadReadService(p);
  teamleadSvc = new TeamleadService(p, workflow, events, live);
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe('case detail (§10.4 GET /api/teamlead/cases/:caseId)', () => {
  it('returns header + positions + boxes + documents + history', async () => {
    const { caseId } = await seed();

    const detail = await readSvc.caseDetail(caseId);

    // Header
    expect(detail.case.id).toBe(caseId);
    expect(detail.case.weBelegNo).toBe('WE-DET-1');
    expect(detail.case.goodsType).toBe('Vororder');
    expect(detail.case.assignedEmployeeName).toBe('Dora');
    expect(detail.deliveryNoteNo).toBe('LS-9001');
    expect(detail.primaryShopAreaNo).toBe('21');
    expect(detail.primaryFloor).toBe('EG');
    expect(detail.catManDate).toBe(DATE);
    expect(detail.loadPlanDate).toBe(DATE);
    expect(detail.goodsType).toBe('Vororder');

    // Work instruction
    expect(detail.workInstruction?.goodsReceiptCheckMode).toBe('percentage_check');
    expect(detail.workInstruction?.zstRequired).toBe(true);

    // Positions + SKU lines + aggregated quantities + instruction flags
    expect(detail.positions).toHaveLength(2);
    const [p1, p2] = detail.positions;
    expect(p1?.positionNo).toBe(1);
    expect(p1?.priceLabelRequired).toBe(true);
    expect(p1?.securityRequired).toBe(true);
    expect(p1?.onlineHandlingRequired).toBe(false);
    expect(p1?.expectedQuantity).toBe(20);
    expect(p1?.confirmedQuantity).toBe(18);
    expect(p1?.skuLines).toHaveLength(2);
    expect(p2?.onlineHandlingRequired).toBe(true);
    // No SKU line on p2 is confirmed yet → aggregate is null, not 0.
    expect(p2?.confirmedQuantity).toBeNull();

    // Transport boxes
    expect(detail.transportBoxes).toHaveLength(1);
    expect(detail.transportBoxes[0]?.boxNo).toBe(1);
    expect(detail.transportBoxes[0]?.plannedQuantity).toBe(30);

    // Documents
    expect(detail.documents).toHaveLength(2);
    expect(detail.documents.map((d) => d.kind).sort()).toEqual([
      'goods_receipt',
      'work_instruction',
    ]);

    // History (newest first) includes the teamlead prioritize
    expect(detail.history.length).toBeGreaterThan(0);
    expect(detail.history.some((e) => e.eventType === 'case.prioritized')).toBe(true);
    for (let i = 1; i < detail.history.length; i++) {
      expect(detail.history[i - 1]!.seq).toBeGreaterThan(detail.history[i]!.seq);
    }
  });

  it('404s a missing case', async () => {
    await expect(readSvc.caseDetail('does-not-exist')).rejects.toBeInstanceOf(NotFoundException);
  });
});
