# Schichtende-Handling — Auto-Verteilungs-Cutoff & keine offenen Belege über Nacht

Teamlead-Feedback (Dustin Feldmann), Punkte **5** und **6** zum Preview-Build der
automatisierten Belegverteilung.

> **5. Manuelle Beleganforderung am Schichtende** — Mitarbeitende sollen am Schichtende
> keine übrigen Belege oder angefangene Ware auf dem Tisch haben. Die automatische
> Verteilung endet z. B. zwei Stunden vor Schichtende; danach fordern Mitarbeitende
> selbstständig Belege aus dem Pool an.
>
> **6. Keine offenen Belege über Nacht** — Halb bearbeitete Belege am Abend verzerren die
> Leistungsbewertung. Außerdem soll niemand die angefangene Ware eines anderen
> weiterbearbeiten. Es braucht einen Mechanismus, der offen liegen gebliebene Belege am
> Schichtende verhindert.

---

## 1. Bestandsaufnahme (Stand `main`)

Das System verteilt **nicht kontinuierlich im Hintergrund**. Es gibt zwei Mechanismen:

1. **Batch-Auto-Verteilung** — Teamlead löst `recalculate` (§8.3 „Neu berechnen") aus.
   Die reine Engine (`assignWork`) füllt jeden Mitarbeiter bis zur Netto-Kapazität
   (`netCapacityMinutes`) und legt für den Tag genau **ein Bündel pro Person** an.
2. **Pull-on-idle** — der Mitarbeiter holt nach Fertigstellung selbst das nächste
   Bündel (`assignNextBundle`, `POST /api/me/next-bundle`, Button „Nächstes Bündel
   holen"). Stoppt bereits bei Erreichen der Netto-Kapazität (Feierabend), gibt nie ein
   neues Bündel bei offenem Bündel.

Die „automatische Verteilung" aus der E-Mail ist also der **Batch** (1): er füllt heute
schon den ganzen Tag inkl. der letzten zwei Stunden. Der Pull (2) ist bereits das
„Mitarbeitende fordern selbst an" — er braucht aber eine **fertig-schaffbare**
Dimensionierung am Ende.

---

## 2. ZIEL A (Punkt 5) — Auto-Verteilungs-Cutoff

**Entscheidung:** Die Batch-Auto-Verteilung reserviert die letzten `autoCutoffMinutes`
(Default **120**, in §11 Admin/Regelpflege konfigurierbar) jeder Schicht. Sie füllt nur
das Fenster `[Schichtbeginn … (plannedEnd − autoCutoffMinutes)]`. Danach übernimmt der
bestehende Pull.

### Kapazitätsmodell (rein, deterministisch)

Die Engine arbeitet in **Aufwand-Minuten**, nicht in Wanduhr-Scheduling. Wir bilden den
Cutoff über eine **proportionale, wanduhr-bewusste Effektivkapazität** ab
(`autoAssignableCapacityMinutes`, `packages/assignment-engine/src/capacity/shift-end.ts`):

```
fullWindow   = plannedEnd − plannedStart                 (Wanduhr-Minuten)
cutoffPoint  = plannedEnd − autoCutoffMinutes
from         = max(now, plannedStart)
assignable   = clamp(cutoffPoint − from, 0, fullWindow)  (Wanduhr-Minuten)
fraction     = min(1, assignable / fullWindow)
effective    = round(netCapacityMinutes × fraction)
```

Eigenschaften:

- **Vor Schichtbeginn geplant** (`now ≤ plannedStart`): `fraction = (fullWindow −
  autoCutoffMinutes) / fullWindow`. Für eine 8-h-Schicht (480 min) und Cutoff 120 →
  75 % der Netto-Kapazität werden auto-verteilt, die letzten ~2 h bleiben für Pull frei.
- **Im Lauf des Tages**: je näher `now` an `cutoffPoint`, desto kleiner die noch
  auto-verteilbare Kapazität (verbrauchte Zeit zählt mit).
- **Ab dem Cutoff-Punkt** (`now ≥ plannedEnd − autoCutoffMinutes`): `effective = 0` →
  **keine Auto-Zuweisung** mehr für diese Schicht. Mitarbeitende pullen.
- **`autoCutoffMinutes = 0`**: vollständige No-Op — `effective = netCapacityMinutes`,
  keine Wanduhr-Abhängigkeit. Das ist der **Engine-Default** (siehe unten).

### Engine-Default = 0, Anwendung = 120

Der reine Engine-Default `DEFAULT_SHIFT_END_CONFIG.autoCutoffMinutes = 0` hält die
deterministische Engine-Testsuite stabil (kein Wanduhr-Einfluss). Die **Anwendung**
(Backend `recalculate`) liest den konfigurierten Wert (Default 120 aus
`DEFAULT_RULE_CONFIG.shiftEnd`) und reicht das reale `now` in die Engine. Damit ist die
zeitabhängige Wirkung bewusst auf die Anwendungsschicht beschränkt; Service-Methoden
(`recalculate`, `assignNextBundle`) nehmen ein injizierbares `now` für deterministische
Tests.

Da eine reduzierte Effektivkapazität als gewöhnliche `EmployeeShift`-Kopie
(`netCapacityMinutes` ersetzt) in die bestehende Pipeline (Kapazität → Reserve →
Bündelung → Verteilung) fließt, respektieren **alle** Downstream-Schritte den Cutoff
ohne weitere Änderung. Eine Schicht mit `effective = 0` fällt automatisch aus der
Verteilung (`distribute` filtert `netCapacityMinutes > 0`).

---

## 3. ZIEL B (Punkt 6) — keine offenen Belege über Nacht

Physische Arbeit lässt sich nicht „force-completen". Der Mechanismus ist daher
**präventiv + sichtbar**, dreifach:

### 3a. Fertig-schaffbare Pull-Dimensionierung

`assignNextBundle` begrenzt das gepullte Bündel zusätzlich zur Restkapazität auf die
**real verbleibende Wanduhr-Zeit bis Schichtende** (`finishableBudgetMinutes =
min(remainingCapacity, minutesUntilShiftEnd)`). Ein Bündel, dessen geschätzter Aufwand
nicht mehr vor `plannedEnd` zu schaffen ist, wird **nicht** ausgegeben — der Pull liefert
dann `assigned:false, reason:'shift_ending'`. So bekommt niemand am Schichtende noch
unfertigbare Arbeit auf den Tisch.

### 3b. Keine Weiterverteilung angefangener Ware

Ein bereits begonnener Beleg (`in_progress` / `partially_completed`) ist **kein**
`ready`-Pool-Mitglied. `recalculate` plant ausschließlich den `ready`-Pool und lässt die
Bündelbindung begonnener Belege unangetastet (`clearPriorPlanForDate` revertiert nur
`assigned`-Belege). Ein halbfertiger Beleg bleibt damit **bei seinem ursprünglichen
Mitarbeiter** und wird **nie** an einen anderen weitergereicht — exakt die
E-Mail-Forderung „andere sollen die Ware nicht weiterbearbeiten". (Bestehende Invariante,
hier dokumentiert und durch Test abgesichert.)

### 3c. Cockpit-Ausnahme „offen am Schichtende"

Jeder nicht-terminale Beleg, dessen zugewiesener Mitarbeiter seine Schicht bereits beendet
hat (`now > plannedEnd`), wird im Teamlead-Cockpit als **Ausnahme** ausgewiesen
(`DashboardDto.endOfShiftOpenCount`). Der Teamlead sieht so sofort, wo Ware liegen zu
bleiben droht, und kann eingreifen.

---

## 4. Konfiguration (§11 Admin/Regelpflege)

`RuleConfig.shiftEnd.autoCutoffMinutes` (Default 120). Editierbar im Admin-Tab
„Schichtende". `0` deaktiviert den Cutoff (Auto-Verteilung läuft bis Schichtende durch).

---

## 5. Betroffene Dateien

| Ebene | Datei | Änderung |
|------|-------|----------|
| Engine | `capacity/shift-end.ts` (neu) | `minutesUntilShiftEnd`, `autoAssignableCapacityMinutes`, `finishableBudgetMinutes` |
| Engine | `config.ts` | `ShiftEndConfig` + `DEFAULT_SHIFT_END_CONFIG` (0) in `EngineConfig` |
| Engine | `assignment/plan.ts` | Effektivschichten vor Kapazität/Verteilung |
| Types | `domain-types/admin-config.ts` | `shiftEnd` in `RuleConfig` (Default 120) |
| Backend | `assignment/assignment.service.ts` | Cutoff in `recalculate`, fertig-schaffbarer Pull, injizierbares `now`, Rule-Config-Bridge |
| Backend | `cases/teamlead-read.service.ts` | `endOfShiftOpenCount` |
| Frontend | `teamlead-web` Admin + Cockpit, `employee-pwa` BundleHome | Control, Ausnahme-Indikator, Pull-Hinweis |

## 6. Koordination

`plan.ts` / `distribute.ts` / `capacity` überschneiden sich mit der
Lieferschein-Gruppierung (Punkt 1) und der Überfälligkeit (Punkt 4). Die Änderung hier ist
**additiv** (Effektivschicht-Mapping vor der bestehenden Pipeline; neue Config-Sektion);
Merge-Reconciliation entsprechend einplanen.
