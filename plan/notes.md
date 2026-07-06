# Notes: employee-pwa Dustin integration (task 2/3)

## PWA current-state map (all files read)

- **App.tsx** — routes: `/` BundleHomeScreen, `/collect` CollectScreen, `/case/:caseId` BelegProcessScreen, `/case/:caseId/problem` ProblemMeldenScreen. Bootstrap: backend `loadAssignedWork()` vs demo `seedIfEmpty()` via `isBackendEnabled` (= VITE_API_BASE_URL set).
- **BundleHomeScreen** — 'Guten Morgen' hardcoded (:124); header stats box :127-137 ('X von N fertig · ca. M Min' + 'Heute erledigt'); DemoControls rendered when !isBackendEnabled (:119); COLLECT card navigates to /collect; Beleg rows locked until collectComplete; ICON by GoodsCategory (emoji); row shows `totalQuantity Teile` unconditional (:203); footer `Weiter · WE X` pushes engine-recommended nextOpenBeleg; 'empfohlen' hint.
- **CollectScreen** — StepScaffold list of stops, toggleStop, useScanner optional; footer 'Sammeln fertig → Bearbeiten' navigates home (the rejected round-trip).
- **BelegProcessScreen** — StepScaffold(title 'Beleg bearbeiten', where 'WE x · loc', subtitle 'N Positionen'); kopf 'Abschnitt N · Warenart · N Teile'; Arbeitsanweisung infoPoints (instructionPoints minus ACTION_POINT_KEYS); §G.2 card print-labels → open-carton buttons; LabelPlacementHint; positions with FLAG_CHIPS, skuLines only when >1 (:256), 'Mindestmenge geprüft' button (no un-check), Problem per position; Boxzettel; Teilabschluss dialog (reason only, no explanation).
- **workflowModel.ts** — initialProgress: labelsPrinted/cartonOpened/quantityCheckedPositionIds/zstDone/partial; canOpenCarton §G.2; canCompleteCase gates: labels printed, all qty checked, no open issues; checkQuantity has NO un-check (:91); partialComplete sets step 'done' + partial=true (→ shows as Fertig, D7 bug).
- **belegList.ts** — deriveBelegStatus: step done → 'done' (even partial); nextOpenBeleg = first non-done in bundle order.
- **useCaseFlow** — commit(transition, event, persist?) pattern; printLabels→persistStartPreparation; complete→persistComplete; partialComplete→persistPartialComplete; reportIssue→persistIssue.
- **useBundle** — bundle/stops/collectProgress/belege + toggleStop.
- **db.ts** — Dexie v4 tables: bundle, collectStops, bundleProgress, belege, aggregates, progress, events. Bump to v5.
- **types.ts** — BundleContext(workstation, plannedEffortMinutes, bereich, caseIds), CollectStop(sequence, locationCode, scanRequired, caseIds), BelegListItem(caseId, weBelegNo, order, storageLocationCode, goodsType:GoodsCategory, totalQuantity), CaseAggregate(case, workInstruction, positions, boxTargets, instructionPoints), CaseProgress.
- **sync.ts** — toGoodsReceiptCase synthesizes storageLocation.type 'regal' HARDCODED (:115, B6 bug); goodsCategory() falls back 'regal' since 'DTO does not expose location kind' (:246); workstation DEFAULT_WORKSTATION 'Tisch 1' (:52); toBelegList maps summary. Aggregates fetched per case GET /api/me/cases/:id/aggregate.
- **persist.ts** — POST start-preparation/complete/partial-complete/issues; isBackendEnabled no-op offline.
- **session.ts** — JWT decode employee_no/name, fallback ma-101.
- **api.ts** — apiBaseUrl via resolveEnv('VITE_API_BASE_URL'); isBackendEnabled=Boolean(apiBaseUrl). `.env` has it commented out → demo mode (A1 bug).
- **exampleAssignment.ts / scenarios.ts** — demo builder (PositionSpec, DemoCaseSpec, assembleScenario); scenarios: standard(Regal), haengeware, gross(Regal). A1 wants mixed Regal+Hängebahn+Palette in one Bündel.
- **seed.ts** — seedIfEmpty, resetToScenario, cycleDemoScenario (round-robin on 'Nächstes Bündel holen' offline).
- **events/types.ts** — AppEventType = WorkflowEventType | 'step.skipped'.
- **StepScaffold** — overline where / h1 title / subtitle; footer primary + secondary + Problem.
- **AppHeader** — static title + Teamlead link.
- **e2e/employee-flow.spec.ts** — asserts: 'Guten Morgen', 'Arbeitsplatz: Tisch 4', 'Sammeln starten', 'Plätze abholen', 'Sammeln fertig → Bearbeiten', 'Beleg bearbeiten' heading, 'Abschnitt 1 · Vororder · 9 Teile', Karton geöffnet, Mindestmenge geprüft ×5, '1 von 3 fertig', Demo·Belegset switch, Continuation. LARGE REWRITE needed for merged screen + new wording + removed steps.

## Key implementation implications
- B1 merge: kill /collect route + CollectScreen; inline stops into BundleHomeScreen section '1 · Ware holen'; keep useBundle/collect.ts logic; keep useScanner on home.
- C4: delete labelsPrinted/cartonOpened from CaseProgress + §G.2 (canOpenCarton, markLabelsPrinted, openCarton, printLabels flow action, e2e), reorder instruction points: Prüfung Wareneingang, Rotpreis, Boxzettel (point 3 → position 5?); ACTION_POINT_KEYS changes.
- D5: rename + un-checkable → checkQuantity toggle; keep event on check only? (uncheck event 'sku.quantity_confirmed' payload {checked:false}?)
- D7: partial should NOT count as done/'Fertig' → new BelegStatus 'partial' or keep 'done' w/ partial label; erledigt-count excludes partial.
- A2: Tisch login → new screen/gate storing workstation in localStorage (+ Dexie?) & feeding BundleContext.workstation; scan barcode via useScanner.
- A3: greeting by hour.
- B4 park: needs backend endpoint POST /api/me/park (from task 1) — VERIFY exists (agent).

## Backend surface (from Explore agent)
- /api/me: GET today (date, bundle{bundleId,status,plannedEffortMinutes,caseCount,routeStops}, cases: CaseSummaryDto[]), GET current-bundle, GET cases/:id/aggregate, POST next-bundle, SSE me/stream. Case POSTs: /api/cases/:id/start-preparation|complete|partial-complete, /api/issues.
- CaseSummaryDto HAS: primaryShopNo, inboundCartonCount, goodsType (GoodsTypeText), section, storageLocationCode, totalQuantity, estimatedMinutes. MISSING: location kind, teile.
- Aggregate HAS: SkuLineDto ean/size/expected/confirmed/ekPrice/vkPrice/vkLabelPrice; ReceiptPositionDto catMan, wgr+wgrDescription, nosFlag, shopNo; PositionInstructionDto.securityTypeCode; WorkInstructionHeaderDto inspectionLevelCode/Label/Description + priceLabelPrintRequired.
- Pictograms: GET /static/pictograms/:code.svg @Public; codes hard-tag|ink-tag|spider-wrap|safer-box|cable-lock (SECURITY_PICTOGRAM_CODES).
- OnlineSizePreference: admin-only GET/upload (wgr,sizeVariant,preferredSize,alternativeSize).
- Park: teamlead-only /api/teamlead/cases/:id/park. Workstation: admin-settable only.
- locationKindSchema: regal, palette_a/b/c/e, haengebahn, lagerplatz_d, workstation, printer, conveyor_*.
- goodsTypeTextSchema: Vororder, Nachorder, Sonderposten, NOS, NOOS, Extrabestellung, NOS-Nachorder, Prio.
- InspectionLevel codes none/p10/p20/full with German label+percentage+description (DEFAULT_INSPECTION_LEVELS).
- api-client regenerated & current on this tree.

## MISSING backend pieces I must add (commit 0 "feat(api)")
1. CaseSummaryDto.storageLocationKind (LocationKind) — from location kind; fixes sync.ts hardcode (B6).
2. POST /api/me/park { caseIds } — employee parks remaining unstarted Belege of active bundle back to pool (B4). Reuse teamlead withdraw/park mechanics.
3. POST /api/me/workstation { code } + workstation info on TodayResponseDto (A2 Tisch claim).
4. SkuLineDto.onlineMark 'red'|'green'|null computed server-side from OnlineSizePreference (D4, fachlogik single-source).
5. (C3/B8 need no backend: goodsTypeText already carries Vororder/Nachorder/NOS/Extrabestellung.)
Then: OpenAPI regen (DB-less recipe) + api-client regen.
