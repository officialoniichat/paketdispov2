/**
 * Seeds two employees, each with their OWN AssignmentBundle + RouteStop +
 * GoodsReceiptCases, so the e2e suite can prove real per-employee data
 * isolation through the actual backend (not a mock). See the Task 16 report
 * (`.superpowers/sdd/task-16-report.md`) for the exact values and how to
 * verify them by hand; the raw constants live in `seed-data.ts`.
 *
 * `LoginService.login()` defaults an employee with no `UserRole` rows to
 * `Role.Employee` (see `apps/backend-api/src/auth/login.service.ts`), so this
 * seed does not need to create `Role`/`UserRole` rows at all — and since the
 * Mitarbeiterrolle needs no secret, it seeds no `pinHash` either.
 */
import { PrismaClient } from './prisma-client.js';
import {
  MA_101,
  MA_102,
  ONLINE_SIZE_PREFERENCE,
  type SeedEmployeeSpec,
  type SeedPositionSpec,
} from './seed-data.js';

/** Midnight UTC "today" — must match `startOfTodayUtc()` in cases.service.ts
 *  exactly, since `GET /api/me/today` looks up the bundle by this exact date. */
function todayMidnightUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Positions + Größen (SKU lines) with EK/VK/VK-Etikett prices, plus the work
 * instruction header the PROCESS screen renders above the Positionen-Tabelle.
 * Without these a Beleg has no positions at all and the table has nothing to
 * lay out.
 */
async function seedPositions(
  prisma: PrismaClient,
  caseId: string,
  positions: readonly SeedPositionSpec[],
): Promise<void> {
  await prisma.workInstructionHeader.create({
    data: {
      caseId,
      priceLabelPrintRequired: true,
      sortByArticleColorSizeRequired: true,
      boxLabelRequired: false,
      zstRequired: true,
    },
  });

  for (const spec of positions) {
    const position = await prisma.receiptPosition.create({
      data: {
        caseId,
        positionNo: spec.positionNo,
        wgr: spec.wgr,
        supplierArticleNo: spec.supplierArticleNo,
        supplierColor: spec.supplierColor,
        season: spec.season,
        branchNo: '1',
        shopNo: spec.shopNo,
        catMan: spec.catMan,
        onlineRelevant: spec.onlineRelevant,
      },
    });
    await prisma.positionInstruction.create({
      data: {
        positionId: position.id,
        priceLabelRequired: true,
        priceLabelAttachRequired: spec.priceLabelAttachLocation !== undefined,
        priceLabelAttachLocation: spec.priceLabelAttachLocation,
        securityRequired: spec.securityTypeCode !== undefined,
        securityTypeCode: spec.securityTypeCode,
        securityLocation: spec.securityLocation,
        onlineHandlingRequired: spec.onlineRelevant,
      },
    });
    await prisma.receiptSkuLine.createMany({
      data: spec.skuLines.map((line) => ({ receiptPositionId: position.id, ...line })),
    });
  }
}

async function seedEmployee(prisma: PrismaClient, spec: SeedEmployeeSpec): Promise<void> {
  const today = todayMidnightUtc();

  const user = await prisma.user.create({
    data: {
      employeeNo: spec.employeeNo,
      displayName: spec.displayName,
      active: true,
    },
  });

  const location = await prisma.location.create({
    data: {
      code: spec.locationCode,
      displayName: `E2E Regal ${spec.locationCode}`,
      kind: 'regal',
      sequenceIndex: 1,
    },
  });

  const bundle = await prisma.assignmentBundle.create({
    data: { employeeId: user.id, date: today, status: 'assigned' },
  });

  await prisma.routeStop.create({
    data: {
      bundleId: bundle.id,
      sequence: 1,
      locationId: location.id,
      locationCode: location.code,
      scanRequired: true,
    },
  });

  for (const [index, weBelegNo] of spec.weBelegNos.entries()) {
    const c = await prisma.goodsReceiptCase.create({
      data: {
        source: 'manual',
        externalRef: `e2e-${spec.employeeNo}-${index + 1}`,
        weBelegNo,
        bookingDate: today,
        branchNo: '1',
        storageLocationId: location.id,
        section: 7,
        totalQuantity: 10,
        status: 'assigned',
        effortPoints: 5,
        estimatedMinutes: 15,
      },
    });
    await prisma.goodsReceiptCase.update({
      where: { id: c.id },
      data: { assignedBundleId: bundle.id },
    });
    await prisma.assignmentItem.create({
      data: { bundleId: bundle.id, caseId: c.id, sequence: index + 1 },
    });
    if (index === 0 && spec.positions) await seedPositions(prisma, c.id, spec.positions);
  }
}

export async function seedDatabase(databaseUrl: string): Promise<void> {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    // The Online-Größen-Markierung is derived from this preference, so it must
    // exist before the positions that reference its WGR are read back.
    await prisma.onlineSizePreference.create({ data: { ...ONLINE_SIZE_PREFERENCE } });
    await seedEmployee(prisma, MA_101);
    await seedEmployee(prisma, MA_102);
  } finally {
    await prisma.$disconnect();
  }
}
