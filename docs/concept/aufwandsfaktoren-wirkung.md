# Aufwand — Parameter, Wirkung & Beispiele

> Antwort auf Teamlead-Anmerkung **Punkt 2**: *„Wie wirken sich die konfigurierbaren
> Werte konkret aus? Wenn ich einen Wert ändere — welchen Impact hat das auf
> Bearbeitungszeit oder Priorisierung?“*

**Kurzantwort:** Jeder Beleg bekommt eine geschätzte **Bearbeitungszeit** in Minuten,
berechnet aus den **echten Aufwandsparametern** der Engine. Diese Parameter — die
tatsächlichen **Minuten je Tätigkeit** — sind im Cockpit (Admin → „Aufwand“) direkt
editierbar; **nichts ist mehr fest verdrahtet**. Mehr Minuten ⇒ mehr **Aufwandspunkte**
⇒ der Beleg bindet mehr Kapazität, Bündel werden kleiner, die Last verteilt sich anders.
Die Parameter ändern **nicht** die **Priorität** (Reihenfolge). Rechenbeispiel in
Abschnitt 3.

> **Geändert ggü. der ersten Version:** Es gibt **keine abstrakten Multiplikator-Faktoren**
> („Faktor Etikettendruck 1,2“) mehr. Der Teamlead stellt jetzt die **realen Minuten** ein
> (z. B. „Etiketten drucken = 2 min“). Das ist dieselbe Konfiguration, die die Engine
> rechnet (single source of truth), und die früher hartkodierten Grundzeiten sind damit
> ebenfalls editierbar.

---

## 1. Die editierbaren Parameter

Alle Werte leben in **einer** Konfiguration (`RuleConfig.effort`), die der Engine-Konfig
`EngineConfig.effort` **1:1 entspricht** (`packages/domain-types/src/admin-config.ts` →
`effortRuleConfigSchema`). Die Engine rechnet mit genau dieser Konfig (`computeEffort`);
das Cockpit editiert sie; die Vorschau rechnet damit.

| Parameter (Cockpit-Feld) | Default | Bedeutung |
| --- | --- | --- |
| Grundzeit je Beleg | 3 min | fixe Rüstzeit, mengenunabhängig |
| Minuten je Teil | 0,35 min/Teil | Mengenerfassung (× Warengruppen-Faktor) |
| Etiketten drucken (je Beleg) | 2 min | Preisetiketten drucken |
| Etiketten anbringen (je Pos.) | 0,45 min/Pos. | Preisetiketten anbringen |
| Warensicherung (je Pos.) | 0,75 min/Pos. | Sicherungsetiketten/-tags |
| Online-Behandlung (je Pos.) | 0,6 min/Pos. | Zusatzbehandlung online-relevanter Artikel |
| Rotpreis (je Beleg) | 0,5 min | Rotpreis-Auszeichnung |
| Box-Splitting (je Box) | 1,25 min/Box | je zusätzlicher Transportbox (nachgelagert) |
| Punkte je Minute | 1 | Umrechnung Minuten → Aufwandspunkte |
| Prüf-Multiplikatoren | 1,0 / 1,25 / 1,6 | Mengen-/Stichproben-/Vollkontrolle (auf Mengenaufwand) |
| Handling-Multiplikatoren | 1,0 … 1,3 | je Handling-Klasse (auf Mengenaufwand) |

Die **Warengruppen-Faktor-Tabelle** (`wgrFactors`) ist Stammdaten je WGR (kein globaler
Knopf) und wird im Tab nicht einzeln editiert, aber mitgespeichert.

---

## 2. Die Formel (so entstehen die Minuten)

`computeEffortBreakdown` (`packages/assignment-engine/src/effort/effort-score.ts`, §8.2):

```
quantity = totalQuantity × (Minuten je Teil) × wgrFactor

minutes = (Grundzeit je Beleg)
        + quantity
        + (Etikettendruck nötig?  → Etiketten drucken)
        + (#Positionen etikettieren × Etiketten anbringen)
        + (#Positionen sichern     × Warensicherung)
        + (#Positionen online      × Online-Behandlung)
        + (Rotpreis nötig?         → Rotpreis)
        + quantity × (Prüf-Multiplikator − 1)     ← Prüf-Mehraufwand
        + quantity × (Handling-Multiplikator − 1)  ← Handling-Mehraufwand

points  = minutes × (Punkte je Minute)
```

Prüfen und Handling sind **Mehraufwände auf der Mengenerfassung** (sie wirken nur auf den
mengenabhängigen Teil). Bei Stichprobe wird der Prüf-Multiplikator anteilig interpoliert:
`1 + (Multiplikator − 1) × Prüfprozent`.

---

## 3. Durchgerechnetes Beispiel

**Beispiel-Beleg** (identisch zur Live-Vorschau im Cockpit, `EXAMPLE_EFFORT_VECTOR`):
60 Teile · Etikettendruck · 12 Positionen etikettieren · 4 Positionen sichern ·
6 Positionen online · Rotpreis · 50 % Stichprobenprüfung · Handling „normal“.

### 3a. Mit den Default-Parametern

| Anteil | Rechnung | Minuten |
| --- | --- | --- |
| Grundzeit je Beleg | `3` | 3,00 |
| Mengenerfassung | `60 × 0,35 × 1,0` | 21,00 |
| Etiketten drucken | `2` | 2,00 |
| Etiketten anbringen | `12 × 0,45` | 5,40 |
| Warensicherung | `4 × 0,75` | 3,00 |
| Online-Behandlung | `6 × 0,6` | 3,60 |
| Rotpreis | `0,5` | 0,50 |
| Prüfung (50 % Stichprobe) | `21 × (1,125 − 1)` | 2,63 |
| Handling („normal“) | `21 × (1,0 − 1)` | 0,00 |
| **Bearbeitungszeit gesamt** | | **≈ 41,13 min** |

Aufwandspunkte = 41,13 × 1 = **41,13**.

### 3b. Beispiel-Änderung: „Etiketten drucken“ 2 → 4 min

| | 2 min | 4 min | Δ |
| --- | --- | --- | --- |
| Etiketten drucken | 2,00 | 4,00 | +2,00 |
| **Beleg gesamt** | **41,13 min** | **43,13 min** | **+2,00 min** |

Oder „Etiketten anbringen“ 0,45 → 0,90 min/Pos.: `12 × 0,45 = +5,40 min` → 46,53 min.

**Auswirkung auf Bündel & Last:**

- Aufwandspunkte steigen mit den Minuten → der Beleg „wiegt“ in der **fairen
  Lastverteilung** mehr und belegt mehr Tageskapazität.
- Bei einem Bündel-Ziel von ~55 min passen **weniger Belege pro Rollwagen/Bündel**.
- **Keine** Wirkung auf **Priorität/Reihenfolge**.

> **Merksatz:** Aufwand = Zeit & Last, **nicht** Priorität.

---

## 4. Implementierungsstand (ehrlich)

| Baustein | Status |
| --- | --- |
| Aufwandsformel `computeEffort` / `computeEffortBreakdown` | **aktiv** — single source für Minuten/Punkte |
| Editierbare Parameter im Cockpit (Tab „Aufwand“) + Persistenz (`RuleConfig.effort`) | **aktiv** |
| Live-Vorschau (dieser Tab) | **aktiv** — rechnet mit `previewEffort` über die echte Formel |
| Parameter erreichen die Engine (`engineConfigFromRuleConfig.effort`) | **aktiv** (durchgereicht) |
| Per-Beleg-Neuberechnung im **Live-Lauf** aus Positionsdaten | **aktiv** — `effortVectors` aus Arbeitsanweisung + Positions-Anweisungen |

Die editierten Parameter wirken jetzt **in der Live-Verteilung**. Bei jedem
`recalculate` / `preview` und beim Mitarbeiter-Pull (`assignNextBundle`) baut der Backend
für jeden Beleg **mit Arbeitsanweisung** einen `EffortInputVector` aus den persistierten
Daten (`apps/backend-api/src/assignment/effort-vector.ts`):

- Mengen/WGR ← `GoodsReceiptCase.totalQuantity` + `ReceiptPosition.wgr`
- Druck/Prüfmodus ← `WorkInstructionHeader`
- Etikettieren/Sicherung/Online/Rotpreis ← `PositionInstruction` (Anzahl je Treiber)
- Handling-Klasse ← `storageLocation.kind` (`handlingClassFromLocationKind`)

Die Engine rechnet daraus `computeEffort(vector, engineConfig.effort)` — also mit den
**aktuell konfigurierten Minuten**. Bündelgröße, `plannedEffortMinutes` und Lastverteilung
spiegeln damit live die Cockpit-Einstellungen.

**Bewusste Grenze (kein Workaround):** Ein Beleg **ohne** Arbeitsanweisung hat noch keine
bekannten Aufwandstreiber — für ihn fällt die Engine deterministisch auf den vorab
gespeicherten `estimatedMinutes` zurück (statt zu raten). Der für Tafel/Pool **angezeigte**
`estimatedMinutes` ist der Schätzwert aus der Ingestion/Arbeitsanweisungs-Erzeugung; ihn
bei jedem `recalculate` zu überschreiben wäre ein Seiteneffekt am falschen Ort. Die
saubere Stelle, `case.estimatedMinutes`/`effortPoints` persistent neu zu berechnen, ist die
Arbeitsanweisungs-Erzeugung/ProHandel-Ingestion (separater, dokumentierter Schritt) — die
**Verteilung** selbst nutzt bereits durchgängig die echten, konfigurierten Werte.

---

## 5. Umsetzung (Dateien)

- `packages/domain-types/src/admin-config.ts` — `effortRuleConfigSchema` +
  `DEFAULT_EFFORT_RULE_CONFIG`: single source des Aufwands-Konfig-Shapes (Cockpit + Engine).
- `packages/assignment-engine/src/config.ts` — re-exportiert dieses Shape als
  `EffortConfig` / `DEFAULT_EFFORT_CONFIG` (keine Duplizierung).
- `packages/assignment-engine/src/effort/effort-score.ts` — `computeEffort` /
  `computeEffortBreakdown` (Formel + benannte Anteile).
- `packages/assignment-engine/src/effort/effort-factors.ts` — `previewEffort`
  (Beispiel-Beleg über die echte Formel), `EXAMPLE_EFFORT_VECTOR`. Test
  `effort-factors.test.ts` prüft die Zahlen dieses Dokuments.
- `apps/backend-api/src/assignment/load-plan.ts` — `engineConfigFromRuleConfig` reicht
  `effort` an die Engine durch.
- `apps/backend-api/src/assignment/effort-vector.ts` — `buildEffortVector` /
  `buildEffortVectors`: baut den `EffortInputVector` je Beleg aus Arbeitsanweisung +
  Positions-Anweisungen + Lagerklasse. Test `effort-vector.test.ts`.
- `apps/backend-api/src/assignment/assignment.service.ts` — `recalculate` / `preview` /
  `assignNextBundle` befüllen `EngineInput.effortVectors` und rechnen so live mit den
  konfigurierten Parametern.
- `packages/domain-types/src/location.ts` — `handlingClassFromLocationKind` (Lagerklasse →
  Handling-Klasse), analog zu `bereichFromLocationKind`.
- `apps/teamlead-web/src/features/admin/AdminPage.tsx` + `EffortPreview.tsx` — editierbare
  Parameter + Live-Vorschau im Tab „Aufwand“.
