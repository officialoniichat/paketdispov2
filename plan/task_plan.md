# Task Plan: Foundation task — Dustin feedback backend/engine integration

## Goal
Land ALL backend/engine/domain-model points (A mock-ERP model+seed, B priority ladder rework, C Teile-based packs, D intake gates) end-to-end (Zod → Prisma → seed → OpenAPI → api-client → DTOs), quality gate green, docs/architecture updated, several coherent Conventional Commits on a feature branch off main.

## Phases
- [x] Phase 0: Explore & ground plan in real code
- [x] Phase 1: A — Mock-ERP domain model + seed + connector + endpoints (A1–A10) — commit "feat(mock-erp)"
- [x] Phase 2+3: B priority ladder + C Teile packs — combined commit "feat(engine)!" (both cut through engine core: config/types/plan)
- [x] Phase 4: D — Intake gates (D1–D2) — commit "feat(intake)"
- [~] Phase 5: Quality gate — typecheck 13/13 ✓, lint 8/8 ✓, full unit tests 13/13 ✓, updated int-test files (admin/me-next-bundle/recalculate/preview/effort-wiring) 19/19 ✓ (rest of test:int pre-existing red per memory), OpenAPI+api-client regenerated ✓, handbook stale claims patched ✓; PENDING: docs/architecture agent (diagrams+render), final docs commit

## Key facts from memory
- bundle.* RuleConfig NOT mapped into engineConfig (load-plan.ts:101-122) — must wire new Teile config
- effort factors dead config; assignWork uses precomputed estimatedMinutes — C7 deletes admin surface
- CatMan weighting deactivated — A3 keeps CatMan display-only
- clearPriorPlanForDate already keeps started Belege (C4 regression-test)
- Cross-worktree symlink gotcha: apps/*/node_modules/@paket/* may point elsewhere; DB-less OpenAPI regen recipe exists
- Prisma client stale-on-symlink gotcha after schema change
- test:int 18/41 pre-existing red (materializeShiftsForDate deletes manual shifts)

## Decisions Made (grounded in code)
- A1: ReceiptSkuLine already has ean/size/ek/vk/vkLabel/qty — populate via seed + connector (no schema change).
- A2: new `WgrCatalog` Prisma model + zod + seed (218110 D-Bermuda etc.); descriptions joined into DTOs later.
- A3: position-level `catMan Boolean?` display field; case `catManDate` stays display-only.
- A4: `PositionInstruction.securityTypeCode String?` + backend static route /static/pictograms/<code>.svg with mock SVGs.
- A5: `InspectionLevel` catalog model (none/p10/p20/full, label+percentage+todo description) + `WorkInstructionHeader.inspectionLevelCode` + RuleConfig `inspection.source: prohandel|dashboard`.
- A6: `GoodsReceiptCase.inboundCartonCount Int?`.
- A7: `GoodsReceiptCase.primaryShopNo String?`; full list derivable via boxes/positions.
- A8: `OnlineSizePreference` model (wgr+sizeVariant unique, preferredSize, alternativeSize) + admin CSV upload + GET.
- A9: backend ProHandelMockConnector (deterministic generator, no HTTP) + POST /api/admin/integrations/prohandel/pull; IntegrationenTab wired; seed populates all new fields.
- A10: `User.workstationId` (rel to Workstation) + `skillTier` enum profi|fortgeschritten|basis|starter|dummy; engine: starter/dummy shifts excluded from AUTO distribution + self-pull; admin API settable.
- B: new PRIORITY_RANK exclusion0/manual1/prio2/dailyLoading3(sections 7,4,8 + shopAreas 120,90 config)/nosHaenge4(goodsTypeText NOS|NOS-Nachorder|NOOS OR storageLocation.type haengebahn)/loadPlan5(section 1/2/3 due today>=loadPlanDate)/fifo6. DELETE overdueLeadDays(+Overrides), overdue rank, catman rank, VerladeplanTab Vorlauf UI. B3: specialDay row = one-off date (validFrom); regular candidates falling inside a same-area specialDay window are suppressed.
- C (USER STEER OVERRIDE 2026-07-06): effort model KEPT EXACTLY AS IS — RuleConfig.effort, Aufwand tab, EffortPreview, computeEffort, effortVectors, minutes as internal capacity currency (net capacity, cutoff, finishable budget, fair distribution) ALL unchanged. ONLY bundle sizing unit → Teile: AssignmentConfig/RuleConfig.bundle = { starterPackMinTeile:200, starterPackMaxTeile:250, followUpPackMinTeile:80, followUpPackMaxTeile:90, largeBelegTeileThreshold:2000 } (min/max-Minuten + maxCases + maxHeavyCases knobs replaced; C2 heavy weighting dropped from bundling), WIRED via engineConfigFromRuleConfig. Packs sized by Teile, feasibility-checked against remaining shift minutes via unchanged effortMinutes. Large Belege → unassigned 'large_beleg'. assignNextBundle: follow-up Teile budget + unchanged finishable-minutes gate. C5: default cutoff 120→50 + dissolution semantics via recalc; C6 continuation exclusion in backend.
- D1: new CaseStatus 'blocked' (zurück an Bucher) + `missingFields String[]`; storageLocationId nullable; intake gate in connector+seed; TL endpoints return-to-bucher (event, mock queue) + complete-intake release; events case.intake_blocked/returned_to_bucher/intake_released.
- D2: withhold incomplete confirmed/likely groups (expectedSize>presentSize) unless all members `deliveryGroupReleased`; new case flag + release endpoint ('trotzdem bearbeiten').

## Errors Encountered
-

## Status
**Phase 0** — exploring codebase
