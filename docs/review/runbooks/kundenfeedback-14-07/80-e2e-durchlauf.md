# Runbook 80 — Durchgehendes End-to-End (ein Beleg, Seed → sauber fertig)

**Zweck:** Die gesamte Reise **in einem Rutsch** an EINEM Beleg: Seed → Admin → MA-Login →
Zuweisung/Bündel → Positionen prüfen → Problem erfassen → Teilabschluss → Teamlead klärt →
zurück zum **selben MA** → fertig bearbeiten → sauberer Endzustand. Belegt, dass **nichts
verwaist**.

**Voraussetzung:** Stack läuft (Runbook 10). Server-Zeit mitten in der Schicht (z. B. 09:00),
damit Self-Pull nicht am Schichtende scheitert.

> Dieser Durchlauf wurde am 2026-07-15 real gefahren (Beleg **WE 3.540.946**, MA **Anna Berger /
> ma-101**). Zustände zusätzlich per DB/Audit-Log (`workflow_events`) gegengeprüft.

---

## Der Durchlauf

| # | Schritt | Aktion | Erwartet / Belegt | Ergebnis |
|---|---------|--------|-------------------|----------|
| 1 | **Seed** | Cockpit → Admin → Dev/Szenarien → `standard` laden | „189 Belege bereit …", deterministisch | **PASS** |
| 2 | **Zeit** | Dev/Szenarien → Server-Zeit auf 15.07.2026 09:00, **Setzen** | Badge „Server-Zeit eingefroren" | **PASS** |
| 3 | **Admin-Katalog** | Admin → Problemarten prüfen | 9 aktive Gründe vorhanden (Basis für Problem-Erfassung) | **PASS** |
| 4 | **MA-Login** | Mitarbeiter-App `:5175`, `ma-101` | Home, Tisch 1 | **PASS** |
| 5 | **Bündel/Erweitern** | „Weiteres Bündel anfordern" trotz offenem Bündel | Offenes Bündel wird **erweitert** (WE 3.540.946 dazu); Hol-Aufgabe HB-5/234; freie Reihenfolge | **PASS** (`bundle.extended`) |
| 6 | **Ware holen** | Hol-Aufgabe antippen | **✓ geholt**; Beleg startbar | **PASS** |
| 7 | **Positionen** | WE 3.540.946 öffnen | Sticky-Tabelle: CatMan-Chip, HShop/Shop, **Order ORD-…**, VK korrigiert; Ist-Stepper | **PASS** (`case.started`) |
| 8 | **Problem (manuell)** | Pos 1 → **Problem** → Grund aus Katalog → **Problem erfassen** | Rotes Grund-Chip an Pos 1; „…beim Teilabschluss gesammelt gesendet" | **PASS** |
| 9 | **Problem (implizit)** | Pos 2·38 Ist 6→4; Pos 1·38 VK korrigiert 12,90 | **−2 Mindermenge**; **Preisabweichung**; Status „nur Teilabschluss möglich"; **Beleg erledigt gesperrt** | **PASS** |
| 10 | **Teilabschluss** | **Teilabschluss (Problem melden)** → Zusammenfassung (kein Freitext) → **An Teamleitung senden** | 3 Probleme gebündelt; Beleg **rot geparkt**, „Wartet auf Klärung …" | **PASS** (`case.problems_reported` → `issue_open`) |
| 11 | **TL: sehen** | Cockpit → Probleme offen → Ansehen → Problemfälle-Lane → **Details** | Gesammelter Fall: WE-Nr, **Lieferschein LS-25-136**, alle 3 Probleme mit **Order-Nr**/Delta/Preis | **PASS** |
| 12 | **TL: klären** | **Probleme geklärt** (Anmerkung optional) → bestätigen | Kopf **Geklärt** (grün); alle Issues resolved | **PASS** (`case.problems_resolved` → `problem_resolved`) |
| 13 | **MA: grün zurück** | Mitarbeiter-App neu laden | WE 3.540.946 **grün** „Geklärt – zur Weiterbearbeitung freigegeben." | **PASS** |
| 14 | **MA: fortsetzen** | Beleg **über die Liste** öffnen | Bearbeitbar (Resume) | **PASS** (`case.resumed` → `in_progress`) |
| 15 | **MA: fertig** | Alle Positionen geprüft → **Beleg erledigt** | Beleg **abgeschlossen** | **PASS** (`case.completed`) |
| 16 | **Endzustand** | DB/Board prüfen | Beleg `completed`, **0 offene Probleme**; Problemfälle-Lane ohne den Fall | **PASS** |

**Screenshots:** `screenshots/80-01-seed.*` … `80-16-endzustand.*` (Kernbilder wiederverwendet aus 10–60).

---

## Audit-Beleg (DB `workflow_events`, chronologisch, real gefahren)
```
09:00(Server) / real 15:24  bundle.extended        ma-101   +WE 3.540.946
             15:30  case.started           ma-101   946 assigned→in_progress
             15:35  case.problems_reported ma-101   946 in_progress→issue_open (manual, price_deviation, under_delivery)
             15:39  case.problems_resolved tl-001   946 issue_open→problem_resolved
             15:51  case.resumed           ma-101   (Beleg über Liste geöffnet) problem_resolved→in_progress
             15:51  case.completed         ma-101   946 →completed
```
Kein Event bleibt im Zustand `issue_open`/`problem_resolved` hängen → **verwaisungsfrei**.

## Endzustands-/Aufräum-Check
- ✅ Der E2E-Beleg endet `completed`, 0 offene Probleme.
- ✅ Abschließender `standard`-Reload stellt den deterministischen Nullzustand wieder her
  (alle Test-Cases entfernt; nur die 1 seed-eigene Demo-Problematik bleibt als Baseline).
- ✅ Board, Belege-Liste, MA-Dashboard zeigen **keinen** verwaisten Problemfall aus diesem Lauf.

**Verdikt Runbook 80: PASS** — vollständiger Kreislauf ohne verwaisten Zustand.
