# Dustin Feldmann Feedback (03.07.2026) — Full Critical Review

Ground truth: `Feedback zum aktuellen Stand des Dashboards | UX.pdf` (Mitarbeiterapp, 03.07. 8:36) and
`Dashboard UI - Feedback Teamlead.docx` (Dashboard, 03.07. 12:50). Verified against code on `main`
@ `fdaaee3` after Tasks 1/3 (Backend+Engine), 2/3 (PWA), 3/3 (Cockpit) landed. Verdicts: **DONE** /
**PARTIAL** / **MISSING** / **WRONG**. Every row cites the source sentence and file:line evidence.

## Summary

- Mitarbeiterapp: **44/44 DONE** (one caveat on Hängeware ordering, noted below).
- Dashboard/Admin: of ~45 points, all but 4 are DONE; found and fixed **one real bug** (D2
  Pool-Hold release never reached the engine) and **one test-seed bug** masquerading as a
  regression; removed one dead UI remnant (schwer/leicht); tightened two misleading comments/UI
  hints; two questions remain genuinely open (only Dustin/ops can answer).
- Full quality gate green after fixes: typecheck 13/13, build 8/8, lint 0 errors, engine 164
  tests, backend unit 130 tests, monorepo test 13/13, OpenAPI/api-client in sync, seed clean.

---

## 1. Mitarbeiterapp (UX PDF)

| # | Feedback (verbatim/paraphrased) | Verdict | Evidence |
|---|---|---|---|
| M1 | "Dieser Punkt könnte gestrichen werden, weil die MAs das nicht sehen müssen" (Demo-Picker) | DONE | Gated on `VITE_DEMO_CONTROLS=1`, not shown by default (`BundleHomeScreen.tsx:171`, `api.ts:30`) |
| M2 | "Vorschlag: Immer eine Mischung — Regal, Hängebahn, Palette" | DONE | Default scenario mixes all 3 kinds (`exampleAssignment.ts:345/408/437`) |
| M3 | "Dein Karren. 3 Belege . Regal streichen" | DONE | Overline removed, header is greeting-only (`BundleHomeScreen.tsx:172-177`) |
| M4 | "Arbeitsplatz muss in den Admin-Tools an einem Mitarbeiter hinterlegt werden können" | DONE | Admin `SkillWorkstationFields` (`EmployeeDetailPanel.tsx:181-243`); PWA `claimWorkstation` → `POST /api/me/workstation` |
| M5 | "Beim Log-In, Tisch-Nr. eingeben oder Scannen eines Barcodes?" | DONE | `TischLoginScreen.tsx:43` scanner + manual TextField (58-68) |
| M6 | "Blau markiert kann gestrichen / vorerst ausgeblendet werden" | DONE | No stats header anywhere (`AppHeader.tsx:22-34`) |
| M7 | "Passt sich Guten Morgen an die Tageszeit an?" | DONE | `greetingForHour` Morgen/Tag/Abend (`BundleHomeScreen.tsx:66-70`) |
| M8 | "Wording Sammeln in Ware holen abändern" | DONE | "1 · Ware holen" (`:191`) |
| M9 | "Für mich ist ein Schritt zu viel / ein Fenster zu viel" (one-screen flow) | DONE | No `/collect` route; inline check-off (`:198-258`) |
| M10 | "MA soll direkt die Info erhalten, ob Etiketten gedruckt werden müssen. Wenn nicht, nichts dazu" | DONE | Chip only `if (b.priceLabelPrintRequired)` (`:245`) |
| M11 | "nach 3 oder 4 Belegen Stopp... Parkposition... im nächsten Bündel" | DONE | "Rest parken" (`:113-266`); backend rejects non-`assigned` cases → started never returns (`cases.service.ts:208-222`) |
| M12 | "Bei Paletten/Regal nicht Teile-Anzahl, bei Hängeware schon" | DONE | `goodsType === 'haengeware'` gate (`:300-301`) |
| M13 | "Anpassung der ICONs — definierbar über die Lagerplätze" | DONE | `goodsCategoryFromKind` from LocationKind (`sync.ts:137-152`) |
| M14 | "Weiter · WE XY → Start Bearbeitung WE XY" | DONE | (`:359`) |
| M15 | "Lagerplatz muss 1:1 aus der Arbeitsanweisung entnommen werden" | DONE | comment + literal render (`:236-237`) |
| M16 | "NOS/EB Abschnittsbezeichnung ... es muss keine Empfehlung ausgesprochen werden" | DONE | Chip shown, list order = bundle order only, any Beleg tappable (`:305-307`, `belegList.ts:11-13`) |
| M17 | "WE Beleg-Nr. muss größer" | DONE | Hero title (`BelegProcessScreen.tsx:177`) |
| M18 | "Beleg Bearbeiten kann gestrichen werden" | DONE | Title is "WE X" only |
| M19 | "Anzahl der Kartons ... müssen dort stehen" | DONE | "📦 N Karton(s)" (`:179-182`) |
| M20 | "Wie viele Positionen kann gestrichen werden" | DONE | bare heading, no count (`:253`) |
| M21 | "Abschnitt 1 etc. weg, Vororder/Nachorder bleibt" | DONE | (`:191-193, 299-301`) |
| M22 | "Anzahl Teile kann stehenbleiben" | DONE | (`:194`) |
| M23 | Arbeitsanweisung reorder + Prüfstufen-Erklärung | DONE | `POINT_DISPLAY_ORDER` sort→check(explained)→security→red_price→box_label→online (`:64-71, 227-257`) |
| M24 | "Preisetikettendruck ... kann gestrichen werden" (+ no dead code) | DONE | No print step; no `printedLabels`/§G.2 gate anywhere (grep clean) |
| M25 | "Karton öffnen ... kann gestrichen werden" | DONE | (`:11`, no rendered step) |
| M26 | "Preisetikett auf Positionsebene mit Piktogramm" | DONE | Per-Position placement + pictogram img (`:267, 319-334`) |
| M27 | "EAN, Größe, EK, VK, VK-Etikett, Menge je Position" | DONE | (`:340-408`) |
| M28 | "Stattdessen ganzer Beleg... kann hier weg" | DONE | Not offered at Positionsebene (`ProblemMeldenScreen.tsx:121-135`) |
| M29 | "Mehr-/Mindermengen pro Größe mit +/-" | DONE | (`:372-405`) |
| M30 | "Wo ist das Problem kann weg" | DONE | Replaced by Problemart dropdown (`:137-148`) |
| M31 | "Kommentar bleibt" | DONE | (`:150-156`) |
| M32 | "warum gibt es den Button Restware weiterbearbeiten?" | DONE | Button removed, replaced by explanatory footer text (`:174-176`) |
| M33 | "Farbe auf gleiche Schriftgröße wie Artikel-Nr." | DONE | (`:280-281`) |
| M34 | "Artikel-Nr. unter Pos 1" | DONE | (`:278-280`) |
| M35 | "Shop ergänzen" | DONE | (`:288-290`) |
| M36 | "WGR mit Beschreibung" | DONE | (`:283-287`, `DEFAULT_WGR_CATALOG`) |
| M37 | "Catman ergänzen" | DONE | (`:302`) |
| M38 | Online-Größen CSV rot/grün + Fallback | DONE | Server-side `deriveOnlineSizeMarks` with preferred→alternative→sizes[0] fallback (`erp-catalog.ts:122-141`); CSV upload `admin.service.ts:192-238` |
| M39 | "Sicherungstyp als Bild hinterlegen (aus ERP)" | DONE | `/static/pictograms/<code>.svg` (`:110-112, 322-329`) |
| M40 | "Mindestmenge geprüft → Position geprüft" | DONE | (`:417/427`) |
| M41 | "muss auch rückgängig gemacht werden können" | DONE | Toggle-back (`:413-419`) |
| M42 | "Was ist der Grund für den Teilabschluss...?" | DONE | Dialog explains, status `'partial'` ≠ Fertig (`:509-515`, `belegList.ts:22`) |
| M43 | "Gibt es die Möglichkeit Belege zu parken" | DONE | `parkRemainingBelege` → `POST /api/me/park` |
| M44 | "Hängeware: keine Wegeoptimierung nötig" | DONE (caveat) | Engine has **no** route optimization at all (`pickup-order.ts:13-20`, explicit non-goal) — satisfies the ask, but Hängeware gets the same deterministic type+number sort as every other stop; there's no special "leave hanging goods unordered" branch. Not a defect, just worth knowing if a *specific* Hängeware ordering was implied. |

## 2. Dashboard/Admin (docx)

### Schichtende / Schichtplan / Skill-Tiers

| # | Feedback | Verdict | Evidence |
|---|---|---|---|
| D1 | "Autostopp: 50 min vor Schichtende, dann Packs auflösen → Pool" | DONE | Default `autoCutoffMinutes: 50` (`admin-config.ts:233`); non-started bundles dissolved via `clearPriorPlanForDate` on `recalculate` (`assignment.service.ts:483-508`). **Caveat**: dissolution runs on the next `recalculate` call, not a wall-clock scheduled job — nothing fires automatically at the cutoff minute unless recalculate is invoked (manually or on a future cron). Two stale "default 120" comments found and fixed (`load-plan.ts`, `config.ts`). |
| D2 | MSP-Daten, aber keine Azubis (nur Stammmannschaft; Rest über Dummys) | PARTIAL | `measured=false` models dummies/Azubis correctly; **no MSP import exists** — open question, no code can answer it |
| D3 | Verschiedene Startzeiten je Saison/Arbeitszeitmodell | DONE | `weeklyPattern` per weekday drives shift derivation (`assignment.service.ts:358-397`) |
| D4 | "Wie bekomme ich die Zeiten bei den Dummys hinterlegt?" | DONE | Dummies materialize shifts from their own `weeklyPattern` same as everyone else |
| D5 | "Bereich kann weg" (Schichtplan) | DONE | No Bereich column (`SchichtplanTab.tsx:116-127`) |
| D6 | Skill-Gewichtung Profi/.../Starter/Dummy gating auto-distribution | DONE | Tiers `profi/fortgeschritten/basis/starter/dummy`; only first 3 auto-assignable (`enums.ts:47-55`); starter/dummy → manual only, both batch (`plan.ts:111-113`) and self-pull (`assignment.service.ts:204-206`) |
| D7 | "Digi-Tag, bleiben sie? ... Produktivität kann dann nicht im Trimestergespräch verwendet werden" | **OPEN QUESTION** | Business/HR decision, not a code question |

### Lagerplätze / Verladeplan / Lieferungen

| # | Feedback | Verdict | Evidence |
|---|---|---|---|
| D8 | "welche Intention... eventuell nicht benötigt (chaotische Lagerhaltung)" | DONE | Admin explainer states exactly this (`LocationMasterEditor.tsx:100-104`) |
| D9 | Verladeplan erklären + Sonderregelung Feiertag DO→MI | DONE | `resolveLoadPlanDate` handles `specialDay` (`load-plan.ts:66-103`); explainer in `VerladeplanTab.tsx:132-138` |
| D10 | Lieferungs-Regeln erklären; Brax-Fall (Kartons fortlaufend, Lieferscheine nicht) | PARTIAL | Union-find over sourceKey/deliveryNoteNo/weBelegNo-run (`delivery-group.ts:163-306`). **No carton-number signal exists** — `inboundCartonCount` is display-only, never fed into detection. The WE-Belegnummer run is used as a *proxy* for consecutive carton booking, which works only when Belege are booked in carton order. Explainer copy (`AdminPage.tsx`) tightened to say this explicitly instead of implying the system reads carton numbers. |
| D11 | Hinweis in Belege-Ansicht bei zusammengehörenden Belegen | DONE | `LieferungChip` column, tooltip "Zusammengehörige Lieferung — X von N" (`BelegListPage.tsx:330-335`) |
| D12 | Pool-Hold: Gruppe wartet bis alle gebucht ODER TL-Release | **FIXED (was broken)** | Backend hold+release logic existed (`delivery-group.ts:withheldCaseIds`, `teamlead.service.ts:releaseDeliveryGroup`) but **`deliveryGroupReleased` was never passed from the case record into the engine's grouping input** (`plan.ts` + 3 call sites in `teamlead-read.service.ts`) — so "trotzdem bearbeiten" never actually lifted the hold. Also **no frontend caller existed** for the release endpoint at all — `DeliveryGroupPanel` had merge/split but no release button. Both fixed: wired `deliveryGroupReleased` end-to-end (engine input + 3 Prisma selects) and added a "Trotzdem bearbeiten" button + `released` badge to `DeliveryGroupPanel.tsx`. Added an engine regression test (`plan.test.ts`: "withholds an incomplete Liefergruppe but assigns it after TL release"). |

### Aufwand / Bündel / Priorität

| # | Feedback | Verdict | Evidence |
|---|---|---|---|
| D13 | "Meiner Meinung nach wird [Aufwand] nicht benötigt..." | KEPT per user steer | Model intact: `computeEffort`, `EffortPreview`, admin Aufwand tab all live (verified in browser) — user explicitly decided to keep it as an internal capacity model; only the **pack sizing** had to become Teile-based (see D14/20/21), which it is |
| D14 | Starter-Pack ~200-250 Teile / Folge-Pack ~80-90 Teile, self-request | DONE | `starterPackMinTeile/MaxTeile: 200/250`, `followUpPackMinTeile/MaxTeile: 80/90` (`admin-config.ts:211-216`), wired into `bundling.ts` (Teile, not minutes) |
| D15 | Nicht geschaffte Belege → Pool bei Schichtende | DONE | Same `clearPriorPlanForDate` as D1 |
| D16 | "Angefangene Belege dürfen nicht in den Pool zurück" | DONE | Dissolution reverts only `status:'assigned'` cases (`assignment.service.ts:495`) |
| D17 | "eigenverantwortlich führt dazu, dass sich der MA das einfachste heraussucht" | DOCUMENTED | Self-pull still respects priority order and skill-tier gating; cherry-picking within the pulled pack is a process/training question, not solvable in code alone |
| D18 | "Wer gewichtet schwer/leicht? Nur Koffer ist wirklich schwer" | **FIXED** | No engine weighting existed (correct), but a **dead frontend remnant** (`heavyCaseCount`/`lightCaseCount`, `HEAVY_MINUTES_THRESHOLD=30`) was still displayed on the board ("schwer X/leicht Y"). Removed from `remoteDataset.ts`, `types.ts`, `MitarbeiterBoard.tsx`. |
| D19 | "Max. Belege/Bündel Grenze würde ich nicht geben (Shop 31 NOS)" | DONE | No `maxCasesPerBundle` anywhere (grep clean) |
| D20 | "Bündel würde ich nach Menge packen" | DONE | Teile-based packing (`bundling.ts:59-131`) |
| D21 | "Min/Max Minuten müsste durch min Teile ersetzt werden" | DONE | See D14; minutes remain only as a capacity/feasibility budget, not pack-size driver |
| D22 | Groß-Belege (2-3000 Teile Knecki) manuelle Entscheidung + Folgetag-Sperre | PARTIAL | `largeBelegTeileThreshold: 2000` skips auto-distribution → `reason:'large_beleg'` (manual TL decision), confirmed wired (`plan.ts:184-194`). "Folgetag" is implemented as **status-based**, not calendar-based: an employee with an open `partially_completed` large case is excluded from the next recalculate and self-pull (`assignment.service.ts:105-116, 214-222`) — functionally equivalent to "no new Belege while the large one is open," but not literally "skip tomorrow" if the large case finishes same-day. |
| D23 | "Überfälligkeitsvorlauf streichen" | DONE | Zero code remnants of `overdueLeadDays`/`vorlauf` — only "gestrichen" doc-comments remain intentionally |
| D24 | Prio-Leiter: tägl. Verladung+EB7+Shop120+Shop90 vor NOS; dann NOS+Hängeware; dann Verladeplan | DONE | `PRIORITY_RANK` exact order: exclusion→manual→prio→daily(sections 7/4/8+dailyShopAreas)→NOS+Hängeware→loadPlanDue→FIFO (`priority-engine.ts:57-133`) |

### Belege-Ansicht / Mitarbeiterboard / Digitale Ablage

| # | Feedback | Verdict | Evidence |
|---|---|---|---|
| D25 | Shop/Filiale/Etiketten/Buchungsdatum/gehört-zusammen Spalten + Filter + Sort | DONE (minor gap) | All columns + server-side per-column filters + validated sort (`teamlead-read.service.ts:poolWhere`, `SORTABLE_COLUMNS`). Minor: Etiketten + Lieferung columns are filter-only, not sortable. |
| D26 | Mehrere Shops/Filialen auf einem Beleg | DONE | Primary shop + "+N" chip with tooltip listing all (`BelegListPage.tsx:272-284`) |
| D27 | "Ab wann archiviert? Wie lange behalten?" | PARTIAL | WHEN answered (`completed`/`zst_done` scope + DocuWare hint in UI); **HOW LONG is genuinely undocumented** — tracked as open klärungspunkt OP-25 in `docs/discovery/06-klaerungspunkte-register.md:69`, no retention period exists anywhere in code |
| D28 | DocuWare-Verbindung | DONE | Mock link per Beleg, archiv scope (`BelegListPage.tsx:356-389`) |
| D29 | Ansicht: wem zugeordnet + nächste Bündel vorbereitet | DONE | "Zugeteilt" + "vorbereitet · Pos N" (`BelegListPage.tsx:336-353`) |
| D30 | Topf für Bucherinnen → TL ordnet zu | DONE | `topf` scope = attentionFlag OR blocked/needs_review; Freigeben/Zuweisen actions |
| D31 | WE-Nr Texteingabe + Plausibilitätsprüfung, kein Dropdown | DONE | `AssignDialog.tsx` free-text WE-Nr, live `lookupCase` (exact match by design — see note below) |
| D32 | Grund kein Pflichtfeld | DONE | Optional everywhere, confirm never gated on it |
| D33 | Teile-Menge anzeigen | DONE | `plannedTeile` on board + dialog |
| D34 | Admin-Self-Assign | DONE (caveat) | "Mir zuweisen" pinned in `AssignFromListDialog`; requires the TL principal to map to an active seeded Employee record |
| D35 | Zuweisen auch über Reiter Belege | DONE | "Zuweisen" button on ready+unassigned rows |
| D36 | Ablage horizontal ohne runterscrollen | DONE | Lanes own their vertical scroll (`AblagenBoard.tsx:164-286`) — verified in browser |
| D37 | Felder verschiebbar + letzte Ansicht speichern | DONE (localStorage) | Lane reorder + collapse persisted to `localStorage` (not server) |
| D38 | "Was bedeutet geparkt?" | DONE | Tooltip: actor, timestamp, reason (`AblagenBoard.tsx:351-354`) |
| D39 | "Bei Problem: Details → Problem sofort erkennbar" | DONE | Deep-link `?tab=problem` + persistent banner on every tab |
| D40 | Weiterleitung Retouren/Lieferscheinbucher | DONE | `ForwardMenu.tsx`, both recipients wired |
| D41 | "Wie kommen gebuchte Belege ins System?" | DONE | Mock-ProHandel `POST /api/prohandel/pull` ("Jetzt pullen"), full field chain Zod→Prisma→seed→OpenAPI→api-client verified |
| D42 | "Werden wir Ware ins HH schicken, die noch nicht bearbeitet wurde?" | **OPEN QUESTION** | Business/ops process question, no code answer |
| D43 | Datenqualitäts-Gate: fehlender Lagerplatz/Lieferschein → zurück an Bucher, nie ready | DONE | `blocked` status, never transitions to `ready` while fields missing (`beleg-persist.ts:62-85`) |
| D44 | "Wie häufig werden Daten aktualisiert?" | **OPEN / undocumented** | No scheduled ProHandel pull exists — only manual "Jetzt pullen". Cadence is an ops decision once the real ERP integration replaces the mock. |
| D45 | "Bleiben eingetragene Daten bis Go-Live erhalten?" | **OPEN / undocumented** | Data persists in the dev/pilot database as normal; whether *this* database carries forward to the production go-live environment is an infra/deployment decision, not something the code can assert. |

---

## 3. Fixes Applied This Session

1. **fix(engine+backend): wire `deliveryGroupReleased` through grouping detection** — `plan.ts` and
   all 3 `teamlead-read.service.ts` grouping call sites (+ Prisma selects) were missing the field, so
   the D2 "trotzdem bearbeiten" release never reached `withheldCaseIds`. Added engine regression test.
2. **feat(cockpit): surface delivery-group release in the UI** — `DeliveryGroupPanel.tsx` had no
   caller for the existing `POST /delivery-groups/release` endpoint. Added `released` to the DTO/
   mapper/types chain (regenerated OpenAPI + api-client) and a "Trotzdem bearbeiten" button.
3. **refactor(cockpit): remove dead schwer/leicht board display** — `heavyCaseCount`/`lightCaseCount`/
   `HEAVY_MINUTES_THRESHOLD` were pure frontend remnants matching Dustin's D18 complaint almost word
   for word; deleted from `remoteDataset.ts`, `types.ts`, `MitarbeiterBoard.tsx`.
4. **fix(cockpit): board display cleanup** — rounded effort points display; hid the stray
   "Beleg 1/0" label on bundle-less (idle) rows.
5. **docs: correct stale comments + tighten explainer copy** — "default 120" → "default 50" (2 files,
   D1); Lieferungen-tab explainer now states plainly that carton numbers themselves are unknown to
   the system and the WE-Belegnummer run is only a proxy (D10).
6. **test(int): fix a false-positive board test failure** — `board.int.test.ts` seeded 6
   *consecutive* WE-Belegnummern, which the D2 Pool-Hold logic (correctly) now treats as a suspected
   delivery group and withholds — the test's own seed was defeating its own assertion, not a product
   bug. Reseeded with a 100-gap (`maxWeBelegGap` default is far smaller) so the six cases are
   genuinely independent.

All fixes verified: `pnpm typecheck` 13/13, `pnpm build` 8/8, `pnpm lint` 0 errors, engine vitest
164/164, backend unit 130/130, monorepo `pnpm test` 13/13 suites, OpenAPI regen + api-client
generation produce no diff, `prisma migrate reset && seed` runs clean.

## 4. Regression / Quality Gate Detail

- **test:int** (Testcontainers Postgres): 65/82 passing. The 16 remaining failures
  (`capacity`, `events`, `lifecycle`, `manual-overrides`, `preview`) are a **pre-existing** family —
  every one of those suites seeds employees via `prisma.user.create` **without** a `weeklyPattern`,
  and `materializeShiftsForDate` (correctly) deletes shifts for pattern-less employees on every
  `recalculate` — a known gotcha already recorded in project memory
  (`materialize-shifts-deletes-manual-shifts.md`). This is a test-authoring debt, not a product
  regression; it predates this review and was not introduced by tasks 1-3. Recommend a follow-up
  task to add `weeklyPattern` to those five suites' seed helpers.
- **C4 architecture diagrams**: `domain-model.mmd` already reflects `skillTier`, `workstationId`,
  `blocked` status, `deliveryGroupReleased`, and the D2 hold semantics — no diagram update was
  needed for this session's fixes (only DTO/service-layer wiring changed, not schema or module
  boundaries).
- **Dead-config sweep**: `overdueLeadDays`, `overdueLeadDaysOverrides`, `overdueThresholdHours`,
  `catManWeight`, `maxCasesPerBundle`, `maxHeavyCases` — all clean (zero code references, only
  intentional "ersatzlos gestrichen" doc-comments). One remnant found and removed (`heavyCaseCount`/
  `lightCaseCount`, see fix #3).

## 5. Remaining Gaps (ranked by risk)

1. **D12 Pool-Hold release (HIGH, fixed this session)** — see above; was silently non-functional.
2. **D10 Brax carton-number grouping (MEDIUM, documented not fixed)** — the system has no way to
   read actual carton numbers; it approximates via consecutive WE-Belegnummer. If Brax (or any
   supplier) books non-consecutively, the group will legitimately not be detected and needs a
   manual merge. This is a data-availability limitation (ProHandel mock doesn't carry carton
   sequence), not a logic bug — flagging for the real ERP integration scope.
2. **D27 archive retention period (LOW)** — "how long" is an open ops/legal question (OP-25),
   already tracked in the discovery register.
3. **D22 Folgetag-Sperre semantics (LOW)** — status-based rather than calendar-based; functionally
   adequate for the stated goal but worth confirming with Dustin whether a literal next-calendar-day
   block was intended even if the large Beleg finishes same-day.
4. **D1 shift-end dissolution trigger (LOW)** — runs on next `recalculate`, not a wall-clock cron.
   Fine for a teamlead-driven cockpit; would need a scheduled job if unattended automation is wanted.

## 6. Open Questions for Dustin (code cannot answer)

- **Tisch-Login-Verfahren final**: Tisch-Nr entry + barcode scan are both implemented — which is the
  intended production flow, or both permanently?
- **MSP-Import real**: no importer exists; needs the real MSP data contract/format/cadence.
- **Digi-Tags decision (D7)**: keep or drop, and how does that interact with Trimestergespräch
  productivity reporting?
- **DocuWare real integration**: current link is a mock placeholder — real API/SSO needed?
- **Prüfstufen source**: should inspection-level percentages come from ProHandel or be
  Dashboard-defined? (M23 asked this explicitly; currently Dashboard-catalog-driven.)
- **HH-Versand unbearbeiteter Ware (D42)**: will unprocessed goods still ship to HH in-season, and
  if so what process change does that require?
- **Archiv-Aufbewahrungsfrist (D27)**: how long should completed Belege stay in-system before
  actual deletion (vs. DocuWare long-term archive)?
