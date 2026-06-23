# Konzept — Bündel-Fortsetzung & Mehr-Bündel-Tag (Mitarbeiter-App)

**Status:** Konzept (kein Code). **Stand:** 2026-06-23.
**Baut auf:** `employee-pwa-ux-redesign.md` (Zwei-Phasen-Flow COLLECT → PROCESS → DONE),
`automatik-dispo-konzept.md`, `dispo-engine-ux-concept.md`, `beleg-lifecycle-completion-concept.md`.
**Entscheidung (mit Kunde):** **Pull-on-idle** — der Mitarbeiter holt das nächste Bündel selbst,
die Engine gibt das aktuell beste freie Karren-Bündel aus.

---

## 1. Problem

Heute endet der Mitarbeiter-Flow in einer **Sackgasse**: ist das eine zugeteilte Bündel fertig,
zeigt die App „alle erledigt" — und das war's. Es gibt **keine Fortsetzung**. Ursachen (belegt):

- **Genau ein Bündel pro MA/Tag.** `GET /api/me/today` ist `findFirst` (ein Bündel). Die Engine
  rechnet zwar den ganzen Tag in **karren-große Proto-Bündel** (≤ 6 Belege, Bereich-homogen,
  wegeoptimiert — exakt ein Karren), **merged sie aber zu EINEM `AssignmentBundle`** und **wirft
  alles darüber in `unassigned`** (`distribute.ts`: `st.bundleCount = 1`). → Schnelle Kräfte
  bekommen nichts mehr, fertige Ware liegt unzugeteilt.
- **Kein Abschluss-Marker.** Wird der letzte Beleg `completed`/ZST, passiert mit dem Bündel
  **nichts** — kein Status `completed`, der MA wird nie „frei". Status `accepted`/`active`/`completed`
  existieren im Enum, werden aber **nie gesetzt** (`getCurrentBundle` liefert daher immer `null`).
- **Nur Teamlead-Trigger.** Neuverteilung gibt es nur über „Neu berechnen" (recalculate). Es gibt
  **keinen Worker-Pull**.

Das Zielbild war im Konzept schon angelegt — als **Folge-Epic** und als Worker-Berührungspunkt:
*„Worker (Tempo: ‚Nächste holen')"* und *„Worker ‚Nächste Belege holen' … braucht einen
Pull-Endpoint"* (`automatik-dispo-konzept.md`). Dieses Konzept füllt das aus.

---

## 2. Kernidee

Der **Tag eines MA = eine Folge karren-großer Bündel**, nacheinander abgearbeitet — **immer genau
EIN aktives Bündel** (ein Karren). Ist es fertig, **holt** der MA das nächste; die Engine gibt das
**jetzt beste freie** Karren-Bündel aus dem aktuellen `ready`-Pool aus (inkl. unterm Tag
eingelagerter Ware), **Bereich-bewusst**, **reserve-geschützt**, im Rahmen der **Restkapazität** der
Schicht.

Damit bleibt der saubere Zwei-Phasen-Flow (einen Karren sammeln → bearbeiten) **unverändert** — es
kommt nur die **Fortsetzung** dazu. Prinzipien (aus dispo-Konzept): **Reserve ist heilig**,
**Push der Information / Pull der Entscheidung**, **Frei/Fix** (laufende/begonnene Arbeit unantastbar).

> Bewusst **nicht** mehrere gleichzeitig aktive Bündel und **kein** vorab fixierter Tagesplan
> (Pull-on-idle gewann gegen „pre-planned queue"): adaptiver, fairer (schnelle Kräfte ziehen mehr),
> nimmt Tagesnachschub auf, schützt die Reserve zum Ausgabezeitpunkt.

---

## 3. UX-Mockups (Mobile)

### 3.1 Bündel fertig → nächstes holen (der neue Übergang)
Ersetzt die heutige „alle erledigt"-Sackgasse, sobald der letzte Beleg erledigt ist.

```
┌──────────────────────────────────────────┐
│ Karren 1 · fertig ✓                        │
│ Guten Lauf, Anna 🎉                        │
│ ┌────────────────────────────────────────┐│
│ │ Dieses Bündel: 6 Belege · 48 Min         ││
│ │ Heute gesamt: 6 Belege · 48 Min          ││  ← Tagesfortschritt
│ └────────────────────────────────────────┘│
│                                            │
│ Nachschub frei: 3 Belege (Regal)           │  ← Push der Info (aus Pool-Stand)
│ [        Nächstes Bündel holen         ]   │  ← Pull der Entscheidung
│ [        Pause / Feierabend             ]  │
└──────────────────────────────────────────┘
```
Tippen → kurzer „Bündel wird zusammengestellt…" → neues Karren-Bündel lädt → **zurück in COLLECT**
(`/collect`) mit der neuen, wegeoptimierten Abholliste.

### 3.2 Kein Nachschub frei (Pool leer / nur Reserve)
```
┌──────────────────────────────────────────┐
│ Karren 1 · fertig ✓                        │
│ Aktuell nichts frei zum Holen.             │
│ ⓘ Es bleibt nur Reserve übrig – die wird   │
│   nicht angetastet. Neue Ware erscheint    │
│   automatisch, sobald sie eingelagert ist. │
│ [ Aktualisieren ]   [ Pause / Feierabend ] │
└──────────────────────────────────────────┘
```
Die App pollt/aktualisiert (Notification-Hook `useFocusRefresh`); sobald die Engine wieder etwas
Freies hat, wird „Nächstes Bündel holen" aktiv (Push der Info).

### 3.3 Home mit Tagesfortschritt (kleine Ergänzung der bestehenden Hub)
```
┌──────────────────────────────────────────┐
│ DEIN KARREN · 6 BELEGE · REGAL             │
│ Guten Morgen, Anna                         │
│ Heute: Karren 2 · 6 erledigt · ~48 Min     │  ← „heute"-Zähler (kumuliert)
│ … (COLLECT / Bearbeiten wie gehabt) …      │
└──────────────────────────────────────────┘
```

### 3.4 Neuer eiliger Beleg unterm Tag (Notification)
Während ein Bündel läuft, liefert der Notification-Hook „neue Zuteilung":
```
┌──────────────────────────────────────────┐
│ 🔔 Neuer eiliger Beleg verfügbar           │
│ Ein NOS/Eil-Beleg wartet im Pool.          │
│ [ Nach diesem Karren holen ]  [ Später ]   │  ← unterbricht NIE den laufenden Karren (Frei/Fix)
└──────────────────────────────────────────┘
```
Laufende Arbeit bleibt unangetastet; der Eil-Beleg wird beim nächsten „holen" bevorzugt.

### 3.5 Teilabschluss / Rest → morgen
```
Beleg WE 12 → [ Teilabschluss ]  Grund: „Ware unvollständig"
  → Restmenge bleibt; Beleg erscheint morgen als Starterpaket wieder.
  → zählt im Tagesjournal als „teilweise, Rest N offen" (Carry-over §4.6).
```

---

## 4. Bündel-Lebenszyklus (Ergänzungen, ohne neue Tabelle)

Vorhandene `AssignmentStatus`-Werte endlich nutzen:

```
created → assigned        (Engine/Recalculate, wie heute)
assigned → active         (MA startet das Bündel = erster PROCESS-/COLLECT-Schritt)
active  → completed       (alle Belege completed/zst_done → Bündel fertig, MA wird „frei")
assigned/active → paused  (Teamlead, wie heute)            paused → assigned (resume)
* → cancelled             (Teamlead/Storno)
```

- **Abschluss-Trigger (fehlt heute):** wenn der letzte Beleg eines Bündels `completed`/`zst_done`
  erreicht → Bündel `completed` + Event `bundle.completed`. Das macht den MA „frei" für den Pull.
- **`active`** markiert das eine laufende Bündel (für `getCurrentBundle`, Teamlead-Board, Frei/Fix).

---

## 5. Trigger & Ablauf (Pull-on-idle)

```
MA tippt „Nächstes Bündel holen"
        │
        ▼
POST /api/me/next-bundle   (neuer Pull-Endpoint, §Folge-Epic)
        │
        ├─ Restkapazität der Schicht übrig?  ──nein──▶ „Feierabend/Kapazität erschöpft"
        ├─ Freie Belege im ready-Pool (nach Reserve-Abzug)? ──nein──▶ „nichts frei"
        │       (Reserve ist heilig: nur Override-Gründe dürfen sie anbrechen)
        ▼
Engine stellt EIN karren-großes Bündel zusammen
  (≤6 Belege, Bereich-homogen, wegeoptimiert, Prio/Starter zuerst, Eil-Beleg bevorzugt)
        │  Belege ready → assigned → (active beim Start), an diesen MA gebunden
        ▼
App lädt das neue Bündel → COLLECT → PROCESS → DONE → (wieder „holen")
```

Ergänzend bleibt der **automatische Info-Push** bestehen: wächst der freie Pool (Einlagerung), zeigt
die App „Nachschub frei: +N" und aktiviert den Hol-Button — **ohne** automatisch zuzuteilen
(Pull der Entscheidung).

---

## 6. Backend-/Engine-Implikationen (benannt, kein Code)

1. **Karren-große Bündel statt Merge.** Die Proto-Bündel (≤6, Bereich-homogen, route-geordnet) sind
   bereits die Karren. Der Merge-zu-Eins in `distribute.ts` entfällt für den Mehr-Bündel-Tag; ein MA
   bekommt **eine Folge** solcher Bündel statt eines Riesenbündels.
2. **Overflow nicht verwerfen.** Heute fallen Belege über das eine Bündel hinaus in `unassigned` und
   verschwinden. Künftig bleiben sie im **`ready`-Pool** (oder als nächste, dem MA noch nicht fest
   zugewiesene Karren), damit „holen" sie ziehen kann.
3. **Pull-Endpoint** `POST /api/me/next-bundle`: nutzt die bestehende Engine-Logik (Prio, Bereich,
   Reserve, Starter) — gibt **genau ein** Karren-Bündel für diesen MA aus oder „leer".
4. **Bündel-Abschluss-Marker** (§4) + Nutzung von `active`/`completed`.
5. **Reserve-Schutz zum Pull-Zeitpunkt:** `next-bundle` zieht nie aus der Reserve (außer
   Override-Gründe: Prio/CatMan/Overdue/Teamlead).
6. **Kapazitäts-Guard:** kumulierte heutige Bündel des MA gegen `netCapacityMinutes` der Schicht →
   wenn erschöpft, „Feierabend".
7. **Teamlead-Board:** zeigt je MA das **aktive** Bündel + „heute erledigte Karren" (statt der
   Annahme „ein Bündel/Tag"). Frei/Fix gilt weiter.
8. **PWA-Store:** der Offline-Store hält weiterhin **ein** aktives Bündel (id `today`); „holen"
   ersetzt es atomar durch das nächste (Collect-Progress reset, Case-Progress des neuen Bündels neu).

---

## 7. Guardrails & Edge Cases

- **Frei/Fix:** „holen" fasst nie laufende/begonnene Arbeit an; ein laufender Karren wird nie
  unterbrochen (Eil-Belege warten bis zum nächsten Hol-Vorgang).
- **Reserve ist heilig:** lieber „nichts frei" als Reserve anbrechen.
- **Doppel-Pull/Race:** zwei MA holen gleichzeitig → serverseitig atomar (ein Beleg landet in genau
  einem Bündel; optimistic lock wie bei Cases).
- **Teilabschluss:** Rest bleibt offen → morgiges Starterpaket (Carry-over), nicht sofort
  wieder-holbar.
- **Offline:** „holen" braucht das Backend; offline → Hinweis „nur online". Im Demo-Modus liefert ein
  Szenario einfach das nächste vordefinierte Karren-Bündel (siehe Demo-Szenarien).
- **Schichtende/Pause:** „Pause/Feierabend" stoppt das Holen; Teamlead sieht den MA als frei/pausiert.

---

## 8. Offene Punkte

- **Auto vs. manuell holen:** Default ist manuell (Pull). Optionaler „Auto-weiter"-Schalter (sofort
  nächsten Karren laden) — später, nur wenn gewünscht.
- **Eil-Beleg „in laufenden Karren einschieben":** bewusst nein (Frei/Fix). Falls fachlich doch
  nötig, separat entscheiden.
- **Genaue Reserve-/Kapazitäts-Formeln** beim Pull = identisch zur bestehenden Plan-Engine; nur der
  Auslösezeitpunkt wandert vom Tagesplan zum Hol-Vorgang.

## 9. Nicht in diesem Konzept
- Implementierung (Code), ProHandel-Echtzeit-Ingestion, Server-seitige Event-Auto-Trigger,
  Teamlead-Cockpit-Rework über das Board-Anzeigedelta hinaus.
