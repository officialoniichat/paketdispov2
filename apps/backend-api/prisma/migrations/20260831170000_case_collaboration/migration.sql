-- Beleg gemeinsam bearbeiten / geteilter Beleg (Kundenanforderung L&T 31.08.2026,
-- docs/concept/beleg-zusammenarbeit-concept.md).
--
-- EIN Beleg, mehrere Bearbeitende, alle sehen alle Positionen. Die Zusammenarbeit ist
-- ein Overlay „Beteiligte je Beleg" (case_participants) — kein zweites AssignmentItem,
-- kein neuer CaseStatus: der Beleg liegt weiterhin in genau EINEM Buendel, Engine,
-- Pack-Fenster, Buendel-Abschluss und Kapazitaet bleiben unveraendert am Inhaber.
-- „Mein Teil ist fertig" (teil_erledigt) ist ein Zustand des Beteiligten, nicht des
-- Belegs.
--
-- Gemeinsame Arbeit braucht eine gemeinsame Wahrheit: „Position geprueft" (bisher
-- reiner Client-Zustand, ging beim Neuladen verloren) und die Preiskorrektur je Groesse
-- werden ab jetzt pro Aktion persistiert — fuer ALLE Belege, nicht nur geteilte.

-- CreateEnum
CREATE TYPE "CaseParticipantRole" AS ENUM ('inhaber', 'helfer');

-- CreateEnum
CREATE TYPE "CaseParticipantStatus" AS ENUM ('eingeladen', 'angenommen', 'abgelehnt', 'teil_erledigt', 'entfernt');

-- CreateTable
CREATE TABLE "case_participants" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "role" "CaseParticipantRole" NOT NULL,
    "status" "CaseParticipantStatus" NOT NULL,
    "invitedById" TEXT,
    "invitedByLabel" TEXT NOT NULL,
    "message" TEXT,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "partDoneAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "removedByLabel" TEXT,

    CONSTRAINT "case_participants_pkey" PRIMARY KEY ("id")
);

-- AlterTable: „Position geprueft" serverseitig — wer hat wann geprueft (NULL = ungeprueft).
ALTER TABLE "receipt_positions" ADD COLUMN "confirmedAt" TIMESTAMP(3),
ADD COLUMN "confirmedById" TEXT;

-- AlterTable: Preiskorrektur je Groesse, pro Aktion persistiert (wie confirmedQuantity).
ALTER TABLE "receipt_sku_lines" ADD COLUMN "correctedVkPrice" DOUBLE PRECISION;

-- CreateIndex: genau eine Beteiligung je Beleg und Mitarbeiter (erneutes Einladen
-- nach abgelehnt/entfernt setzt dieselbe Zeile wieder auf eingeladen).
CREATE UNIQUE INDEX "case_participants_caseId_employeeId_key" ON "case_participants"("caseId", "employeeId");

-- CreateIndex: Posteingang/„Geteilt mit dir"-Abfragen je Mitarbeiter und Status.
CREATE INDEX "case_participants_employeeId_status_idx" ON "case_participants"("employeeId", "status");

-- AddForeignKey: Beteiligungen haengen am Beleg und verschwinden mit ihm.
ALTER TABLE "case_participants" ADD CONSTRAINT "case_participants_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "goods_receipt_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: der Beteiligte selbst ist Pflicht (Loeschen eines Mitarbeiters raeumt
-- seine Beteiligungen vorher explizit ab, EmployeesService.remove).
ALTER TABLE "case_participants" ADD CONSTRAINT "case_participants_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: der Einladende ist optional (Teamlead/System = NULL); der Anzeigename
-- bleibt als Snapshot in invitedByLabel erhalten.
ALTER TABLE "case_participants" ADD CONSTRAINT "case_participants_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Pruefer der Position; geprueft bleibt geprueft, auch wenn der Nutzer
-- spaeter geloescht wird (SET NULL).
ALTER TABLE "receipt_positions" ADD CONSTRAINT "receipt_positions_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
