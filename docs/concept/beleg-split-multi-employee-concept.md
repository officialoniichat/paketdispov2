# Beleg-Split auf mehrere Mitarbeitende + Hardcut „manuell zuteilen"

**Status:** Konzept (Phase 0–1) · kein Produktionscode, keine Migration
**Begleitendes Mockup:** `docs/concept/beleg-split-multi-employee-ux-mockup.html`
**Datum:** 2026-06-24

---

## 0. Anforderung (L&T / Daniel, verbatim)

> „Moin, es müsste auch möglich sein gezielt Belege (z.B aufgrund des Mengenvolumens
> oder Aufwand (Koffer oder eine Sendung von 3000 Teilen)) auch an mehrere
> Mitarbeitende zu verteilen und am Ende auch die Leistung getrennt aufzunehmen oder
> anteilig anzurechnen.
>
> Vielleicht müsste man bei der Belegverteilung ab einer bestimmten Menge ein Hardcut
> machen, und den Teamlead die Steuerung manuell überlassen, damit der Beleg nicht
> automatisiert verteilt wird.
>
> Oder ihr regelt das über die Berechnung, dass aufgrund des Aufwands der Beleg
> rechnerisch in keiner Schicht bearbeitet werden könnte und somit manuell zugeteilt
> werden müsste."

Daraus folgen **drei** Mechanismen, die zusammen *einen* Ablauf ergeben:

| # | Mechanismus | Auslöser | Ergebnis |
|---|---|---|---|
| 1 | **Split** eines Belegs auf N Mitarbeitende | Teamlead-Entscheid, gestützt auf Engine-Vorschlag | N Anteile, Leistung **getrennt** oder **anteilig** |
| 2 | **Mengen-Hardcut** | konfigurierbare Stückzahl-Schwelle | Beleg aus Automatik → `manuell zuteilen` |
| 3 | **Rechnerischer Ausschluss** | Aufwand > größte verfügbare Schicht | Beleg aus Automatik → `manuell zuteilen` |

**Empfehlung (in §3 begründet):** Mechanismus **3 als Primärregel** (kapazitäts­ehrlich,
deckt auch Aufwand jenseits der reinen Stückzahl ab), Mechanismus **2 als expliziter,
leicht erklärbarer Override**. Beide münden in dasselbe Ergebnis: *aus der Automatik
nehmen + zur manuellen Steuerung markieren*. Der Split (1) ist die Aktion, mit der der
Teamlead diesen markierten Beleg anschließend auflöst.

### Leitprinzip (single-source Fachlogik)

> **Die Engine entscheidet die Berechtigung und rechnet die Split-Mathematik. Das
> Dashboard zeigt das an und lässt den Teamlead steuern.** Die Engine **splittet nie
> stillschweigend automatisch** — sie markiert (`requires_manual_split`) und **schlägt**
> einen gleichmäßigen N-Wege-Split **vor**. Bestätigt wird im Cockpit.

---

## 1. IST-Analyse: die „atomarer Beleg"-Annahme

Ein Beleg (`GoodsReceiptCase`) ist heute eine **atomare Einheit**, die genau **einem**
Mitarbeiter-Bundle zugeordnet wird. Es gibt keinen Sub-Beleg- bzw.
Mehr-Mitarbeiter-Bezug. Die Annahme steckt an folgenden Stellen:

| Ort | Datei:Zeile | Wo die Atomarität sitzt |
|---|---|---|
| **Case ↔ Bundle 1:1** | `packages/domain-types/src/cases.ts:114` | `assignedBundleId` ist **ein** optionaler Verweis — ein Case kennt genau ein Bundle. |
| **Menge ist Skalar** | `packages/domain-types/src/cases.ts:110` | `totalQuantity` ist eine Zahl auf Case-Ebene, nicht aufteilbar. |
| **Status ist Skalar** | `packages/domain-types/src/cases.ts:111` | Ein `status` für den ganzen Case (kein Pro-Anteil-Status). |
| **Bundle ↔ 1 Mitarbeiter** | `packages/domain-types/src/assignment.ts:22` | `AssignmentBundle.employeeId` ist **ein** Mitarbeiter. |
| **Bundle hält ganze Cases** | `packages/domain-types/src/assignment.ts:24` | `caseIds: Id[]` — ganze Cases, nie Teilmengen. |
| **Engine: 1 EnrichedCase je Case** | `packages/assignment-engine/src/assignment/plan.ts:96-101` | Jeder Case wird **einmal** angereichert und landet in genau einem Bundle. |
| **Engine: eligible vs. unassigned** | `packages/assignment-engine/src/assignment/plan.ts:104-111` | Pro Case eine Entscheidung; kein Pfad „teilweise zuteilbar". |
| **Bundling packt ganze Cases** | `packages/assignment-engine/src/assignment/bundling.ts:81-95` | Ein Case wird komplett in ein Bundle gelegt; `maxCasesPerBundle`-Cap, nie Stück-Splitting. |
| **Aufwand ist 1 Wert je Case** | `packages/assignment-engine/src/effort/effort-score.ts:33-71` | `computeEffort` liefert *einen* Minuten-/Punktwert für den ganzen Case. |
| **Kein „zu groß"-Grund** | `packages/assignment-engine/src/types.ts:85` | `UnassignedCase.reason` kennt nur `excluded \| no_capacity \| held_in_reserve`. |
| **ZST je (Case, Mitarbeiter)** | `packages/domain-types/src/zst.ts:5-16` | `ZstRecord` hat `caseId` **und** `employeeId` mit eigener `id` — **mehrere Records pro caseId sind schon darstellbar** (zentrale Naht). |
| **Teamlead-Aktionen** | `apps/teamlead-web/src/actions/caseActions.ts:54-160` | Registry kennt `park/unpark/prioritise/cancel/…` — **kein** `split`. |
| **Override-Audit** | `apps/teamlead-web/src/data/audit.ts:12-21` | `OverrideAction` hat bereits `entziehen/hinzufuegen/neuverteilen` — **kein** `aufteilen`. |

### Was konzeptionell geändert werden muss (kein Code hier)

1. **Eine Teil-Einheit unterhalb des Belegs** einführen (`CaseShare`) — der Beleg bleibt
   die fachliche Klammer, der Anteil wird die zuteilbare Einheit.
2. **Engine-Ausschlussgrund** `requires_manual_split` ergänzen (statt still scheitern an
   `no_capacity`) plus optionaler **Split-Vorschlag** im Plan-Output.
3. **Mehrere `ZstRecord` pro `caseId`** als *gewollten* Normalfall behandeln (heute
   technisch möglich, fachlich noch nicht als Split-Leistung aggregiert) — siehe §2.4.
4. **Teamlead-Aktion `aufteilen`** in Registry + Audit ergänzen (neuer Grund-pflichtiger
   Override, gleiche Familie wie `entziehen/neuverteilen`).
5. **Abschluss-/Aggregations-Regel:** Case ist `completed`, wenn die Summe der
   Anteils-Leistungen die `totalQuantity` deckt — sonst `partially_completed` (Status +
   Reaktivierungs-Aktion existieren bereits, `caseActions.ts:144-146`).

> **Wichtig — kein neuer Verteil-Pfad:** Splitten heißt *nicht*, dass die Automatik
> mehr-Mitarbeiter-Bundles baut. Der Split ist ein **manueller** Teamlead-Akt auf einem
> Beleg, den die Engine bewusst **aus** der Automatik genommen hat.

---

## 2. Datenmodell-Design (vorgeschlagen, nicht migriert)

### 2.1 Die neue Einheit: `CaseShare`

Ein `CaseShare` ist *ein Anteil eines Belegs für genau einen Mitarbeiter*. Der Beleg
bleibt unangetastet die fachliche Klammer; der Anteil wird die zuteilbare/abrechenbare
Einheit.

```text
CaseShare {
  id            : Id
  caseId        : Id                 // Klammer-Beleg
  employeeId    : Id                 // genau ein Mitarbeiter je Anteil
  splitMode     : 'quantity' | 'position'
  quantity?     : number             // bei splitMode = 'quantity'  (Σ = totalQuantity)
  positionIds?  : Id[]               // bei splitMode = 'position'  (disjunkte Positionen)
  captureMode   : 'getrennt' | 'anteilig'
  plannedEffortMinutes : number      // von der Engine gerechnet
  plannedEffortPoints  : number
  status        : 'assigned' | 'in_progress' | 'completed' | 'partially_completed'
}
```

- **Bundle bleibt 1-Mitarbeiter** (`assignment.ts:22` unverändert). Der Anteil wird als
  „Share-Zeile" in das Bundle des jeweiligen Mitarbeiters gelegt — das Bundle referenziert
  dann `shareId` statt (bzw. zusätzlich zu) `caseId`. Damit bleibt die bestehende
  Ein-Mitarbeiter-Zuteilung, Pickup-Reihenfolge und Kapazitätslogik strukturell intakt.
- **Kein Split = kein CaseShare.** Der Normalfall (1 Beleg → 1 Bundle) erzeugt keine
  `CaseShare`-Zeilen; nur gesplittete Belege materialisieren sie. (YAGNI, lean.)

### 2.2 Split-Schlüssel: Menge vs. Position — Empfehlung

| | **Split nach MENGE** | **Split nach POSITION** |
|---|---|---|
| Einheit | numerischer Anteil von `totalQuantity` | ganze Positionen (`ReceiptPosition` + ihre SKU-Lines) |
| Passt für | flache, homogene Ware: *„Sendung von 3000 Teilen"* derselben Artikel-/Größenspanne | gemischte Ware: *„Koffer"* mit heterogenen Positionen (versch. Artikel, Handling, Sicherung) |
| Validierung | Σ Anteile = `totalQuantity` (triviale Integer-Mathematik) | Positionen disjunkt + vollständig zugeordnet |
| Aufwand-Aufteilung | linearer Mengen­term dominiert → sauber proportional (§2.3) | jede Position trägt ihren eigenen Overhead → natürlich korrekt |
| Arbeitsanweisung | identisch je Anteil (gleiche Positionen, weniger Stück) | je Mitarbeiter nur seine Positionen sichtbar |

**Empfehlung: beide Modi, Default `quantity` für den Piloten.** Begründung:

- Die Schlagzeilen-Anforderung („3000 Teile") ist ein Mengen-Fall; Mengen-Split ist trivial
  zu validieren (Σ = total) und der Aufwand ist überwiegend mengen­proportional
  (`effort-score.ts:38`, `quantityMinutes = totalQuantity × 0.35 × wgrFactor`).
- **Positions-Split** ist das richtige Werkzeug, sobald Positionen sich im Handling
  unterscheiden (Koffer): dann würde ein gleichmäßiger Mengen-Split die Leistung falsch
  anrechnen, weil Sicherungs-/Etiketten-/Online-Overhead **pro Position** anfällt
  (`effort-score.ts:58-62`).
- Beide Modi erzeugen **dieselbe** Downstream-Struktur (`CaseShare`), nur das gefüllte
  Feld (`quantity` vs. `positionIds`) unterscheidet sich. Ein Modell, zwei Eingaben.

### 2.3 Aufwands-Aufteilung — die Mathematik

Die Aufwandsformel (`effort-score.ts:33-71`) zerfällt in **mengenproportionale** und
**fixe** Anteile:

```text
minutes =
    baseMinutesPerCase                                   ← FIX (pro Beleg)              [config.ts:38 = 3]
  + quantityMinutes                                      ← ∝ Menge                      [effort-score.ts:38]
  + checkMinutes      (= quantityMinutes × (checkF−1))   ← ∝ Menge                      [effort-score.ts:47]
  + handlingMinutes   (= quantityMinutes × (handF−1))    ← ∝ Menge                      [effort-score.ts:53]
  + priceLabelPrint                                      ← FIX (pro Beleg)              [config.ts:45 = 2]
  + attach   × 0.45  / security × 0.75                   ← FIX pro Position             [config.ts:46-47]
  + online   × 0.6   / redPrice 0.5                      ← FIX pro Position/Beleg       [config.ts:48-49]
```

### Konkretes Beispiel — Beleg „WE-2026-000412", 3000 Teile

Annahmen: `wgrFactor = 1.0`, `handlingClass = bulky` (→ Faktor **1.3**, `config.ts:60`),
`checkMode = quantity_only` (→ 1.0), 10 Positionen je mit Sicherung + Etikett-Anbringung,
`priceLabelPrintRequired = true`.

```text
quantityMinutes = 3000 × 0.35 × 1.0                    = 1050.0
checkMinutes    = 1050 × (1.0 − 1)                      =    0.0
handlingMinutes = 1050 × (1.3 − 1)                      =  315.0   ← mengenproportional
base            =                                          3.0
priceLabelPrint =                                          2.0
attach          = 10 × 0.45                              =    4.5
security        = 10 × 0.75                              =    7.5   ← fix (pro Position/Beleg)
──────────────────────────────────────────────────────────────────
GESAMT minutes  =                                       1382.0  min  ≈ 23,0 h
GESAMT points   = 1382.0  (pointsPerMinute = 1, config.ts:63)
```

Eine 7,5-h-Schicht mit 60 min Pause = **390 min** netto (`net-capacity.ts:37-46`). 1382 ≫ 390
→ **in keiner einzelnen Schicht machbar** → `requires_manual_split` (§3).

#### Variante A — ANTEILIG anrechnen (gleiche Arbeit gemeinsam)

Die Engine rechnet den **Gesamtaufwand strikt nach Mengenanteil** auf die N Mitarbeiter um.
Beispiel-Aufteilung 1500 / 1000 / 500:

```text
Mitarbeiter A: 1382 × (1500/3000) = 691.00 Punkte
Mitarbeiter B: 1382 × (1000/3000) = 460.67 Punkte
Mitarbeiter C: 1382 × ( 500/3000) = 230.33 Punkte
────────────────────────────────────────────────
Σ                                  = 1382.00 Punkte  ✓ (= Gesamt)
```

Gleichmäßig (1000/1000/1000): je **460,67** Punkte. Deterministisch, summen­treu.
*Bewusste Vereinfachung:* der fixe Overhead (17 min) wird mit verteilt — wer die
Positions-Einrichtung macht, wird minimal unter-angerechnet. Für den Piloten akzeptiert;
wer Präzision braucht, nimmt **getrennt**.

#### Variante B — GETRENNT aufnehmen (jeder seine messbare Teilmenge)

Jeder Anteil ist eine **eigenständige Teil-Einheit** mit **real gemessener**
`completedQuantity`; der Aufwand wird **pro Anteil aus der tatsächlichen Menge neu
gerechnet** (gleiche Formel, kleinere `totalQuantity`). Gemessen A=1500, B=1000, C=500:

```text
A: 1500 × 0.35 × 1.3-Handling …  → eigener computeEffort  → eigener ZstRecord
B: 1000 × …                       → eigener computeEffort  → eigener ZstRecord
C:  500 × …                       → eigener computeEffort  → eigener ZstRecord
```

Unterschied zu *anteilig*: jeder fixe/positions­bezogene Overhead wird **dort** gezählt, wo
er real anfällt; die Summe muss **nicht** exakt dem Plan entsprechen (Abweichung,
Kurzlieferung). Leistung wird **gemessen**, nicht dividiert.

> **Mapping auf die Anforderung:** „getrennt aufnehmen" = **GETRENNT** (gemessen je Person),
> „anteilig anrechnen" = **ANTEILIG** (Gesamt nach Anteil dividiert).

### 2.4 Mehrere `ZstRecord` pro `caseId`

`ZstRecord` (`zst.ts:5-16`) trägt bereits `caseId`, `employeeId`, `completedQuantity`,
`effortPoints` mit eigener `id` — **mehrere Records pro Beleg sind schon darstellbar.**
Es ändert sich **kein** ZST-Schema; es ändert sich nur die **Aggregations-/Abschlussregel**:

- **GETRENNT:** N `ZstRecord` (einer je Anteil), jeweils mit real gemessener
  `completedQuantity` und eigenem `effortPoints` (aus der Teilmenge gerechnet).
- **ANTEILIG:** N `ZstRecord`, `completedQuantity` = der zugeteilte Mengenanteil,
  `effortPoints` = der **dividierte** Gesamtaufwand.
- **Abschluss:** Case → `completed`, wenn Σ `completedQuantity` über alle ZST-Records ≥
  `totalQuantity`; sonst `partially_completed` (Status + `reactivate` existieren,
  `caseActions.ts:144-146`).
- **ZST/CSV-Export:** eine Zeile **pro Mitarbeiter-Anteil**, plus eine
  Beleg-Summenzeile — siehe Mockup „Abschluss-/Leistungsansicht".

---

## 3. Engine-Regel-Design

### 3.1 Rechnerischer Ausschluss — `exceeds_single_shift` (Primärregel)

Pro berechtigtem Case vergleicht die Engine `effortMinutes` (`plan.ts:46-48`) gegen die
**größte einzelne verfügbare Schicht** `netCapacityMinutes` (`net-capacity.ts:68`) bzw.
gegen ein konfigurierbares `singleShiftEffortCeilingMinutes`.

```text
ceiling      = singleShiftEffortCeilingMinutes
            ?? max(shift.netCapacityMinutes for shift in shifts where shift.active)
isExcluded   = effortMinutes > ceiling
```

Bei `isExcluded` wird der Case **nicht** ins Auto-Bundling gegeben (vor `eligible`,
`plan.ts:104-111`), sondern als unassigned mit **neuem Grund** geführt — und die Engine
hängt einen **Vorschlag** an:

```text
suggestedSplitCount = ceil(effortMinutes / ceiling)        // gleichmäßiger N-Wege-Vorschlag
```

### 3.2 Mengen-Hardcut — `quantity_hardcut` (expliziter Override)

Konfigurierbarer Schwellwert `autoSplitQuantityThreshold` (z. B. **800** Stück). Gilt
`totalQuantity > threshold`, wird der Case **unabhängig vom gerechneten Aufwand** genauso
ausgeschlossen + markiert. Das ist der einfach erklärbare Politik-Schalter für L&T.

### 3.3 Neuer `UnassignedCase`-Grund

`UnassignedCase.reason` (`types.ts:83-87`) wird konzeptionell erweitert:

```text
reason: 'excluded' | 'no_capacity' | 'held_in_reserve' | 'requires_manual_split'
manualSplitTrigger?: 'computed_effort' | 'quantity_hardcut'
suggestedSplitCount?: number
```

Ein gemeinsamer Grund `requires_manual_split` mit Diskriminator hält das Cockpit einfach
(eine Swimlane „manuell zuteilen"), erklärt aber **warum** (Aufwand vs. Mengen-Hardcut).

### 3.4 Warum 3 primär, 2 als Override (Begründung)

- **Kapazitäts­ehrlich:** Der rechnerische Ausschluss passt sich an die *tatsächlich
  geplanten Schichten* an (kleine Schicht heute → mehr Belege werden manuell) und erfasst
  Aufwand **jenseits der reinen Stückzahl** — Handling-Klasse (Koffer = `bulky`, Faktor
  1.3), Sicherung pro Position, Prüfmodus. Genau Daniels Beispiele „Koffer **oder** 3000
  Teile" sind so *beide* abgedeckt, ohne zwei Schwellen pflegen zu müssen.
- **Mengen-Hardcut** ist grob (ignoriert Aufwandstreiber), aber **trivial erklärbar** und
  gibt dem Betrieb einen harten, vorhersehbaren Riegel. Ideal als bewusster Override für
  „ab X Stück sehen wir immer manuell drauf", auch wenn die Rechnung knapp drunter liegt.
- Beide ergeben **dieselbe** Konsequenz und denselben Cockpit-Zustand — kein divergierender
  Pfad. Die Engine bleibt deterministisch (< 5 s, Anhang E.5) und **splittet nie selbst**.

### 3.5 Konfiguration

Lebt in der bestehenden datengetriebenen Engine-Config (`config.ts`, „Regelpflege" §11):

```text
AssignmentConfig  (+ ergänzt)
  singleShiftEffortCeilingMinutes? : number   // leer = max aktive Schicht
  autoSplitQuantityThreshold?      : number   // leer = Mengen-Hardcut aus
```

Keine neuen Tabellen für den Schwellwert — gleiche Stelle wie `targetBundleMinutes`
(`config.ts:116`), pflegbar durch Teamlead/Admin ohne Code-Änderung.

---

## 4. Kontrakt für die employee-pwa (parallel im Rebuild)

Ein gesplitteter Beleg erscheint in **jedem** beteiligten Mitarbeiter-Bundle als normaler
Beleg, ergänzt um einen **Share-Deskriptor**:

```text
CaseAggregate (PWA-Sicht)  + Split-Felder:
  shareId            : Id
  shareOfTotal       : { quantity: number, total: number }   // „1.000 von 3.000"
  sharePositionIds?  : Id[]                                    // bei Positions-Split
  coworkerCount      : number                                  // „geteilt mit 2 Kolleg:innen"
  captureMode        : 'getrennt' | 'anteilig'
```

- **Banner** oben im Beleg: *„Teil-Beleg · 1.000 von 3.000 Teilen · geteilt mit 2
  Kolleg:innen"*.
- Mindestmengen-Prüfung, Arbeitsanweisung, Boxen etc. arbeiten auf der **Teilmenge** bzw.
  den **Positionen** des Anteils — nicht auf dem ganzen Beleg.
- Beim Abschluss meldet die PWA die `completedQuantity` **des Anteils** → wird zum
  `ZstRecord` dieses Mitarbeiters (GETRENNT: gemessen; ANTEILIG: = zugeteilte Menge).
- **PWA-Verdrahtung ist ein Folge-Task** (Tasks 4ba19 / facd4 bauen die PWA gerade um).
  Dieses Konzept liefert nur den Kontrakt.

---

## 5. Offene Punkte / Risiken / bewusst ausgeklammert

**Offen / zu kalibrieren**
- `singleShiftEffortCeilingMinutes`: „größte aktive Schicht" vs. fester Deckel — im Piloten
  beobachten, welche Variante weniger Fehl-Markierungen erzeugt.
- `autoSplitQuantityThreshold`-Startwert (Vorschlag 800) mit L&T abstimmen.
- Rundung der ANTEILIG-Punkte (letzter Anteil trägt die Rundungsdifferenz, damit Σ exakt
  bleibt).

**Risiken**
- **Teil-Abschluss-Drift:** GETRENNT-Anteile summieren sich evtl. nicht auf `totalQuantity`
  (Kurzlieferung) → Case bleibt `partially_completed`; Teamlead muss den Rest schließen
  (`reactivate`/`cancel`). Muss im Cockpit sichtbar sein.
- **Doppelzählung im ZST-Export** vermeiden: Summenzeile klar als Aggregat kennzeichnen,
  nicht als zusätzliche Leistung exportieren.
- **Mehrfach-Split / Re-Split** (nachträgliches Umverteilen eines Anteils) — siehe unten,
  ausgeklammert.

**Bewusst ausgeklammert (lean Pilot)**
- Kein automatischer Mehr-Mitarbeiter-Split durch die Engine (nur Vorschlag).
- Kein Re-Split eines bereits begonnenen Anteils; Korrektur = `cancel` + neu splitten.
- Keine anteilige Pickup-/Routen-Optimierung über Anteile hinweg (jeder Anteil nutzt die
  bestehende Pickup-Sequenz seiner Positionen).
- Kein eigener Sub-Beleg-Status­automat — wir leihen `partially_completed` + `reactivate`.
- Keine Splits über Bereichs-/Skill-Grenzen mit Spezial-Routing; Anteile erben den festen
  Bereich des Belegs (`plan.ts:96-101`).

---

## 6. Zusammenfassung der vorgeschlagenen Änderungen (für die spätere Umsetzung)

| Schicht | Änderung (konzeptionell) | Referenz heute |
|---|---|---|
| domain-types | neue `CaseShare`-Struktur; `ZstRecord` unverändert | `cases.ts`, `zst.ts:5-16` |
| engine | `requires_manual_split` + `suggestedSplitCount`; Ausschluss vor Bundling; 2 Config-Felder | `plan.ts:104-111`, `types.ts:83-87`, `config.ts` |
| teamlead-web | Aktion `aufteilen` (Registry + Audit `aufteilen`, grund-pflichtig) | `caseActions.ts:54-160`, `audit.ts:12-21` |
| employee-pwa | Share-Deskriptor im CaseAggregate (Folge-Task) | PWA-Rebuild |
| Abschluss | Σ-Mengen-Regel: completed vs. partially_completed | `caseActions.ts:144-146` |

Alle Punkte sind **additiv** und brechen den bestehenden 1-Beleg-1-Bundle-Normalfall nicht.
