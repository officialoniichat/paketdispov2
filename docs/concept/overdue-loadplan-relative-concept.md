# Überfälligkeit relativ zum Verladetag (Teamlead-Punkt 4)

## Problem

Manche Shops haben nur **einen Verladetag pro Woche**. Die bisherige
Überfälligkeitsschwelle war als feste **Stundendifferenz** gedacht
(`priority.overdueThresholdHours = 48`) — bei wöchentlichen Verladetagen
greift sie praktisch nie, und sie wurde von der **puren Engine ohnehin nie
konsumiert** (toter Konfig-Wert).

## Entscheidung

Überfälligkeit/Dringlichkeit wird **relativ zum nächsten Verladetag** des Cases
berechnet, nicht über eine Stundendifferenz:

> Ein Verladeplan-Case (Abschnitt 1/2/3) wird **dringend/überfällig**, wenn
> `heute >= Verladetag − overdueLeadDays` — d.h. heute liegt innerhalb von
> `overdueLeadDays` Tagen **vor** dem Verladetag, **oder** der Verladetag wurde
> bereits verpasst (`Verladetag < heute`).

- `overdueLeadDays` ist **Default-Config** und **shop-/abschnittsspezifisch
  übersteuerbar** (`overdueLeadDaysOverrides`).
- Mit `overdueLeadDays = 0` entspricht das Verhalten exakt der alten
  „Verladeplan-Ware heute"-Regel (Rückwärtskompatibilität ohne Sonderfall).
- Der tote `overdueThresholdHours` wird **hart entfernt** (kein Compat-Shim).

## Verladetag-Quelle

Der einzige **lebende** Verladeplan-Datensatz ist `RuleConfig.loadPlan`
(`LoadPlanRow[]`, persistiert als AppConfig `rule_config`, gepflegt im
Admin-Tab „Verladeplan"). Die Prisma-Tabelle `LoadPlanRule` wird nirgends
gelesen oder geseedet — sie ist tot und wird hier **nicht** als Quelle benutzt.

Pro Case wird der nächste Verladetag (`loadPlanDate`) im Backend aus
`RuleConfig.loadPlan` aufgelöst: Match über `shopAreaNo` + `floor`, früheste
Wochentags-Vorkommen **≥ bookingDate** (innerhalb `validFrom`/`validTo`). Das
Ergebnis kann in der Vergangenheit liegen (verpasst → überfällig) oder in der
Zukunft (näher rückend). Anker ist `bookingDate`, damit ein verpasster
Verladetag überfällig bleibt statt jede Woche zurückzuspringen.

## Schichtung (Engine bleibt pur)

| Schicht | Verantwortung |
| --- | --- |
| **Backend** (`assignment.service`) | Liest `RuleConfig` + Kalender, löst `loadPlanDate` pro Case auf, legt Datum + `overdueLeadDays`(+Overrides) in den Engine-Input. Kein Fachurteil. |
| **Engine** (`priority-engine`) | Reine Vorlauf-Arithmetik: effektive `leadDays` für den Case auflösen (Override-Match), `heute >= Verladetag − leadDays` prüfen, Klasse `load_plan_due` vergeben. Kein Fetch. |

## Priorität / Ranking

Die Klasse `load_plan_today` (Rang 5) wird zu **`load_plan_due`** (Rang 5,
Wert unverändert) — der Name spiegelt die neue Vorlauf-Semantik. Das §8.1-Ladder
bleibt sonst unangetastet (`every_day` schlägt weiterhin `load_plan_due`).
Verpasst vs. näher-rückend wird nur im `reason`-Text unterschieden (Transparenz
im Teamlead-Diff), nicht über getrennte Ränge.
