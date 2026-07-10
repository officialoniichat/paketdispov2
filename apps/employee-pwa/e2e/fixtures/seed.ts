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
import { MA_101, MA_102, type SeedEmployeeSpec } from './seed-data.js';

/** Midnight UTC "today" — must match `startOfTodayUtc()` in cases.service.ts
 *  exactly, since `GET /api/me/today` looks up the bundle by this exact date. */
function todayMidnightUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
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
  }
}

export async function seedDatabase(databaseUrl: string): Promise<void> {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    await seedEmployee(prisma, MA_101);
    await seedEmployee(prisma, MA_102);
  } finally {
    await prisma.$disconnect();
  }
}
