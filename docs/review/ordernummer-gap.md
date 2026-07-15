# Ordernummer zur Fehlerlösung (Kundenfeedback 14.07.2026) — UMGESETZT

## Kundenwunsch

Im Feedback vom 14.07.2026 fragt der Kunde nach der **Ordernummer** zur
Fehlerlösung — als UX-Hilfe für den Teamlead, um einen Problemfall im ERP
eindeutig zuordnen zu können.

## Ausgangslage

Zum Zeitpunkt des Feedbacks existierte **keine** Order-/Bestellnummer im
Datenmodell. Die vorhandenen Bezeichner waren `weBelegNo` (WE-Beleg-Nr, eindeutig),
`deliveryNoteNo` (Lieferschein) und `externalRef` (ProHandel-Buchungsreferenz).

## Umsetzung

Die Ordernummer ist jetzt **auf Positions-Ebene** modelliert (ASN/DESADV:
Order-Identität gehört zur Position/Artikel, nicht zum Beleg-Kopf):

- **Prisma:** `ReceiptPosition.orderNo String?` (Migration
  `20260715152533_problem_workflow_rework`).
- **domain-types:** `receiptPositionSchema.orderNo`.
- **Backend-DTOs:** `ReceiptPositionDto.orderNo` (Positions-Anzeige) und
  `IssueSummaryDto.orderNo` (aus der betroffenen Position aufgelöst, `mapIssue`).
- **mock-ERP:** `beleg-generator.ts` erzeugt deterministisch `ORD-<no>-<pos>`;
  `beleg-persist.ts` persistiert es. Dev-Szenarien + e2e-Seeds ebenfalls.
- **Mitarbeiter-App:** Ordernummer in der Positions-Kopfzeile
  (`BelegProcessScreen`), gleiche Schriftgröße wie Art-Nr/Shop.
- **Teamlead-Klärung:** Ordernummer je Problem in der Bezugszeile
  (`BelegDetailPage` → `IssuesTab`), zusätzlich WE-Nr + Lieferschein am Kopf.

## Hinweis zur realen ERP-Quelle

Die Mock-Ordernummer (`ORD-<beleg>-<pos>`) ist ein Platzhalter. Für den Pilot ist
mit dem Kunden zu klären, aus welchem ProHandel-/ERP-Feld die reale Ordernummer
stammt (ProHandel-Order vs. Lieferanten-Auftragsnummer); der Connector
(`beleg-generator`/`beleg-persist`) mappt sie dann 1:1 auf `ReceiptPosition.orderNo`
— das Datenmodell und beide UIs sind bereits vorbereitet.
