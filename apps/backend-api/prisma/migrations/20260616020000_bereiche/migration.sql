-- Mitarbeiter Bereiche/Skills: rename free-text areaTags → bereiche (admin-catalog
-- labels), and tag each Lagerplatz with its Bereich for engine routing.
ALTER TABLE "users" RENAME COLUMN "areaTags" TO "bereiche";
ALTER TABLE "locations" ADD COLUMN "bereich" TEXT;
