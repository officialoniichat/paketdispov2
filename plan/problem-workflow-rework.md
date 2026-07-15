# Plan: Problem-/Teilabschluss-Workflow Rework + Positionen-Tabelle (Kundenfeedback 14.07.2026)

Branch: `feat/problem-workflow-rework` (off `main` @ e9b092f)

## Zieldesign

### Neues Problem-Modell (ersetzt IssueType-Enum + Beleg-weites Problem-Melden)

- **`ProblemReason`** (neue Prisma-Tabelle): admin-verwalteter Katalog `{ id, label, active, sortOrder }`.
  Seed mit den bisherigen deutschen Enum-Labels. Admin-CRUD im Teamlead-Cockpit (Tab „Problemarten").
  PWA lädt den Katalog dynamisch (`GET /api/problem-reasons`).
- **`Issue`** umgebaut: `issueType`-Enum-Feld → `kind ProblemKind (manual | over_delivery | under_delivery | price_deviation)`
  + `reasonId`/`reasonLabel`-Snapshot (nur bei `manual`), Payload-Felder `deviationQty`, `expectedVkPrice`, `correctedVkPrice`.
  Scope bleibt (`position` | `sku_line`); `case`-Scope-Probleme entfallen (Punkt 8).
- IssueType-Enum + `issueTypeLabels` werden GELÖSCHT (Prisma, domain-types, ui-labels).

### Neuer Teilabschluss-Loop (State-Machine)

- `in_progress → issue_open` : Teilabschluss MIT gesammelten Problemen (`POST /api/cases/:id/partial-complete`,
  body `{ completedQuantity, skuQuantities[], problems[] }`, ≥1 Problem Pflicht, kein Freitext-Grund mehr).
  Backend erzeugt Issues (manuell + implizit aus SKU-Deltas/Preiskorrekturen), persistiert `confirmedQuantity`
  je SKU, schreibt proportionalen ZST, Case bleibt beim SELBEN MA (Bündel bleibt offen).
- `issue_open` : rot beim MA geparkt, NICHT bearbeitbar; Teamlead sieht Problemfall mit allen Positions-Problemen.
- `issue_open → problem_resolved` : Teamlead „Probleme geklärt" (`POST /api/teamlead/cases/:id/resolve-problems`,
  löst ALLE offenen Issues, optionale Anmerkung). Grün beim MA.
- `problem_resolved → in_progress` : MA setzt fort (bestehender `start-preparation`-Endpoint bekommt die Kante).
- `in_progress → completed` : „Beleg erledigt" nur wenn KEINE offenen Probleme + keine Abweichungen
  (Backend-Guard in complete; nimmt jetzt auch `skuQuantities` entgegen und prüft Deltas).
- GELÖSCHT: Status `partially_completed`, TL-`reactivate`-Endpoint, Freitext-Teilabschluss-Dialog,
  `POST /api/issues` (Employee-Einzelmeldung), ProblemMeldenScreen + Route.

### Positionen-Tabelle (BelegProcessScreen)

1. `ReceiptPosition.catManDate` (neu, Prisma + DTO) — Anzeige als Datum-Chip pro Position (Seed: aus Case-catManDate).
2. `hShopNo` in ReceiptPositionDto ergänzen; Kopfzeile: `HShop X · Shop Y` in Art-Nr-Typo-Größe.
3. Sticky Table-Header (`position: sticky` auf TableHead-Zellen, top: 0, zIndex, bg).
4. Neue Spalte „VK korrigiert": Zahleneingabe je SKU-Zeile hinter VK-Etikett → lokale Preiskorrektur
   (implizites Problem, erzwingt Teilabschluss).
5. Problem-Erfassung inline: pro Position/SKU Dialog (Grund aus dynamischem Katalog + Notiz),
   lokal in CaseProgress gesammelt; farbliche Markierung (roter Rand/Chip mit Grund-Label) an Position/SKU.
6. Implizite Probleme (Ist≠Soll, Preiskorrektur) automatisch markiert; „Beleg erledigt" gesperrt sobald Probleme.
7. Teilabschluss-Dialog = Zusammenfassung der gesammelten Probleme + Bestätigen (kein Freitext).

### Teamlead-Cockpit

- Problemfälle-Lane/Beleg-Detail: Liste aller Issues (Grund-Label, Position/EAN, Delta, Preis alt→neu),
  Aktion „Probleme geklärt" → Case wird grün beim MA. WE-Nr + Lieferschein prominent (Ordernummer-Ersatz).
- Admin-Tab „Problemarten": Liste editierbar (Label, aktiv, Reihenfolge), `GET/PUT /api/admin/problem-reasons`
  (Replace-all-Upsert nach Locations-Muster, referenzierte Gründe nur deaktivierbar).

### Offene Frage Ordernummer

Keine Ordernummer im Datenmodell (ReceiptPosition/mock-ERP/ASN geprüft — kein Feld).
→ Gap dokumentieren in `docs/review/ordernummer-gap.md`; Klärungs-UI zeigt stattdessen WE-Beleg-Nr + Lieferschein-Nr.

## Phasen (je Conventional Commit)

- **A** feat(backend): ProblemReason-Katalog + Issue-Umbau + neue State-Machine + Endpoints (+Prisma-Migration, OpenAPI regen)
- **B** feat(employee-pwa): Positionen-Tabelle (sticky, CatMan, Shops, Preiskorrektur) + Problem-Erfassung + neuer Teilabschluss + Dashboard rot/grün; ProblemMeldenScreen löschen
- **C** feat(teamlead-web): Klärungs-UX + Admin „Problemarten"; reactivate/partially_completed-Reste löschen
- **D** chore/docs: Seeds/Szenarien/Tests-Sweep, Handbuch-Abschnitte, C4 (domain-model, c3-backend, c3-pwa, c3-teamlead), ordernummer-gap.md

## Risiken

- `partially_completed`-Entfernung streut in Seeds/Szenarien/Tests/Lanes/Handbuch → Phase D Sweep + typecheck-Gate.
- assignment-engine: prüfen, ob Status-Filter `partially_completed`/`issue_open` referenzieren.
- test:int-Baseline war schon vor der Änderung teilrot (66/82) — nur Regressionen relativ zur Baseline werten.
