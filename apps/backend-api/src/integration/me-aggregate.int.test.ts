import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import { EventLogService } from '../events/event-log.service.js';
import { WorkflowService } from '../workflow/workflow.service.js';
import { LiveStatusService } from '../live/live.module.js';
import { CasesService } from '../cases/cases.service.js';
import { Role, type Principal } from '../auth/rbac.js';

/**
 * §14.2 GET /api/me/cases/:id/aggregate — the employee-scoped read the PWA's
 * CaseAggregate needs (work-instruction header + receipt positions + transport
 * box targets). Verifies the §16.1 ownership guard: the owning employee reads
 * the full aggregate; a foreign employee is forbidden (403); a missing case 404.
 */

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const owner: Principal = {
  sub: 'oidc-emp-owner',
  employeeNo: 'E-OWNER',
  roles: [Role.Employee],
  claims: {},
};
const stranger: Principal = {
  sub: 'oidc-emp-stranger',
  employeeNo: 'E-STRANGER',
  roles: [Role.Employee],
  claims: {},
};

function todayMidnightUtc(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let cases: CasesService;

async function seed(): Promise<{ caseId: string }> {
  const ownerUser = await prisma.user.create({
    data: { employeeNo: 'E-OWNER', displayName: 'Olga Owner' },
  });
  await prisma.user.create({ data: { employeeNo: 'E-STRANGER', displayName: 'Stan Stranger' } });

  const loc = await prisma.location.create({
    data: { code: 'AGG-R1', displayName: 'Regal 1', kind: 'regal', sequenceIndex: 1 },
  });
  const docSet = await prisma.documentSet.create({
    data: { source: 'pdf_folder', importKey: 'agg-set-1', status: 'parsed' },
  });
  const day = todayMidnightUtc();

  const c = await prisma.goodsReceiptCase.create({
    data: {
      documentSetId: docSet.id,
      weBelegNo: 'WE-AGG-1',
      bookingDate: day,
      branchNo: '1',
      storageLocationId: loc.id,
      section: 7,
      totalQuantity: 30,
      status: 'assigned',
      effortPoints: 10,
      estimatedMinutes: 20,
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
  await prisma.receiptPosition.createMany({
    data: [
      {
        caseId: c.id,
        positionNo: 1,
        wgr: '4711',
        supplierArticleNo: 'ART-001',
        supplierColor: 'schwarz',
        branchNo: '1',
        shopNo: '21',
      },
      {
        caseId: c.id,
        positionNo: 2,
        wgr: '4712',
        supplierArticleNo: 'ART-002',
        supplierColor: 'blau',
        branchNo: '1',
        shopNo: '21',
      },
    ],
  });
  await prisma.transportBox.create({
    data: {
      caseId: c.id,
      boxNo: 1,
      branchNo: '1',
      shopAreaNo: '21',
      plannedQuantity: 30,
    },
  });

  // Assign the case to the owner via a bundle so the ownership guard sees it.
  const bundle = await prisma.assignmentBundle.create({
    data: { employeeId: ownerUser.id, date: day, status: 'assigned' },
  });
  await prisma.goodsReceiptCase.update({
    where: { id: c.id },
    data: { assignedBundleId: bundle.id },
  });
  await prisma.assignmentItem.create({ data: { bundleId: bundle.id, caseId: c.id } });

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
  cases = new CasesService(p, workflow, events, live);
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe('GET /api/me/cases/:id/aggregate (§14.2 + §16.1)', () => {
  it('returns header + positions + box targets for the owning employee', async () => {
    const { caseId } = await seed();

    const aggregate = await cases.getCaseAggregate(owner, caseId);

    expect(aggregate.case.id).toBe(caseId);
    expect(aggregate.case.weBelegNo).toBe('WE-AGG-1');

    expect(aggregate.workInstruction).not.toBeNull();
    expect(aggregate.workInstruction?.goodsReceiptCheckMode).toBe('percentage_check');
    expect(aggregate.workInstruction?.goodsReceiptCheckPercentage).toBe(20);
    expect(aggregate.workInstruction?.zstRequired).toBe(true);

    expect(aggregate.positions).toHaveLength(2);
    expect(aggregate.positions.map((p) => p.positionNo)).toEqual([1, 2]);
    expect(aggregate.positions[0]?.supplierArticleNo).toBe('ART-001');

    expect(aggregate.boxTargets).toHaveLength(1);
    expect(aggregate.boxTargets[0]?.boxNo).toBe(1);
    expect(aggregate.boxTargets[0]?.plannedQuantity).toBe(30);
  });

  it('forbids a foreign employee (403)', async () => {
    const c = await prisma.goodsReceiptCase.findFirstOrThrow({ where: { weBelegNo: 'WE-AGG-1' } });
    await expect(cases.getCaseAggregate(stranger, c.id)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404s a missing case', async () => {
    await expect(cases.getCaseAggregate(owner, 'does-not-exist')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
