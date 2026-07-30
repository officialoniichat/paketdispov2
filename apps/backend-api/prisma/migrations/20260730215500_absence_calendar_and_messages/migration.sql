-- Nachtrag der zwei per `db push` eingeführten Features als echte Migration
-- (Schichtplan-Kalender Krank/Urlaub + Teamlead-Nachrichten an die Mitarbeiter-App).
-- Ohne diese Datei blieb `prisma migrate deploy` (Railway-preDeploy) auf dem Stand
-- vom 15.07. stehen: `employee_absences` fehlte und JEDER /api/teamlead/board-Aufruf
-- fiel mit 500 (Tabelle existiert nicht) — unabhängig vom angefragten Datum.

-- CreateEnum
CREATE TYPE "AbsenceKind" AS ENUM ('krank', 'urlaub');

-- CreateTable
CREATE TABLE "employee_absences" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" "AbsenceKind" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_absences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teamlead_messages" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "caseId" TEXT,
    "text" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "teamlead_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_absences_startDate_endDate_idx" ON "employee_absences"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "teamlead_messages_employeeId_readAt_idx" ON "teamlead_messages"("employeeId", "readAt");

-- AddForeignKey
ALTER TABLE "employee_absences" ADD CONSTRAINT "employee_absences_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teamlead_messages" ADD CONSTRAINT "teamlead_messages_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
