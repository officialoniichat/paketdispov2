-- AlterEnum
ALTER TYPE "CaseStatus" ADD VALUE 'blocked';

-- DropForeignKey
ALTER TABLE "goods_receipt_cases" DROP CONSTRAINT "goods_receipt_cases_storageLocationId_fkey";

-- AlterTable
ALTER TABLE "goods_receipt_cases" ADD COLUMN     "deliveryGroupReleased" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "missingFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "storageLocationId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "goods_receipt_cases" ADD CONSTRAINT "goods_receipt_cases_storageLocationId_fkey" FOREIGN KEY ("storageLocationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
