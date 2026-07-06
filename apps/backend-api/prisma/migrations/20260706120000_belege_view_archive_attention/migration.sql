-- Belege-Ansicht (A6/A7): DocuWare-Archivlink, TL-Topf-Aufmerksamkeitsflag, Abschlusszeitpunkt.
-- AlterTable
ALTER TABLE "goods_receipt_cases" ADD COLUMN     "docuWareUrl" TEXT,
ADD COLUMN     "attentionFlag" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "attentionNote" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3);
