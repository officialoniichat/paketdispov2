-- Wer hat den Beleg an diese Stelle gelegt? Engine (system) oder Teamlead (§8.4).
-- Die Automatik (recalculate) räumt nur system-platzierte, unbegonnene Belege ab —
-- Teamlead-Platzierungen (Zuweisen, Einsortieren, Verschieben, vorgeplante Packs)
-- überleben die Neuberechnung.
ALTER TABLE "assignment_items" ADD COLUMN "createdBy" "AssignmentCreatedBy" NOT NULL DEFAULT 'system';
