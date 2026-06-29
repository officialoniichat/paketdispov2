# Kritischer Review — Teamlead-Feedback (Dustin Feldmann), 7 Punkte

**Datum:** 2026-06-29 · **Reviewer:** integrierte Verifikation (kein Rubber-Stamp) ·
**Branch:** auf `main` integriert · **Basis:** `f6fc9f1`

Alle sieben Punkte wurden auf **einem** Stand integriert, voll gebaut/getestet und
adversarial gegen Dustins **tatsächliche** Anforderung geprüft. Verdikte sind ehrlich;
jeder Befund hat Evidenz (Datei:Zeile / Test-Output).

---

## 0. Verifikation des integrierten Ganzen

| Gate | Ergebnis |
| --- | --- |
| `pnpm typecheck` | ✅ **13/13** grün |
| `pnpm test` (Standard-Gate, alle Pakete) | ✅ **402 Tests** grün (engine 152, backend 109, pwa 61, teamlead 54, ui 9, domain-types 15, +2) |
| `pnpm build` | ✅ 8/8 grün |
| `pnpm lint` | ✅ exit 0 (nur 37 erlaubte NestJS-DI `import type`-Warnungen, **nicht** auto-gefixt) |
| OpenAPI ↔ api-client | ✅ frisch regeneriert, **kein** Drift (byte-identisch zum Commit) |
| `pnpm test:int` (Testcontainers, **separates** Docker-Gate, NICHT im Standard-Gate) | ❌ **6/12 Dateien, 18/41 Tests rot** — **vorbestehend auf `main`**, siehe Querschnitts-Risiko R2 |

**Integrations-Reparaturen** (beide waren bereits auf `main` rot, nicht durch die
Integration verursacht — Beweis: Dateien byte-identisch zu `main`):
- `load-plan.test.ts`: `engineConfigFromRuleConfig`-Fixture war veraltet — fehlte das
  jetzt **pflichtige** `grouping` (Pkt.1) + `shiftEnd` (Pkt.5+6) und trug das in Pkt.7
  gelöschte `catManWeight`. Unit-Tests laufen **nicht** durch `tsc`, daher schlüpfte das
  rot am Typecheck vorbei und brach erst zur Laufzeit.
- `priority-engine.ts`: ein NBSP (U+00A0) im `load_plan_due`-Reason-String ließ
  `no-irregular-whitespace` (engine-lint) fehlschlagen → durch normales Leerzeichen ersetzt.

**C4-Duplikat:** Inhalt von `main`/`abb8859` und Branch `docs/c4-architecture`/`12abe9b`
ist **byte-identisch** (`git diff` leer) → keine echte Doppelung; `main` trägt das
kanonische Set, der Branch ist redundant und wurde entfernt. **Genau ein C4-Set.**

---

## Per-Punkt-Verdikte

### Punkt 1 — Erkennung zusammengehöriger Lieferscheine — **PASS-MIT-RISIKO**

> *"Kann das Dashboard zusammengehörige Lieferscheine automatisch erkennen? … 'Lieferschein: X' … fortlaufende Beleg-Nummern (3.551.119 bis 3.551.122)."*

- **Erkennung** ist pur & deterministisch: `packages/assignment-engine/src/grouping/delivery-group.ts`
  (Union-Find). Gruppiert bei gleichem `deliveryNoteNo` ODER zusammenhängendem
  `weBelegNo`-Lauf mit `gap ≤ maxWeBelegGap`. Grenzfall korrekt (`delivery-group.ts:133`,
  `gap=1` rein, `gap=2` raus); nicht-numerische/fehlende Felder sauber abgefangen.
- **Verteilungs-Bias** ist eine **weiche** Nebenbedingung (`distribute.ts:40,168-176`,
  `GROUP_AFFINITY_BONUS = 0.1`), **Bereich-gated** (`groupAffinity=0` bei Bereichs-Mismatch)
  und kapazitätsbewusst: eine zu große Gruppe wird geteilt statt jemanden zu überladen.
- **Sichtbarkeit:** `BoardCaseDto.deliveryGroupId/Size`; Board-Badge „Lieferung ×n" +
  Split-Warnung (`MitarbeiterBoard.tsx:48-71,204-211`). Engine ist Single-Source, UI zeigt nur.
- **Tests:** 13 Grouping-Tests grün (gleicher Lieferschein → gruppiert; fortlaufend →
  gruppiert; Lücke > Schwelle → nicht; Gruppe bleibt bei einem MA bei Kapazität).

**Risiko:** Ohne ProHandel-„X von N" ist `weBelegNo`-Nachbarschaft eine **Heuristik** —
zwei unabhängige Lieferungen mit zufällig fortlaufenden Nummern können fälschlich
zusammengezogen werden (gemildert durch `maxWeBelegGap=1` default, weichen Bias und die
Teamlead-Split-Warnung). Es fehlen Tests für **Bereich-übergreifende** Gruppen und einen
**Full-Pipeline**-Durchlauf. Kernanforderung („nicht zwei Leute am selben Paket") ist
erfüllt: Engine bündelt automatisch + alarmiert, Teamlead kann eingreifen.

---

### Punkt 2 — Auswirkung der Aufwandsfaktoren — **PASS-MIT-RISIKO (irreführende UX)** ⚠️ Headline-Befund

> *"Wie wirken sich die konfigurierbaren Faktoren aus? Wenn ich 1,2 auf 2,0 ändere — welchen Impact? Eine kurze Erläuterung/Dokumentation wäre hilfreich."*

Dustin bat um **Dokumentation/Erläuterung** — die ist geliefert (`docs/concept/aufwandsfaktoren-wirkung.md`)
und die Mathematik der Vorschau ist **korrekt** (über die echte `computeEffort`, 8 Unit-Tests
inkl. „1,2→2,0 = +5,92 min", `effort-factors.test.ts`). **Aber** die Transparenz ist im
aktuellen System **irreführend**, und das ist der wichtigste Querschnitts-Befund (R1):

**Die 6 Admin-Aufwandsfaktoren sind in der Live-Verteilung doppelt wirkungslos:**
1. `engineConfigFromRuleConfig` (`apps/backend-api/src/assignment/load-plan.ts:101-115`)
   reicht **kein** `effort` durch → `config.effort` ist immer `DEFAULT_ENGINE_CONFIG.effort`.
2. `recalculate()` (`assignment.service.ts:95-126`) liefert **keine** `effortVectors` →
   `plan.ts:48` fällt auf die **persistierten** `estimatedMinutes/effortPoints` zurück;
   `computeEffort` läuft im **gesamten Backend nirgends** (verifiziert: kein Import).
   Die persistierten Werte stammen aktuell aus dem **Seed** (`prisma/seed.ts:230`).
3. `applyEffortFactors` wird **nur** von `EffortPreview.tsx` (der Pkt-2-Vorschau)
   konsumiert — **nie** vom Backend.

→ Ändert der Teamlead einen Faktor im Admin-Tab, passiert in der echten Verteilung
**nichts**. Die UI ist trotzdem mit **„Live-Vorschau"** überschrieben (`EffortPreview.tsx:62`)
**ohne Hinweis**, dass die Faktoren nicht verdrahtet sind. Das beantwortet Dustins Frage mit
einem **Counterfactual**, das eine nicht-existente Wirkung suggeriert.

**Präzisierung (wichtig, fair):** Das Aufwands**modell** als solches *ist* im Engine-Design
verankert (`plan.ts` nutzt Aufwand-Minuten für Bündelgröße/Last) — es ist nur derzeit
**dormant**, weil die Datenquelle (ProHandel-Positionen → effortVectors) noch nicht gebaut
ist (ProHandel ist Konzept). Der Kaskaden-Effekt auf Pkt.1/5+6 ist daher **weich**: jene
Features rechnen mit Aufwand-Minuten aus Seed-Schätzwerten — deterministisch korrekt, aber
nicht realitäts-/tuning-getrieben.

**Empfehlung (eine wählen, vor Pilot):**
- **(A) Ehrlichkeit, minimal:** Disclaimer in Doc **und** UI: „Faktoren sind bis zur
  ProHandel-Anbindung noch nicht in der Live-Verteilung aktiv; die Vorschau zeigt das
  Wirkmodell." Behebt die Irreführung sofort.
- **(B) Verdrahten:** in `engineConfigFromRuleConfig` `effort: applyEffortFactors(DEFAULT_ENGINE_CONFIG.effort, config.effort)` setzen **und** in `recalculate()` pro Case
  `effortVectors` bauen. Macht Faktoren + Vorschau wahrhaftig — verändert aber sofort die
  deterministische Verteilung (Defaults sind nicht-neutral) → bewusste Produktentscheidung,
  daher **nicht** in dieser Integration vorgenommen.

clean-code/no-legacy-Spannung: die Admin-Faktoren sind aktuell totes Config (sollten
verdrahtet **oder** entfernt werden). Pkt.2 hat darauf Vorschau-Fläche gebaut statt die
Totheit aufzulösen.

---

### Punkt 3 — Temporäre Kräfte (measured-Flag) — **PASS** (mit Cross-Feature-Risiko)

> *"Azubis/Saisonaushilfen … manuell verteilbar, ohne Leistungsmessung. Dummy-Mitarbeitende? Bessere Lösung?"*

Umgesetzt als `User.measured: boolean` am **realen** Modell (nicht Fake-Entitäten) — die
empfohlene saubere Lösung.
- **KPI-Isolation korrekt & live verdrahtet:** `aggregateKpiTotals` (`kpi-aggregate.ts`)
  zählt **Durchsatz für alle**, **Leistung/Produktivität nur für `measured=true`**; aufgerufen
  in der echten Read-Path `teamlead-read.service.ts:360` mit `employee.measured` (:349). Nicht
  dormant.
- `measured` gatet **ausschließlich** KPI — **nie** Assignment/Shift-Targeting (repo-weiter
  grep bestätigt) → Temp-Kräfte sind valide manuelle Zuweisungsziele.
- Default `true` (`workforce.ts:119`); Anlage via `POST /api/admin/employees` (default
  `measured=false`) + `employee.created`-Event; UI-Markierung (`EmployeeSettings.tsx`).
- Tests: `kpi-aggregate.test.ts` (4) grün.

**Cross-Feature-Risiko (R3):** Temp-Kräfte werden mit `active:true` **ohne `weeklyPattern`**
angelegt (`employees.service.ts`; `weeklyPattern` ist `Json?` ohne Default). `recalculate()`
ruft eingangs `materializeShiftsForDate`, das für jeden aktiven MA **ohne** passendes
Wochenmuster `shift.deleteMany` ausführt (`assignment.service.ts:312+`). → Eine vom Teamlead
**manuell angelegte Schicht** einer Temp-Kraft wird beim nächsten „Neu berechnen" **gelöscht**.
Untergräbt potenziell den manuellen Zuweisungsfluss. (Dies ist zugleich die Wurzel der
roten `test:int`, siehe R2.) Vor Pilot klären: Temp-Kräfte bekommen ein Default-Muster, ODER
`materializeShiftsForDate` darf `source='manual'`-Schichten nicht löschen.

---

### Punkt 4 — Überfälligkeit relativ zum Verladetag — **PASS**

> *"Shops mit nur einem Verladetag/Woche … Stundendifferenz greift praktisch nie. Alternative Logik/shopspezifische Konfiguration."*

- Überfällig = **Lead-Days**, nicht Stunden: `today ≥ loadPlanDate − overdueLeadDays`
  (`priority-engine.ts:120-130`), mit `overdueLeadDaysOverrides` pro shopArea.
- Tote `overdueThresholdHours` **hart entfernt** (repo-weit nur noch 1 erklärender Kommentar).
- Test beweist Kernfall: Shop mit einzigem Wochen-Verladetag wird dringend, sobald der Tag
  näher rückt — **ohne** Stundendifferenz (`priority.coverage.test.ts:238-248`).
- Engine bleibt **pur**: `loadPlanDate` wird upstream im Backend aus der **LIVE**
  `RuleConfig.loadPlan` aufgelöst (`load-plan.ts:59-93`); die Prisma-`LoadPlanRule`-Tabelle
  ist **tot** (einzige Loadplan-Quelle ist RuleConfig — keine konkurrierenden Quellen).

**Nit (no-legacy):** Die tote `LoadPlanRule`-Tabelle steht noch in `schema.prisma:430` —
sollte nach der ABSOLUTE-clean-code-Regel entfernt werden (oder Kommentar, warum sie für die
ProHandel-Anbindung bleibt).

---

### Punkt 5 — Auto-Verteilungs-Cutoff am Schichtende — **PASS**

> *"Automatische Verteilung endet z.B. zwei Stunden vor Schichtende; danach fordern Mitarbeitende selbst an."*

- Cutoff-Modell pur & deterministisch (`capacity/shift-end.ts`): proportional,
  `effective = round(net × clamp((cutoffPoint − max(now,start))/fullWindow,0,1))`.
  Engine-Default **0** (no-op), App-Default **120** (`admin-config.ts:154`), `0` = deaktiviert.
- **Keine Auto-Zuweisung im Cutoff-Fenster**: Test beweist Kapazität = 0 ab Cutoff-Punkt
  (`shift-end.test.ts:59-66`); leere Shifts fallen aus der Verteilung.
- Wiring: `load-plan.ts:113`; Engine-Tests nutzen **fixes** `now` (deterministisch).

---

### Punkt 6 — Keine offenen Belege über Nacht — **PASS**

> *"Mechanismus, der verhindert, dass Belege am Schichtende offen liegen; andere sollen Ware nicht weiterbearbeiten."*

- **Fertig-schaffbarer Pull:** `finishableBudgetMinutes` = min(Restkapazität, Wallclock bis
  plannedEnd); `assignNextBundle` gibt nahe Ende `{assigned:false, reason:'shift_ending'}`
  und kappt Cart-Größe (`assignment.service.ts:217-218,272`).
- **Keine Weiterverteilung:** Nur `ready`-Cases speisen die Engine (`POOL_STATUS`);
  `partially_completed`/`in_progress` bleiben am ursprünglichen MA gebunden — werden nie an
  andere verteilt (`assignment.service.ts:115-117`, `clearPriorPlanForDate`).
- **Cockpit:** `DashboardDto.endOfShiftOpenCount` zählt nicht-terminale Belege von MA, deren
  Schicht bereits endete (`teamlead-read.service.ts:153-173`).

**Nit:** Toter Zweig `c.status === 'partially_completed'` bei `assignNextBundle:254` ist
unerreichbar (Pool ist `ready`-only) — harmlos, aber irreführend; entfernen.

---

### Punkt 7 — CatMan-Gewichtung deaktivieren — **PASS**

> *"CatMan-Info soll keine Auswirkung auf die Priorisierung haben; bleibt im UI sichtbar."*

- `catman_due`/`catManDate` heben **keinen** Rang mehr (`priority-engine.ts:101-106`, nur
  `overdue` triggert Rang 3) und sind **nicht** im Reserve-Override
  (`config.ts:84` = `['prio','overdue','manual_teamlead_priority']`).
- `catManWeight`-Config **vollständig gelöscht** (Zod, DEFAULT_RULE_CONFIG, DTOs, AdminPage).
- `catManDate` bleibt **rein informativ** (Chip/Counter). Tests beweisen: kein Rang-Effekt,
  Reserve-Override `catman_due → false`.

**Nit (no-legacy):** Der Rang-3-Identifier heißt noch `catManDue`/Klasse `'catman_due'`
(`types.ts:19,31`), obwohl er jetzt rein overdue-getrieben ist (Reason: „überfällig") —
Leftover-Benennung des gelöschten Konzepts; nach ABSOLUTE-no-legacy in `overdue` umbenennen.

**Layering Pkt.4 ↔ Pkt.7:** kohärent. Rang 3 ist jetzt **overdue-only**, kein
Doppelzählen, keine konkurrierenden Pfade.

---

### C4-Architekturmodell — war **FAIL**, jetzt **PASS** (in dieser Integration behoben)

Die committeten C4-Diagramme zeigten Drift gegen die integrierten Engine-Module
(verifiziert gegen Code). `main` selbst hat parallel `c3-engine-components.mmd` +
`c4-engine-pipeline.mmd` auf Pkt.1/2/5+6 synchronisiert (Commit `9fbef3f`); diese
Integration ergänzt nur die verbleibende Lücke **`USER.measured`** (Pkt.3) in
`domain-model.mmd` + Re-Render (`./render.sh` fehlerfrei). Genau **ein** C4-Set;
der byte-identische `docs/c4-architecture`-Branch wurde entfernt.

---

## Querschnitts-Risiken

| # | Risiko | Schwere | Empfehlung |
| --- | --- | --- | --- |
| **R1** | **Aufwandsfaktoren nicht verdrahtet** (Pkt.2): Admin-Faktoren wirken nicht live; `computeEffort` läuft im Backend nirgends; Vorschau ist „Live" ohne Disclaimer → irreführend. | **Hoch** (vor Pilot) | Disclaimer (A) **oder** Verdrahtung + effortVectors (B). |
| **R2** | **`test:int` rot (18/41)** — vorbestehend auf `main`. Wurzel: `materializeShiftsForDate` löscht handgeseedete Schichten musterloser aktiver MA → recalc liefert 0 Bündel. Nicht im Standard-Gate, daher unbemerkt. | **Mittel** | Int-Test-Seeds an `materializeShiftsForDate` anpassen (Wochenmuster) **oder** `source='manual'`-Schichten nicht löschen (deckt auch R3). |
| **R3** | **Temp-Schicht-Löschung** (Pkt.3): manuell angelegte Temp-Schicht wird bei recalc gelöscht (musterlos+aktiv). | **Mittel** | Temp-Default-Muster **oder** manuelle Schichten schützen. Mit R2 gemeinsam lösbar. |
| **R4** | **no-legacy-Nits:** tote `LoadPlanRule`-Tabelle; `catManDue`/`'catman_due'`-Benennung; toter `assignNextBundle:254`-Zweig. | Niedrig | Aufräumen gemäß ABSOLUTE-clean-code. |

---

## Go / No-Go

- **Standard-Gate (typecheck/test/build/lint/OpenAPI):** ✅ grün — die Integration ist als
  Feature-Checkpoint **mergebar auf `main`**.
- **Pilot-Reife:** **No-Go**, bis **R1** (Aufwands-Ehrlichkeit) und **R3** (Temp-Schicht)
  geklärt sind, und **R2** (`test:int`) repariert oder formal als Ticket geführt ist. **Keiner
  dieser Punkte wurde durch die Integration verursacht** — R1/R2/R3 sind vorbestehend.
- Fachlich lösen alle 7 Punkte Dustins Anforderung; der einzige Punkt mit echtem
  Substanz-Vorbehalt ist **Pkt.2** (korrekte Doku, aber irreführende „Live"-UX auf totem Config).

**Fazit:** Integriertes Ganzes ist auf dem Standard-Gate grün und fachlich tragfähig.
Vor Pilot sind R1–R3 menschlich zu entscheiden (Aufwands-Verdrahtung ist eine
Produktentscheidung, kein Bug-Fix).
