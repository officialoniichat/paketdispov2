-- Pack-Isolation (Pull-Prinzip): das Pack wird persistiert statt aus den
-- `bundle.created`/`bundle.extended` Audit-Events rekonstruiert.
--
-- `packIndex`: Pack (Engine-Arbeitseinheit) des Items innerhalb seines Bündels —
--   0 = Starter-Pack, dann aufsteigend je Folge-Pack.
-- `activePackIndex`: das Pack, an dem der Mitarbeiter gerade arbeitet. Nur dessen
--   Belege sieht die Mitarbeiter-App.
--
-- Backfill: Bestandsdaten laufen als EIN Pack (0) weiter — die Sichtbarkeit
-- bleibt für laufende Bündel damit unverändert.
ALTER TABLE "assignment_items" ADD COLUMN "packIndex" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "assignment_bundles" ADD COLUMN "activePackIndex" INTEGER NOT NULL DEFAULT 0;
