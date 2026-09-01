-- Ware holen als eigener Gang je Person (Kundenwunsch 01.09.2026): der eingeladene
-- Helfer holt die Ware bzw. seinen Teil davon selbst und hakt sie hier ab. Der
-- Haken des Inhabers bleibt am Beleg (goods_receipt_cases."collectedAt") — ein
-- gemeinsamer Haken hätte für alle gegolten, sobald einer ihn setzt.
ALTER TABLE "case_participants" ADD COLUMN "collectedAt" TIMESTAMP(3);
