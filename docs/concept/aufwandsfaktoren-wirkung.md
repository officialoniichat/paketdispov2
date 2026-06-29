# Aufwandsfaktoren — Wirkung & Beispiele

> Antwort auf Teamlead-Anmerkung **Punkt 2**: *„Wie wirken sich die konfigurierbaren
> Faktoren (z. B. ‚Faktor Etikettendruck‘) konkret aus? Wenn ich einen Wert von 1,2 auf
> 2,0 ändere — welchen Impact hat das auf Bearbeitungszeit oder Priorisierung?“*

**Kurzantwort:** Jeder Beleg bekommt eine geschätzte **Bearbeitungszeit** in Minuten. Sie
entsteht aus festen Engine-Grundzeiten (Abschnitt 2). Die sechs Faktoren sind
**Multiplikatoren** (1,0 = neutral) und skalieren je einen Teil dieser Zeit (Abschnitt 3).
Mehr Zeit ⇒ mehr **Aufwandspunkte** ⇒ der Beleg bindet mehr Kapazität, Bündel werden
kleiner, die Last verteilt sich anders. Faktoren ändern **nicht** die **Priorität**
(Reihenfolge). Konkretes Rechenbeispiel inkl. „1,2 → 2,0“ in Abschnitt 4.

---

## 1. Die zwei Bestandteile des Aufwands

```
Aufwand(Beleg) = Grundaufwand (feste Engine-Minuten)  ×  Faktoren (Multiplikatoren)
                 └── Abschnitt 2 ──┘                      └── Abschnitt 3 ──┘
```

- **Grundaufwand**: feste Minutenwerte pro Tätigkeit, hinterlegt in der Engine
  (`DEFAULT_EFFORT_CONFIG`). Sie sagen, *wie lange* eine Tätigkeit grundsätzlich dauert.
- **Faktoren**: die im Cockpit editierbaren Multiplikatoren. Sie sagen, *wie stark* ein
  Tätigkeitsanteil ins Gewicht fällt. `1,0` = unverändert, `1,2` = +20 %, `2,0` = doppelt.

Beide zusammen ergeben über die Engine-Funktion `computeEffort` Minuten und Punkte.

---

## 2. Woher die Minuten kommen (Grundaufwand)

Ein Beleg wird durch einen **EffortInputVector** beschrieben (welche Tätigkeiten anfallen,
`packages/domain-types/src/effort.ts`):

| Feld | Bedeutung |
| --- | --- |
| `totalQuantity` | Anzahl Teile im Beleg |
| `wgrCodes` | Warengruppen (bestimmen den WGR-Faktor) |
| `priceLabelPrintRequired` | Preisetiketten drucken nötig? |
| `priceLabelAttachPositionCount` | Positionen, die etikettiert werden |
| `securityRequiredPositionCount` | Positionen mit Warensicherung |
| `onlineRelevantPositionCount` | online-relevante Positionen |
| `redPriceRequired` | Rotpreis-Auszeichnung nötig? |
| `goodsReceiptCheckMode` / `…Percentage` | Prüfmodus (Menge / Stichprobe % / Vollkontrolle) |
| `handlingClass` | Füllmaterial/Handling-Klasse |

Die Engine multipliziert diese Tätigkeiten mit festen Minuten-Konstanten
(`DEFAULT_EFFORT_CONFIG` in `packages/assignment-engine/src/config.ts`):

| Engine-Konstante | Wert | wofür |
| --- | --- | --- |
| `baseMinutesPerCase` | 3 min | Grundzeit je Beleg |
| `quantityBaseMinutes` | 0,35 min/Teil | Mengenerfassung (× WGR-Faktor) |
| `priceLabelPrintMinutes` | 2 min | Etiketten drucken (je Beleg) |
| `labelAttachMinutesPerPosition` | 0,45 min/Pos. | Etiketten anbringen |
| `securityMinutesPerPosition` | 0,75 min/Pos. | Warensicherung |
| `onlineHandlingMinutesPerPosition` | 0,6 min/Pos. | Online-Behandlung |
| `redPriceMinutesPerPosition` | 0,5 min | Rotpreis-Auszeichnung |
| `boxSplitMinutesPerBox` | 1,25 min/Box | Karton-Splitting (nachgelagert) |
| `checkModeFactors` | 1,0 / 1,25 / 1,6 | Prüf-Multiplikator (Menge/Stichprobe/Voll) |
| `handlingClassFactors` | 1,0 … 1,3 | Handling-Multiplikator je Klasse |
| `pointsPerMinute` | 1 | Minuten → Aufwandspunkte |

**Formel** (`computeEffortBreakdown` in
`packages/assignment-engine/src/effort/effort-score.ts`):

```
quantity = totalQuantity × quantityBaseMinutes × wgrFactor

minutes = baseMinutesPerCase
        + quantity
        + (priceLabelPrintRequired ? priceLabelPrintMinutes : 0)
        + priceLabelAttachPositionCount × labelAttachMinutesPerPosition
        + securityRequiredPositionCount × securityMinutesPerPosition
        + onlineRelevantPositionCount × onlineHandlingMinutesPerPosition
        + (redPriceRequired ? redPriceMinutesPerPosition : 0)
        + quantity × (Prüf-Multiplikator − 1)     ← Prüf-Mehraufwand
        + quantity × (Handling-Multiplikator − 1)  ← Handling-Mehraufwand

points  = minutes × pointsPerMinute
```

Prüfen und Handling sind **Mehraufwände auf der Mengenerfassung** (sie wirken nur auf den
mengenabhängigen Teil). Bei Stichprobe wird der Prüf-Multiplikator anteilig interpoliert:
`1 + (Multiplikator − 1) × Prüfprozent`.

---

## 3. Worauf die Faktoren wirken

Jeder der sechs Cockpit-Faktoren multipliziert **genau einen** Grundaufwands-Anteil aus
Abschnitt 2 (`applyEffortFactors` in `effort-factors.ts`):

| Faktor (Cockpit) | Standard | multipliziert |
| --- | --- | --- |
| `priceLabelPrintFactor` (Etikettendruck) | 1,2 | `priceLabelPrintMinutes` **und** `labelAttachMinutesPerPosition` |
| `securingFactor` (Sicherung) | 1,3 | `securityMinutesPerPosition` |
| `onlineFactor` (Online) | 1,15 | `onlineHandlingMinutesPerPosition` |
| `redPriceFactor` (Rotpreis) | 1,1 | `redPriceMinutesPerPosition` |
| `checkShareFactor` (Prüfanteil) | 1,25 | den Prüf-Mehraufwand: `1 + (Multiplikator − 1) × checkShareFactor` |
| `boxSplittingFactor` (Box-Splitting) | 1,4 | `boxSplitMinutesPerBox` (greift erst bei Aufteilung, s. u.) |

`1,0` lässt den jeweiligen Anteil unverändert. Box-Splitting wirkt erst, wenn ein Beleg
**nachgelagert** in mehrere Transportboxen geteilt wird (§8.2 `splitBoxCount`); auf einen
einzelnen, ungeteilten Beleg hat dieser Faktor daher **keine** Wirkung.

---

## 4. Durchgerechnetes Beispiel

**Beispiel-Beleg** (identisch zur Live-Vorschau im Cockpit, `EXAMPLE_EFFORT_VECTOR`):
60 Teile · Etikettendruck · 12 Positionen etikettieren · 4 Positionen sichern ·
6 Positionen online · Rotpreis · 50 % Stichprobenprüfung · Handling „normal“.

### 4a. Grundaufwand (alle Faktoren = 1,0) — woher die 41,13 min kommen

| Anteil | Rechnung | Minuten |
| --- | --- | --- |
| Grundzeit je Beleg | `baseMinutesPerCase` | 3,00 |
| Mengenerfassung | `60 × 0,35 × 1,0` | 21,00 |
| Etiketten drucken | `priceLabelPrintMinutes` | 2,00 |
| Etiketten anbringen | `12 × 0,45` | 5,40 |
| Warensicherung | `4 × 0,75` | 3,00 |
| Online-Behandlung | `6 × 0,6` | 3,60 |
| Rotpreis | `redPriceMinutesPerPosition` | 0,50 |
| Prüfung (50 % Stichprobe) | `21 × (1,125 − 1)` | 2,63 |
| Handling („normal“) | `21 × (1,0 − 1)` | 0,00 |
| **Grundaufwand** | | **≈ 41,13 min** |

### 4b. Mit Standard-Faktoren

Jeder Faktor erhöht „seinen“ Anteil:

| Faktor | wirkt auf | neutral | mit Faktor | Δ |
| --- | --- | --- | --- | --- |
| Etikettendruck ×1,2 | 2,00 + 5,40 = 7,40 | 7,40 | 8,88 | +1,48 |
| Sicherung ×1,3 | 3,00 | 3,00 | 3,90 | +0,90 |
| Online ×1,15 | 3,60 | 3,60 | 4,14 | +0,54 |
| Rotpreis ×1,1 | 0,50 | 0,50 | 0,55 | +0,05 |
| Prüfanteil ×1,25 | 2,63 | 2,63 | 3,28 | +0,65 |
| Box-Splitting ×1,4 | — (kein Split) | — | — | 0,00 |
| **Summe** | | **41,13** | **44,75** | **+3,62** |

⇒ Mit den Standard-Faktoren kostet der Beleg **44,75 min** (41,13 + 3,62).

### 4c. Die gefragte Änderung: Etikettendruck 1,2 → 2,0

| | Faktor 1,2 | Faktor 2,0 | Δ |
| --- | --- | --- | --- |
| Etiketten drucken | 2,40 | 4,00 | +1,60 |
| Etiketten anbringen | 6,48 | 10,80 | +4,32 |
| **Beleg gesamt** | **44,75 min** | **50,67 min** | **+5,92 min (≈ +13 %)** |

**Auswirkung auf Bündel & Last:**

- Aufwandspunkte steigen mit (`points = minutes × 1`): 44,75 → 50,67 → der Beleg „wiegt“
  in der **fairen Lastverteilung** mehr und belegt mehr Tageskapazität.
- Bei einem Bündel-Ziel von ~55 min passen **weniger Belege pro Rollwagen/Bündel**.
- **Keine** Wirkung auf **Priorität/Reihenfolge**.

> **Merksatz:** Aufwand = Zeit & Last, **nicht** Priorität.

---

## 5. Implementierungsstand (ehrlich)

Damit klar ist, *wo* die Faktoren heute schon wirken und *wo* noch nicht:

| Baustein | Status |
| --- | --- |
| Grundaufwand-Formel `computeEffort` / `computeEffortBreakdown` | **aktiv** — single source of truth für Minuten/Punkte |
| Live-Vorschau im Cockpit (dieser Tab) | **aktiv** — rechnet mit `applyEffortFactors` + echter `computeEffort` |
| Faktoren im laufenden **Zuteilungslauf** (`assignWork` / „Neu berechnen“) | **noch nicht verdrahtet** |

Heute läuft die Zuteilung (`apps/backend-api/src/assignment/assignment.service.ts`) mit den
Engine-Standardwerten (`DEFAULT_ENGINE_CONFIG`) und nutzt für die Belegminuten den bereits
gespeicherten `estimatedMinutes` je Beleg — die sechs Cockpit-Faktoren werden dort **noch
nicht** eingelesen. Die Vorschau zeigt also die **modellierte Wirkung** der Faktoren über
dieselbe Engine-Formel, die der echte Lauf verwendet — die Faktoren beeinflussen den
Live-Lauf aber erst, wenn folgende zwei Punkte umgesetzt sind:

1. **Config durchreichen:** beim Lauf die gespeicherte `RuleConfig.effort` über
   `applyEffortFactors` in die `EngineConfig` mappen (statt `DEFAULT_ENGINE_CONFIG`).
2. **EffortVectors liefern:** je Beleg den `EffortInputVector` aus den Positionsdaten
   bereitstellen (`EngineInput.effortVectors`), damit `assignWork` `computeEffort` rechnet
   statt auf den vorab gespeicherten `estimatedMinutes` zurückzufallen.

`applyEffortFactors` ist der fertige, getestete Baustein für Schritt 1.

---

## 6. Umsetzung (Dateien)

- `packages/assignment-engine/src/effort/effort-score.ts` — `computeEffort` /
  `computeEffortBreakdown` (Grundaufwand-Formel + benannte Anteile), single source.
- `packages/assignment-engine/src/effort/effort-factors.ts` — `applyEffortFactors`
  (Faktor → Engine-Term), `previewEffortBreakdown` (Grundanteile + Faktor-Beiträge),
  `EXAMPLE_EFFORT_VECTOR`. Test `effort-factors.test.ts` prüft die Zahlen dieses Dokuments.
- `apps/teamlead-web/src/features/admin/EffortPreview.tsx` — Live-Vorschau im Admin-Tab
  „Aufwand“ (`AdminPage.tsx`): zeigt Grundaufwand **und** Faktor-Wirkung, rechnet live mit.
