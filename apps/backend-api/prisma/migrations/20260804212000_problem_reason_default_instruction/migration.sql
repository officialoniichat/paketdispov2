-- Standardanweisung je Problemart (Kundenfeedback 04.08.2026): Vorlagentext für
-- den Instruktions-Dialog der Teamleitung + Schalter, ob die Vorlage automatisch
-- vorausgefüllt (autoInsert=true) oder nur per Knopf eingefügt wird.
ALTER TABLE "problem_reasons" ADD COLUMN "defaultInstruction" TEXT;
ALTER TABLE "problem_reasons" ADD COLUMN "autoInsert" BOOLEAN NOT NULL DEFAULT false;
