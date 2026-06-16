-- Cut CaseStatus from 20 to 10 values (alpha: dev DB reset, applied on a fresh DB).
-- Removes the work micro-states (picking..boxing), the issue-flow internals
-- (waiting_teamlead/released) and the ingest states (imported/parsed); adds in_progress.
-- Recreate the enum type and re-point the column (USING cast is trivial on empty tables).
ALTER TYPE "CaseStatus" RENAME TO "CaseStatus_old";

CREATE TYPE "CaseStatus" AS ENUM (
  'needs_review',
  'ready',
  'parked',
  'assigned',
  'in_progress',
  'issue_open',
  'partially_completed',
  'completed',
  'zst_done',
  'cancelled'
);

ALTER TABLE "goods_receipt_cases" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "goods_receipt_cases"
  ALTER COLUMN "status" TYPE "CaseStatus" USING ("status"::text::"CaseStatus");
ALTER TABLE "goods_receipt_cases" ALTER COLUMN "status" SET DEFAULT 'ready';

DROP TYPE "CaseStatus_old";
