-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('imported', 'parsed', 'needs_review', 'ready', 'parked', 'assigned', 'picking', 'preparing', 'sorting', 'checking', 'labeling', 'securing', 'boxing', 'issue_open', 'waiting_teamlead', 'released', 'partially_completed', 'completed', 'zst_done', 'cancelled');

-- CreateEnum
CREATE TYPE "ParseStatus" AS ENUM ('pending', 'parsed', 'needs_review', 'failed');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('delivery_note', 'goods_receipt', 'work_instruction', 'unknown');

-- CreateEnum
CREATE TYPE "DocumentSource" AS ENUM ('prohandel_api', 'erp_export', 'pdf_folder', 'print_job', 'manual_upload');

-- CreateEnum
CREATE TYPE "PriorityFlag" AS ENUM ('prio', 'catman_due', 'overdue', 'manual_teamlead_priority', 'same_day_required');

-- CreateEnum
CREATE TYPE "GoodsTypeText" AS ENUM ('Vororder', 'Nachorder', 'Sonderposten', 'NOS', 'NOOS', 'Extrabestellung', 'NOS-Nachorder', 'Prio');

-- CreateEnum
CREATE TYPE "LocationKind" AS ENUM ('regal', 'palette_a', 'palette_b', 'palette_c', 'palette_e', 'haengebahn', 'lagerplatz_d', 'workstation', 'printer', 'conveyor_packages', 'conveyor_finished_goods');

-- CreateEnum
CREATE TYPE "CheckMode" AS ENUM ('quantity_only', 'percentage_check', 'full_check');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('created', 'assigned', 'accepted', 'active', 'paused', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "AssignmentCreatedBy" AS ENUM ('system', 'teamlead');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('open', 'in_review', 'waiting_external', 'resolved', 'rejected');

-- CreateEnum
CREATE TYPE "IssueScope" AS ENUM ('case', 'position', 'sku_line', 'transport_box');

-- CreateEnum
CREATE TYPE "IssueType" AS ENUM ('missing_quantity', 'overdelivery', 'wrong_article', 'wrong_color', 'wrong_size', 'damaged_goods', 'missing_package', 'label_problem', 'security_problem', 'printer_problem', 'other');

-- CreateEnum
CREATE TYPE "PositionStatus" AS ENUM ('open', 'confirmed', 'issue_open', 'completed');

-- CreateEnum
CREATE TYPE "SkuLineStatus" AS ENUM ('open', 'confirmed', 'deviation');

-- CreateEnum
CREATE TYPE "BoxGoodsType" AS ENUM ('vororder', 'nachorder', 'sopo', 'nos', 'extrabestellung', 'nos_nachorder', 'prio', 'mixed');

-- CreateEnum
CREATE TYPE "BoxLabelStatus" AS ENUM ('not_required', 'pending', 'printed', 'reprinted');

-- CreateEnum
CREATE TYPE "ZstSource" AS ENUM ('mobile_app', 'teamlead_dashboard', 'manual_import');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('system', 'employee', 'teamlead', 'admin');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "employeeNo" TEXT NOT NULL,
    "email" TEXT,
    "displayName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "plannedStart" TIMESTAMP(3) NOT NULL,
    "plannedEnd" TIMESTAMP(3) NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "plannedHours" DOUBLE PRECISION NOT NULL,
    "netCapacityMinutes" DOUBLE PRECISION NOT NULL,
    "workstationId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workstations" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locationId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "workstations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "kind" "LocationKind" NOT NULL,
    "zone" TEXT,
    "sequenceIndex" INTEGER,
    "scanCode" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sets" (
    "id" TEXT NOT NULL,
    "source" "DocumentSource" NOT NULL,
    "importKey" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bookingDate" DATE,
    "weBelegNo" TEXT,
    "deliveryNoteNo" TEXT,
    "parseConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "ParseStatus" NOT NULL DEFAULT 'pending',

    CONSTRAINT "document_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "documentSetId" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT,
    "sizeBytes" INTEGER,
    "parserVersion" TEXT,
    "parseStatus" "ParseStatus" NOT NULL DEFAULT 'pending',
    "parseWarnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_cases" (
    "id" TEXT NOT NULL,
    "documentSetId" TEXT NOT NULL,
    "weBelegNo" TEXT NOT NULL,
    "deliveryNoteNo" TEXT,
    "bookingDate" DATE NOT NULL,
    "weDate" DATE,
    "branchNo" TEXT NOT NULL,
    "primaryShopAreaNo" TEXT,
    "primaryFloor" TEXT,
    "storageLocationId" TEXT NOT NULL,
    "section" INTEGER,
    "goodsTypeText" "GoodsTypeText",
    "priorityFlags" "PriorityFlag"[] DEFAULT ARRAY[]::"PriorityFlag"[],
    "catManDate" DATE,
    "loadPlanDate" DATE,
    "totalQuantity" INTEGER NOT NULL DEFAULT 0,
    "status" "CaseStatus" NOT NULL DEFAULT 'imported',
    "effortPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimatedMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "assignedBundleId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goods_receipt_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_instruction_headers" (
    "caseId" TEXT NOT NULL,
    "priceLabelPrintRequired" BOOLEAN NOT NULL DEFAULT false,
    "sortByArticleColorSizeRequired" BOOLEAN NOT NULL DEFAULT false,
    "goodsReceiptCheckMode" "CheckMode" NOT NULL DEFAULT 'quantity_only',
    "goodsReceiptCheckPercentage" DOUBLE PRECISION,
    "minimumQuantityCheckAlwaysRequired" BOOLEAN NOT NULL DEFAULT true,
    "boxLabelRequired" BOOLEAN NOT NULL DEFAULT false,
    "zstRequired" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "work_instruction_headers_pkey" PRIMARY KEY ("caseId")
);

-- CreateTable
CREATE TABLE "receipt_positions" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "positionNo" INTEGER NOT NULL,
    "wgr" TEXT NOT NULL,
    "supplierArticleNo" TEXT NOT NULL,
    "supplierColor" TEXT NOT NULL,
    "season" TEXT,
    "nosFlag" BOOLEAN,
    "branchNo" TEXT NOT NULL,
    "shopNo" TEXT NOT NULL,
    "hShopNo" TEXT,
    "floor" TEXT,
    "onlineRelevant" BOOLEAN,
    "sustainabilityFlag" TEXT,
    "labelType" TEXT,
    "status" "PositionStatus" NOT NULL DEFAULT 'open',

    CONSTRAINT "receipt_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position_instructions" (
    "positionId" TEXT NOT NULL,
    "priceLabelRequired" BOOLEAN NOT NULL DEFAULT false,
    "priceLabelAttachRequired" BOOLEAN NOT NULL DEFAULT false,
    "priceLabelAttachLocation" TEXT,
    "securityRequired" BOOLEAN NOT NULL DEFAULT false,
    "securityLocation" TEXT,
    "onlineHandlingRequired" BOOLEAN NOT NULL DEFAULT false,
    "onlineHandlingLocation" TEXT,
    "redPriceRequired" BOOLEAN,
    "notes" TEXT,

    CONSTRAINT "position_instructions_pkey" PRIMARY KEY ("positionId")
);

-- CreateTable
CREATE TABLE "receipt_sku_lines" (
    "id" TEXT NOT NULL,
    "receiptPositionId" TEXT NOT NULL,
    "ean" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "expectedQuantity" INTEGER NOT NULL DEFAULT 0,
    "confirmedQuantity" INTEGER,
    "ekPrice" DOUBLE PRECISION,
    "vkPrice" DOUBLE PRECISION,
    "vkLabelPrice" DOUBLE PRECISION,
    "status" "SkuLineStatus" NOT NULL DEFAULT 'open',

    CONSTRAINT "receipt_sku_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "load_plan_rules" (
    "id" TEXT NOT NULL,
    "shopAreaNo" TEXT NOT NULL,
    "floor" TEXT,
    "section" INTEGER,
    "weekday" INTEGER,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "load_plan_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "priority_rules" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "priority_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "effort_rules" (
    "id" TEXT NOT NULL,
    "driverKey" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "params" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "effort_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_bundles" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "plannedEffortMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "effortPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'created',
    "createdBy" "AssignmentCreatedBy" NOT NULL DEFAULT 'system',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignment_bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_items" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "assignment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_stops" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "locationId" TEXT NOT NULL,
    "locationCode" TEXT NOT NULL,
    "orderIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scanRequired" BOOLEAN NOT NULL DEFAULT true,
    "skipAllowedWithReason" BOOLEAN NOT NULL DEFAULT false,
    "scannedAt" TIMESTAMP(3),

    CONSTRAINT "route_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issues" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "scope" "IssueScope" NOT NULL,
    "scopeId" TEXT,
    "employeeId" TEXT NOT NULL,
    "issueType" "IssueType" NOT NULL,
    "description" TEXT,
    "photoKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "IssueStatus" NOT NULL DEFAULT 'open',
    "resolution" TEXT,
    "releasedBy" TEXT,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_boxes" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "boxNo" INTEGER NOT NULL,
    "branchNo" TEXT NOT NULL,
    "shopAreaNo" TEXT NOT NULL,
    "shopNo" TEXT,
    "hShopNo" TEXT,
    "floor" TEXT,
    "goodsType" "BoxGoodsType",
    "goodsTypeText" "GoodsTypeText",
    "positionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "plannedQuantity" INTEGER NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "labelStatus" "BoxLabelStatus" NOT NULL DEFAULT 'not_required',
    "labelPrinted" BOOLEAN NOT NULL DEFAULT false,
    "sealed" BOOLEAN NOT NULL DEFAULT false,
    "sealCode" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transport_boxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zst_records" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "completedQuantity" INTEGER NOT NULL DEFAULT 0,
    "effortPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3) NOT NULL,
    "source" "ZstSource" NOT NULL DEFAULT 'mobile_app',
    "exportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zst_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_events" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "correlationId" TEXT,

    CONSTRAINT "workflow_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_employeeNo_key" ON "users"("employeeNo");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_name_key" ON "permissions"("name");

-- CreateIndex
CREATE INDEX "shifts_date_idx" ON "shifts"("date");

-- CreateIndex
CREATE UNIQUE INDEX "shifts_employeeId_date_key" ON "shifts"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "workstations_code_key" ON "workstations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "locations_code_key" ON "locations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "locations_scanCode_key" ON "locations"("scanCode");

-- CreateIndex
CREATE INDEX "locations_kind_idx" ON "locations"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "document_sets_importKey_key" ON "document_sets"("importKey");

-- CreateIndex
CREATE INDEX "document_sets_weBelegNo_idx" ON "document_sets"("weBelegNo");

-- CreateIndex
CREATE UNIQUE INDEX "documents_storageKey_key" ON "documents"("storageKey");

-- CreateIndex
CREATE INDEX "documents_documentSetId_idx" ON "documents"("documentSetId");

-- CreateIndex
CREATE UNIQUE INDEX "documents_documentSetId_sha256_key" ON "documents"("documentSetId", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipt_cases_weBelegNo_key" ON "goods_receipt_cases"("weBelegNo");

-- CreateIndex
CREATE INDEX "goods_receipt_cases_status_idx" ON "goods_receipt_cases"("status");

-- CreateIndex
CREATE INDEX "goods_receipt_cases_bookingDate_idx" ON "goods_receipt_cases"("bookingDate");

-- CreateIndex
CREATE INDEX "goods_receipt_cases_section_idx" ON "goods_receipt_cases"("section");

-- CreateIndex
CREATE INDEX "receipt_positions_caseId_idx" ON "receipt_positions"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_positions_caseId_positionNo_key" ON "receipt_positions"("caseId", "positionNo");

-- CreateIndex
CREATE INDEX "receipt_sku_lines_receiptPositionId_idx" ON "receipt_sku_lines"("receiptPositionId");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_sku_lines_receiptPositionId_ean_size_key" ON "receipt_sku_lines"("receiptPositionId", "ean", "size");

-- CreateIndex
CREATE INDEX "load_plan_rules_shopAreaNo_idx" ON "load_plan_rules"("shopAreaNo");

-- CreateIndex
CREATE UNIQUE INDEX "load_plan_rules_shopAreaNo_floor_validFrom_key" ON "load_plan_rules"("shopAreaNo", "floor", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "priority_rules_key_key" ON "priority_rules"("key");

-- CreateIndex
CREATE UNIQUE INDEX "effort_rules_driverKey_key" ON "effort_rules"("driverKey");

-- CreateIndex
CREATE INDEX "assignment_bundles_employeeId_date_idx" ON "assignment_bundles"("employeeId", "date");

-- CreateIndex
CREATE INDEX "assignment_bundles_status_idx" ON "assignment_bundles"("status");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_items_bundleId_caseId_key" ON "assignment_items"("bundleId", "caseId");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_items_caseId_key" ON "assignment_items"("caseId");

-- CreateIndex
CREATE INDEX "route_stops_bundleId_idx" ON "route_stops"("bundleId");

-- CreateIndex
CREATE UNIQUE INDEX "route_stops_bundleId_sequence_key" ON "route_stops"("bundleId", "sequence");

-- CreateIndex
CREATE INDEX "issues_caseId_idx" ON "issues"("caseId");

-- CreateIndex
CREATE INDEX "issues_status_idx" ON "issues"("status");

-- CreateIndex
CREATE UNIQUE INDEX "transport_boxes_sealCode_key" ON "transport_boxes"("sealCode");

-- CreateIndex
CREATE INDEX "transport_boxes_caseId_idx" ON "transport_boxes"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "transport_boxes_caseId_boxNo_key" ON "transport_boxes"("caseId", "boxNo");

-- CreateIndex
CREATE UNIQUE INDEX "zst_records_idempotencyKey_key" ON "zst_records"("idempotencyKey");

-- CreateIndex
CREATE INDEX "zst_records_caseId_idx" ON "zst_records"("caseId");

-- CreateIndex
CREATE INDEX "zst_records_exportedAt_idx" ON "zst_records"("exportedAt");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_events_idempotencyKey_key" ON "workflow_events"("idempotencyKey");

-- CreateIndex
CREATE INDEX "workflow_events_entityType_entityId_idx" ON "workflow_events"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "workflow_events_eventType_idx" ON "workflow_events"("eventType");

-- CreateIndex
CREATE INDEX "workflow_events_correlationId_idx" ON "workflow_events"("correlationId");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "workstations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workstations" ADD CONSTRAINT "workstations_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_documentSetId_fkey" FOREIGN KEY ("documentSetId") REFERENCES "document_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_cases" ADD CONSTRAINT "goods_receipt_cases_documentSetId_fkey" FOREIGN KEY ("documentSetId") REFERENCES "document_sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_cases" ADD CONSTRAINT "goods_receipt_cases_storageLocationId_fkey" FOREIGN KEY ("storageLocationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_cases" ADD CONSTRAINT "goods_receipt_cases_assignedBundleId_fkey" FOREIGN KEY ("assignedBundleId") REFERENCES "assignment_bundles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_instruction_headers" ADD CONSTRAINT "work_instruction_headers_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "goods_receipt_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_positions" ADD CONSTRAINT "receipt_positions_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "goods_receipt_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_instructions" ADD CONSTRAINT "position_instructions_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "receipt_positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_sku_lines" ADD CONSTRAINT "receipt_sku_lines_receiptPositionId_fkey" FOREIGN KEY ("receiptPositionId") REFERENCES "receipt_positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_bundles" ADD CONSTRAINT "assignment_bundles_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_items" ADD CONSTRAINT "assignment_items_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "assignment_bundles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_items" ADD CONSTRAINT "assignment_items_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "goods_receipt_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "assignment_bundles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "goods_receipt_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_boxes" ADD CONSTRAINT "transport_boxes_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "goods_receipt_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zst_records" ADD CONSTRAINT "zst_records_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "goods_receipt_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zst_records" ADD CONSTRAINT "zst_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
