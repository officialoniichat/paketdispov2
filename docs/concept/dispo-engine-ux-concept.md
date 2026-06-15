# Dispo-Engine- & Zuteilungs-UX — Neukonzept (Teamlead-Dashboard)

**Scope:** Die Zuteilungs-/Dispo-UX in `apps/teamlead-web` — „Neu berechnen", Vorschau/Simulation, Reserve, Override, manuelle Eingriffe, Ablagen.
**Fachliche Grundlage:** Konzept v1.5 — §4.3 (Tagesplanung), §8 (Priorisierung, Aufwand, Assignment Engine, Anti-Cherry-Picking), §10 (Teamlead-Dashboard UX), Anhang E.4 (SOTA Teamlead-UX, human-in-the-loop), Anhang E.5 (recalculate < 5 s).
**Art:** Konzeptdokument, **kein Code**. ASCII-Wireframes sind Skizzen, keine Pixelvorgabe.
**Datum:** 2026-06-15

> Dieses Dokument ersetzt das mentale Modell der heutigen Dispo-UX, nicht die fachlichen Regeln. §8-Prioritätsklassen, Aufwandspunkte, eiserne Reserve und Audit bleiben unverändert gültig — sie werden nur **anders bedient**.

---

## (a) Problemanalyse der IST-UX

Die heutige Umsetzung ist funktional weit (vgl. `docs/analysis/ux-gap-analysis.md`, ≈ 80 %), aber das **Bedienmodell** ist unklar. Die Engine selbst ist solide; verwirrend ist, *wie der Teamlead mit ihr spricht*. Konkret:

### P1 — „Neu berechnen" ist überladen und falsch benannt
`CockpitPage.tsx:74-81`: Der Primärbutton heißt **„Neu berechnen"**, öffnet aber einen Dialog mit dem Titel **„Neu berechnen – Vorschau (Simulation)"** (`SimulationPanel.tsx:53`). Das Wort *berechnen* suggeriert eine sofortige Blackbox-Operation, tatsächlich ist es eine Vorschau. Der Teamlead weiß beim Klick nicht: *Rechnet das jetzt etwas um, oder zeigt es mir nur etwas?* Erst im Dialog kommt mit **„Live zuweisen"** die eigentliche Schreiboperation. Ein Knopf, drei Bedeutungen (rechnen / simulieren / zuweisen).

### P2 — Vorschau zeigt Absolutwerte, kein Delta
`SimulationPanel.tsx:70-122`: Die Vorschau listet Bündelzahl, zugewiesen/nicht-zuteilbar, Reserve und Last je MA — alles als **Absolutwert des Vorschlags**. Anhang E.4 fordert ausdrücklich „zeigt Vorschlag, **Delta** und Auswirkungen". Ohne Delta kann der Teamlead die Kernfrage *„Was ändert dieser Vorschlag gegenüber jetzt?"* nicht beantworten. Er muss Zahlen im Kopf gegen den aktuellen Board-Zustand rechnen — genau das, was die UI abnehmen sollte.

### P3 — Zwei konkurrierende Bedien-Paradigmen für denselben Plan
- **Engine-Weg:** Cockpit → Dialog → Vorschau → „Live zuweisen" (Preview-dann-Commit, `SimulationPanel.tsx`).
- **Board-Weg:** Entziehen / Hinzufügen / Reihenfolge / Pause committen **sofort und direkt** ans Backend, ohne Vorschau (`MitarbeiterBoard.tsx:189-278`, `mutations.ts:55-140`).

Damit gibt es zwei Wahrheiten, die sich widersprechen können: Der Teamlead macht chirurgische Eingriffe am Board (sofort wirksam) — und drückt danach „Neu berechnen", das die **ganze** Ready-Liste neu verteilt (`mutations.ts:165-179`, kein UX-seitiges Ausklammern von begonnener oder manuell gesetzter Arbeit). **Frisst der Commit meine gerade gemachten Eingriffe?** Diese Frage beantwortet die UI nicht — also traut der Teamlead dem Knopf nicht.

### P4 — „Starterpakete erzeugen" und „Reserve anpassen" wirken wie eigene Algorithmen
§10.1 zeigt die Buttonzeile `[Neu berechnen] [Starterpakete erzeugen] [Reserve anpassen] [Export]`. Drei davon klingen wie drei unabhängige Rechenaktionen. Tatsächlich sind **Starterpakete** (Frühschicht-Anteil aus Vortagen, §4.3.4 / §8.3 `buildStarterPackages`) und **Reserve** (§4.3.5) nur **Eingaben in dieselbe eine Plan-Berechnung** — keine separaten Outputs. Als gleichrangige Knöpfe neben „Neu berechnen" erzeugen sie den falschen Eindruck dreier konkurrierender Verteilungen.

### P5 — Redundantes, teils totes Feedback
- `CockpitPage.tsx:85-87`: **„Export" hat kein `onClick`** — toter Knopf. Ein Button, der nichts tut, zerstört Vertrauen in alle anderen.
- `CockpitPage.tsx:216-240`: Das Cockpit hat **eigene Erfolgs-/Fehler-Snackbars** für `recalculate`, obwohl der Commit im Dialog passiert. Das Ergebnis-Feedback existiert doppelt (Dialog + Cockpit) und referenziert teils einen `recalcResult`, den der Dialogfluss gar nicht setzt.
- `SimulationPanel.tsx:126`: „Engine-Lauf {durationMs} ms" ist eine Entwickler-Metrik im Entscheidungsdialog — Rauschen, keine Entscheidungshilfe.

### P6 — Reserve erscheint an drei Stellen ohne klare Hoheit
Reserve steht im Cockpit-KPI (`CockpitPage.tsx:110-114`), im Vorschau-KPI (`SimulationPanel.tsx:80-91`) **und** als „Reserve anpassen"-Aktion (§10.1). Welcher Wert ist führend? Wo stelle ich ihn ein, wo lese ich ihn nur?

**Kern der Verwirrung:** Die IST-UX behandelt *Simulieren*, *Zuweisen* und *manuell Eingreifen* als drei separate Mechaniken mit unterschiedlichem Verhalten — und lässt offen, wie sie sich gegenseitig überschreiben. Es fehlt **ein** Modell, das alle drei zu einer einzigen, vorhersagbaren Schleife zusammenfasst.

---

## (b) Leitprinzipien

1. **Ein lebender Plan, eine Wahrheit.** Es gibt zu jedem Zeitpunkt genau einen aktiven Tagesplan. Die UI zeigt nie zwei konkurrierende Zustände nebeneinander.
2. **Vorschlag statt Befehl.** Die Engine *schlägt vor*, der Teamlead *entscheidet*. Nichts am Live-Plan ändert sich ohne ein bewusstes **Übernehmen**.
3. **Frei vs. Fix.** Die Engine verteilt ausschließlich die **freie** Arbeit: bereit, noch nicht begonnen, nicht manuell fixiert. **Laufende und bewusst gesetzte Arbeit ist unantastbar** — die Engine fasst sie nie an. Das löst „zwei Wahrheiten" auf: Es gibt nichts, worüber Engine und Teamlead streiten könnten.
4. **Delta vor Absolutwert.** Jeder Vorschlag zeigt zuerst, *was sich ändert* (Δ), erst dann die neuen Summen.
5. **Eingaben sind keine Aktionen.** Reserve, Prio, Parken, Starterpaket-Politik sind **Stellschrauben am Plan-Input**, keine eigenen Rechen-Knöpfe. Sie ändern, *was* die nächste Verteilung vorschlägt — nicht *ob* gerechnet wird.
6. **Direkteingriff = Fixierung.** Ein chirurgischer Eingriff (Beleg X von Anna nehmen, Prio-Beleg an Bernd geben) wirkt sofort **und fixiert** den Beleg. Die nächste Verteilung respektiert ihn automatisch. Manueller Eingriff und Engine widersprechen sich damit per Konstruktion nie.
7. **Reversibel & auditiert.** Vor dem Übernehmen ist **Verwerfen** immer da. Jede wirksame Änderung trägt Grund + Audit (§8.4).
8. **Wenige Verben.** Der Teamlead kennt genau vier Verben: **Vorschlagen · Übernehmen · Fixieren · Parken.** Alles andere ist Lesen.

---

## (c) Das neue mentale Modell — in einem Satz

> **Es gibt einen lebenden Tagesplan; die Engine schlägt nur für die freie, noch nicht begonnene Arbeit eine Verteilung vor, der Teamlead sieht das Delta und übernimmt oder verwirft — laufende und bewusst fixierte Arbeit bleibt unangetastet.**

Kurzform für die Wand: **„Plan, nicht Rechnung. Vorschlag, nicht Befehl. Frei wird verteilt, Fix bleibt fix."**

Die wichtigste Konsequenz daraus, die die IST-Verwirrung auflöst:

> **Simulation ist kein eigenes Feature.** Ein Vorschlag *anzusehen und nicht zu übernehmen* **ist** die Simulation. „Vor Tagesstart simulieren" (§4.3.7) und „während des Tages neu berechnen" sind nicht zwei Mechaniken — es ist **dieselbe Schleife**, einmal mit und einmal ohne Übernehmen.

---

## (d) End-to-End-Ablauf mit Wireframes

Der gesamte Dispo-Loop besteht aus **drei** Bildern: **Cockpit → Vorschlag (Delta) → Übernommen.** Plus dem Board für Direkteingriffe. Mehr braucht es nicht.

### Die eine Schleife

```
                 ┌────────────────────────────────────────────────┐
                 │                  COCKPIT                        │
                 │  Plan-Status · Kapazität · Reserve · Pool · ZST │
                 │            [ Verteilung vorschlagen ]           │
                 └───────────────┬───────────────────┬────────────┘
                                 │                   │
            Direkteingriff       │                   │  „Verteilung vorschlagen"
        (Board: fixiert sofort)  │                   ▼
                                 │        ┌────────────────────────┐
                                 │        │  VORSCHLAG (Delta)      │
                                 │        │  Was ändert sich? Δ     │
                                 │        │  Auswirkung Reserve/Last│
                                 │        │ [Verwerfen] [Übernehmen]│
                                 │        └────┬──────────────┬─────┘
                                 │       Verwerfen        Übernehmen
                                 │             │              │
                                 └─────────────┴──────────────┘
                                          zurück zum Cockpit
                                   (Übernehmen schreibt Plan + Audit)
```

Der Teamlead ist **immer** auf dem Cockpit/Board zu Hause. Der Vorschlag ist ein kurzer, modaler Abstecher mit genau zwei Ausgängen.

---

### Screen 1 — Cockpit

Ein Bildschirm beantwortet: *Wie steht der Tag? Brauche ich die Engine? Was ist mein nächster Schritt?* Genau **ein** Primärbutton.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Heute · Logistik Warenauszeichnung           Mo 15.06.2026   [ Verteilung    ]│
│                                                              [ vorschlagen  ▸]│
├──────────────────────────────────────────────────────────────────────────────┤
│ PLAN-STATUS                                                                    │
│   ● Plan aktuell · zuletzt übernommen 09:12 · 3 Belege im freien Pool          │
│                                                                                │
│ KAPAZITÄT      8 MA geplant · Netto 2.760 min · Verplant 1.940 min · 70 %      │
│ RESERVE morgen   420 min   ◀───────●────────▶  (0 … 600)   ⓘ wirkt im Vorschlag│
│ FREIER POOL    Offen 3 · Überfällig 0 · Prio 1 ⚠ · CatMan 0 · Problem 2 ⚠       │
│ ZST            fertig 31/86  ████████░░░░░░░░░░  36 %                           │
│                                                                                │
│ LETZTE EINGRIFFE (Audit §8.4)                                                  │
│   09:41  WE-4711 vorgezogen → „Filiale wartet"                                 │
│   09:18  WE-3303 von Anna entzogen → „überlastet"                              │
│                                              [ Zum Board ]  [ Ablagen ]         │
└──────────────────────────────────────────────────────────────────────────────┘
```

Designentscheidungen gegenüber IST:
- **„Neu berechnen" → „Verteilung vorschlagen".** Der Name sagt, was passiert: ein Vorschlag erscheint, nichts wird sofort geschrieben.
- **PLAN-STATUS-Zeile** ist neu und zentral: *aktuell* vs. *Vorschlag verfügbar* (z. B. wenn neue Belege importiert wurden oder sich Kapazität geändert hat). Sie sagt dem Teamlead, **wann** er die Engine braucht — er muss nicht raten.
- **Reserve ist ein Schieber im Cockpit**, kein eigener Knopf. Er ist die Stellschraube; sein Wert wirkt im nächsten Vorschlag. (Prinzip 5, behebt P4/P6 — eine Hoheit für Reserve.)
- **„Freier Pool"** statt „Offener Pool": macht das Frei/Fix-Modell sichtbar. Gezählt wird nur, was die Engine überhaupt verteilen darf.
- **„Export" gestrichen** (siehe f). **Cockpit-Recalc-Snackbars gestrichen** — Ergebnis-Feedback gehört in den Vorschlags-/Übernommen-Screen.

---

### Screen 2 — Vorschlag (Delta)

Das Herzstück. **Delta zuerst.** Beantwortet die drei Fragen aus Anhang E.4: *Was schlägt die Engine vor? Was ändert sich? Was bedeutet es für Reserve und Last?*

```
┌─ Verteilungs-Vorschlag ─────────────────────────────────────────  Engine ✓ ──┐
│ Auslöser: 3 neue Belege (Tagesnachschub) · Reserve-Ziel 480 → 420 min          │
│                                                                                │
│ WAS ÄNDERT SICH                                                                │
│   +  3 Belege  neu zugeteilt           (waren offen im freien Pool)            │
│   ↹  1 Beleg   Anna → Bernd            (frei, nicht begonnen)                   │
│   =  5 Pakete  laufen — bleiben fix     (Engine fasst sie nicht an)            │
│   📌 2 Belege  manuell fixiert          bleiben unverändert                     │
│   ⏸ 1 Beleg   bleibt offen             (Reserve-Schutz, niedrigste Prio)       │
│                                                                                │
│ AUSWIRKUNG                            vorher     nachher       Δ                │
│   Reserve morgen                      480 min    420 min     −60                │
│   Prio-Beleg WE-4711 enthalten        nein       ja          ✓                  │
│   ───────────────────────────────────────────────────────────────             │
│   Anna     6,5 h   ███████░░  78 → 71 %   1.020 → 930 min    −90                │
│   Bernd    5,0 h   ████████░  80 → 92 % ⚠ 1.200 → 1.380 min  +180               │
│   Claudia  7,0 h   █████░░░░  65 → 65 %   1.640 → 1.640 min     0               │
│                                                                                │
│   ⚠ Bernd läge bei 92 % — innerhalb der Schwelle, aber eng.                     │
│   ✓ Eiserne Reserve bleibt geschützt.  ✓ schwer/leicht je Schicht gemischt.    │
│                                                                                │
│                                          [ Verwerfen ]   [ Übernehmen  ▸ ]      │
└────────────────────────────────────────────────────────────────────────────────┘
```

Designentscheidungen:
- **„WAS ÄNDERT SICH"** ist die Δ-Liste: neu zugeteilt / verschoben / **läuft (fix)** / **manuell fixiert** / offen-gehalten. Macht Prinzip 3 (Frei/Fix) und Prinzip 4 (Delta) sichtbar. Behebt P2 und P3: Der Teamlead sieht schwarz auf weiß, dass seine Direkteingriffe (📌) **nicht** angefasst werden.
- **Reserve-Schutz ist sichtbares Verhalten:** Die Engine isst nie die Reserve auf (§8.3). Reicht die Kapazität nicht, bleibt der **niedrigstpriorisierte** Beleg offen — und der Vorschlag sagt es offen an (`⏸ 1 Beleg bleibt offen`), statt still Reserve zu verbrennen.
- **Last je MA als Δ-Balken** (vorher → nachher), Warnschwelle inline. Kein Punkt-/ms-Rauschen mehr im Entscheidungsbereich (Engine-Dauer wandert in einen dezenten „Engine ✓"-Tooltip — P5).
- **Genau zwei Ausgänge:** Verwerfen / Übernehmen. „Live zuweisen" entfällt als Begriff — es heißt **Übernehmen**, weil der Teamlead einen *Vorschlag* übernimmt, keine Berechnung startet.

---

### Screen 2b — Vorschlag ohne Änderung (No-Op)

Wenn nichts frei verteilbar ist, darf **kein** leerer, beängstigender Dialog erscheinen.

```
┌─ Verteilungs-Vorschlag ────────────────────────────────────────────────────────┐
│ ✓ Plan ist aktuell. Keine freie, unverteilte Arbeit vorhanden.                  │
│   86 Belege verteilt · 5 Pakete laufen · Reserve 420 min geschützt.             │
│   Es gibt nichts zu übernehmen.                              [ Schließen ]       │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

### Screen 3 — Übernommen (Bestätigung am Cockpit)

Nach Übernehmen kehrt der Teamlead aufs Cockpit zurück. **Ein** ruhiges Bestätigungsband, dann ist der Plan-Status wieder „aktuell".

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ✓ Übernommen 10:03 · 3 neu zugeteilt · 1 verschoben · Reserve 420 min · Audit ✓│
├──────────────────────────────────────────────────────────────────────────────┤
│ PLAN-STATUS   ● Plan aktuell · zuletzt übernommen 10:03 · 0 Belege im Pool      │
│  …                                                                             │
```

---

### Board — Direkteingriff (fixiert sofort)

Chirurgische Eingriffe bleiben **direkt und schnell** — aber das Modell macht klar, dass sie *fixieren* (Prinzip 6). Kein Vorschau-Umweg für den Ein-Beleg-Fall.

```
┌ Mitarbeiterboard ─────────────────────────────────────────────────────────────┐
│ Anna     6,5 h · 71 % · 0 Issues · Paket 2/3 läuft                              │
│   1. ✓ WE-3301  fertig                                                          │
│   2. ▸ WE-3302  läuft        ← fix · Engine rührt das nicht an                  │
│   3.   WE-3303  wartet (frei)               [ Entziehen ]  [ ↑ ][ ↓ ]           │
│ Bernd    5,0 h · 92 % ⚠ · 1 Issue · Paket 1/2 läuft     [ + Beleg aus Pool ]    │
│                                                                                │
│  „Entziehen" / „+ Beleg" → Grund-Dialog → wirkt sofort, auditiert (§8.4)        │
│  Ergebnis: Beleg ist 📌 fixiert — der nächste Vorschlag respektiert ihn.         │
└──────────────────────────────────────────────────────────────────────────────────┘
```

So fügen sich die §10.3-Aktionen (Entziehen / Hinzufügen / Reihenfolge / Pause) **nahtlos** in den Loop: Sie sind die „Fix"-Seite des Frei/Fix-Modells. Der Teamlead lernt eine einzige Regel — *was ich anfasse, ist fix; den Rest verteilt die Engine* — und beide Welten können sich nie widersprechen.

---

## (e) Zustände & Edge-Cases

| Situation | Verhalten | Begründung |
|---|---|---|
| **Nichts zu verteilen** (Pool leer / alles zugeteilt) | Vorschlag öffnet als **No-Op-Karte** (Screen 2b), kein Übernehmen-Button. | Leerer Diff-Dialog wäre verwirrend; klare Aussage „Plan ist aktuell". |
| **Reserve würde unterschritten** | Engine isst Reserve **nicht**; sie lässt die niedrigstpriorisierten Belege offen und zeigt `⏸ N Belege bleiben offen (Reserve-Schutz)`. | §4.3.5 / §8.3: Reserve schützt den Folgetag. Lieber Pool sichtbar offen als Reserve still verbrannt. |
| **Teamlead will Reserve bewusst opfern** | Reserve-Schieber im Cockpit runtersetzen → neuer Vorschlag verteilt mehr. Bewusste Eingabe, kein versteckter Automatismus. | Prinzip 5: Reserve ist Stellschraube, die Entscheidung bleibt menschlich. |
| **Laufende Pakete** (MA mitten in Bearbeitung) | Vom Vorschlag **ausgeschlossen** (`= läuft, bleibt fix`); ihre Minuten zählen als verbrauchte Kapazität. | Prinzip 3. Laufende Arbeit umzuverteilen wäre chaotisch und nicht sinnvoll auditierbar. |
| **Direkteingriff danach Vorschlag** | Fixierte Belege erscheinen als `📌 unverändert`. | Prinzip 6 — keine zwei Wahrheiten. |
| **Neue Belege während des Tages** (Tagesnachschub, §4.3.6) | PLAN-STATUS wechselt auf „Vorschlag verfügbar: +N Belege"; Teamlead holt Vorschlag, wenn er will. | Push der Information, Pull der Entscheidung. Kein Auto-Reshuffle ohne Zustimmung. |
| **Prio-/überfälliger Beleg im Pool** | Vorschlag hebt hervor, ob er enthalten ist (`Prio-Beleg WE-4711 enthalten ✓/nein`). | §8.1 Rang 1–3; der Teamlead muss sehen, dass Dringendes drin ist. |
| **MA fällt aus (krank)** | Pause/Abwesenheit am Board (fix) → Kapazität sinkt → Vorschlag verteilt deren freie Belege neu. | Eine Mechanik für „weniger Hände", kein Sonderfluss. |
| **Engine > 5 s / Fehler** | Vorschlag zeigt Fehler statt halber Daten; **kein** Teil-Commit. Übernehmen bleibt gesperrt, bis ein vollständiger Vorschlag vorliegt. | Anhang E.5 (< 5 s Ziel); atomar — entweder ganzer Vorschlag oder keiner. |
| **Geparkter Beleg** (§8.1 Rang 0) | Bleibt aus jedem Vorschlag ausgeschlossen, sichtbar in Ablage „Geparkt"; Freigeben macht ihn wieder frei. | Parken ist die explizite „nicht verteilen"-Stellschraube. |

---

## (f) Bewusst gestrichene / umgebaute Features

| # | Element (IST) | Entscheidung | Begründung |
|---|---|---|---|
| 1 | **Begriff „Neu berechnen"** | **Umbenannt** → „Verteilung vorschlagen"; Dialog-Aktion „Live zuweisen" → „Übernehmen" | „Berechnen" framt eine Blackbox-Sofortaktion. Das Modell ist *Vorschlag → Übernehmen*, und die Begriffe müssen das sagen (P1). |
| 2 | **Eigenständiges Feature „Simulation"** | **Gestrichen als Konzept** — Simulation = Vorschlag-ansehen-ohne-Übernehmen | Eine Schleife statt zweier Mechaniken. „Vor Tagesstart simulieren" (§4.3.7) und „während des Tages neu berechnen" sind identisch (P1/P3). |
| 3 | **Vorschau mit reinen Absolutwerten** | **Ersetzt** durch Delta-Ansicht (vorher → nachher, Δ) | Anhang E.4 fordert Delta; Absolutwerte beantworten die Entscheidungsfrage nicht (P2). |
| 4 | **Button „Starterpakete erzeugen"** | **Gestrichen als Aktion** — automatischer Teil des Vorschlags (Frühschicht-Anteil, §8.3 `buildStarterPackages`); bei Bedarf Toggle *im* Vorschlag | Starterpakete sind ein Plan-**Input**, kein eigener Algorithmus. Peer-Knopf suggeriert dritte konkurrierende Verteilung (P4). |
| 5 | **Button „Reserve anpassen"** | **Gestrichen als Modal-Aktion** — wird **Schieber im Cockpit** | Reserve ist eine Zahl, die jeden Vorschlag formt. Ein Knopf, der eine Berechnung impliziert, ist das falsche mentale Bild; eine Stellschraube ist das richtige (P4/P6). |
| 6 | **Button „Export" (ohne `onClick`)** | **Gestrichen** | Toter Knopf zerstört Vertrauen. KPI-/ZST-Export (§15) ist ein eigenes, später zu definierendes Feature und gehört nicht in die Dispo-Buttonzeile (P5). |
| 7 | **Cockpit-eigene Recalc-Snackbars** (`CockpitPage.tsx:216-240`) | **Gestrichen** — Ergebnis-Feedback nur im Vorschlags-/Übernommen-Band | Doppeltes Feedback (Dialog + Cockpit), teils auf nicht gesetzten Daten. Eine Quelle der Rückmeldung (P5). |
| 8 | **„Engine-Lauf {durationMs} ms" im Dialogtext** | **Relegiert** in dezenten „Engine ✓"-Tooltip | Entwickler-Metrik im Entscheidungsbereich ist Rauschen. Das < 5 s-Ziel (E.5) ist eine Betriebs-, keine Teamlead-Entscheidungsgröße (P5). |
| 9 | **Zwei Bedien-Paradigmen** (Board sofort vs. Engine Preview-Commit) | **Vereinheitlicht** unter Frei/Fix: Direkteingriff = sofort + fixiert; Engine = Vorschlag→Übernehmen für den freien Rest | Beseitigt „zwei Wahrheiten" per Konstruktion statt per Erklärung (P3). |

**Bewusst NICHT gestrichen** (das Modell baut darauf auf): §8-Prioritätsklassen, Aufwandspunkte, eiserne Reserve, Anti-Cherry-Picking, Override-mit-Grund + Audit (§8.4), Ablagen-Lanes (§10.2), Mitarbeiterboard-Aktionen (§10.3), Belegdetails (§10.4). Diese sind fachlich korrekt — sie werden nur in **eine** kohärente Schleife eingebettet.

---

## Zusammenfassung der Wirkung

| Vorher (IST) | Nachher (Konzept) |
|---|---|
| „Neu berechnen" = rechnen? simulieren? zuweisen? | **Verteilung vorschlagen** → Delta sehen → **Übernehmen** |
| Vorschau zeigt Absolutwerte | Vorschau zeigt **Δ** + Reserve-/Last-Auswirkung |
| Board sofort, Engine über Dialog — frisst Commit meine Eingriffe? | **Frei wird verteilt, Fix bleibt fix** — keine Kollision möglich |
| 4 Buttons (2 davon Inputs, 1 tot) | **1 Primärbutton** + Reserve-Schieber als Input |
| Simulation als eigenes Feature | Simulation = Vorschlag ohne Übernehmen |

Vier Verben, ein Plan, ein Vorschlag-Screen. Weniger Oberfläche, ein klares, lehrbares Modell.
