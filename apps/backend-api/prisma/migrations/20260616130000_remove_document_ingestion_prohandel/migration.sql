-- ProHandel integration replaces the PDF/parser/document-ingestion concept.
-- Drops the document_sets/documents tables + their enums, and replaces the
-- GoodsReceiptCase.documentSetId FK with `source` (CaseSource) + `externalRef`
-- (the ProHandel booking reference). Cases now originate from the ProHandel API.

-- CreateEnum
CREATE TYPE "CaseSource" AS ENUM ('prohandel_api', 'manual');

-- DropForeignKey
ALTER TABLE "documents" DROP CONSTRAINT "documents_documentSetId_fkey";

-- DropForeignKey
ALTER TABLE "goods_receipt_cases" DROP CONSTRAINT "goods_receipt_cases_documentSetId_fkey";

-- AlterTable
ALTER TABLE "goods_receipt_cases" DROP COLUMN "documentSetId",
ADD COLUMN     "externalRef" TEXT NOT NULL,
ADD COLUMN     "source" "CaseSource" NOT NULL DEFAULT 'prohandel_api';

-- DropTable
DROP TABLE "document_sets";

-- DropTable
DROP TABLE "documents";

-- DropEnum
DROP TYPE "DocumentKind";

-- DropEnum
DROP TYPE "DocumentSource";

-- DropEnum
DROP TYPE "ParseStatus";
