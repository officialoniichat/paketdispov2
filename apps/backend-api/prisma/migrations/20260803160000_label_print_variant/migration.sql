-- Etikett-Druckvariante je Position (Kundenfeedback L&T 03.08.2026).
-- Loest das boolean priceLabelRequired ab: es kannte nur "Etikett ja/nein" und
-- machte damit den Druck OHNE Preis (Digi-Tag-Ware) unsichtbar.

-- CreateEnum
CREATE TYPE "LabelPrintVariant" AS ENUM ('etikett_mit_preis', 'digitag_etikett_ohne_preis', 'kein_etikett');

-- AlterTable
ALTER TABLE "position_instructions" ADD COLUMN     "labelPrintVariant" "LabelPrintVariant" NOT NULL DEFAULT 'etikett_mit_preis';

-- Bestandsdaten uebernehmen: der bisherige stille Standard war "Etikett mit Preis",
-- ein false hiess "gar kein Etikett". Digi-Tag-Positionen gab es im Altbestand nicht.
UPDATE "position_instructions" SET "labelPrintVariant" = 'kein_etikett' WHERE "priceLabelRequired" = false;

-- AlterTable
ALTER TABLE "position_instructions" DROP COLUMN "priceLabelRequired";
