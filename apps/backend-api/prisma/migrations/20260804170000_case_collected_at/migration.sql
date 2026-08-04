-- Ware-holen-Haken (B2): wann der MA die Ware des Belegs am Lagerplatz geholt hat
-- (Tipp oder Lagerplatz-Scan); null = noch nicht geholt bzw. wieder abgehakt.
ALTER TABLE "goods_receipt_cases" ADD COLUMN "collectedAt" TIMESTAMP(3);
