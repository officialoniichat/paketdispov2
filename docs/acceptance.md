# Abnahme- & Test-Matrix (Qualität vor Pilot)

Dieses Dokument macht die Pilotreife **messbar**: jedes Abnahmekriterium aus
Konzept **§17** (sowie **Anhang G.5** zur Arbeitsanweisung-Integration) ist auf
einen konkreten, automatisierten Test abgebildet. „Grün" heißt: der Test läuft im
CI/lokal durch.

> **Scope-Hinweis (bewusst schlank — Tool, kein ERP).**
> Auf ausdrücklichen Wunsch sind drei Konzept-Bausteine **nicht** als eigene
> Features ausgebaut: **Offline-/Sync-Betrieb** (Happy-Path zählt, nicht
> Offline), **Security/RBAC-Härtung** (für den Piloten zweitrangig), und ein
> **Notmodus/Papier-Fallback-Subsystem** (Kontinuität = Backups + Restart-
> Policies, siehe `docs/operations.md`). Vorhandene Basis-Tests dazu bleiben
> erhalten, werden aber nicht erweitert.

## Suite ausführen

```bash
pnpm -w run typecheck          # alle Pakete
pnpm -w run test               # alle Unit-/Komponententests (Docker-frei)
pnpm -w run lint               # 0 errors

# Integrationstests gegen echtes Postgres (Docker erforderlich, Testcontainers)
pnpm --filter @paket/backend-api test:int

# Parser (Python)
cd apps/parser-worker && uv run pytest -q

# E2E (Playwright, chromium)
pnpm --filter @paket/employee-pwa e2e
pnpm --filter @paket/teamlead-web e2e
```

Aktueller Stand: **Unit ~248 (JS) + 63 (Parser)**, **Integration 3/3** (echtes
Postgres), **E2E 9/9** (4 Mitarbeiter-App, 5 Teamlead). Typecheck 13/13, Lint 0
errors.

## §17.1 Fachliche Abnahme

| Kriterium | Abnahmebedingung | Nachweis (Test) | Status |
|---|---|---|---|
| Dokumentenimport | Testbelege korrekt zu DocumentSets gruppiert | `apps/parser-worker/tests/test_golden_gate.py`, `test_load_batch.py` (`parse_document_set` gruppiert AW+WE+LS) | ✅ |
| Parser Arbeitsanweisung | Lagerplatz, Shopbereich, Belegnummer, Belegmenge, Etikett, Sortierung, Prüfung, Boxzettel, Sicherung, ZST erkannt | `apps/parser-worker/tests/test_golden_master.py`, `test_golden_gate.py` (Feld-Assertions je Variante) | ✅ |
| Parser WE-Beleg | Positionen, SKU, EAN, Größe, Menge, WGR, Preise, Shop/HShop erkannt | `apps/parser-worker/tests/test_golden_gate.py`, `test_normalize.py` | ✅ |
| Prio/Abschnitt | Prio = Flag (kein Abschnitt); Abschnitte 7/4/8 priorisiert | `packages/assignment-engine/src/priority/priority.coverage.test.ts` (Prio-kein-Abschnitt, 7/4/8-Reihenfolge) + Parser-Variante `prio_beleg` | ✅ |
| Verladeplan | Abschnitte 1/2/3 am Verladetag priorisiert; Regeln änderbar | `packages/assignment-engine/src/priority/*.test.ts` (`loadPlanToday`-Rang); Regeln über Engine-Config / Teamlead-Admin | ✅ |
| Zuteilung | Schaffbares Paket aus mehreren Belegen auf IST-Stunden-Basis | `packages/assignment-engine/src/assignment/{assignment,plan}.test.ts` + `apps/backend-api/src/integration/lifecycle.int.test.ts` (Zuteilung) | ✅ |
| Route | Route innerhalb des Pakets vorgegeben, kein Auswahlgrund | `packages/assignment-engine/src/pickup/pickup.test.ts` | ✅ |
| Problemfall | Melden → Teamlead-Freigabe → Restware weiter | `apps/backend-api/src/integration/lifecycle.int.test.ts` (issue-flow) + `src/modules/issue/issue-logic.test.ts` (Scope-Blocking) | ✅ |
| Teilabschluss | Box/Teilmenge abschließen, Rest Folgetag | `src/modules/completion/completion-logic.test.ts` + `partialComplete` (ZST anteilig) in der Integration | ✅ |
| ZST | Digitaler Abschluss erzeugt korrekten ZST-Datensatz + KPI-Grundlage | `apps/backend-api/src/integration/lifecycle.int.test.ts` (ZST) + `src/modules/reporting/reporting.test.ts` | ✅ |

## §17.2 Technische Tests

| Test | Nachweis | Status |
|---|---|---|
| Unit-Tests Prioritäts-/Aufwandsscore | `packages/assignment-engine/src/priority/*` + `effort/*` (107 Tests) | ✅ |
| Golden-Master-Tests Parser | `apps/parser-worker/tests/test_golden_gate.py` (14-Varianten-Gate, Regression blockiert Deployment §16.3) | ✅ |
| Integrationstests Assignment/Issue/ZST | `apps/backend-api/src/integration/lifecycle.int.test.ts` (Testcontainers Postgres) | ✅ |
| Drucktests Preisetiketten/Boxzettel | `apps/backend-api/src/modules/print/print-jobs.test.ts` (price_label + box_slip, Erfolg/Fehler, Nachdruck) | ✅ |
| Lasttest Batchimport 20-30 + Tagesnachschub | `packages/assignment-engine/src/assignment/load.test.ts` (40 Fälle < 5 s) + `apps/parser-worker/tests/test_load_batch.py` (30 Belege) | ✅ |
| Offline-/Sync-Tests | `apps/employee-pwa/src/offline/syncEngine.test.ts` (Basis, nicht erweitert — bewusst zweitrangig) | ➖ |
| Security-Test Rollenrechte/fremde Pakete | `apps/backend-api/src/auth/rbac.test.ts`, `src/cases/case-access.policy.test.ts` (Basis, nicht erweitert — bewusst zweitrangig) | ➖ |

➖ = vorhanden/grün, aber per Steuerung des Auftraggebers nicht weiter ausgebaut.

## Anhang G.5 — Arbeitsanweisung-Integration

| Kriterium | Nachweis | Status |
|---|---|---|
| App-Schritte statt PDF | `apps/employee-pwa/e2e/employee-flow.spec.ts` (Schrittfolge Tagesstart→ZST) | ✅ |
| Punkte 1,4,5,6,8,9,10,11 als Felder | `apps/parser-worker/tests/test_golden_gate.py` (Feld-Assertions) | ✅ |
| Prüfung Wareneingang = Nein → trotzdem Stückzahlkontrolle | `apps/employee-pwa/e2e/employee-flow.spec.ts` (`G.5 Prüfung=Nein → Stückzahlkontrolle`) + Parser-Variante | ✅ |
| Sicherung = Nicht sichern → keine Sicherungsaufgabe | Parser-Varianten `sicherung_ja` / „Nicht sichern" in `test_golden_gate.py` | ✅ |
| Positionsnummern verknüpft, mehrere SKU/Größen sichtbar | Parser-Variante `haengeware` (Multi-SKU-Grouping) in `test_golden_gate.py` | ✅ |
| NOS ≠ Abschnitt; Priorisierung nutzt Abschnittsfeld | `assignment-engine` Priority-Tests + Parser (`rotpreis`/`prio` Section-Text bleibt verbatim) | ✅ |
| Boxzettel und ZST = echte Abschluss-Schritte | `apps/employee-pwa/e2e/employee-flow.spec.ts` (Boxabschluss + ZST) + `print-jobs.test.ts` (box_slip) | ✅ |

## Shadow-Mode-Fähigkeit (§18 Phase 2, Anhang F.4, Pilotmessung)

Der Shadow-Mode-Betrieb (Papierprozess läuft weiter, System liest mit, vergleicht
Parser, misst Zeiten) ist tragfähig:

- **Parser-Vergleich:** Golden-Master-Gate prüft echte Varianten; niedrige
  Konfidenz wird zu `needs_review` geroutet statt still falsch übernommen.
- **Durchlauf-/Bearbeitungszeit:** KPI-Berechnung (`reporting/kpis.ts`,
  `avgThroughputMinutes`) + Lasttests liefern die Messgrundlage; jeder ZST-Satz
  trägt `effortPoints`/`completedQuantity`.
- **ZST parallel:** Digitale ZST-Sätze entstehen beim Abschluss zusätzlich zum
  Altprozess; CSV/BI-Export über `reporting/csv-export.ts`.
- **Audit:** Manipulationssichere Hash-Chain (`events/event-hash.ts`,
  `verifyIntegrity`) trennt fachliche Events von technischen Logs (§16.2).
- **Betrieb:** On-Prem Docker-Compose + Reverse Proxy, Backup/Restore mit
  Restore-Test vor Go-Live (`docs/operations.md`).

## Definition of Done

- [x] Alle §17.1-Kriterien auf grüne Tests abgebildet.
- [x] §17.2 technische Tests grün (Offline/Security bewusst auf Basis belassen).
- [x] G.5-Kriterien auf grüne Tests abgebildet.
- [x] Shadow-Mode-fähig (Parser-Vergleich, Zeitmessung, ZST parallel, Audit, Betrieb).
- [x] Gesamte Codebase EPIC 1-8 auf `master` integriert und grün.
