-- Beleg-Aufteilung als ECHTE Teil-Belege (Teamlead-Fragenkatalog 07.08.2026).
--
-- Ein zu grosser Beleg wird in eigenstaendige Kind-Belege zerlegt, statt eine Zeile
-- virtuell als n Arbeitseinheiten zu deuten: der gesamte Stack (Engine, Buendel,
-- Status, ZST, Probleme, Positionen) rechnet pro Case-Zeile, deshalb laufen Teil-Belege
-- ueberall als ganz normale Belege mit.
--
-- Der Original-Beleg bleibt als fachliche Klammer bestehen, wechselt aber auf den neuen
-- Status split_container: er ist nicht mehr zuteilbar und faellt aus jeder Pool-Abfrage,
-- weil diese Abfragen im Stack Erlaubnislisten ueber CaseStatus sind.
ALTER TYPE "CaseStatus" ADD VALUE 'split_container';

-- parentCaseId = Container-Beleg (NULL bei normalen Belegen und beim Container selbst),
-- partNo = 1-basierte Nummer des Teils fuer die Anzeige „WE-2026-000207 (2)".
ALTER TABLE "goods_receipt_cases" ADD COLUMN "parentCaseId" TEXT;
ALTER TABLE "goods_receipt_cases" ADD COLUMN "partNo" INTEGER;

ALTER TABLE "goods_receipt_cases"
  ADD CONSTRAINT "goods_receipt_cases_parentCaseId_fkey"
  FOREIGN KEY ("parentCaseId") REFERENCES "goods_receipt_cases"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Eine Teilnummer je Container: schuetzt gegen doppelte „(2)" bei parallelen Splits.
CREATE UNIQUE INDEX "goods_receipt_cases_parentCaseId_partNo_key"
  ON "goods_receipt_cases"("parentCaseId", "partNo");

CREATE INDEX "goods_receipt_cases_parentCaseId_idx"
  ON "goods_receipt_cases"("parentCaseId");
