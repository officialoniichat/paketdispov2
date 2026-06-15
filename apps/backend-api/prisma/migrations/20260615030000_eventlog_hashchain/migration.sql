-- AlterTable
ALTER TABLE "workflow_events" ADD COLUMN     "hash" TEXT NOT NULL,
ADD COLUMN     "prevHash" TEXT,
ADD COLUMN     "seq" BIGSERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "workflow_events_seq_key" ON "workflow_events"("seq");

