# Terminologie — Paketlagerdispo

Verbindliches Vokabular für UI-Texte, Konzeptdokumente und Code-Kommentare.
Wenn ein Begriff hier steht, wird genau dieser benutzt — keine Synonyme.

## Glossar

| Begriff | Code | Bedeutung |
|---|---|---|
| **Beleg** | `GoodsReceiptCase` | Die kleinste **zuweisbare Einheit** — ein Wareneingangs-Vorgang (Lieferschein-Abschnitt). Hat einen Status (`ready`, `assigned`, …), einen Lagerplatz und Positionen. Der Beleg ist das, was ein Mitarbeitender abholt und bearbeitet. |
| **Bündel** | `AssignmentBundle` | Die **Tagesmenge an Belegen für genau einen Mitarbeitenden**, in Abhol-Reihenfolge. Pro Mitarbeitendem und Tag gibt es **höchstens ein** Bündel (die Engine emittiert ein Bündel je eingeplantem Kopf). Ein Bündel entsteht aus Belegen und kann manuell erweitert oder neu angelegt werden. |
| **Position** | `ReceiptPosition` | Eine Artikelzeile innerhalb eines Belegs (Artikel-Identität, NOS, Saison, Menge). |
| **Bereich** | abgeleitet aus `LocationKind` | Feste Skill-/Lagerklasse eines Belegs, bestimmt durch die Art seines Lagerplatzes (`bereichFromLocationKind`). Kein frei pflegbarer Katalog. |
| **Override** | `WorkflowEvent` (§8.4) | Ein manueller Teamlead-Eingriff mit Pflicht-Grund (z. B. „Beleg zuweisen", „Beleg entziehen"), der in den auditierten Ereignis-Log geschrieben wird. |

## Beziehung Beleg ↔ Bündel

Ein **Bündel** ist eine geordnete Sammlung von **Belegen**. „Einen Beleg zuweisen"
heißt: den Beleg **in das Bündel** des Mitarbeitenden legen — bzw. das Bündel
**anlegen**, falls der Mitarbeitende noch frei ist (erster Beleg = erstes Mitglied).

## Markennamen (kein Fachbegriff)

„**Paket**" ist **kein** Fachbegriff dieser Anwendung. Das Wort erscheint
ausschließlich als **Produkt-/Paketname** und bleibt dort unverändert:

- **Paketlagerdispo** — Produktname (App-/API-Titel)
- **`@paket/*`** — npm-Workspace-Pakete (`@paket/domain-types`, `@paket/ui`, …)
- **`PaketDb`**, **`PaketApiClient`** — technische Klassennamen
- **`paket.automatik`** — interner Automatik-Schlüssel

Für das fachliche Konzept „Tagesmenge eines Mitarbeitenden" gilt **immer „Bündel"**,
nie „Paket". Die einzelne Arbeitseinheit ist **immer „Beleg"**.
