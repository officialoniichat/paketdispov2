# Bearbeitungs-Abschluss-Domänen (EPIC 5)

Completion-side domain logic for the digital goods-receipt workflow. Each module is a
pure, side-effect-free decision core: it takes plain inputs (+ an injected `id` / `now`
/ `Actor`) and returns the next state plus **event drafts** (`events.ts`). Persistence,
the tamper-protected event log (§7.2), RBAC and HTTP wiring are supplied by EPIC 3 when
that backbone lands; keeping the cores pure makes them deterministic and fully unit-tested
here (61 tests).

| Module | Concept | Responsibility |
| --- | --- | --- |
| `issue/derive-problems.ts` | Kundenfeedback 14.07.2026, Punkt 7 | Implizite Probleme: Mehr-/Minderlieferung (Ist≠Soll) und Preisabweichung (korrigierter VK) werden aus den gemeldeten SKU-Ständen abgeleitet; sie erzwingen den Teilabschluss (`fullCompleteAllowed`). |
| `transport/box-splitting.ts` | Anhang D, §3.2 | Derive `TransportBoxTarget`s automatically from positions; split per Shopbereich / Shop / Etage; deterministic, idempotent box numbering; `splitBoxCount` feeds the effort penalty (§8.2). |
| `print/print-jobs.ts` | §13.4 Drucker/Etiketten | Build price-label + box-slip print jobs (PDF by default), enforce the reprint permission ("Nachdruck mit Berechtigung"), log every job as a workflow event (wer/wann/was/Drucker/Erfolg-Fehler). |
| `completion/completion-logic.ts` | §15.1 | Rechenkerne des Abschlusses: `processingMinutes` + `proratedEffort` (Delta-ZST-Buchung). Der Ablauf (Beleg erledigt vs. Teilabschluss mit Problemen → issue_open) lebt im CasesService + der §7.1-State-Machine. |
| `reporting/kpis.ts` + `csv-export.ts` | §15 Reporting/KPIs | Compute Teile/h **and** Aufwandspunkte/h, Durchlaufzeit, Pool-Alter, Problemquote, Override-Quote; RFC-4180 CSV/BI export of ZST rows and KPI snapshots. |

Shared types live in `@paket/domain-types` (`print.ts`, `reporting.ts` + the existing
`issues.ts` / `transport.ts` / `zst.ts`).

## MVP vs. Phase 2 (Anhang H)

- **ZST**: produced as a record + CSV/PDF export. A deep ZST-system integration is Phase 2.
- **Druck**: rendered payload + enqueued print job (Windows Print Server / CUPS, PDF first;
  ZPL/EPL only where the printer supports it). Raw driver spooling is Phase 2.
- Both stay behind role-restricted, audit-logged access (§16.1 / §16.2).
