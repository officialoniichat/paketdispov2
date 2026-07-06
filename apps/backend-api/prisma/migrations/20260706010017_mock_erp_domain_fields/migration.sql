-- CreateEnum
CREATE TYPE "SkillTier" AS ENUM ('profi', 'fortgeschritten', 'basis', 'starter', 'dummy');

-- CreateEnum
CREATE TYPE "InspectionLevelCode" AS ENUM ('none', 'p10', 'p20', 'full');

-- AlterTable
ALTER TABLE "goods_receipt_cases" ADD COLUMN     "inboundCartonCount" INTEGER,
ADD COLUMN     "primaryShopNo" TEXT;

-- AlterTable
ALTER TABLE "position_instructions" ADD COLUMN     "securityTypeCode" TEXT;

-- AlterTable
ALTER TABLE "receipt_positions" ADD COLUMN     "catMan" BOOLEAN;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "skillTier" "SkillTier" NOT NULL DEFAULT 'profi',
ADD COLUMN     "workstationId" TEXT;

-- AlterTable
ALTER TABLE "work_instruction_headers" ADD COLUMN     "inspectionLevelCode" "InspectionLevelCode";

-- CreateTable
CREATE TABLE "wgr_catalog" (
    "wgr" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "wgr_catalog_pkey" PRIMARY KEY ("wgr")
);

-- CreateTable
CREATE TABLE "inspection_levels" (
    "code" "InspectionLevelCode" NOT NULL,
    "label" TEXT NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "inspection_levels_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "online_size_preferences" (
    "id" TEXT NOT NULL,
    "wgr" TEXT NOT NULL,
    "sizeVariant" TEXT NOT NULL,
    "preferredSize" TEXT NOT NULL,
    "alternativeSize" TEXT,

    CONSTRAINT "online_size_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "online_size_preferences_wgr_sizeVariant_key" ON "online_size_preferences"("wgr", "sizeVariant");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "workstations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
