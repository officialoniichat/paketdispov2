-- Instruktions-Loop je Einzel-Meldung (Kundenfeedback 04.08.2026).
-- 1) Verlaufstabelle issue_messages: Erst-Meldung des MA, TL-Instruktion je
--    Meldung, MA-Rückmeldung — ersetzt das pauschale issues.resolution-Feld.
-- 2) IssueStatus wird auf den Loop verengt: open | instruction_sent.

-- Neue Enums
CREATE TYPE "IssueMessageKind" AS ENUM ('meldung', 'instruktion', 'rueckmeldung');
CREATE TYPE "IssueAuthorRole" AS ENUM ('employee', 'teamlead');

-- Verlaufstabelle
CREATE TABLE "issue_messages" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorRole" "IssueAuthorRole" NOT NULL,
    "kind" "IssueMessageKind" NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "issue_messages_issueId_idx" ON "issue_messages"("issueId");

ALTER TABLE "issue_messages"
    ADD CONSTRAINT "issue_messages_issueId_fkey"
    FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Überführung: die bestehende Erst-Meldung des MA wird der erste Verlaufs-Eintrag.
INSERT INTO "issue_messages" ("id", "issueId", "authorId", "authorName", "authorRole", "kind", "text", "createdAt")
SELECT
    'imm_' || i."id",
    i."id",
    i."employeeId",
    COALESCE(u."displayName", 'Mitarbeiter'),
    'employee',
    'meldung',
    COALESCE(i."description", i."reasonLabel", i."kind"::text),
    i."reportedAt"
FROM "issues" i
LEFT JOIN "users" u ON u."id" = i."employeeId";

-- Überführung: eine vorhandene Pauschal-Klärung (resolution) wird zur Instruktion.
INSERT INTO "issue_messages" ("id", "issueId", "authorId", "authorName", "authorRole", "kind", "text", "createdAt")
SELECT
    'imi_' || i."id",
    i."id",
    COALESCE(i."releasedBy", 'teamlead'),
    'Teamleitung',
    'teamlead',
    'instruktion',
    i."resolution",
    COALESCE(i."releasedAt", i."reportedAt")
FROM "issues" i
WHERE i."resolution" IS NOT NULL;

-- IssueStatus auf den Instruktions-Loop verengen:
-- resolved/rejected => instruction_sent, alles andere => open.
CREATE TYPE "IssueStatus_new" AS ENUM ('open', 'instruction_sent');
ALTER TABLE "issues" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "issues"
    ALTER COLUMN "status" TYPE "IssueStatus_new"
    USING (
        CASE
            WHEN "status"::text IN ('resolved', 'rejected') THEN 'instruction_sent'
            ELSE 'open'
        END
    )::"IssueStatus_new";
DROP TYPE "IssueStatus";
ALTER TYPE "IssueStatus_new" RENAME TO "IssueStatus";
ALTER TABLE "issues" ALTER COLUMN "status" SET DEFAULT 'open';

-- Pauschal-Felder sind durch den Verlauf ersetzt.
ALTER TABLE "issues" DROP COLUMN "resolution";
ALTER TABLE "issues" DROP COLUMN "releasedBy";
ALTER TABLE "issues" DROP COLUMN "releasedAt";
