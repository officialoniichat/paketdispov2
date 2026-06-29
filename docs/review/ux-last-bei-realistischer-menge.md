# UX-Last-Review bei realistischer Belegmenge

**Datum:** 2026-06-29 · **Branch:** main · **Scope:** Hält die UX die echten täglichen
Belegmengen aus? · **Quelle der Mengen:** Kunden-Excel → `docs/data/belege-history-per-day.csv`

---

## 1. Datengrundlage (echte historische Mengen)

Abgeleitet aus der Kunden-Excel *„Übersicht Anzahl der Belege pro Tag/KW/Monat/Jahr"*
(forward-fill der Tagesgruppen, eine Zeile = ein Beleg). Die kompakte Tagesreihe ist
eingecheckt unter `docs/data/belege-history-per-day.csv` (`datum,anzahl_belege,summe_anzahl`),
das große xlsx **nicht**.

| Kennzahl | Wert |
|---|---|
| Zeitraum | 2025-01-02 … 2026-06-17 (363 Arbeitstage) |
| Belege gesamt | 61 849 |
| Pro Tag: min / Median / Mittel | 2 / **171** / 170 |
| Pro Tag: p90 / p95 / **max** | 249 / 261 / **315** |
| Peak-Monate | Februar & August (~300–315/Tag) |
| Lieferschein-Gruppen (Run-Length) | typ. Tag ≈ 59 Läufe für 171 Belege, max. Lauf ≈ 22; Peak-Tag bis ~55 |

Die Belegnummern laufen blockweise fortlaufend mit kleinen Lücken
(`3.551.001 … 3.551.019`) → bestätigt das Lieferschein-Gruppen-Muster (Teamlead Pkt.1).

**Daraus abgeleitete Test-Szenarien (im Seed wählbar):**
- `typical` → **171 Belege** (Median-Tag)
- `peak` → **315 Belege** (stärkster beobachteter Tag)

---

## 2. Realistischer Seed (Teil 1 — umgesetzt)

- **`apps/backend-api/prisma/seed-data.ts`** (neu): deterministischer Generator
  (mulberry32-PRNG, fester Seed pro Szenario; **kein** `Date.now`/`Math.random`).
  Erzeugt die Tagesmenge als **Lieferläufe**: jeder Lauf teilt einen Lagerplatz
  (→ Bereich), eine `deliveryNoteNo` und einen Block fortlaufender, gepunkteter
  `weBelegNo` (`3.540.001`-Stil) — damit die Pkt.1-Lieferschein-Gruppierung greift.
  Realistisch gestreut: Sections (1/2/3 Verladeplan, 4/7/8 täglich, prio=null),
  Warenart (gewichtet), Menge (Bänder), Positionen/Beleg (1–5), Prüfmodus,
  Handling-Bereich, Prioritäts-Flags, Verladeplan-Datum (→ Overdue-Anteil).
- **`apps/backend-api/prisma/seed.ts`** (umgebaut): wählt das Szenario über
  `SEED_SCENARIO=typical|peak` (Default `typical`), baut den Case-Graph
  **deterministisch neu auf** (Reset der seed-eigenen Transaktionsdaten → exakt N
  Ready-Cases, keine Geister aus alter Seed-Form), realistisches Team (10 gemessene
  Köpfe über Früh/Spät + 2 temporäre Kräfte `measured=false`) und 25 Lagerplätze
  über alle drei Bereiche.

**Verifiziert (gegen lokale Postgres):**

```
[seed] scenario=typical (target=171) users=14 shifts=12 activeLocations=25 readyCases=171 deliveryGroups=46 …
[seed] scenario=peak    (target=315) users=14 shifts=12 activeLocations=25 readyCases=315 deliveryGroups=95 …
```

Zwei aufeinanderfolgende `typical`-Läufe liefern identische Zahlen (deterministisch &
idempotent). Lauf: `SEED_SCENARIO=peak pnpm --filter @paket/backend-api exec prisma db seed`.

---

## 3. Engine-Last (Determinismus + Laufzeit)

**Verdikt: SKALIERT.** Neuer Test `packages/assignment-engine/src/assignment/plan.perf.test.ts`:
- plant einen **315-Case-Peak-Tag** über ein 12-Kopf-Team **deutlich unter dem
  Anhang-E.5-Budget von 5 000 ms** (Testdatei mit 3 vollen 315-Case-Plänen inkl.
  Zod-Parsing läuft in ~90 ms → ein einzelner Recalculate ≪ 30 ms).
- bestätigt **Determinismus**: zwei Läufe derselben Eingabe sind byte-identisch.

Engine-Suite gesamt: **150 Tests grün** (148 vorher + 2 neue).

---

## 4. UX-Last je Fläche

Legende: ✅ **SKALIERT** · ⚠️ **SKALIERT-NICHT** (mit Grund + konkreter Empfehlung).

### 4.1 Teamlead — Digitale Ablagen Board · ⚠️ SKALIERT-NICHT
`apps/teamlead-web/src/features/ablagen/AblagenBoard.tsx`

- **Keine Virtualisierung:** `lanes.map → lane.cards.map` rendert *jede* Karte ins DOM
  (Z. 59–66, 97–99). `@tanstack/react-virtual` ist installiert, wird hier aber **nicht**
  genutzt. Bei ~170 Cases → ~3 150 DOM-Knoten; bei 315 spürbarer Jank.
- **200er-Cap mit stiller Trunkierung:** der Pool-Fetch begrenzt auf `limit: 200`
  (`remoteDataset.ts`) → an einem Peak-Tag (315) fehlen ~115 Belege **ohne Hinweis**.
- **Lieferschein-Gruppierung nicht genutzt:** Detection/Felder existieren (Engine
  `grouping/`, `BoardCaseDto.deliveryGroupId/Size`), aber der `LaneCard`-Typ trägt die
  Gruppe nicht → jeder Beleg wird einzeln gerendert statt zu „Lieferung ×n" geclustert.
- **Keine Filter/Suche/Dichte:** keine Affordanz, die sichtbare Kartenzahl zu senken.

**Empfehlung (wirkungsstärkste zuerst):**
1. **Lieferschein-Cluster im Board** — `deliveryGroupId/Size` in `LaneCard` durchreichen
   und Läufe als **eine** zusammenklappbare „Lieferung ×n"-Karte rendern. Reduziert die
   sichtbaren Einheiten am Peak-Tag von 315 auf ~95 (vgl. Seed-Kennzahl `deliveryGroups`).
2. **Lane-Virtualisierung** (`useVirtualizer`, gleiche Mechanik wie `DataTable.tsx`).
3. **Filter-/Such-Leiste** je Lane (WE-Beleg, Bereich, Section, Prio).
4. **Dichte-/Kompakt-Modus** (einzeilige Karten statt voller `Card`).
5. **200er-Cap auflösen** (Limit hoch **oder** Overflow-Banner, siehe 4.3).

→ Verbessertes Mockup: `docs/concept/ux-last-ablagen-board-mockup.html`.

### 4.2 Teamlead — Cockpit (KPIs / Ausnahmen) · ✅ SKALIERT
`apps/teamlead-web/src/features/cockpit/CockpitPage.tsx`

Reine Aggregat-KPIs (MetricCards) + Audit-Feed hart auf 8 Einträge (`slice(0, 8)`).
~100 DOM-Knoten **unabhängig** von der Poolgröße. Keine Änderung nötig.

### 4.3 Teamlead — Belege-Liste (§10.4, Scope-Switcher) · ⚠️ SKALIERT-NICHT (nur Peak)
`apps/teamlead-web/src/features/belege/BelegListPage.tsx` + `…/api/belege.ts`

- **Tabellenkörper ist virtualisiert** ✅ (`useVirtualizer`, `DataTable.tsx:77–83` — nur
  ~36 Zeilen im DOM), inkl. Client-Filter, Sortierung, globaler Suche, Scope-Filter.
  Bei **171** Zeilen voll nutzbar.
- **Aber:** `BELEGE_PAGE_LIMIT = 200` (`belege.ts:33`) lädt nur Seite 1; `dto.total` wird
  verworfen, kein Overflow-Check. Bei **315** Zeilen werden **115 still ignoriert** —
  Suche/Sortierung/Scope-Verteilung arbeiten dann auf einem unvollständigen Set.
- **Saved Views**: im Code vorbereitet (State liftet zum Caller), aber **nicht persistiert**.

**Empfehlung:** Server-Pagination via `useInfiniteQuery`
(`getNextPageParam: total > items.length ? page+1 : undefined`, Seiten vor der
Virtualisierung flachklopfen). **Sofort-Sicherung** vorab: Overflow-Banner zeigen, wenn
`total > items.length` (Mockup unter `…ux-last-ablagen-board-mockup.html`, Abschnitt B).

### 4.4 Teamlead — Mitarbeiter-Board / Aufteilungen · ✅ SKALIERT
`MitarbeiterBoard.tsx` (Accordion über 5–15 MA, je 1–5 Cases), `AufteilungenPage.tsx`
(manuelle Splits als Karten, 2–4 Zeilen). Klein und beschränkt. Keine Änderung nötig.

### 4.5 Employee-PWA (alle Flächen) · ✅ SKALIERT
Ein Mitarbeiter sieht **nie** den Tagespool — er bekommt **ein** Bündel zugeteilt.

- **Harte Bündelgrenze:** `maxCasesPerBundle: 6` (`assignment-engine/src/config.ts`),
  durchgesetzt in `bundling.ts`. → `BundleHomeScreen` rendert max. 6 Belege.
- **CollectScreen:** Stops sind per Lagerplatz dedupliziert → ≤ 6 Stops.
- **BelegProcessScreen:** lädt **ein** Case-Aggregat (1–3 Positionen, 1–2 Boxen).
- **Pull/`assignNextBundle`:** der ~170–315er Pool wird serverseitig verarbeitet und
  **nie** an die PWA gerendert (nur Statusmeldungen).
- **Offline-Demo-Seed** `apps/employee-pwa/src/demo/scenarios.ts` (2–4 Belege) bleibt
  bewusst klein und realistisch — **keine** Änderung nötig (Bündel ist beschränkt).

Keine Virtualisierung/Pagination auf Employee-Seite erforderlich.

---

## 5. Gesamtbild

| Fläche | Typisch (171) | Peak (315) | Verdikt | Primärer Fix |
|---|---|---|---|---|
| Engine (Recalculate) | ≪ 30 ms | ≪ 30 ms | ✅ | — |
| Cockpit | ✅ | ✅ | ✅ | — |
| Belege-Liste | ✅ | ⚠️ (200-Cap) | ⚠️ Peak | Infinite-Query + Overflow-Banner |
| **Digitale Ablagen** | ⚠️ | ⚠️ | ⚠️ | **Lieferschein-Cluster + Virtualisierung** |
| Mitarbeiter-Board / Aufteilungen | ✅ | ✅ | ✅ | — |
| Employee-PWA (alle) | ✅ | ✅ | ✅ | — |

**Kernbefund:** Engine, Cockpit und die komplette Employee-PWA tragen die echte Last
problemlos. Auf Teamlead-Seite sind genau **zwei** Flächen betroffen: das **Digitale-Ablagen-
Board** (kein Virtualisieren, keine Cluster, 200-Cap) und die **Belege-Liste** (200-Cap am
Peak-Tag). Beide haben konkrete, kleine Fixes; die Lieferschein-Gruppierung (Pkt.1, bereits
auf main) ist der Hebel, der das Board am Peak-Tag von 315 auf ~95 sichtbare Einheiten bringt.

> Diese Fixes sind **Empfehlungen** dieses Reviews — nicht Teil dieses Change-Sets (das den
> realistischen Seed + Last-Nachweis liefert). Mockups der Soll-Variante:
> `docs/concept/ux-last-ablagen-board-mockup.html`.
