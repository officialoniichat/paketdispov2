-- Delivery-Group (Teamlead-Anforderung Punkt 1): T1 source key + „X von N" total and
-- the Teamlead manual override key (`grp:<key>` merge / `solo:<id>` isolate).
ALTER TABLE "goods_receipt_cases" ADD COLUMN "deliverySourceGroupKey" TEXT;
ALTER TABLE "goods_receipt_cases" ADD COLUMN "deliverySourceGroupSize" INTEGER;
ALTER TABLE "goods_receipt_cases" ADD COLUMN "manualDeliveryGroupKey" TEXT;
