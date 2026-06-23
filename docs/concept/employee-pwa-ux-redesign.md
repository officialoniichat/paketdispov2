# Mitarbeiter-App UX-Redesign — Zwei-Phasen-Bundle-Flow

**Stand:** 2026-06-23 · **App:** `apps/employee-pwa` · **Sprache:** Deutsch
**Ersetzt:** den schrittweisen Einzel-Beleg-Flow aus `mitarbeiter-app-ux-mockups.html`
(historisch erhalten). Kein Legacy/Compat-Shim — der alte Flow wurde gelöscht.

> Einordnung: Die frühere Überarbeitung (2026-06-16) war selbst ein Versuch,
> zu vereinfachen, ging aber in die falsche Richtung: Sie warf das Engine-Bundle
> weg, behielt eine 7-Schritt-Kette pro Beleg, zeigte **eine Position nach der
> anderen** und fügte sogar einen separaten „Boxen sortieren"-Schritt hinzu.
> Das Kundenfeedback (L&T, Mellingburgredder) war eindeutig:
> *„Die Position einzeln anzuzeigen ist eine sehr schlechte Übersicht."* und zum
> Schritt-für-Schritt-Ablauf: *„Der Rest ist unnötig."* — relevant ist am Ende
> nur das **erledigt → ZST** pro Beleg.

---

## 1. Der eigentliche Lagerablauf (Kundenbeschreibung)

Der reale Ablauf ist **zweiphasig und bündel-orientiert**, nicht Beleg-für-Beleg:

1. **SAMMELN (COLLECT):** Mitarbeiter nimmt einen Karren und fährt zu mehreren
   Lagerplätzen, um **alle 6–7 Belege/Sendungen** des Bündels zuerst
   einzusammeln. Er braucht **eine konsolidierte Abholliste** aller Lagerplätze
   (idealerweise wegeoptimiert), keine Scanne-einen-dann-nächsten-Schleife.
2. **BEARBEITEN (PROCESS):** Zurück am Tisch sieht er über das ganze Bündel
   hinweg, welche Belege/Positionen Preisetiketten / Sicherung / Online-Handling
   brauchen, druckt alle Etiketten gebündelt und etikettiert/sichert/boxt.
   Etiketten-Infos werden **gebündelt für den ganzen Karren** dargestellt, nicht
   pro Sendung neu durchlaufen.

---

## 2. Grundursache (der eigentliche Fehler)

Die `assignment-engine` emittiert bereits **ein Bereich-homogenes
`AssignmentBundle` pro Mitarbeiter/Tag** (`packages/domain-types/src/assignment.ts`):
konkatenierte `caseIds`, `maxCasesPerBundle: 6`, wegeoptimierte `route`
(RouteStops, §D.3). Das Backend liefert es fertig über
`GET /api/me/today → { bundle: { routeStops … }, cases }`.

Die PWA hat dieses Bündel in der Dexie-v3-Migration **weggeworfen** und durch
eine flache, frei wählbare Einzel-Beleg-Liste ersetzt. → **Die Engine erzeugt
ein Bündel, die App warf es weg.** Das Redesign konsumiert das Engine-Bundle
wieder (Dexie v4).

---

## 3. Flow: vorher → nachher

```
VORHER (über-granular, Bündel verworfen)
  Tagesstart
    → Belegliste (frei wählbar, prioRank-Sortierung)
      → /case/:id/pickup     (Pflicht-Scan, blockiert sonst)
        → /prepare           (Etiketten / Karton / Sortieren – 3 Gates)
          → /positions       (EINE Position nach der anderen, Progressive Disclosure)
            → /sort           (Boxen sortieren – Engine-Vorschlag bestätigen)   ← „unnötig"
              → /boxing       (pro Box: Zettel → Plombe → Förderband – 3 Gates) ← „unnötig"
                → /complete   (ZST)
                  → done

NACHHER (zwei Phasen, Bündel-Ebene)
  /            BundleHome     COLLECT-Status + gesperrte Bearbeiten-Liste
   └─ Hard-Gate ─────────────────────────────────────────────────────────┐
  /collect     CollectScreen  EINE konsolidierte Abholliste (wegeoptimiert) │
                              alle Plätze abhaken (Scan optional)           │
   └─ erst wenn 100 % gesammelt ────────────────────────────────────────────┘
  /case/:id    BelegProcess   ALLE Positionen auf einen Blick
                              §G.2 Etiketten→Karton · Mindest-Stückzahl · Boxen-Info
                              → „Beleg erledigt" (ZST)
  /case/:id/problem           Problem melden (Ebene Position/SKU/Box/Beleg bleibt)
```

8 Screens → **4** (BundleHome, Collect, BelegProcess, Problem).
Gelöscht: `BelegListeScreen`, `LagerplatzScanScreen`, `VorbereitungScreen`,
`PositionScreen`, `BoxenSortierenScreen`, `BoxabschlussScreen`, `AbschlussScreen`
(+ `skip.ts`/`SkipDialog` als verwaister Code).

---

## 4. Wireframes (ASCII, Mobile 390 px)

### 4.1 BundleHome — gesperrt (Sammeln offen)

```
┌──────────────────────────────────────────┐
│ DEIN KARREN · 3 BELEGE · REGAL             │
│ Guten Morgen, Anna                         │
│ ┌────────────────────────────────────────┐│
│ │ Arbeitsplatz: Tisch 4                    ││
│ │ 0 von 3 fertig · ca. 34 Min              ││
│ └────────────────────────────────────────┘│
│ ┌─ 1 · Sammeln ───────────────── [Offen] ─┐│  ← orange umrandet, → /collect
│ │ 0/2 Plätze geholt                        ││
│ └──────────────────────────────────────────┘│
│ 2 · Bearbeiten                              │
│ ⓘ Erst alle Plätze holen, dann bearbeiten.  │
│ ┌───────────────────────────── [Offen] ──┐ │  ┐
│ │ 📦 WE 3656860 · R27 · 9 Teile           │ │  │ ausgegraut,
│ │ 📦 WE 3656861 · R27 · 4 Teile           │ │  │ nicht klickbar
│ │ 📦 WE 3656862 · A-4 · 4 Teile           │ │  ┘ (Hard-Gate)
│ └──────────────────────────────────────────┘│
│ [        Sammeln starten        ]           │
└──────────────────────────────────────────┘
```

### 4.2 CollectScreen — konsolidierte Abholliste

```
┌──────────────────────────────────────────┐
│ ‹ Zurück                                   │
│ SAMMELN · REGAL                            │
│ Plätze abholen                             │
│ 0/2 Plätze · alle holen, dann bearbeiten   │
│ ┌────────────────────────────── [offen] ─┐ │
│ │ (1)  R27        2 Belege                 │ │  ← Tippen = abhaken
│ ├──────────────────────────────────────────┤│     (Scan optional, falls
│ │ (2)  A-4        1 Beleg                   ││      scanRequired)
│ └──────────────────────────────────────────┘│
│ [   Noch 2 offen   ]  (deaktiviert)         │  → „Sammeln fertig → Bearbeiten"
└──────────────────────────────────────────┘     sobald 2/2
```

### 4.3 BelegProcess — alle Positionen auf einen Blick

```
┌──────────────────────────────────────────┐
│ ‹ Zurück   WE 3656860 · R27                │
│ Beleg bearbeiten                           │
│ 5 Positionen · Prüfung: Mindest-Stückzahl  │
│ ┌─ Vorbereitung (§G.2: erst Etiketten) ───┐│
│ │ [ Preisetiketten drucken ]              ││  ← „Karton geöffnet" bleibt
│ │ [ Karton geöffnet ] (gesperrt bis Druck)││     gesperrt bis gedruckt
│ └──────────────────────────────────────────┘│
│ Positionen                                  │
│ ┌──────────────────────────────────────────┐│
│ │ Pos 1 · 411005 …            Soll 1        ││
│ │ 🏷️ Etikett                                ││
│ │ [ Stückzahl geprüft ]                     ││  ← Mindest-Stückzahl je Position
│ ├──────────────────────────────────────────┤│     (immer, auch „Prüfung = Nein")
│ │ Pos 2 · 411006 …            Soll 1        ││
│ │ 🏷️ Etikett  🔴 Rotpreis                   ││  ← Arbeitsanweisungs-Flags
│ │ [ Stückzahl geprüft ]                     ││
│ ├──────────────────────────────────────────┤│
│ │ Pos 3 · 411007 …            Soll 3        ││
│ │ Größe 8 ·1   Größe 9 ·1   Größe 10,5 ·1   ││  ← Multi-SKU dynamisch
│ │ [ Stückzahl geprüft ]                     ││
│ └──────────────────────────────────────────┘│
│ Boxen (Info)                                │
│ Box 1 → Shopbereich 21 · 9 Teile            │  ← nur Info, kein Gate
│ ⓘ Noch offen: Preisetiketten … · Stückzahl… │
│ [ Beleg erledigt ]  [ Teilabschluss ]       │  ← erledigt gesperrt bis Gate ok
│ [ Problem melden ]                          │
└──────────────────────────────────────────┘
```

Weitere Flags pro Position: `🔒 Sicherung` (`securityRequired`),
`🌐 Online` (`onlineHandlingRequired` — nur angezeigt, Verdrahtung ist
separate Aufgabe), `🔴 Rotpreis` (`redPriceRequired`).

---

## 5. Beibehaltene Guardrails

| Guardrail | Wo | Verhalten |
|---|---|---|
| **§G.2 Druck vor Auspacken** | BelegProcess | „Karton geöffnet" ist gesperrt, bis „Preisetiketten drucken" erfolgt ist (`canOpenCarton`). |
| **Mindest-Stückzahl immer** | BelegProcess | Jede Position braucht „Stückzahl geprüft", auch wenn `goodsReceiptCheckMode = quantity_only` („Prüfung = Nein"). |
| **ZST pro Beleg** | BelegProcess | „Beleg erledigt" setzt ZST pro Beleg (nicht pro Position), CSV-exportierbar über den Teamlead-Tagesabschluss. |
| **Problem blockiert Abschluss** | BelegProcess / Problem | Offenes `issue.created` hält das Gate geschlossen, bis geklärt (oder Teilabschluss). |
| **Problem-Scope erhalten** | ProblemMelden | Ebene Position/SKU/Box/Beleg bleibt wählbar — der Teamlead muss wissen, welche Position betroffen ist. |
| **Offline-first / Optimistic Lock** | Dexie + repository | Bundle-, Collect- und Case-Progress laufen lokal, Backend-POSTs sind best-effort. |

**Bewusst entfernt** (Kunde: „unnötig"): Pflicht-Scan beim Abholen,
separater „Boxen sortieren"-Schritt, gateweises Boxen-Verplomben/Förderband,
Progressive Disclosure pro Position.

---

## 6. Datenmodell (Dexie v4)

```
bundle           BundleContext   id='today', bundleId, employeeName, date,
                                 plannedEffortMinutes, bereich, caseIds[]
collectStops     CollectStop     sequence, locationCode, scanRequired, caseIds[]
bundleProgress   BundleProgress  id='today', collectedSequences[], version
belege           BelegListItem   caseId, weBelegNo, order, storageLocationCode,
                                 goodsType, totalQuantity
aggregates       CaseAggregate   case + workInstruction + positions(+skuLines) + boxTargets
progress         CaseProgress    step('process'|'done'), labelsPrinted, cartonOpened,
                                 quantityCheckedPositionIds[], zstDone, partial, version
events           LocalEvent      lokales Audit-Log
```

Die COLLECT-Liste wird aus `bundle.routeStops` rekonstruiert (Reihenfolge =
Engine-Wegeplan §D.3); Fallback ohne RouteStops: Gruppierung der Belege nach
Lagerplatz mit numerischer Sortierung (`db/collectStops.ts`).

## 7. Benachrichtigungs-Hook

`useFocusRefresh` lädt das Bündel bei Fokus/Sichtbarkeit neu — sauberer
Integrationspunkt für späteres Live-Push („neuer Beleg zugeteilt"); im
Offline-Demo-Modus ein No-op.

## 8. Tests & Verifikation

- **Unit (Vitest, 43):** `collect`, `belegList`, `workflowModel` (inkl. §G.2 +
  Mindest-Stückzahl + Issue-Gate), `collectStops`, `sync` (Mapping
  today→Bundle/CollectStops/Belege), `repository` (Optimistic Lock).
- **E2E (Playwright, Mobile 390×844):** COLLECT-Hard-Gate → PROCESS (Etiketten →
  Karton → 5× Stückzahl) → DONE; Problem blockiert erledigt. Screenshots je Phase
  unter `apps/employee-pwa/e2e/screenshots/`.
- Build grün, typecheck + lint sauber, keine verwaisten Routen/Toten Code.

## 9. Arbeitsanweisung-Treue (Punkte 1–11 + Varianten)

**Referenz-PDF:** `docs/reference/arbeitsanweisung-lt-example-we-3656860.pdf` (L&T Wareneingang
V28.038). Das Formular ist ein festes **11-Punkte-Template**; das Beispiel rendert die Punkte
**1, 4, 5, 6, 8, 9, 10, 11** — die Punkte **2, 3, 7** und Varianten (Prüfung %, „Sichern Ja“,
Online, Rotpreis, Platzierungsgrafik) sind bedingt und im Beispiel nicht enthalten.

**Modell (Single Source):** `deriveWorkInstructionPoints(header, positions)` in
`@paket/domain-types` projiziert die gespeicherten Felder auf eine **geordnete Liste von
`WorkInstructionPoint`** (`pointNo?`, `key`, `label`, `value`, `scope`, `positionNos?`,
`assetRef?`). Bestätigte Punkte tragen ihre gedruckte Nummer (1,4,5,6,8,9,10,11); Varianten
(`red_price`, `online_handling`) erscheinen per Key **ohne erfundene Nummer**, bis eine
Varianten-AW die Nummerierung von 2/3/7 belegt. Das Backend berechnet die Liste einmal
(`CaseAggregateDto.instructionPoints`) — die PWA zeigt sie nur an.

**Datenfluss (keine Migration):** Die DB speichert bereits alles
(`PositionInstruction` inkl. `…Location`/`redPrice`/`notes`, `WorkInstructionHeader.checkPercentage`,
`ReceiptSkuLine`). Der Mitarbeiter-Aggregat-Endpoint (`/api/me/cases/:id/aggregate`) projiziert
jetzt `instruction` + `skuLines` je Position **und** `instructionPoints` (vorher fehlten sie —
nur die Teamlead-Sicht hatte sie). OpenAPI wird DB-los neu generiert → `@paket/api-client`.

**Anzeige (BelegProcessScreen):** Eigener „Arbeitsanweisung“-Block mit der geordneten Punktliste.
Die gedruckten Punktnummern bleiben **formtreu** (Lücken wie 2/3/7 wie auf dem Papier; Varianten
gebulletet) — aber **bereits per Button erledigte Punkte werden in der Liste ausgeblendet**:
Preisetikettendruck (1, „drucken“-Button), Preisetiketten anbringen (8, Platzierungs-Karte),
ZST stempeln (11, „Beleg erledigt“) und die redundante Warenbezeichnung (4). Es bleiben die
Info-Punkte (Sortieren 5, Prüfung 6, Boxzettel 9, Sicherung 10, Rotpreis/Online). Daneben:
je Position die Flags (Preisetikett/Sicherung/Online/Rotpreis) + Detailzeilen
(Anbring-Ort, Sicherungs-Ort, Online-Ort, Hinweis); Prüfmodus inkl. **%**; sowie eine
**Platzierungs-Visualisierung** „Preisetikett – wo anbringen?“ (`LabelPlacementHint`:
illustratives SVG + Ort-Texte, mit Slot für ein echtes Asset-Bild via `assetRef`).

**Offen (bewusst):** Die echte Nummerierung/Beschriftung der Punkte 2/3/7 ist erst mit einer
Varianten-Arbeitsanweisung belegbar; bis dahin Varianten ohne Nummer. Echte
Platzierungs-Grafiken kommen später aus ProHandel/AW (heute illustratives Default-SVG).

## 10. Demo-Szenarien (Offline)

Im Offline-Modus zeigt die Home eine `DemoControls`-Leiste (nur ohne Backend): ein
**Belegset-Auswahlfeld** + **„Zurücksetzen“**. Der Katalog (`src/demo/scenarios.ts`) bietet
mehrere Bündel (Standard Regal · 3 Belege; Hängeware · Hängebahn · 2 Belege; Großbündel · Regal ·
4 Belege mit Stichprobe %/Sicherung/Online/Rotpreis). `resetToScenario(id)` leert alle
Dexie-Tabellen und seedet das gewählte Szenario; die Auswahl wird in `localStorage` gemerkt.
