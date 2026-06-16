-- Bereich is FIXED by a Lagerplatz's storage class (LocationKind), not a free-text
-- per-location tag. The engine derives a case's Bereich from `kind`, so the stored
-- column is dead and removed. Employee skills stay in users.bereiche.
ALTER TABLE "locations" DROP COLUMN IF EXISTS "bereich";
