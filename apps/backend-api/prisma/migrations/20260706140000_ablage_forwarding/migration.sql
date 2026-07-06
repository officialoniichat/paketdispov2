-- Digitale Ablage (C5): Weiterleitung eines Belegs an eine Abteilung/Person
-- (Katalog: retourenabteilung | lieferscheinbucher); NULL = nicht weitergeleitet.
-- AlterTable
ALTER TABLE "goods_receipt_cases" ADD COLUMN     "forwardedTo" TEXT;
