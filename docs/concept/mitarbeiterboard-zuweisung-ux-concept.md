# Mitarbeiterboard — Beleg-Zuweisung (UX-Konzept)

> Status: Konzept zur Abstimmung. Mockup: `mitarbeiterboard-zuweisung-ux-mockup.html`.
> Baut auf dem gelandeten „Board zeigt alle eingeplanten Mitarbeitenden inkl. freie" auf
> (`feat/board-show-idle-employees`, commit 80b32ca).

## Problem

Das Mitarbeiterboard zeigt jetzt **alle eingeplanten Mitarbeitenden** — auch freie (ohne
Bündel). Aber:

1. **Zuweisung ist für freie Mitarbeitende deaktiviert.** Jede Board-Aktion hängt an einem
   **bestehenden Bündel** (`POST /api/teamlead/bundles/{bundleId}/add`). Ein freier
   Mitarbeitender hat `bundleId = null` → das Steuerelement ist ausgegraut. Es gibt im
   Backend **keinen** Pfad „Bündel anlegen und Beleg zuweisen".
2. **Begriff falsch beschriftet.** Das Dropdown heißt **„Paket hinzufügen"**, fügt aber einen
   **einzelnen Beleg** hinzu — kein Bündel.

## Begriffe (single-source)

| Begriff | Code | Bedeutung |
|--------|------|-----------|
| **Beleg** | `GoodsReceiptCase` | Ein Wareneingangs-Vorgang (ein WE-Beleg). Die kleinste zuweisbare Einheit. |
| **Bündel** | `AssignmentBundle` | Die **Tagesmenge an Belegen für genau einen Mitarbeitenden**, in Abhol-Reihenfolge. |

**Invariante:** Ein Mitarbeitender hat pro Tag **genau ein** Bündel (die Engine emittiert
ein Bündel je Mitarbeitendem). „Beleg zuweisen" heißt also: Beleg **in das Bündel** des
Mitarbeitenden legen — bzw. das Bündel **anlegen**, falls noch keins existiert.

## Ziel

Der Teamlead kann vom Board aus einen freien Beleg (aus dem Pool) einem Mitarbeitenden
zuweisen:

- **Mitarbeitender hat schon ein Bündel** → Beleg wird **ans Bündel angehängt**
  (= heutiger `add`-Override, nur korrekt beschriftet).
- **Mitarbeitender ist frei (kein Bündel)** → beim **ersten** zugewiesenen Beleg wird ein
  **neues Bündel** angelegt und der Beleg darin platziert.

Beide Wege sind ein **auditierter §8.4-Override** — Begründungspflicht wie bei
Entziehen/Hinzufügen/Reihenfolge.

## Interaktion — zwei Einstiege, ein Command

1. **Vom Mitarbeitenden aus** (Board-Zeile):
   `+ Beleg zuweisen` → Beleg aus Pool wählen → Grund → Bestätigen.
   Freie Zeile zeigt denselben Button (statt ausgegraut) — er **erstellt das Bündel**.
2. **Vom Beleg aus** (Pool / Ablagen): `Zuweisen` → Mitarbeitenden wählen
   (mit Auslastung & Bereich sichtbar) → Grund → Bestätigen.

Beide rufen denselben Backend-Command, damit es keine zweite Zuweisungslogik gibt.

## Fachlogik / Backend

Neuer auditierter Command (Command-Service, nicht Engine):

```
assignCaseToEmployee(principal, employeeId, caseId, date, reason)
  └─ tx:
     1. findOrCreate Bündel(employeeId, date):  status 'assigned', plannedEffortMinutes 0
     2. bestehende add-Logik wiederverwenden:    Item anhängen, case → 'assigned',
                                                  assignedBundleId setzen, Effort neu rechnen
     3. §8.4 Audit:  eventType 'assignment.overridden', action 'manual_assign'
```

- **Single-source bleibt gewahrt:** Die Engine ist weiterhin alleinige Quelle der
  **Automatik**. Manuelle Zuweisung ist ein **Override** — sie *re-implementiert keine*
  Engine-Planungslogik, sie legt nur ein leeres Bündel an und nutzt den vorhandenen
  add-Pfad.
- **Caveat (transparent machen):** Ein erneutes **„Live zuweisen" (recalculate)** plant den
  Tag neu und **überschreibt** manuelle Bündel — identisch zum heutigen add/withdraw-Verhalten.
  Das Board weist im Zuweisen-Dialog darauf hin.
- **Bereich-Hinweis:** Beleg-Bereich (fix aus Lagerplatz) vs. Bereiche des Mitarbeitenden.
  Bei Mismatch **weiche Warnung** im Dialog („Bereich Hängebahn passt nicht zu Anna" ),
  **kein** harter Block — konsistent mit der Engine-Soft-Penalty.
- **Endpoint:** `POST /api/teamlead/employees/{employeeId}/assign` Body `{ caseId, reason }`
  → `BundleMutationResultDto` (gibt das ggf. neu erstellte `bundleId` zurück).

## Terminologie-Fix (klein, sofort)

| Alt | Neu |
|-----|-----|
| „Paket hinzufügen" (Dropdown-Label) | **„Beleg zuweisen"** |
| „Kein Bündel zugewiesen." (Leerzustand) | **„Frei — keine Belege zugewiesen"** |
| Button „Hinzufügen" | **„Zuweisen"** |

## UI-States (Board-Zeile)

- **Frei** (kein Bündel): grüner `frei`-Chip, Bereiche sichtbar, **„+ Beleg zuweisen" aktiv**
  (sofern Pool nicht leer). Erste Zuweisung legt das Bündel an.
- **Belegt**: Bündel-Liste mit Belegen, `+ Beleg`, Reihenfolge speichern, Pause, Entziehen
  (wie heute, korrekt benannt).
- **Pool leer**: „Beleg zuweisen" deaktiviert mit Hinweis „Keine freien Belege".

## Abgrenzung

- **Kein** Beleg-Split hier (ein Beleg auf mehrere MA) — das ist
  `beleg-split-multi-employee-concept.md`.
- **Keine** Änderung an der Engine-Verteilung/Reihenfolge — nur manueller Override.
