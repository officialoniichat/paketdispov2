# Aufwandsfaktoren — Wirkung & Beispiele

> Antwort auf Teamlead-Anmerkung **Punkt 2**: *„Wie wirken sich die konfigurierbaren
> Faktoren (z. B. ‚Faktor Etikettendruck‘) konkret aus? Wenn ich einen Wert von 1,2 auf
> 2,0 ändere — welchen Impact hat das auf Bearbeitungszeit oder Priorisierung?“*

**Kurzantwort:** Aufwandsfaktoren wirken auf die geschätzte **Bearbeitungszeit** (Minuten)
und die daraus abgeleiteten **Aufwandspunkte** (Last/Fairness) eines Belegs. Über die Zeit
beeinflussen sie indirekt **Bündelgröße** und **Lastverteilung**. Sie ändern **nicht** die
**Priorität** (die Reihenfolge der Abarbeitung) — diese ergibt sich ausschließlich aus
Prio-Kennzeichen und Terminen.

---

## 1. Wo die Faktoren wirken

Jeder Beleg bekommt eine geschätzte Bearbeitungszeit aus der Engine-Formel
`computeEffort` (`packages/assignment-engine/src/effort/effort-score.ts`, §8.2). Die sechs
Teamlead-Faktoren sind **Multiplikatoren** (Standard ≈ 1,x; `1,0` = neutral, keine
Wirkung). Sie skalieren jeweils genau den Aufwandsanteil, den sie benennen — die übrige
Formel bleibt unberührt.

Mapping Faktor → skalierter Aufwandsanteil
(`packages/assignment-engine/src/effort/effort-factors.ts`):

| Faktor (Admin) | Standard | skaliert | Engine-Basiswert |
| --- | --- | --- | --- |
| `priceLabelPrintFactor` (Etikettendruck) | 1,2 | Drucken + Anbringen von Preisetiketten | `priceLabelPrintMinutes` 2 min + `labelAttachMinutesPerPosition` 0,45 min/Pos. |
| `securingFactor` (Sicherung) | 1,3 | Warensicherung je Position | `securityMinutesPerPosition` 0,75 min/Pos. |
| `onlineFactor` (Online) | 1,15 | Behandlung online-relevanter Positionen | `onlineHandlingMinutesPerPosition` 0,6 min/Pos. |
| `redPriceFactor` (Rotpreis) | 1,1 | Auszeichnung reduzierter Artikel | `redPriceMinutesPerPosition` 0,5 min |
| `checkShareFactor` (Prüfanteil) | 1,25 | Prüf-Mehraufwand (Mengen-/Stichproben-/Vollkontrolle) | `checkModeFactors` (Multiplikator über der Mengenerfassung) |
| `boxSplittingFactor` (Box-Splitting) | 1,4 | je zusätzlicher Transportbox | `boxSplitMinutesPerBox` 1,25 min/Box |

Zwei Sonderfälle:

- **Prüfanteil** skaliert nicht eine feste Minutenzahl, sondern den *Überschuss* des
  Prüf-Multiplikators über `1`: `effektiv = 1 + (basis − 1) × checkShareFactor`. Beispiel
  Stichprobe (basis 1,25): bei `checkShareFactor = 1,25` wird daraus `1 + 0,25 × 1,25 =
  1,3125`.
- **Box-Splitting** greift erst *nachgelagert*, wenn ein Beleg in mehrere Transportboxen
  aufgeteilt wird (§8.2 `splitBoxCount`). Auf den Aufwand eines einzelnen, ungeteilten
  Belegs hat dieser Faktor daher **keine** Wirkung.

---

## 2. Durchgerechnetes Beispiel

**Beispiel-Beleg** (identisch zur Live-Vorschau im Admin-Tab „Aufwand“,
`EXAMPLE_EFFORT_VECTOR`): 60 Teile · Etikettendruck · 12 Positionen etikettieren ·
4 Positionen sichern · 6 Positionen online · Rotpreis · 50 % Stichprobenprüfung ·
Handling „normal“.

### Bearbeitungszeit bei Standard-Faktoren

| Anteil | Rechnung | Minuten |
| --- | --- | --- |
| Grundzeit/Beleg | `baseMinutesPerCase` | 3,00 |
| Menge | `60 × 0,35 × 1,0` | 21,00 |
| Etikettendruck | `2 × 1,2` | 2,40 |
| Etiketten anbringen | `12 × 0,45 × 1,2` | 6,48 |
| Sicherung | `4 × 0,75 × 1,3` | 3,90 |
| Online | `6 × 0,6 × 1,15` | 4,14 |
| Rotpreis | `0,5 × 1,1` | 0,55 |
| Prüfanteil (50 % Stichprobe) | `21 × (1,15625 − 1)` | 3,28 |
| **Summe** | | **≈ 44,75 min** |

Zum Vergleich: **alle Faktoren neutral (1,0)** ⇒ **41,13 min**. Die konfigurierten
Standard-Faktoren erhöhen den Beispiel-Beleg also um **+3,62 min** gegenüber neutral.

### Effekt der gefragten Änderung: Etikettendruck 1,2 → 2,0

| | Faktor 1,2 | Faktor 2,0 | Δ |
| --- | --- | --- | --- |
| Etikettendruck | 2,40 | 4,00 | +1,60 |
| Etiketten anbringen | 6,48 | 10,80 | +4,32 |
| **Beleg gesamt** | **44,75 min** | **50,67 min** | **+5,92 min (≈ +13 %)** |

**Auswirkung auf Bündel & Last:**

- Die Aufwandspunkte des Belegs steigen ebenfalls (`points = minutes × 1`), also von
  44,75 auf 50,67 Punkte → der Beleg „wiegt“ in der **fairen Lastverteilung** mehr und
  belegt mehr von der Tageskapazität des Mitarbeiters.
- Bei einem Bündel-Ziel von ~55 min passen damit **weniger Belege pro Rollwagen/Bündel**;
  Bündel werden tendenziell kleiner bzw. früher geschlossen.
- **Keine** Auswirkung auf die **Priorität/Reihenfolge** — wann ein Beleg an der Reihe
  ist, hängt an Prio-Kennzeichen und Verladeterminen, nicht am Aufwand.

---

## 3. Merksatz

> **Aufwand = Zeit & Last, nicht Priorität.**
> Faktor hoch → Beleg kostet mehr Minuten/Punkte → bindet mehr Kapazität, kleinere
> Bündel, gleichmäßigere Verteilung. Die **Reihenfolge** der Abarbeitung bleibt
> unverändert.

---

## 4. Umsetzung (Single Source of Truth)

- Die Vorschau und alle Beispielzahlen oben stammen aus der **echten** Engine-Funktion
  `computeEffort` — die Faktoren werden über `applyEffortFactors` auf die Engine-Config
  abgebildet und dann gerechnet. Es gibt **keine** zweite, nachgebaute Formel.
- Helfer: `packages/assignment-engine/src/effort/effort-factors.ts`
  (`applyEffortFactors`, `previewEffortWithFactors`, `previewEffortBreakdown`),
  getestet in `effort-factors.test.ts` (inkl. der Zahlen dieses Dokuments).
- In-UI-Transparenz: `apps/teamlead-web/src/features/admin/EffortPreview.tsx`, eingebettet
  im Admin-Tab „Aufwand“ (`AdminPage.tsx`). Die Vorschau rechnet live mit, während ein
  Faktor geändert wird.
