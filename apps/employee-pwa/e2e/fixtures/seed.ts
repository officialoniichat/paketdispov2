/**
 * Seeds four employees, each with their OWN AssignmentBundle + RouteStops +
 * GoodsReceiptCases, so the e2e suite can prove real per-employee data
 * isolation through the actual backend (not a mock). The raw constants live in
 * `seed-data.ts`.
 *
 * `LoginService.login()` defaults an employee with no `UserRole` rows to
 * `Role.Employee` (see `apps/backend-api/src/auth/login.service.ts`), so this
 * seed does not need to create `Role`/`UserRole` rows at all — and since the
 * Mitarbeiterrolle needs no secret, it seeds no `pinHash` either.
 *
 * Bündel werden hier DIREKT geschrieben, nicht über die assignment-engine.
 * `POST /api/teamlead/assignments/recalculate` darf deshalb NICHT im Setup
 * laufen: `clearPriorPlanForDate()` löscht die Bündel des Tages und stellt die
 * `assigned`-Belege in den `ready`-Pool zurück; da dieser Seed keine `Shift`-Zeilen
 * anlegt, hat die Engine anschließend niemanden, dem sie zuteilen könnte — das
 * Bündel wäre leer und „Ware holen" hätte nichts zu zeigen. Empirisch geprüft:
 * recalculate meldet danach `bundleCount: 0`, `/api/me/today` liefert `bundle: null`.
 */
import { PrismaClient } from './prisma-client.js';
import {
  MA_101,
  MA_102,
  MA_103,
  MA_104,
  MA_105,
  ONLINE_SIZE_PREFERENCE,
  type SeedBelegSpec,
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
 * Positions + Größen (SKU lines) with EK/VK/VK-Etikett prices. Without these a
 * Beleg has no positions at all and the Positionen-Tabelle has nothing to lay out.
 */
async function seedPositions(
  prisma: PrismaClient,
  caseId: string,
  positions: readonly SeedPositionSpec[],
): Promise<void> {
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

/** Ein Beleg samt optionaler Arbeitsanweisung + Positionen, gehängt an Bündel + Lagerplatz. */
async function seedBeleg(
  prisma: PrismaClient,
  spec: SeedBelegSpec,
  context: { employeeNo: string; bundleId: string; locationId: string; sequence: number },
): Promise<void> {
  if (spec.positions && spec.priceLabelPrintRequired === undefined) {
    throw new Error(
      `Seed-Fehler: Beleg ${spec.weBelegNo} hat Positionen, aber keinen WorkInstructionHeader ` +
        `(priceLabelPrintRequired ist undefined). Der PROCESS-Screen braucht den Kopf.`,
    );
  }

  const goodsCase = await prisma.goodsReceiptCase.create({
    data: {
      source: 'manual',
      externalRef: `e2e-${context.employeeNo}-${context.sequence}`,
      weBelegNo: spec.weBelegNo,
      bookingDate: todayMidnightUtc(),
      branchNo: '1',
      storageLocationId: context.locationId,
      section: 7,
      totalQuantity: 10,
      status: 'assigned',
      effortPoints: 5,
      estimatedMinutes: 15,
      goodsTypeText: spec.goodsTypeText,
      assignedBundleId: context.bundleId,
    },
  });

  // `sequence` ist die Reihenfolge der Engine — `/api/me/today` sortiert danach.
  await prisma.assignmentItem.create({
    data: {
      bundleId: context.bundleId,
      caseId: goodsCase.id,
      sequence: spec.bundleSequence ?? context.sequence,
    },
  });

  // Kein Header ⇒ `/api/me/today` liefert `priceLabelPrintRequired: null` ⇒ kein Chip.
  if (spec.priceLabelPrintRequired !== undefined) {
    await prisma.workInstructionHeader.create({
      data: {
        caseId: goodsCase.id,
        priceLabelPrintRequired: spec.priceLabelPrintRequired,
        sortByArticleColorSizeRequired: true,
        boxLabelRequired: false,
        zstRequired: true,
      },
    });
  }

  if (spec.positions) await seedPositions(prisma, goodsCase.id, spec.positions);
}

async function seedEmployee(prisma: PrismaClient, spec: SeedEmployeeSpec): Promise<void> {
  const user = await prisma.user.create({
    data: { employeeNo: spec.employeeNo, displayName: spec.displayName, active: true },
  });

  const bundle = await prisma.assignmentBundle.create({
    data: { employeeId: user.id, date: todayMidnightUtc(), status: 'assigned' },
  });

  // `deriveStops()` in BundleHomeScreen verknüpft Stop und Beleg über den
  // locationCode — jeder Stop braucht deshalb seinen eigenen Lagerplatz.
  let caseSequence = 0;
  for (const [stopIndex, stop] of spec.stops.entries()) {
    const location = await prisma.location.create({
      data: {
        code: stop.locationCode,
        displayName: `E2E Regal ${stop.locationCode}`,
        kind: 'regal',
        sequenceIndex: stopIndex + 1,
      },
    });

    await prisma.routeStop.create({
      data: {
        bundleId: bundle.id,
        sequence: stopIndex + 1,
        locationId: location.id,
        locationCode: location.code,
        scanRequired: true,
      },
    });

    for (const beleg of stop.belege) {
      caseSequence += 1;
      await seedBeleg(prisma, beleg, {
        employeeNo: spec.employeeNo,
        bundleId: bundle.id,
        locationId: location.id,
        sequence: caseSequence,
      });
    }
  }
}

export async function seedDatabase(databaseUrl: string): Promise<void> {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    // The Online-Größen-Markierung is derived from this preference, so it must
    // exist before the positions that reference its WGR are read back.
    await prisma.onlineSizePreference.create({ data: { ...ONLINE_SIZE_PREFERENCE } });
    for (const employee of [MA_101, MA_102, MA_103, MA_104, MA_105]) {
      await seedEmployee(prisma, employee);
    }
  } finally {
    await prisma.$disconnect();
  }
}
