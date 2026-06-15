-- CreateEnum
CREATE TYPE "ShiftSource" AS ENUM ('seak', 'pattern', 'teamlead');

-- CreateEnum
CREATE TYPE "AbsenceKind" AS ENUM ('krank', 'urlaub', 'abwesend', 'teilabwesend');

-- AlterTable (Mitarbeiter-Einstellungen: per-head capacity/effort params)
ALTER TABLE "users" ADD COLUMN     "isPilot" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "areaTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "productivityFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "overtimeTolerancePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "weeklyPattern" JSONB;

-- AlterTable (shift provenance + applied per-head factor)
ALTER TABLE "shifts" ADD COLUMN     "source" "ShiftSource" NOT NULL DEFAULT 'seak',
ADD COLUMN     "productivityFactor" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "absences" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "dateFrom" DATE NOT NULL,
    "dateTo" DATE NOT NULL,
    "kind" "AbsenceKind" NOT NULL,
    "partialUntil" TEXT,
    "reason" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "absences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "absences_employeeId_idx" ON "absences"("employeeId");

-- CreateIndex
CREATE INDEX "absences_dateFrom_idx" ON "absences"("dateFrom");

-- AddForeignKey
ALTER TABLE "absences" ADD CONSTRAINT "absences_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
