# Mitarbeiter-Einstellungen-UX — Konzept (Arbeitszeit & Einsatzplanung, Teamlead)

**Scope:** Verwaltung der Mitarbeiter-Stammdaten und der Arbeitszeit-/Einsatzplanung in
`apps/teamlead-web` — **wer** arbeitet (Profil), **wann** (Schicht/Verfügbarkeit), **wie lange**
(Soll-/Netto-Kapazität) — und wie diese Daten die Dispo-/Assignment-Engine speisen.
**Fachliche Grundlage:** Konzept v1.5 — §4.3 (Tagesplanung, Kapazität), §8.2 (Aufwand),
§8.3 (Assignment Engine, Lastverteilung), §10 (Teamlead-Dashboard), §11 (Admin/Stammdaten).
**Code-Anker (IST):** `packages/domain-types/src/workforce.ts:5-39`,
`packages/assignment-engine/src/capacity/{net-capacity.ts,shift-import.ts}`,
`packages/assignment-engine/src/assignment/{plan.ts:104,distribute.ts:64-74}`,
`packages/assignment-engine/src/config.ts:87-102` (CapacityConfig),
`apps/backend-api/prisma/schema.prisma:194-210` (User), `:254-273` (Shift),
`apps/teamlead-web/src/features/admin/AdminPage.tsx`.
**Art:** Konzeptdokument, **kein Code**. ASCII-Wireframes sind Skizzen, keine Pixelvorgabe.
**Datum:** 2026-06-15

> Companion zu `docs/concept/dispo-engine-ux-concept.md`. Jenes Dokument beschreibt, *wie der
> Teamlead die Engine bedient*; dieses beschreibt, *woher die Engine ihre Kapazität bekommt*.
> Beide teilen dasselbe Frei/Fix-Modell und dieselbe Audit-Disziplin (§8.4).

> **Umsetzungsstand (2026-06-16) — gegenüber dem Erstentwurf bereinigt (lean):**
> - **Kein Pilot-Login.** Login ist immer vorhanden; das `isPilot`-Feld wurde komplett
>   entfernt. Rollen sind in diesem Stand read-only (Identität bleibt im IdP).
> - **Trennung in zwei Admin-Tabs statt einem überladenen Panel:**
>   *Mitarbeiter* = Stammdaten (Rolle, aktiv, Bereich/Skill, Produktivität,
>   Überstunden-Toleranz). *Schichtplan* = intuitives Wochengitter (Früh/Spät/Frei je
>   Mo–So + Legende) + einfache Abwesenheit. Keine manuelle „Schicht heute überschreiben“.
> - **Kapazität ist musterbasiert:** Speichern des Wochenplans **materialisiert** die
>   konkrete `Shift` (netCapacityMinutes), die die Engine liest. Der Wochenplan ist die
>   einzige Quelle — kein Tages-Override.
> - **Abwesenheit lean:** ganztägig `krank | urlaub | abwesend` über einen Zeitraum →
>   Kapazität 0. Kein `teilabwesend`/`partialUntil`.
> Die folgenden Abschnitte beschreiben das ursprüngliche Modell; wo sie Pilot-Login,
> Tages-Override oder Teilabwesenheit erwähnen, gilt der obige bereinigte Stand.

---

## (a) Problem-/Zielanalyse

### Was heute fehlt

Die Engine balanciert die freie Arbeit strikt nach **einer** Zahl pro Kopf: den
`netCapacityMinutes` der aktiven Schicht (`distribute.ts:64-74` iteriert genau über
`shifts` mit `netCapacityMinutes > 0`; `plan.ts:104` summiert sie zur Team-Kapazität). Diese
Zahl entsteht heute **ausschließlich** aus einem SEAK/PEP-CSV-Import
(`shift-import.ts`) → Prisma-`Shift`. Es gibt in `apps/teamlead-web` **keine** Oberfläche, um
sie zu sehen, zu prüfen oder zu korrigieren.

Daraus folgen drei konkrete Lücken:

- **L1 — Kein Ort für „wer arbeitet".** Das `User`-Modell kennt nur
  `employeeNo, displayName, email, active, roles` (`schema.prisma:194-210`). Es gibt keine UI,
  um einen Mitarbeiter aktiv/inaktiv zu schalten, ihm eine Rolle/einen Bereich zu geben oder
  den Pilot-Login-Bezug zu pflegen. Stammdatenpflege passiert heute nur per Seed/DB.
- **L2 — Kein Ort für „wann & wie lange".** Fällt der CSV-Import aus, ist falsch oder kommt zu
  spät, kann der Teamlead die Kapazität **nicht** reparieren — obwohl genau er weiß, wer heute
  da ist. Die Cockpit-Zeile „8 MA geplant · Netto 2.760 min" (vgl. Dispo-Konzept Screen 1) ist
  damit ein **read-only Echo einer Datei**, kein steuerbarer Plan-Input.
- **L3 — §8.2-Aufwand verteilt sich auf eine unkontrollierte Kapazitätsbasis.** Der Aufwand pro
  Beleg (`computeEffort`, `effort-score.ts:33-71`) ist sauber konfigurierbar (Admin-Tab
  „Aufwand"). Aber Aufwand-Minuten werden gegen Kapazitäts-Minuten verteilt — und die
  Kapazitätsseite hat keinen menschlichen Regler: kein per-Kopf-Produktivitätsfaktor (heute
  global `productivityFactor = 1.0`, `config.ts:87-102`), keine Teilzeit-Pflege, keine
  Überstunden-Toleranz, keine Abwesenheit. Eine gute Aufwandsformel verteilt also auf eine
  blinde Kapazitätsbasis.

### Warum das zur Zuteilung gehört

Die Zuteilung ist nur so gut wie ihre **zwei** Eingaben: Aufwand pro Beleg (vorhanden &
pflegbar) und Kapazität pro Kopf (vorhanden, aber **nicht** pflegbar). Mitarbeiter-Einstellungen
schließt die zweite Hälfte — und macht sie zur **bewussten, auditierten Stellschraube** statt zu
einem stillen Datei-Artefakt.

### Mentales Modell — in einem Satz

> **Mitarbeiter-Einstellungen ist die eine Stelle, an der entsteht, woraus die Engine rechnet:
> wer (Profil) · wann (Schicht/Verfügbarkeit) · wie lange (Netto-Minuten) — und genau diese
> Netto-Minuten pro Schicht sind der einzige Hebel, mit dem §8.2-Aufwand auf Köpfe verteilt
> wird.**

Kurzform für die Wand: **„Aufwand kommt vom Beleg, Kapazität kommt vom Menschen. Hier wird der
Mensch gepflegt."**

---

## (b) Leitprinzipien

1. **Eine Quelle für Kapazität.** Was die Engine als „Netto X min" verteilt, ist hier sichtbar
   und hier editierbar — kein zweiter konkurrierender Wert.
2. **CSV ist Vorbelegung, Mensch hat Hoheit.** Der SEAK/PEP-Import bleibt der schnelle Default;
   der Teamlead kann jeden Wert überschreiben. Überschreibung gewinnt und wird auditiert.
3. **Netto-Minuten sind abgeleitet, nicht getippt.** Der Teamlead pflegt verständliche Größen
   (Schichtfenster, Pause, Produktivität, Teilzeit) — die Netto-Minuten **rechnet das System**
   transparent daraus (`net-capacity.ts`-Formel sichtbar gemacht).
4. **Profil ≠ Tag.** Stammdaten (wer/Rolle/Bereich, Wochenmuster) ändern sich selten;
   Tagesabweichungen (krank, früher weg, Aushilfe) sind schnell und ohne Profil-Eingriff.
5. **Abwesenheit ist eine Eingabe, kein Sonderfluss.** „Anna ist krank" senkt Kapazität auf 0 —
   dieselbe Mechanik wie „weniger Hände", die die Engine ohnehin kennt (vgl. Dispo-Konzept
   Edge-Case „MA fällt aus").
6. **Aufwandsformel bleibt im Aufwand-Tab.** §8.2-Parameter (Mengenfaktor, WGR-Faktoren …) sind
   **global** und gehören nicht hierher. Hier leben nur die **kopfbezogenen** Parameter
   (Produktivität, Bereich/Skill, Überstunden-Toleranz), die die Verteilung *dieses* Aufwands
   beeinflussen.
7. **Pilot-tauglich lean.** Kein HR-System, keine Lohn-/Vertragslogik, keine
   Urlaubsgenehmigungs-Workflows. Nur, was die Tagesdispo braucht.
8. **Auditiert & reversibel.** Jede kapazitätswirksame Änderung trägt Grund + Audit (§8.4),
   sichtbar im Cockpit-Audit wie ein Direkteingriff.

---

## (c) Datenmodell-Skizze (konzeptuell)

Drei Entitäten. Zwei sind Erweiterungen des Bestehenden (`User`, `EmployeeShift`), eine ist neu
(`Absence`). **Keine Migration hier** — nur Felder/Bedeutung.

### Mitarbeiter — `Employee` (erweitert heutiges `User`)

| Feld | Bedeutung | Quelle | IST? |
|------|-----------|--------|------|
| `employeeNo` | natürlicher Schlüssel (PEP/SEAK) | Stammdaten | ✓ |
| `displayName`, `email` | Anzeige / Login | Stammdaten | ✓ |
| `roles` | Employee \| Teamlead \| Admin \| It (`rbac.ts:13-18`) | Admin | ✓ |
| `active` | im Dispo-Pool führbar ja/nein | Teamlead | ✓ |
| `loginRef` / `isPilot` | Bezug zum Pilot-Login (Mitarbeiter-App) | Admin | teils |
| `areaTags[]` | Bereich/Skill (z. B. Hängebahn, Palette, NOS) — speist Spezialisten-Routing | Teamlead | **neu** |
| `productivityFactor` | per-Kopf-Faktor (0,5 … 1,2; default 1,0); skaliert Netto-Minuten | Teamlead | **neu** (heute global) |
| `weeklyPattern` | Default-Wochenmuster (s. u.), erzeugt Schichten | Teamlead/SEAK | **neu** |
| `overtimeTolerancePct` | erlaubte Mehrlast vor Warnung (z. B. +10 %) | Teamlead | **neu** |

### Wochenmuster & Schicht — `WeeklyPattern` + `EmployeeShift`

`WeeklyPattern` ist die **Vorlage** (ändert sich selten); `EmployeeShift` ist der **konkrete
Tag** (existiert heute, `workforce.ts:5-17`). Pattern erzeugt Schichten, Schicht kann abweichen.

```
WeeklyPattern (neu, Vorlage)
  employeeId · Mo..So → { shiftModel, start, end, breakMin, partTimePct }
  shiftModel ∈ { Frühschicht, Spätschicht, Frei, … }   (benannte Schichtmodelle)

EmployeeShift (IST, konkreter Tag — workforce.ts:5-17)
  id · employeeId · date          (date: YYYY-MM-DD, z. B. 2026-06-15)
  plannedStart · plannedEnd · breakMinutes · plannedHours   (Zeiten: HH:MM)
  netCapacityMinutes   ← (end − start − break) × productivityFactor   [net-capacity.ts:27-34]
  workstationId · active
  source ∈ { seak, pattern, teamlead }   (neu: Herkunft/Hoheit für L2/Prinzip 2)
```

### Verfügbarkeit/Abwesenheit — `Absence` (neu)

```
Absence (neu)
  employeeId · dateFrom · dateTo          (YYYY-MM-DD)
  kind ∈ { krank, urlaub, abwesend, teilabwesend }
  effect: setzt netCapacityMinutes der betroffenen Schicht(en) auf 0
          (teilabwesend: kürzt das Schichtfenster)
  reason · createdBy · createdAt   (Audit §8.4)
```

### Kapazitäts-Ableitung (eine sichtbare Formel)

```
netCapacityMinutes = (plannedEnd − plannedStart − breakMinutes) × productivityFactor
Team-Kapazität     = Σ netCapacityMinutes über aktive Schichten ohne Absence   [plan.ts:104]
Frühschicht-Anteil = Team-Kapazität × morningCapacityFraction (0,5)            [config.ts:87-102]
```

Diese Formel wird in der UI **gezeigt**, nicht versteckt — der Teamlead soll verstehen, warum
„Netto 2.760 min" herauskommt.

---

## (d) End-to-End-UX-Flow mit Wireframes

Fünf Bilder: **Liste → Detail → Wochenplaner → Abwesenheit → Kapazitäts-/Effort-Parameter.**
Einstieg: ein neuer Admin-Tab **„Mitarbeiter"** (s. Abschnitt e).

### Der Fluss

```
   ┌──────────────────┐   Zeile      ┌──────────────────┐   Tab        ┌──────────────────┐
   │ MITARBEITERLISTE │ ───wählen──▶ │ MITARBEITER-     │ ──Schicht──▶ │ WOCHENPLANER     │
   │ wer · aktiv · Δ  │              │ DETAIL           │              │ (Schichtmodelle) │
   │ Kapazität heute  │ ◀──zurück─── │ Profil·Schicht·  │ ──Abwesen.─▶ │ ABWESENHEIT      │
   └──────────────────┘              │ Kapazität·Audit  │ ──Param.──▶  │ KAPAZ./EFFORT    │
            ▲                        └──────────────────┘              └──────────────────┘
            │  jede Schreiboperation → Audit (§8.4) + Cockpit-Kapazität aktualisiert
            └───────────────────────────────────────────────────────────────────────────┘
```

---

### Screen 1 — Mitarbeiterliste (Desktop)

Beantwortet: *Wer ist heute eingeplant, mit wie viel Kapazität, und stimmt das mit der Realität?*

```
┌─ Admin · Mitarbeiter ──────────────────────────────────────────────────────────┐
│ Heute Mo 15.06.  Team-Kapazität: 8 aktiv · Netto 2.760 min · Früh 1.380 min     │
│ [ + Mitarbeiter ]   Filter: [ aktiv ▾ ] [ Bereich: alle ▾ ]   Quelle: SEAK 12:40│
├─────────────────────────────────────────────────────────────────────────────────┤
│ Name        Rolle      Bereich      Heute        Netto    Quelle    Status        │
│ ───────────────────────────────────────────────────────────────────────────────│
│ Anna M.     Employee   Hängebahn    06–14 ·30P   420 min  SEAK      ● aktiv   ▸  │
│ Bernd K.    Employee   Palette      06–14 ·30P   450 min  ✎ TL      ● aktiv   ▸  │
│ Claudia R.  Employee   NOS          09–17 ·45P   420 min  Muster    ● aktiv   ▸  │
│ Dilan T.    Employee   —            —            0 min    Absenz    ✚ krank   ▸  │
│ Emre S.     Teamlead   —            06–14        — (TL)   SEAK      ● aktiv   ▸  │
│ …                                                                                │
│ ───────────────────────────────────────────────────────────────────────────────│
│ ⓘ „Netto" ist, was die Engine verteilt. „✎ TL" = vom Teamlead überschrieben.    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

- **„Quelle"-Spalte** macht L2/Prinzip 2 sichtbar: SEAK (Import) · Muster (Wochenvorlage) ·
  ✎ TL (manuell, gewinnt) · Absenz.
- Die Kopfzeile ist **dieselbe Kapazität**, die das Cockpit zeigt — eine Wahrheit (Prinzip 1).
- Inaktive/abwesende MA zählen 0 und sind sofort erkennbar.

### Screen 1 — Mobile

```
┌ Mitarbeiter · heute ─────────┐
│ 8 aktiv · 2.760 min Netto    │
│ [ + ]   [ aktiv ▾ ]          │
├──────────────────────────────┤
│ Anna M.    Hängebahn   ● 420 │
│ 06–14 ·30P · SEAK        ▸  │
│ ──────────────────────────── │
│ Bernd K.   Palette  ✎ ● 450 │
│ Dilan T.   krank        ✚ 0 │
└──────────────────────────────┘
```

---

### Screen 2 — Mitarbeiter-Detail / Einstellungen (Desktop)

Ein Bildschirm, drei Karten: **Profil · Heute · Wochenmuster** — plus Audit. Schreibt sofort,
mit Grund bei kapazitätswirksamen Änderungen.

```
┌─ Anna Müller · #10342 ────────────────────────────────────────────  ● aktiv ──┐
│ PROFIL                                                                          │
│   Rolle    [ Employee ▾ ]    Bereich/Skill  [ Hängebahn ✕ ] [ + Bereich ]     │
│   Login    Pilot-App ✓ verknüpft (#pilot-10342)        Aktiv  [●——]            │
│                                                                                │
│ HEUTE  Mo 15.06.                                                  Quelle: SEAK │
│   Schicht   06:00 – 14:00    Pause 30 min     Teilzeit  100 %                  │
│   Produktivität  [ 1,00 ]  (0,5…1,2)                                           │
│   → Netto = (480 − 30) × 1,00 = 420 min          [ Heute überschreiben ✎ ]     │
│   ⏸ [ Abwesend melden ]                                                        │
│                                                                                │
│ WOCHENMUSTER                                                  [ Bearbeiten ▸ ] │
│   Mo Fr  06–14 (Früh)   Di Mi Do 06–14 (Früh)   Sa So  frei                    │
│                                                                                │
│ AUDIT (§8.4)                                                                    │
│   12:41  Produktivität 0,9 → 1,0  „eingearbeitet" · Emre S.                    │
│   Mo 09:02  Schicht 06–14 importiert · SEAK                                    │
└────────────────────────────────────────────────────────────────────────────────┘
```

- **Netto wird gerechnet und gezeigt** (Prinzip 3) — der Teamlead sieht die Formel, tippt sie
  nicht.
- „Heute überschreiben" trennt **Profil ≠ Tag** (Prinzip 4): die Wochenvorlage bleibt, nur der
  heutige `EmployeeShift` weicht ab (`source = teamlead`).
- Bereich/Skill (`areaTags`) ist das einzige, was ins **Spezialisten-Routing** der Engine
  einspeist (s. e).

---

### Screen 3 — Wochenplaner / Schicht-Editor (Desktop)

Das Wochenmuster als Vorlage. Benannte **Schichtmodelle** (Früh/Spät) statt freier Zeitfelder —
schnell und fehlerarm.

```
┌─ Wochenmuster · Anna Müller ──────────────────────────────────────────────────┐
│ Schichtmodell wählen, auf Tage ziehen/klicken:                                 │
│   [ Frühschicht 06–14 ·30 ]  [ Spätschicht 10–18 ·30 ]  [ Frei ]  [ + Modell ] │
├────────────────────────────────────────────────────────────────────────────────┤
│         Mo        Di        Mi        Do        Fr        Sa        So          │
│      ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌─────┐  ┌─────┐         │
│      │ Früh  │ │ Früh  │ │ Früh  │ │ Früh  │ │ Früh  │ │ frei│  │ frei│         │
│      │06–14  │ │06–14  │ │06–14  │ │06–14  │ │06–14  │ │     │  │     │         │
│      │−30 P  │ │−30 P  │ │−30 P  │ │−30 P  │ │−30 P  │ │     │  │     │         │
│      │420 min│ │420 min│ │420 min│ │420 min│ │420 min│ │  0  │  │  0  │         │
│      └───────┘ └───────┘ └───────┘ └───────┘ └───────┘ └─────┘  └─────┘         │
│  Wochen-Soll: 5 × 420 = 2.100 min (35,0 h)        Teilzeit  [ 100 % ]           │
│                                                                                │
│  ⓘ Muster erzeugt künftige Schichten. Tagesabweichung → Detail „überschreiben".│
│                                          [ Verwerfen ]   [ Muster speichern ▸ ] │
└────────────────────────────────────────────────────────────────────────────────┘
```

- **Schichtmodelle** sind wiederverwendbar (Anhang: Früh/Spät decken den L&T-Tag ab; weitere im
  Admin pflegbar). Das hält den Planer für den Pilot lean.
- Teilzeit % skaliert das Tagesfenster (z. B. 50 % → halbe Netto-Minuten).

### Screen 3 — Mobile (Listen- statt Rasterform)

```
┌ Wochenmuster · Anna ─────────┐
│ Modell: [ Früh 06–14 ▾ ]     │
├──────────────────────────────┤
│ Mo  Früh 06–14 ·30  →420 [✎] │
│ Di  Früh 06–14 ·30  →420 [✎] │
│ …                            │
│ Sa  frei            →  0 [✎] │
│ Woche: 2.100 min (35 h)      │
│         [ Muster speichern ] │
└──────────────────────────────┘
```

---

### Screen 4 — Verfügbarkeit / Abwesenheit

Schnell, weil es im Tagesbetrieb oft gebraucht wird. Aus Liste oder Detail erreichbar.

```
┌─ Abwesenheit melden · Dilan T. ───────────────────────────────┐
│  Art    ( ) Krank   ( ) Urlaub   ( ) Abwesend  ( ) Teilabw.    │
│  Von    [ 15.06.2026 ]     Bis  [ 15.06.2026 ]   ▢ ganztägig   │
│  (Teilabw.: nur bis [ 11:00 ] anwesend → Netto gekürzt)        │
│  Grund  [ ____________________________ ]   (Audit §8.4)        │
│                                                                │
│  Wirkung:  Netto heute 420 → 0 min · Team 2.760 → 2.340 min    │
│            Freie Belege von Dilan gehen zurück in den Pool.    │
│                              [ Abbrechen ]   [ Melden ▸ ]       │
└────────────────────────────────────────────────────────────────┘
```

- Die **Wirkung auf die Team-Kapazität** steht im Dialog (Delta, wie im Dispo-Konzept) — der
  Teamlead sieht sofort, was die Engine danach anders verteilt.
- „Melden" senkt Kapazität → der nächste **Verteilungs-Vorschlag** (Dispo-Konzept) verteilt die
  frei gewordenen Belege neu. Kein eigener Reshuffle, keine zweite Mechanik (Prinzip 5).

---

### Screen 5 — Kapazitäts-/Effort-Parameter (kopfbezogen)

Hier leben **nur** die per-Kopf-Regler, die die Verteilung formen — **nicht** die globale
§8.2-Aufwandsformel (die bleibt im Admin-Tab „Aufwand", Prinzip 6).

```
┌─ Einsatz-Parameter · Anna Müller ─────────────────────────────────────────────┐
│  Produktivitätsfaktor   [ 1,00 ]  0,5 ──────●──── 1,2                           │
│    skaliert Netto-Minuten. Default 1,0. Einarbeitung/Routine → fein justieren.  │
│                                                                                │
│  Überstunden-Toleranz   [ +10 % ]   0 ───●────── +25 %                          │
│    bis hierhin verteilt die Engine ohne Warnung; darüber ⚠ im Vorschlag        │
│    (vgl. Dispo-Konzept „Bernd 92 % ⚠").                                         │
│                                                                                │
│  Bereich/Skill          [ Hängebahn ✕ ]  [ + ]                                  │
│    bevorzugte Zuteilung passender Belege; fremder Bereich → Spezialisten-       │
│    Malus (Anti-Cherry-Picking, distribute.ts SPECIALIST_PENALTY).              │
│                                                                                │
│  ⓘ Aufwand pro Beleg (Mengen-/WGR-Faktoren §8.2) wird global im Tab „Aufwand"   │
│    gepflegt — hier nur, wie dieser Aufwand auf diesen Kopf verteilt wird.       │
│                                              [ Verwerfen ]   [ Speichern ▸ ]    │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## (e) Integration in Cockpit-Navigation (§10/§11) & Engine

### Navigation

Mitarbeiter-Einstellungen ist **Stammdaten/Konfiguration** → es gehört in den Admin-Bereich
(§11), nicht ins operative Cockpit (§10). Ein neuer Tab erweitert das bestehende `AdminPage`
(heute 7 Tabs: Priorität/Reserve/Bündel/Aufwand/Verladeplan/Parser/Lagerplätze):

```
Admin  [ Priorität | Reserve | Bündel | Aufwand | Verladeplan | Parser | Lagerplätze | ▸Mitarbeiter ]
                                                                                        └ neu (Tab 7)
```

Zusätzlich **zwei Sprungpunkte** aus dem operativen Fluss (lesen im Cockpit, pflegen im Admin):

- **Cockpit-Kapazitätszeile** („8 MA geplant · Netto 2.760 min", Dispo-Konzept Screen 1) wird
  klickbar → öffnet die Mitarbeiterliste. Antwort auf „warum nur 2.760?".
- **Mitarbeiterboard** (`/board`, §10.3): jede Kopfzeile bekommt ein dezentes
  „⚙ Einstellungen / ⏸ Abwesend"-Menü → Detail bzw. Abwesenheits-Dialog. Schnellpfad für „X ist
  gerade gegangen".

### Anbindung an die Engine-Kapazität

Die Einstellungen schreiben **genau die Felder, die die Engine schon liest** — kein neuer Pfad:

```
Mitarbeiter-Einstellungen (neu, UI)
        │  schreibt
        ▼
EmployeeShift.netCapacityMinutes · .active   (workforce.ts:5-17 / Prisma Shift)
        │  liest unverändert
        ▼
plan.ts:104  teamCapacityMinutes(shifts)  ┐
distribute.ts:64-74  balanciert §8.2-Aufwand je Kopf nach netCapacity + Überstunden-Toleranz
config.ts:87-102  productivityFactor (jetzt per Kopf) · morningCapacityFraction
        │
        ▼
Verteilungs-Vorschlag (Dispo-Konzept Screen 2) — Last/Reserve-Delta spiegelt die Änderung
```

- **`productivityFactor`** wandert vom globalen Config-Default zu einem **per-Kopf**-Wert
  (Default bleibt 1,0; abwärtskompatibel).
- **`areaTags`** speist den bereits existierenden Spezialisten-Malus (`distribute.ts`).
- **`overtimeTolerancePct`** wird zur per-Kopf-Warnschwelle für das „⚠"-Last-Flag im Vorschlag.
- **CSV-Import bleibt** der schnelle Default-Befüller von `EmployeeShift`; die UI ist die
  **Override- und Pflege-Schicht** darüber (`source`-Feld entscheidet Hoheit).

---

## (f) Zustände & Edge-Cases

| Situation | Verhalten | Begründung |
|---|---|---|
| **Kein CSV-Import heute** | Wochenmuster erzeugt Default-Schichten; Teamlead korrigiert manuell. | L2: nie kapazitätslos. |
| **CSV überschreibt manuelle Pflege?** | Nein — `source = teamlead` ist gegen Re-Import geschützt; Konflikt wird angezeigt, nicht still überschrieben. | Prinzip 2: Mensch hat Hoheit. |
| **Abwesenheit bei laufenden Paketen** | Laufende Arbeit bleibt fix (Frei/Fix); nur **freie** Belege gehen zurück in den Pool. | Konsistent mit Dispo-Konzept Prinzip 3. |
| **Produktivität auf 0,5 mitten am Tag** | Netto sinkt; nächster Vorschlag zeigt Last-Delta; bereits Zugeteiltes bleibt. | Eingabe formt den *nächsten* Vorschlag, kein Auto-Reshuffle. |
| **MA inaktiv geschaltet** | Aus allen künftigen Schichten/Pool entfernt; historische Audits bleiben. | Stammdaten-Hoheit, Nachvollziehbarkeit. |
| **Teilzeit + Pause > Fenster** | Validierung blockt Speichern (Netto < 0 unmöglich). | Eingaben am Systemrand validieren. |
| **Bereich/Skill leer** | Kein Malus, MA bekommt jede Arbeit. | Skill ist optional, nicht Pflicht (Pilot-lean). |
| **Überstunden-Toleranz überschritten** | Engine verteilt bis Schwelle, danach ⚠ im Vorschlag — kein hartes Blocken. | Entscheidung bleibt beim Teamlead. |

---

## (g) Bewusst weggelassen (lean, Pilot-tauglich)

| # | Feature | Entscheidung | Begründung |
|---|---|---|---|
| 1 | **Vollständiges HR-/Zeiterfassungssystem** (Stempeln, Ist-Zeiten, Lohn) | nicht im Scope | SEAK/PEP ist das Quellsystem; wir spiegeln nur die Dispo-relevante Kapazität. |
| 2 | **Urlaubsantrag-/Genehmigungs-Workflow** | nur direkte `Absence`-Erfassung | Genehmigungsketten sind HR, nicht Tagesdispo. Teamlead trägt das Ergebnis ein. |
| 3 | **§8.2-Aufwandsformel hier editierbar** | bleibt im Admin-Tab „Aufwand" | Aufwand ist beleg-, nicht kopfbezogen; Doppelpflege vermeiden (Prinzip 6). |
| 4 | **Frei zeichenbare Schichtzeiten / Schichttausch-Markt** | benannte Schichtmodelle | Modelle decken den L&T-Tag ab; freie Editierbarkeit ist Fehlerquelle ohne Mehrwert im Pilot. |
| 5 | **Mehrwochen-/Rotationsplanung, Forecast, Soll/Ist-Reporting** | nur 1 Wochenmuster + Tagesabweichung | Pilot plant tagesnah; Rotationen sind späterer Ausbau. |
| 6 | **Eigene Auth-/Benutzerverwaltung** | nutzt bestehendes `User`/RBAC (`rbac.ts`) | Rollen existieren; wir ergänzen Dispo-Felder, kein paralleles Identity-System. |
| 7 | **Skill-Matrix mit Leveln/Zertifikaten** | einfache `areaTags` | Engine kennt nur Spezialisten-Malus; Level wären ungenutzte Daten. |

**Bewusst NICHT weggelassen** (das Modell baut darauf): per-Kopf-Produktivität, Teilzeit,
Abwesenheit, Bereich/Skill-Tag, Überstunden-Toleranz, Audit — sie sind die minimal nötige
Menge, damit die Kapazitätsseite der Zuteilung **steuerbar und auditiert** wird.

---

## Zusammenfassung der Wirkung

| Vorher (IST) | Nachher (Konzept) |
|---|---|
| Kapazität = read-only Echo eines CSV; nicht korrigierbar | **Pflegbare, auditierte Stellschraube** mit CSV als Default |
| Kein Ort für wer/wann/wie lange | **Liste → Detail → Wochenplaner → Abwesenheit** im Admin |
| `productivityFactor` global 1,0 | **per-Kopf** Produktivität, Teilzeit, Überstunden-Toleranz |
| §8.2-Aufwand verteilt auf blinde Kapazität | Aufwand (Beleg) trifft **steuerbare** Kapazität (Mensch) |
| „MA krank" → manueller DB-Eingriff | **Abwesenheit melden** → Kapazitäts-Delta → nächster Vorschlag |

Eine Quelle für Kapazität, dieselben Engine-Felder, dasselbe Frei/Fix- und Audit-Modell wie die
Dispo-UX — nur die fehlende Hälfte der Eingabe ergänzt.
