# Kritisches Review — Aktionen auf Beleg / Position / DocumentSet

**Scope:** Alle Aktionen, die ein **Mitarbeiter** (`apps/employee-pwa`) oder ein **Teamlead** (`apps/teamlead-web`) auf einem Beleg (`GoodsReceiptCase`), einer Position, einer SKU-Zeile, einer Transport-Box oder einem `DocumentSet` ausführen kann — inkl. Gegenstück in `packages/assignment-engine` und `apps/backend-api` (Domains, Events, §7.1-Zustandsmaschine).
**Methode:** Statische Code-Sichtung mit Fundstellen (`file:line`); die vier wichtigsten Befunde wurden im Code direkt nachverfolgt (Completion-Pfad, Teilabschluss-Body, Issue-Lifecycle-UI, Event-Sync). Kein Laufzeit-Test. **Reine Befundaufnahme — keine Code-Änderung.**
**Datum:** 2026-06-16
**Branch:** `master` (HEAD `be26704`)

> **Status-Legende:**
> **VOLLSTÄNDIG** = UI → Backend → Persistenz → Event/Audit durchgängig, Guardrails serverseitig oder vertretbar clientseitig · **HALF-BAKED** = funktioniert in der UI, aber Serverpersistenz/-validierung fehlt, Event-Abdeckung lückenhaft oder UX mehrdeutig · **KAPUTT** = vorhanden, aber defekt/tot/inkonsistent (toter Button, umgangene Guard, Event-Kollision, Datenverlust) · **FEHLT** = laut Konzept gefordert, gar nicht implementiert.

> **Severity-Legende:** **CRITICAL** = Datenverlust / Kernfluss bricht / Audit unzuverlässig · **HIGH** = im Konzept benannt, fehlt/falsch, Pilot spürt es · **MEDIUM** = Wartbarkeit/UX/Konsistenz · **LOW** = Politur oder bewusst descoped.

---

## (0) Executive Summary

Der **sichtbare** Arbeitsfluss ist auf beiden Apps weit gediehen (vgl. `ux-gap-analysis.md`): Mitarbeiter pickt → bereitet vor → kontrolliert → boxt → schließt mit ZST ab; Teamlead rechnet neu, parkt, priorisiert, greift im Bündel ein — alles mit Grund-Dialog und Audit. **Unter der Oberfläche** klafft jedoch eine systematische Lücke zwischen dem, was die Apps anzeigen, und dem, was das Backend tatsächlich verifiziert und persistiert.

**Die vier kritischen Befunde (alle im Code verifiziert):**

1. **Abschluss umgeht die eigene Guard-Logik und bucht blind die volle Menge.** `CasesService.complete()` (`apps/backend-api/src/cases/cases.service.ts:222-248`) hüpft strukturell bis `boxing`, transitioniert nach `completed` und schreibt `ZstRecord` mit `completedQuantity: caseRow.totalQuantity` — **ohne** die sorgfältig geschriebenen Prüfungen `canFullyComplete()` / `completeCase()` (offene Issues, unverplombte Boxen, bestätigte Menge) aus `apps/backend-api/src/modules/completion/completion-logic.ts:60-128` aufzurufen. Diese Guard-Funktionen sind **toter Code**. Das einzige Completion-Gate, das real greift, lebt clientseitig in `apps/employee-pwa/src/workflow/workflowModel.ts:82-97` und ist serverseitig **nicht** nachprüfbar. → **CRITICAL**

2. **Teilabschluss bucht Menge 0.** Die PWA sendet nur `{ reason }` (`apps/employee-pwa/src/data/persist.ts:65-77`), das Backend liest `dto.completedQuantity ?? 0` (`cases.service.ts:276`). Jeder Teilabschluss schreibt damit einen `ZstRecord` mit **Menge 0 und anteiligem Aufwand 0** (`proratedEffort(total, 0, …) = 0`). §4.6/§15 (anteilige ZST, Restmenge nächster Tag) ist damit faktisch wirkungslos; KPIs unterzählen. → **CRITICAL**

3. **Der Issue-Lifecycle lässt sich aus der Teamlead-UI nicht schließen.** Backend bietet `POST /api/teamlead/issues/:id/resolve` und `/release` (`apps/backend-api/src/cases/teamlead.controller.ts:119-139`), aber **kein** Frontend-Aufruf existiert (`apps/teamlead-web/src/data/mutations.ts`, `store.tsx` — verifiziert per grep). `onRelease` in der Ablage ist die **Entparken**-Aktion (`/unpark`), nicht die Issue-Freigabe. Ein Beleg in `issue_open` / `waiting_teamlead` ist damit **steckengeblieben**: `canPark` erlaubt nur `ready`/`needs_review` (`apps/teamlead-web/src/features/ablagen/AblagenBoard.tsx:100-102`), also lässt er sich nicht einmal parken. → **CRITICAL**

4. **Die gesamte Arbeitsverifikation des Mitarbeiters ist lokal-only.** `pickup.location_scanned`, `position.confirmed`, `sku.quantity_confirmed`, `box.label_printed`, `box.sealed`, `print.job_created` werden nur in Dexie geschrieben (`apps/employee-pwa/src/workflow/useCaseFlow.ts:125-200`); es gibt **keinen** Outbox-/Sync-Pfad und **keinen** Backend-Handler. Nur 4 Mitarbeiter-Endpunkte existieren (`start-preparation`, `complete`, `partial-complete`, `issues`). Folge: Der hash-verkettete Audit-Trail (§7.2/§16.2) enthält **keine** dieser Arbeitsschritt-Events; das Backend „glaubt" dem Client beim Abschluss (siehe Befund 1). → **CRITICAL**

Daneben: ein toter **Export**-Button, zwei fehlende Cockpit-Aktionen (**Starterpakete**, **Reserve-Schieber**), eine **Event-Typ-Kollision** (`box.sealed` doppelt belegt), ein nie aufgerufener **Skip**-Pfad, fehlender **Lagerplatz-Soll/Ist-Abgleich** und mehrere latente Engine-Fähigkeiten ohne UI.

---

## (1) Inventar — alle Aktionen rund um einen Beleg

### 1.A Mitarbeiter-App (`apps/employee-pwa`)

| # | Aktion | UI-Fundstelle | Event (lokal) | Backend-Endpunkt | Persistenz |
|---|--------|---------------|---------------|------------------|------------|
| M1 | Lagerplatz scannen | `screens/LagerplatzScanScreen.tsx:34-44` | `pickup.location_scanned` (`useCaseFlow.ts:125`) | `POST /api/cases/:id/start-preparation` | Status `assigned→picking` (Event lokal-only) |
| M2 | Etiketten drucken | `screens/VorbereitungScreen.tsx:44` | `print.job_created` (`useCaseFlow.ts:139`) | — | lokal-only |
| M3 | Sortierung fertig / Vorbereitung | `screens/VorbereitungScreen.tsx:38-45` | `case.started` (`useCaseFlow.ts:149`) | — | lokal-only |
| M4 | Position bestätigen | `screens/PositionScreen.tsx:48-56` | `position.confirmed` (`useCaseFlow.ts:156`) | — | lokal-only |
| M5 | Stückzahl prüfen | `screens/PositionScreen.tsx:55` | `sku.quantity_confirmed` (`useCaseFlow.ts:166`) | — | lokal-only |
| M6 | Boxzettel drucken | `screens/BoxabschlussScreen.tsx:40` | `box.label_printed` (`useCaseFlow.ts:176`) | — | lokal-only |
| M7 | Box verplomben | `screens/BoxabschlussScreen.tsx:45` | `box.sealed` (`useCaseFlow.ts:185`) | — | lokal-only |
| M8 | Box aufs Förderband | `screens/BoxabschlussScreen.tsx:50` | `box.sealed` **(+payload)** (`useCaseFlow.ts:195`) | — | lokal-only |
| M9 | ZST setzen & abschließen | `screens/AbschlussScreen.tsx:59` | `zst.created` + `case.completed` (`useCaseFlow.ts:205,213`) | `POST /api/cases/:id/complete` | ZstRecord + Status `completed` |
| M10 | Teilabschluss (mit Grund) | `screens/AbschlussScreen.tsx:110` | `case.partially_completed` (`useCaseFlow.ts:224`) | `POST /api/cases/:id/partial-complete` | ZstRecord (Menge 0!) + Status |
| M11 | Problem melden (Issue) | `screens/ProblemMeldenScreen.tsx:47` | `issue.created` (`useCaseFlow.ts:239`) | `POST /api/issues` | Issue-Row + Status |
| M12 | Skip / Überspringen (mit Grund) | `workflow/useCaseFlow.ts:254`, `skip.ts` | `step.skipped` | — | **nie aus UI aufgerufen** |

### 1.B Teamlead-Web (`apps/teamlead-web`)

| # | Aktion | UI-Fundstelle | Grund+Audit | Backend-Endpunkt |
|---|--------|---------------|-------------|------------------|
| T1 | Neu berechnen (Preview/Dry-Run) | `features/cockpit/CockpitPage.tsx:74` → `SimulationPanel.tsx` | — (Simulation) | `POST /api/teamlead/assignments/preview` |
| T2 | Live zuweisen (Commit) | `features/simulation/SimulationPanel.tsx:141` | — | `POST /api/teamlead/assignments/recalculate` |
| T3 | Export | `features/cockpit/CockpitPage.tsx:85` | — | **kein onClick / kein Endpunkt** |
| T4 | Priorisieren | `features/belege/BelegDetailPage.tsx:116`, `features/ablagen/AblagenBoard.tsx:166` | ✓ (`case.prioritized`) | `POST /api/teamlead/cases/:id/prioritize` |
| T5 | Parken | `BelegDetailPage.tsx:127`, `AblagenBoard.tsx:169` | ✓ (`case.parked`) | `POST /api/teamlead/cases/:id/park` |
| T6 | Freigeben / Entparken | `AblagenBoard.tsx:160` | ✓ (`case.ready`) | `POST /api/teamlead/cases/:id/unpark` |
| T7 | Entziehen (Bündel) | `features/board/MitarbeiterBoard.tsx:185` | ✓ (`assignment.overridden`) | `POST /api/teamlead/bundles/:id/withdraw` |
| T8 | Hinzufügen (Bündel) | `MitarbeiterBoard.tsx:205` | ✓ | `POST /api/teamlead/bundles/:id/add` |
| T9 | Reihenfolge ändern | `MitarbeiterBoard.tsx:242` | ✓ | `POST /api/teamlead/bundles/:id/reorder` |
| T10 | Pause / Abwesenheit | `MitarbeiterBoard.tsx:261` | ✓ | `POST /api/teamlead/bundles/:id/pause|resume` |
| T11 | Belegdetails öffnen (7 Tabs, read-only) | `BelegDetailPage.tsx:146-336` | — | `GET /api/teamlead/cases/:id` |
| T12 | Dokumentvorschau | `BelegDetailPage.tsx:323-331` | — | **deaktiviert („EPIC 3")** |
| T13 | Issue auflösen / freigeben | — | — | Backend `POST /api/teamlead/issues/:id/resolve|release` **ohne UI** |
| T14 | Regeln / Lagerplätze speichern | `features/admin/AdminPage.tsx:240`, `LocationMasterEditor.tsx:214` | — | `PUT /api/admin/rules`, `PUT /api/admin/locations` |

### 1.C Vom Konzept gefordert, aber als Aktion nicht vorhanden (Detail in §3)

Starterpakete erzeugen (§10.1) · Reserve-Schieber im Cockpit (§10.1) · Problem-mit-Gerät-Button (§9.2) · Foto-Upload im Problem-Dialog (§9.7) · Lagerplatz-Soll/Ist-Abgleich (§9.4/E.3) · dedizierte Problem-Inbox (E.4).

---

## (2) Kritische Bewertung je Aktion

### 2.A Mitarbeiter-App

**M1 — Lagerplatz scannen — HALF-BAKED.**
Scan-first via Keyboard-Wedge funktioniert; löst korrekt `start-preparation` (assigned→picking) aus. **Aber:** Der gescannte Code wird **nicht** gegen den erwarteten `case.storageLocation.code` validiert (kein Mismatch-Schutz, vgl. E.3 Fehlervermeidung) — `LagerplatzScanScreen.tsx:34-44` nimmt jeden Code an. Das `pickup.location_scanned`-Event bleibt lokal (`useCaseFlow.ts:125`), erreicht den Audit-Trail nie, obwohl `RouteStop.scannedAt` im Schema existiert. **Severity: HIGH.**

**M2 — Etiketten drucken — HALF-BAKED.**
Die **Druck-vor-Auspacken-Guard** ist vorbildlich: „Sortierung fertig" erscheint erst nach `labelsPrinted` (`VorbereitungScreen.tsx:43-45`), Folge-Checkboxen sind bis dahin `disabled`. **Aber:** Es wird **kein** realer Druckauftrag erzeugt — `print.job_created` ist ein lokaler Log-Eintrag (`useCaseFlow.ts:139`); ein Backend-Druckmodul existiert als reine Logik (`modules/print/print-jobs.ts`), hat aber **keinen Controller/Endpunkt** und keine `PrintJob`-Tabelle. Der Druck ist fiktiv. **Severity: MEDIUM** (Pilot druckt vermutlich über Altsystem; relevant sobald Druck integriert wird).

**M3 — Sortierung fertig — HALF-BAKED / verwirrende Event-Benennung.**
Lokales `case.started`-Event (`useCaseFlow.ts:149`) — aber das Backend emittiert bereits bei `start-preparation` ein serverseitiges `case.started` (`cases.service.ts:168`). Zwei gleichnamige Events an unterschiedlichen Punkten; der lokale ist redundant und kollidiert semantisch. **Severity: LOW.**

**M4 — Position bestätigen — HALF-BAKED (Server-Trust-Lücke).**
Eine-Position-pro-Screen, Progressive Disclosure, sauber. **Aber:** `position.confirmed` ist lokal-only; es gibt keinen Endpunkt, der die Positionsbestätigung persistiert (Event-Typ definiert, **nie** vom Backend ausgelöst — `enums.ts`). `ReceiptPosition.status`/`confirmedQuantity` bleibt serverseitig auf `open`. **Severity: HIGH** (Teamlead-Belegdetail „Soll/Ist" zeigt nie echten Ist-Stand).

**M5 — Stückzahl prüfen — KAPUTT (Guard nur clientseitig wirksam).**
Die §G.1-Guard „Mindest-Stückzahlkontrolle immer erforderlich" ist clientseitig korrekt erzwungen (`sync.ts:127`, `workflowModel.ts`). **Aber:** `sku.quantity_confirmed` ist lokal-only (`useCaseFlow.ts:166`); die bestätigte Menge erreicht das Backend **nie**. Da `complete()` ohnehin die volle `totalQuantity` bucht (siehe §2.C), ist die Mengenkontrolle serverseitig **bedeutungslos** — sie kann beliebig abweichen, ohne dass die ZST das merkt. Zusätzlich sind die SKU-Zeilen in der PWA **synthetisch** (eine pro Position, Menge gleichverteilt — `sync.ts:138-177`), das Aggregat-DTO liefert keine echten EANs/Größen. **Severity: HIGH.**

**M6 — Boxzettel drucken — HALF-BAKED.** Wie M2: lokal-only `box.label_printed` (`useCaseFlow.ts:176`), kein Backend. Reihenfolge-Guard (erst Zettel, dann Plombe) korrekt. **Severity: MEDIUM.**

**M7 — Box verplomben — KAPUTT (Backend-Guard erwartet etwas, das nie ankommt).**
`box.sealed` lokal-only (`useCaseFlow.ts:185`); kein Seal-Endpunkt, obwohl `TransportBox.sealed`/`sealCode` im Schema existieren. Das Backend-Completion-Gate prüft `unsealedBoxCount === 0` (`completion-logic.ts:64,100`) — diese Prüfung ist jedoch toter Code (§2.C), sonst könnte **kein** Beleg je abschließen, weil Boxen serverseitig nie verplombt werden. **Severity: HIGH.**

**M8 — Box aufs Förderband — KAPUTT (Event-Typ-Kollision).**
Emittiert **erneut** `box.sealed`, unterschieden nur durch `payload.onConveyor` (`useCaseFlow.ts:195`). Audit/Reporting kann „verplombt" und „auf Band" nicht ohne Payload-Parsing trennen; ein eigener Typ (`box.conveyor_placed`) fehlt. Lokal-only. **Severity: MEDIUM.**

**M9 — ZST setzen & abschließen — HALF-BAKED (Gate clientseitig, Server bucht blind).**
Das clientseitige Completion-Gate (`workflowModel.ts:82-97`: alle Positionen bestätigt, alle Mengen geprüft, alle Boxen verplombt) ist gründlich und sperrt den Button korrekt. **Aber** das Backend ignoriert all das und bucht die volle Menge (§2.C, Befund 1). Offline-Verhalten (lokaler State bleibt, Retry möglich) ist sauber gelöst. **Severity: CRITICAL** (über §2.C).

**M10 — Teilabschluss — KAPUTT (bucht Menge 0).**
Grund-Pflicht im Dialog korrekt (`SkipDialog.tsx:52`). **Aber:** `persistPartialComplete(caseId, reason)` sendet nur `{ reason }` (`persist.ts:65-77`); das Backend bucht `dto.completedQuantity ?? 0` (`cases.service.ts:276`) → ZST mit Menge 0, anteiliger Aufwand 0. Die fertige Teilmenge wird nirgends erfasst; die Restmenge-Logik (§4.6 „Rest nächster Tag") läuft ins Leere. Zusätzlich Idempotenz-Key `zst:<id>:0` vs. später `zst:<id>:<total>` — ein späterer Vollabschluss legt einen **zweiten** ZstRecord an. **Severity: CRITICAL.**

**M11 — Problem melden — HALF-BAKED.**
Exception-first, immer erreichbar; Scope-Auswahl (Position/SKU/Box/Beleg) + 7 Typen; `issue.created` wird per `POST /api/issues` **persistiert** (echtes Backend, Scope-Blocking-Logik vorhanden, `modules/issue/issue-logic.ts`). **Lücken:** (a) **`scopeId` wird in der UI nie gesetzt** — nur der Scope-*Typ*, nicht die konkrete Positions-/SKU-/Box-ID (`ProblemMeldenScreen.tsx`; `persist.ts:89` sendet `scopeId`, Wert bleibt leer) → jedes Issue hängt faktisch am ganzen Beleg, Scope-Blocking auf Positionsebene wirkungslos; (b) **Foto-Upload fehlt** (nur Text „Foto: optional", `photoKeys` nie befüllt); (c) Positionsnummer wird nicht vorbelegt (Konzept zeigt „Position: 3"). **Severity: HIGH** (wegen a — der Issue-Scope ist das fachliche Herz von §4.5).

**M12 — Skip / Überspringen — KAPUTT / FEHLT.**
`skip()`/`buildSkipEvent()` inkl. Grund-Pflicht ist implementiert (`useCaseFlow.ts:254`, `skip.ts:27-38`), wird aber von **keinem** Screen aufgerufen. Der `SkipDialog` wird ausschließlich vom Teilabschluss benutzt. Es gibt keinen „Position überspringen (mit Grund)"-Pfad, obwohl die Infrastruktur steht. Tote Fähigkeit. **Severity: MEDIUM.**

### 2.B Teamlead-Web

**T1/T2 — Neu berechnen (Preview) & Live zuweisen — VOLLSTÄNDIG.**
Preview = echte Engine als Dry-Run, persistiert nichts (`assignment.service.ts` preview); Commit läuft idempotent, deterministisch < 5 s und schreibt Bundles/Items/RouteStops transaktional + `bundle.created`/`bundle.assigned`. Human-in-the-loop sauber. Einzige Lücke: **kein Delta zum Ist** (E.4 fordert „Vorschlag, Delta, Auswirkungen") — nur Absolutwerte. **Severity: LOW.**

**T3 — Export — KAPUTT (toter Button).**
`CockpitPage.tsx:85-87` hat `onClick={undefined}`. Die CSV-Funktionen existieren (`packages/assignment-engine` `csv-export.ts` `zstRowsToCsv`/`kpiSnapshotsToCsv`), aber **kein** `GET /api/teamlead/exports/*`-Endpunkt und keine Mutation. §15.1/§15.2 (ZST-/KPI-Export) ist damit nicht bedienbar. **Severity: HIGH.**

**T4 — Priorisieren — VOLLSTÄNDIG.** ReasonDialog (≥3 Zeichen) + `case.prioritized` + Audit; setzt `manual_teamlead_priority`; invalidiert Cockpit+Beleg. Identisch aus Belegdetail und Ablage. Sauber.

**T5 — Parken — VOLLSTÄNDIG.** Guard `canPark` (nur `ready`/`needs_review`), Grund+Audit (`case.parked`). Sauber. *Nebeneffekt:* Der enge Guard ist mitverantwortlich dafür, dass `issue_open`-Belege nirgends hinkönnen (siehe T13).

**T6 — Freigeben/Entparken — VOLLSTÄNDIG.** `/unpark`, `case.ready`, Grund+Audit. **Achtung Namens-Falle:** Dieses „Freigeben" ist NICHT die Issue-Freigabe (siehe T13).

**T7–T10 — Bündel-Eingriffe (Entziehen/Hinzufügen/Reihenfolge/Pause) — VOLLSTÄNDIG.**
Alle mit ReasonDialog, optimistischem Update **und Rollback** (`store.tsx:245-316`), `assignment.overridden`-Audit, Cockpit-Invalidierung. Guards serverseitig (z. B. Entziehen nur solange Case `assigned`, 409 wenn gestartet). Vorbildlich umgesetzt — Referenz-Qualität für die übrigen Aktionen.

**T11 — Belegdetails (7 Tabs) — VOLLSTÄNDIG (read-only) mit Datenvorbehalt.**
Kopf/Priorität/Aufwand/Positionen+SKU/Boxen/Historie/Dokumente. Korrekt read-only. **Aber:** Die Tabs „Positionen/Boxen" zeigen den serverseitigen Stand — der wegen §2.C nie den realen Mitarbeiter-Fortschritt enthält (Positionen bleiben `open`, Boxen `pending`). Anzeige ist also strukturell, nicht inhaltlich aktuell. **Severity: MEDIUM** (Folge von §2.C).

**T12 — Dokumentvorschau — FEHLT (bewusst, EPIC 3).**
`BelegDetailPage.tsx:323-331` durchgestrichen, „Vorschau folgt (EPIC 3)". Hängt an Dokument-Ingestion/Objektspeicher. **Severity: MEDIUM** (descoped, aber §10.4 fordert Link/Preview).

**T13 — Issue auflösen / freigeben — FEHLT in der UI (Backend verwaist).**
Backend-Endpunkte vorhanden und korrekt (`teamlead.controller.ts:119-139`: resolve `issue_open→waiting_teamlead`, release `waiting_teamlead→released→checking`). **Im Frontend existiert kein einziger Aufruf** (verifiziert). Problemfälle erscheinen nur als Lane im Ablagenboard mit Aktionen Priorisieren/Parken/Details — **keine** Auflösen/Freigeben-Aktion. Da `canPark` `issue_open` ausschließt, gibt es **keinen** UI-Weg, einen beleg-skopierten Problemfall wieder flott zu machen. Der Beleg bleibt hängen. **Severity: CRITICAL.**

**T14 — Regeln / Lagerplätze speichern — VOLLSTÄNDIG.**
`PUT /api/admin/rules` (Zod-validiert) und `PUT /api/admin/locations` (Upsert per Code, Soft-Deactivate, 409 bei Referenz). Verladeplan-/Parser-Tabs nur lesend — bereits in `ux-gap-analysis.md` erfasst, für Beleg-Aktionen nachrangig.

### 2.C Übergreifend — Frontend ↔ Backend ↔ Zustandsmaschine (Kernproblem)

**Die §7.1-Zustandsmaschine ist vollständig und sauber** (`apps/backend-api/src/workflow/case-status.ts`): 20 Zustände, dokumentierte Transitions inkl. Sonderpfade `ready↔parked`, `…→issue_open→waiting_teamlead→released→checking`, `boxing→partially_completed→ready`. Das Problem ist **nicht** die Maschine, sondern dass die **realen Arbeitsschritte sie nicht durchlaufen**:

1. **„Strukturelle Hops" überspringen die Arbeit.** `complete()`/`partialComplete()` rufen `advanceToBoxing()` (`cases.service.ts:181-220`), das den Case ohne Milestone-Events von `assigned` bis `boxing` durchschleust. Picking/Preparing/Sorting/Checking werden serverseitig nie real betreten — sie passieren nur lokal in der PWA. Der Server kennt nur `assigned → (hop) → boxing → completed`.

2. **Die Completion-Guard ist toter Code.** `canFullyComplete()` / `completeCase()` (`completion-logic.ts:60-128`) prüfen offene Issues, unverplombte Boxen und bestätigte Menge — werden aber von `CasesService.complete()` **nicht aufgerufen**. Stattdessen: blind `completedQuantity = totalQuantity` (`cases.service.ts:243-246`). → **Befund 1, CRITICAL.**

3. **Teilabschluss-Menge geht verloren** (Befund 2 / M10). → **CRITICAL.**

4. **Arbeits-Events erreichen den Audit-Trail nie.** Der Event-Log ist hash-verkettet und manipulationssicher (`events/event-log.service.ts`), aber `position.confirmed`, `sku.quantity_confirmed`, `box.sealed`, `box.label_printed`, `pickup.location_scanned`, `bundle.started`, `zst.exported` sind im Enum definiert und werden **nie ausgelöst** (kein Producer). Der „lückenlose" Trail hat also genau dort Lücken, wo die physische Arbeit passiert. Es gibt **keinen** Event-Ingest-Endpunkt und **keine** Outbox in der PWA (`db/sync.ts` lädt nur herunter; ein Upload-Pfad fehlt). → **CRITICAL.**

5. **`AssignmentStatus = 'accepted'`** ist definiert, wird aber nie gesetzt (Case geht `assigned → picking` direkt); `bundle.started` ebenso nie emittiert. Latente Begriffe ohne Producer.

**Engine-Fähigkeiten ohne UI-Aktion** (`packages/assignment-engine`): Aufwands-Vektor-Neuberechnung (`plan.ts:44`), Heavy/Light-Toggle und Specialist-Avoidance (`distribute.ts:70`, hart `true`), Bündel-Max-Cases-Override pro Lauf, Box-Split-Orchestrierung (`TransportBoxTarget` existiert, wird nie erzeugt/aufgeteilt), Pickup-Profil pro Mitarbeiter (`pickup-order.ts:101`). Alles vorhanden, nichts als Aktion exponiert.

---

## (3) Lücken-/Missing-Actions-Analyse (FEHLT)

| Aktion | Konzept-§ | Befund | Fundstelle |
|--------|-----------|--------|------------|
| **Issue auflösen/freigeben (UI)** | §4.5, §8.4, §10.2 | Backend da, **kein** Frontend-Aufruf; Problemfälle nicht abschließbar | Backend `teamlead.controller.ts:119-139`; UI fehlt |
| **Starterpakete erzeugen** | §10.1, §8.3 | Engine-Logik hart in `assignWork()` verdrahtet, kein Button/Toggle | `plan.ts` (`createBalancedBundles(...,'starter')`) |
| **Reserve-Schieber (Cockpit)** | §10.1 | Reserve nur über Admin-Regel editierbar, kein Quick-Slider im Cockpit | `CockpitPage.tsx` (fehlt); Admin `AdminPage.tsx` Reserve-Tab |
| **Export (ZST/KPI-CSV)** | §15.1, §15.2 | Toter Button, kein Endpunkt; CSV-Funktionen ungenutzt | `CockpitPage.tsx:85`; `csv-export.ts` |
| **Lagerplatz Soll/Ist-Abgleich** | §9.4, E.3 | Scan akzeptiert jeden Code, keine Mismatch-Warnung | `LagerplatzScanScreen.tsx:34-44` |
| **Foto-Upload im Problem-Dialog** | §9.7, E.3 | Nur Placeholder-Text; `photoKeys` nie befüllt | `ProblemMeldenScreen.tsx` |
| **Issue-Scope-ID erfassen** | §4.5, §9.7 | Nur Scope-Typ, keine konkrete Positions-/SKU-/Box-ID | `ProblemMeldenScreen.tsx`; `persist.ts:89` |
| **Problem-mit-Gerät-Button** | §9.2 | Kein gerätespezifischer Shortcut im Tagesstart | `TagesstartScreen.tsx` |
| **Position überspringen (mit Grund)** | §9.x | Infrastruktur (`skip()`) vorhanden, nie aus UI aufgerufen | `useCaseFlow.ts:254`, `skip.ts` |
| **Dedizierte Problem-Inbox** | E.4 | Nur Lane im Ablagenboard, keine sortierte Triage-Queue | — |
| **Dokumentvorschau** | §10.4 | Deaktiviert (EPIC 3) | `BelegDetailPage.tsx:323` |
| **Simulation-Delta** | E.4 | Nur Absolutwerte, kein Ist/Soll-Delta | `SimulationPanel.tsx` |

---

## (4) Priorisierte Findings-Tabelle

| # | Aktion | Status | Severity | Problem (Kurz) | Empfehlung | Fundstelle |
|---|--------|--------|----------|----------------|------------|------------|
| F1 | Abschluss (M9) | KAPUTT | **CRITICAL** | Backend bucht blind `totalQuantity`; Guard-Logik ist toter Code | `complete()` echte bestätigte Menge + `canFullyComplete()` verdrahten | `cases.service.ts:222-248`; `completion-logic.ts:60-128` |
| F2 | Teilabschluss (M10) | KAPUTT | **CRITICAL** | Bucht Menge 0; PWA sendet keine `completedQuantity` | Menge im Dialog erfassen + im Body senden; Backend validieren | `persist.ts:65-77`; `cases.service.ts:276` |
| F3 | Issue auflösen/freigeben (T13) | FEHLT | **CRITICAL** | Kein UI-Weg; `issue_open`-Belege bleiben hängen | resolve/release als Teamlead-Aktion (Ablage/Belegdetail) anbinden | `teamlead.controller.ts:119-139`; UI fehlt |
| F4 | Arbeits-Events Sync (M4–M8) | KAPUTT | **CRITICAL** | Events lokal-only, kein Backend, Audit unvollständig | Event-Ingest-Endpunkt + Outbox; Positions-/Box-Status persistieren | `useCaseFlow.ts:125-200`; `db/sync.ts` |
| F5 | Stückzahl prüfen (M5) | KAPUTT | HIGH | Guard nur clientseitig; echte SKU-Daten fehlen | Bestätigte Menge serverseitig führen (Teil von F1/F4) | `PositionScreen.tsx:55`; `sync.ts:138-177` |
| F6 | Position bestätigen (M4) | HALF-BAKED | HIGH | Ist-Stand nie persistiert; Belegdetail zeigt `open` | Positions-Confirm-Endpunkt (Teil von F4) | `useCaseFlow.ts:156` |
| F7 | Problem-Scope-ID (M11) | HALF-BAKED | HIGH | `scopeId` nie gesetzt → Scope-Blocking wirkungslos | konkrete Entity-ID im Dialog erfassen+senden | `ProblemMeldenScreen.tsx`; `persist.ts:89` |
| F8 | Export (T3) | KAPUTT | HIGH | Toter Button, kein Endpunkt | `GET /exports/zst|kpi` + Download-Mutation (CSV existiert) | `CockpitPage.tsx:85`; `csv-export.ts` |
| F9 | Lagerplatz-Abgleich (M1) | HALF-BAKED | HIGH | Kein Soll/Ist-Check beim Scan | Scan gegen `storageLocation.code` validieren, warnen | `LagerplatzScanScreen.tsx:34-44` |
| F10 | Box verplomben (M7) | KAPUTT | HIGH | Seal erreicht Backend nie; Guard läuft leer | Seal-Endpunkt + `TransportBox.sealed` setzen (Teil von F4) | `useCaseFlow.ts:185` |
| F11 | Box-Event-Kollision (M8) | KAPUTT | MEDIUM | `box.sealed` doppelt belegt | eigener Typ `box.conveyor_placed` | `useCaseFlow.ts:195` |
| F12 | Druck M2/M6 | HALF-BAKED | MEDIUM | Fiktiver Druck, kein Backend/Drucker | Druck-Endpunkt erst bei realer Druckintegration | `print-jobs.ts` (kein Controller) |
| F13 | Skip-Pfad (M12) | KAPUTT | MEDIUM | Infrastruktur ungenutzt | „Position überspringen (Grund)" anbinden oder entfernen | `useCaseFlow.ts:254`; `skip.ts` |
| F14 | Foto-Upload (M11) | FEHLT | MEDIUM | Kein Upload-Control/Endpunkt | Datei/Kamera + Objektspeicher | `ProblemMeldenScreen.tsx` |
| F15 | Starterpakete (UI) | FEHLT | MEDIUM | Engine-Logik nicht toggle-/auslösbar | Toggle/Button pro Recalculate | `plan.ts` |
| F16 | Reserve-Schieber | FEHLT | MEDIUM | Nur Admin-Regel, kein Cockpit-Slider | Quick-Slider im Cockpit→Preview | `CockpitPage.tsx` |
| F17 | Problem-mit-Gerät (M-Start) | FEHLT | MEDIUM | Kein Shortcut im Tagesstart | Button mit vorbelegtem Scope/Typ | `TagesstartScreen.tsx` |
| F18 | Dokumentvorschau (T12) | FEHLT | MEDIUM | Deaktiviert (EPIC 3) | mit EPIC 3 liefern | `BelegDetailPage.tsx:323` |
| F19 | Problem-Inbox | FEHLT | MEDIUM | Nur Lane, keine Triage-Queue | sortierbare Inbox (Alter/Schwere/Scope) | — |
| F20 | Lokales `case.started` (M3) | HALF-BAKED | LOW | Redundant zu Server-`case.started` | lokalen Event entfernen/umbenennen | `useCaseFlow.ts:149` |
| F21 | Simulation-Delta | HALF-BAKED | LOW | Nur Absolutwerte | Ist/Soll-Delta-Spalte | `SimulationPanel.tsx` |

---

## (5) Empfehlung zur Reihenfolge der Behebung (lean, Pilot-tauglich)

Leitgedanke: Zuerst die Befunde schließen, die **Daten verfälschen oder den Fluss blockieren** — nicht die fehlenden Komfort-Aktionen. Die Bündel-Eingriffe (T7–T10) sind Referenz-Qualität; dieselbe Disziplin auf die Mitarbeiter-Pfade übertragen.

**Stufe 1 — Datenwahrheit & Fluss (CRITICAL, vor Pilot zwingend):**
1. **F2 (Teilabschluss-Menge):** kleinster Fix mit größtem Datenschaden-Hebel — Menge im Dialog erfassen, im Body senden, Backend validieren. ½ Tag.
2. **F3 (Issue auflösen/freigeben UI):** Backend ist fertig — nur zwei Mutations + Buttons in Ablage/Belegdetail. Ohne dies bleibt jeder echte Problemfall stecken. ~1 Tag.
3. **F1 (Abschluss bucht echte Menge):** `complete()` auf `canFullyComplete()`/echte bestätigte Menge umstellen. Setzt F4/F5 voraus, um die Menge zu kennen.
4. **F4/F5/F6/F10 (Arbeits-Event-Sync gebündelt):** ein Event-Ingest-Endpunkt + Outbox in der PWA, der `position.confirmed`/`sku.quantity_confirmed`/`box.sealed`/`pickup.location_scanned` persistiert und Positions-/Box-Status fortschreibt. Schließt zugleich den Audit-Trail (§7.2). Größter Brocken — als ein Arbeitspaket planen.

**Stufe 2 — Konzept-Kernaktionen sichtbar machen (HIGH):**
5. **F7 (Issue-Scope-ID):** ohne sie ist §4.5-Scope-Blocking wirkungslos — billiger UI-Fix.
6. **F9 (Lagerplatz-Soll/Ist):** reiner Client-Check, hohe Fehlervermeidung (E.3).
7. **F8 (Export):** CSV-Funktionen existieren — nur zwei Read-Endpunkte + Download verdrahten.

**Stufe 3 — Konsistenz & UX (MEDIUM):**
8. F11 (Box-Event-Typ), F13 (Skip anbinden oder löschen), F17 (Gerät-Problem), F15/F16 (Starterpakete/Reserve-Slider), F19 (Problem-Inbox), F14 (Foto).

**Stufe 4 — bewusst nachgelagert (LOW / extern abhängig):**
9. F12 (Druck — erst bei realer Druckintegration), F18 (Dokumentvorschau — EPIC 3), F20 (redundanter Event), F21 (Simulation-Delta).

> **Hinweis zur Lean-Steuerung:** Stufe 1 ist kein „Nice-to-have" — F1–F4 betreffen ZST-Korrektheit und damit die KPI-/Reporting-Basis (§15) sowie die Abschließbarkeit von Problemfällen. Alles ab Stufe 3 ist Pilot-verschiebbar.
