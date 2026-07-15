-- Problem-/Teilabschluss-Workflow Rework (Kundenfeedback 14.07.2026).
-- 1. CaseStatus: `partially_completed` entfällt (alter Teilabschluss-Loop),
--    `problem_resolved` kommt hinzu (Teamlead hat geklärt, grün beim selben MA).
-- 2. IssueType-Enum → admin-verwalteter ProblemReason-Katalog + ProblemKind
--    (manual | implizite Mengen-/Preisabweichung) mit Payload-Feldern.
-- 3. ReceiptPosition.catManDate (Anzeige des CatMan-Termins pro Position).

-- --- CaseStatus enum swap ----------------------------------------------------
-- Alte Teilabschlüsse werden zu `ready` (Rest zurück in den Pool — der alte
-- Reaktivierungs-Pfad), damit kein Wert des alten Enums verloren geht.
CREATE TYPE "CaseStatus_new" AS ENUM ('needs_review', 'blocked', 'ready', 'parked', 'assigned', 'in_progress', 'issue_open', 'problem_resolved', 'completed', 'zst_done', 'cancelled');
ALTER TABLE "goods_receipt_cases" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "goods_receipt_cases"
  ALTER COLUMN "status" TYPE "CaseStatus_new"
  USING (
    CASE WHEN "status"::text = 'partially_completed' THEN 'ready'
         ELSE "status"::text
    END::"CaseStatus_new"
  );
DROP TYPE "CaseStatus";
ALTER TYPE "CaseStatus_new" RENAME TO "CaseStatus";
ALTER TABLE "goods_receipt_cases" ALTER COLUMN "status" SET DEFAULT 'ready';

-- --- ProblemReason catalog ---------------------------------------------------
CREATE TABLE "problem_reasons" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problem_reasons_pkey" PRIMARY KEY ("id")
);

-- Startkatalog: die bisherigen manuellen Problemarten (Mengen-Abweichungen sind
-- jetzt implizite Probleme und kein manueller Grund mehr).
INSERT INTO "problem_reasons" ("id", "label", "active", "sortOrder", "updatedAt") VALUES
  ('pr_wrong_article',    'falscher Artikel',   true, 10, CURRENT_TIMESTAMP),
  ('pr_wrong_color',      'falsche Farbe',      true, 20, CURRENT_TIMESTAMP),
  ('pr_wrong_size',       'falsche Größe',      true, 30, CURRENT_TIMESTAMP),
  ('pr_damaged_goods',    'beschädigt',         true, 40, CURRENT_TIMESTAMP),
  ('pr_missing_package',  'Paket fehlt',        true, 50, CURRENT_TIMESTAMP),
  ('pr_label_problem',    'Etikettenproblem',   true, 60, CURRENT_TIMESTAMP),
  ('pr_security_problem', 'Sicherungsproblem',  true, 70, CURRENT_TIMESTAMP),
  ('pr_printer_problem',  'Druckerproblem',     true, 80, CURRENT_TIMESTAMP),
  ('pr_other',            'Sonstiges',          true, 90, CURRENT_TIMESTAMP);

-- --- Issue: IssueType → ProblemKind + Katalog-Referenz + Payload -------------
CREATE TYPE "ProblemKind" AS ENUM ('manual', 'over_delivery', 'under_delivery', 'price_deviation');

ALTER TABLE "issues"
  ADD COLUMN "kind" "ProblemKind" NOT NULL DEFAULT 'manual',
  ADD COLUMN "reasonId" TEXT,
  ADD COLUMN "reasonLabel" TEXT,
  ADD COLUMN "deviationQty" INTEGER,
  ADD COLUMN "expectedVkPrice" DOUBLE PRECISION,
  ADD COLUMN "correctedVkPrice" DOUBLE PRECISION;

-- Bestehende Meldungen: Mengen-Typen werden implizite Probleme, der Rest wird
-- auf den Startkatalog gemappt (Label-Snapshot bleibt lesbar).
UPDATE "issues" SET "kind" = 'under_delivery' WHERE "issueType"::text = 'missing_quantity';
UPDATE "issues" SET "kind" = 'over_delivery'  WHERE "issueType"::text = 'overdelivery';
UPDATE "issues" i
  SET "reasonId" = 'pr_' || i."issueType"::text,
      "reasonLabel" = pr."label"
  FROM "problem_reasons" pr
  WHERE pr."id" = 'pr_' || i."issueType"::text
    AND i."issueType"::text NOT IN ('missing_quantity', 'overdelivery');

ALTER TABLE "issues" DROP COLUMN "issueType";
DROP TYPE "IssueType";

ALTER TABLE "issues" ADD CONSTRAINT "issues_reasonId_fkey"
  FOREIGN KEY ("reasonId") REFERENCES "problem_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- --- ReceiptPosition.catManDate + orderNo -----------------------------------
ALTER TABLE "receipt_positions" ADD COLUMN "catManDate" DATE;
-- Ordernummer der Position (Referenz zur Fehlerlösung, Kundenfeedback 14.07.2026).
ALTER TABLE "receipt_positions" ADD COLUMN "orderNo" TEXT;
