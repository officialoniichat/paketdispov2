-- Ein-offenes-Bündel-Invariante, hart in der Datenbank: je Mitarbeiter und Tag
-- höchstens EIN nicht abgeschlossenes Bündel. Ein zweites offenes Bündel
-- verschattet in der Mitarbeiter-App das laufende Pack (/api/me/today zeigt genau
-- eines) — jeder Race, der eines anlegen will, scheitert ab jetzt laut (P2002)
-- statt still die Invariante zu brechen. Prisma kann partielle Indizes nicht im
-- Schema abbilden; die Doku dazu steht am Model AssignmentBundle.
CREATE UNIQUE INDEX "one_open_bundle_per_employee_day"
  ON "assignment_bundles" ("employeeId", "date")
  WHERE status NOT IN ('completed', 'cancelled');
