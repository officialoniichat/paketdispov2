# Dispo-Flow Rework — „Neu berechnen" entwirren (umsetzungsreif)

**Scope:** Der Zuteilungs-/Automatik-Flow im Tagescockpit (`apps/teamlead-web`): der eine
Button, der Vorschlag/Simulation, das Übernehmen. Nur das Wesentliche.
**Status:** Konzept, kein Code. Schärft `docs/concept/dispo-engine-ux-concept.md` (Modell stimmt,
wurde aber nie umgesetzt) auf den **heutigen** Codestand (Reserve liegt jetzt in der Regelpflege,
Kapazität kommt aus dem Schichtplan, Mitarbeiternamen sind verfügbar).
**Datum:** 2026-06-16

---

## 1. Befund (was heute verwirrt) — Code-belegt

| # | Problem | Fundstelle |
|---|---------|-----------|
| B1 | Button heißt **„Neu berechnen"**, öffnet aber einen Dialog **„Neu berechnen – Vorschau (Simulation)"**. Ein Klick, drei Bedeutungen: rechnen / simulieren / zuweisen. | `CockpitPage.tsx:74-81`, `SimulationPanel.tsx:53` |
| B2 | Der eigentliche Schreibakt heißt **„Live zuweisen"** — ein vierter Begriff für dieselbe Sache. | `SimulationPanel.tsx:149` |
| B3 | Vorschau zeigt **Absolutwerte** (Bündel, zugewiesen, Reserve), **kein Delta** — „was ändert sich?" bleibt offen. | `SimulationPanel.tsx:70-122` |
| B4 | Last-Tabelle zeigt **`employeeId`** statt Namen — kryptisch. | `SimulationPanel.tsx:112` |
| B5 | **Entwickler-Rauschen** im Entscheidungsdialog: „Engine-Lauf {durationMs} ms". | `SimulationPanel.tsx:126` |
| B6 | Cockpit hat **eigene Erfolgs-/Fehler-Snackbars** für recalculate — doppeltes Feedback neben dem Dialog. | `CockpitPage.tsx:216-240` |
| B7 | **„Export" ist ein toter Knopf** (kein `onClick`). Tote Knöpfe zerstören Vertrauen in alle anderen. | `CockpitPage.tsx:85-87` |
| B8 | Nichts sagt dem Teamlead, **wann** er den Button braucht. Er rät. | — (fehlt) |

Kernursache: *Simulieren*, *Zuweisen* und *manuell Eingreifen* werden als drei Mechaniken mit
unterschiedlichem Wording behandelt. Es fehlt **ein** Modell und **ein** Auslöser.

---

## 2. Das eine Modell — in einem Satz

> **Es gibt einen lebenden Tagesplan. Der Teamlead drückt „Verteilung vorschlagen", sieht das
> Delta (was ändert sich für Reserve und Köpfe) und übernimmt oder verwirft — laufende und
> manuell gesetzte Arbeit bleibt unangetastet.**

Konsequenz, die die Verwirrung auflöst: **Simulation ist kein eigenes Feature.** Einen Vorschlag
*ansehen und nicht übernehmen* **ist** die Simulation. Es gibt nur eine Schleife.

Backend ist schon richtig: `preview` (liest, schreibt nichts) + `recalculate` (schreibt). Falsch
ist nur die **Oberfläche** darüber. Diese Rework ist fast reine UX — kein Engine-Umbau.

---

## 3. Wo der Button hingehört & der Flow

**Genau ein Primärbutton im Cockpit-Header**, dort wo heute „Neu berechnen" steht
(`CockpitPage.tsx:73-88`). Daneben **eine Plan-Status-Zeile** — sie ist der fehlende Auslöser (B8):
sie sagt, *ob* der Button gerade etwas bringt.

```
┌─ Heute · Logistik Warenauszeichnung ───────────── Mo 16.06.2026 ──────────────┐
│                                                                                │
│  PLAN-STATUS:  ● Plan aktuell · zuletzt übernommen 09:12        [ Verteilung  ]│
│                (oder) ⏳ Vorschlag verfügbar: +3 neue Belege     [ vorschlagen ▸]│
│                                                                  [ Zum Board ]  │
└────────────────────────────────────────────────────────────────────────────────┘
        Kapazität · Offener Pool · ZST · Audit  (wie heute, unverändert)
```

- **Plan aktuell** → der Button ist ruhig/sekundär; es gibt nichts zu verteilen.
- **Vorschlag verfügbar (+N Belege / Kapazität geändert)** → der Button ist hervorgehoben; jetzt lohnt er sich.
- Status leitet sich ab aus: offener Pool > 0, oder neue Belege seit letztem Übernehmen, oder
  Kapazität (Schichtplan/Abwesenheit) geändert.

### Der ganze Flow = 3 Bilder

```
   COCKPIT ──"Verteilung vorschlagen"──▶ VORSCHLAG (Delta) ──[Übernehmen]──▶ COCKPIT
      ▲                                      │                                 (Band: „✓ übernommen")
      │                                  [Verwerfen]
      └──────────────────────────────────────┘
   Board-Direkteingriff (entziehen/+Beleg) wirkt sofort & fixiert — kein Umweg.
```

### Screen: VORSCHLAG (Delta) — ersetzt den heutigen Simulationsdialog

```
┌─ Verteilungs-Vorschlag ──────────────────────────────────────────────  ✓ ────┐
│ Auslöser: 3 neue Belege · Reserve-Ziel 480 → 420 min                           │
│                                                                                │
│ WAS ÄNDERT SICH                                                                │
│   +  3 Belege   neu zugeteilt          (waren offen)                            │
│   ↹  1 Beleg    Anna → Bernd           (frei, nicht begonnen)                   │
│   =  5 Pakete   laufen — bleiben fix    (Engine fasst sie nicht an)            │
│   ⏸  1 Beleg    bleibt offen           (Reserve-Schutz, niedrigste Prio)        │
│                                                                                │
│ AUSWIRKUNG                         vorher    nachher     Δ                      │
│   Reserve morgen                   480 min   420 min   −60                      │
│   Anna      ███████░░  78 → 71 %   1.020 → 930   −90                            │
│   Bernd     ████████░  80 → 92 %⚠  1.200 → 1.380 +180                           │
│   Claudia   █████░░░░  65 → 65 %   1.640 → 1.640   0                            │
│   ⚠ Bernd läge bei 92 % (über Überstunden-Toleranz +10 %).                      │
│                                                                                │
│                                          [ Verwerfen ]   [ Übernehmen ▸ ]       │
└────────────────────────────────────────────────────────────────────────────────┘
```

- **Delta zuerst** (vorher → nachher, Δ), Namen statt Ids, Warnschwelle = Überstunden-Toleranz
  des Kopfes (aus Mitarbeiter-Einstellungen).
- **No-Op-Fall:** ist nichts frei verteilbar → kleine Karte „✓ Plan ist aktuell, nichts zu
  übernehmen", **kein** Übernehmen-Button. Kein leerer, beängstigender Dialog.
- Genau zwei Ausgänge: **Verwerfen / Übernehmen**.

---

## 4. Konkrete Änderungen (umsetzungsreif, minimal)

| Tun | Wo | Aufwand |
|-----|----|---------|
| Button „Neu berechnen" → **„Verteilung vorschlagen"** | `CockpitPage.tsx:74-81` | trivial |
| Dialog-Titel → **„Verteilungs-Vorschlag"**; „Live zuweisen" → **„Übernehmen"**; „Verwerfen" bleibt | `SimulationPanel.tsx:53,149` | trivial |
| **Plan-Status-Zeile** ergänzen (aktuell / Vorschlag verfügbar +N) | `CockpitPage.tsx` Header | klein |
| Last-Tabelle: **Namen** statt `employeeId` (Board hat die Namen schon) | `SimulationPanel.tsx:112` | klein (Map id→name aus board/employees) |
| **Delta** vorher→nachher statt Absolutwerte; ⚠ ab Überstunden-Toleranz | `SimulationPanel.tsx:70-122` | mittel (braucht aktuellen Last-Stand zum Vergleich) |
| **durationMs** raus aus dem Dialog (höchstens dezenter „✓"-Tooltip) | `SimulationPanel.tsx:126` | trivial |
| Cockpit-**Recalc-Snackbars streichen** (Feedback nur im Übernommen-Band) | `CockpitPage.tsx:216-240` | trivial |
| Toten **„Export"-Button entfernen** (KPI-Export ist ein eigenes, späteres Feature) | `CockpitPage.tsx:85-87` | trivial |

Backend bleibt unangetastet (`preview` + `recalculate` passen). Reserve bleibt **eine** Hoheit:
Regel in der Regelpflege (`Admin → Reserve`), Wert als KPI im Cockpit, Wirkung sichtbar im
Vorschlag — **kein** zweiter Slider.

---

## 5. Bewusst weggelassen (wesentlich bleiben)

- **Kein** separates „Simulation"-Feature, **kein** „Starterpakete erzeugen"-Knopf, **kein**
  Reserve-Slider im Cockpit — alles sind Eingaben in *die eine* Verteilung (Schichtplan, Prio,
  Reserve-Regel), nicht eigene Knöpfe.
- **Kein** Mehrtages-/Vorschau-Kalender. Der Flow ist „heute".
- **Kein** Auto-Reshuffle. Information wird gepusht (Plan-Status), die Entscheidung bleibt ein
  bewusster Klick (Pull).
- **Kein** Export jetzt (toten Knopf lieber weg als halb da).

## 6. Wirkung

| Vorher | Nachher |
|--------|---------|
| „Neu berechnen" = rechnen? simulieren? zuweisen? | **Verteilung vorschlagen → Delta → Übernehmen** |
| Vorschau = Absolutwerte, Ids, ms | **Delta**, Namen, Reserve-/Last-Wirkung |
| „Wann brauche ich den Button?" — raten | **Plan-Status** sagt es |
| 3 Buttons (1 tot) + doppelte Snackbars | **1 Primärbutton**, ein Feedback-Band |
