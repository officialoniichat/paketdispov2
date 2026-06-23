# Implementierungsplan — Manueller Beleg-Split (Teamlead-UX)

**Scope (vom Nutzer festgelegt):** Nur die **manuelle Teamlead-UX**, voll funktionsfähig und
sauber typisiert. **Engine deferred** (automatische `exceeds_single_shift`-Erkennung, Backend-Persistenz,
Apportionment in der Engine) — kommt später. Keine Schema-Migration. Begleitet
`docs/concept/beleg-split-multi-employee-concept.md`.

## Ziel
Der Teamlead kann einen Beleg manuell auf N Mitarbeitende aufteilen — voll funktionierender Dialog mit
Live-Validierung, Pro-Anteil-Aufwand/Passung, Erfassungsmodus (getrennt/anteilig), Pflicht-Grund — und
sieht die resultierende Leistung je Anteil inkl. CSV-Export. Alles frontend-seitig (Session-State), da die
Engine/Backend-Naht bewusst aufgeschoben ist.

## Architektur — single-source Fachlogik
- **`features/split/splitMath.ts`** (pure, getestet): Apportionment + Validierung + Fit. Die UI rechnet
  nichts selbst — sie ruft diese Funktionen. Spiegelt die Mathematik aus Konzept §2.3.
- UI zeigt nur an + steuert. Kein verstreutes Rechnen in Komponenten.

## Dateien
| # | Datei | Art | Inhalt |
|---|---|---|---|
| 1 | `features/split/splitMath.ts` | neu | `SplitMode`/`CaptureMode`/`ShareDraft`/`ShareComputed`; `suggestedShares`, `apportion`, `validateShares`, `fitForShare`, `suggestedSplitCount` |
| 2 | `features/split/splitMath.test.ts` | neu | TDD: 3000→1500/1000/500 getrennt+anteilig, Teilaufteilung, Über-Verteilung, Fit |
| 3 | `features/split/SplitProvider.tsx` | neu | Session-Context: erstellte Splits je caseId + `recordSplit`, lokale Audit-Events (`aufteilen`) |
| 4 | `features/split/SplitDialog.tsx` | neu | MUI-Dialog wie Mockup: Modus-/Erfassungs-Toggle, MA-Zeilen mit Mengen, Live-Rest, Pro-Anteil-Aufwand/Fit, Pflicht-Grund |
| 5 | `features/split/AufteilungenPage.tsx` | neu | Abschluss/Leistung je Anteil + Beleg-Summe + CSV-Export |
| 6 | `data/audit.ts` | edit | `OverrideAction` + `'aufteilen'`, Label „Aufteilen", Event-Mapping `assignment.overridden` |
| 7 | `data/audit.test.ts` | edit | Coverage für `aufteilen` |
| 8 | `actions/caseActions.ts` | edit | `split`-Action (custom), verfügbar für `ready`/`parked` |
| 9 | `components/CaseActions.tsx` | edit | custom-Action → `onSplit(caseId)` statt ReasonDialog |
| 10 | `features/belege/BelegListPage.tsx` | edit | `onSplit` → SplitDialog öffnen, Beleg-Daten + MA-Liste laden |
| 11 | `App.tsx` | edit | `SplitProvider` + Route `/aufteilungen` |
| 12 | `components/AppShell.tsx` | edit | Nav-Eintrag „Aufteilungen" |

## Daten für den Dialog
- MA-Liste + Pro-Kopf-Schicht-Deckel: `fetchEmployees()` → `EmployeeListItemDto.netCapacityToday` (Fit-Chip),
  `max(netCapacityToday)` = größter Schicht-Deckel (für `suggestedSplitCount`).
- Beleg-Eckdaten (`totalQuantity`, `effortPoints`, `estimatedMinutes`) aus `BelegRow`.

## Apportionment (Plan-Phase, beide Modi gleich)
Pro-Anteil-Aufwand = anteilig an Menge: `shareMinutes = caseMinutes × qty/total` (letzter Anteil absorbiert
Rundung, Σ exakt). getrennt vs. anteilig unterscheidet sich erst bei der *Erfassung* (gemessen vs. dividiert);
im Dialog identische Planschätzung. Fit: `ok` < Deckel, `tight` ≤ 1.15×, `over` darüber.

## Validierung
Σ Anteile ≤ totalQuantity (Teilaufteilung erlaubt, Rest bleibt offen), jeder Anteil > 0, keine
Über-Verteilung. Bestätigen erst bei gültig **und** Grund (`isValidReason`).

## Out of scope (deferred / engine)
Automatische Flag-Erkennung, Backend-Endpoint/Persistenz, ZstRecord-Schreiben, Hardcut-Settings-UI,
Positions-Subset-Picker (Modus „Position" als Toggle vorhanden, Auswahl-UI später), employee-pwa-Wiring.

## Verifikation
`pnpm --filter @paket/teamlead-web typecheck && lint && test`; Playwright-Screenshot des laufenden Dialogs.
