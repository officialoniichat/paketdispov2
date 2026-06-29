# Erkennung zusammengehöriger Lieferscheine (Delivery-Group)

**Teamlead-Anforderung (Dustin Feldmann, Punkt 1).** Manche Lieferanten liefern eine
physische Sendung mit mehreren Lieferscheinen. Da pro Lieferschein gebucht und jeder
Beleg einzeln abgeklebt wird, sammelt der Teamlead die zusammengehörigen Belege heute
manuell und verteilt sie gebündelt — sonst sucht ein Mitarbeiter vergeblich nach einem
Paket, das bereits ein Kollege bearbeitet.

**Ziel.** Das Dashboard erkennt zusammengehörige Belege automatisch und hält sie
zusammen, damit eine Person die ganze Gruppe bearbeitet.

## Entscheidung

Die Erkennung ist eine **reine, deterministische** Engine-Funktion
(`packages/assignment-engine/src/grouping/delivery-group.ts`). Sie bekommt die
`ready`-Cases hineingereicht (Engine bleibt PURE, kein Fetch) und liefert
**Delivery-Groups** zurück.

### Verknüpfungssignale (OR-kombiniert, Union-Find)

Zwei Belege gehören derselben Lieferung an, wenn **mindestens eines** zutrifft:

1. **Gleicher `deliveryNoteNo`** (Lieferschein-Nummer, sofern gesetzt/nicht leer).
2. **Zusammenhängender `weBelegNo`-Lauf** — die numerisch geparsten Beleg-Nummern
   (Punkte/Trenner entfernt, z.B. `3.551.119` → `3551119`) liegen nach Sortierung
   höchstens `maxWeBelegGap` auseinander. Default `1` = streng fortlaufend
   (`…119, …120, …121, …122`). Eine Lücke größer als die Schwelle trennt den Lauf.

Beide Signale werden über **Union-Find** zu zusammenhängenden Komponenten gemischt;
eine Komponente mit **≥ 2** Mitgliedern ist eine Delivery-Group. Einzelbelege sind
keine Gruppe.

> **Annahme / ProHandel-Mapping.** Das auf der Arbeitsanweisung gedruckte Feld
> „Lieferschein: X" (Gesamtzahl der Belege, „X von N") existiert im aktuellen
> Datenmodell **nicht** als eigenes Feld. Solange ProHandel keine explizite
> Sendungs-/Lieferschein-Gesamtzahl liefert, wird die Gruppe aus den beiden oben
> genannten vorhandenen Signalen (`deliveryNoteNo` + fortlaufende `weBelegNo`)
> abgeleitet. Liefert die ProHandel-API später eine echte Sendungs-ID oder „N von M",
> wird diese als zusätzliches (stärkstes) Verknüpfungssignal in dieselbe Union-Find
> eingespeist — die übrige Pipeline bleibt unverändert.

### Verteilungs-Bias (weiche Nebenbedingung)

Eine erkannte Gruppe soll an **eine** Person gehen. In `distribute.ts` wird beim
LPT-Schritt ein **weicher Bonus** (`GROUP_AFFINITY_BONUS`, analog zu den bestehenden
specialist/heavy/Bereich-Penalties) vergeben: ein Proto-Bundle, dessen Cases zu einer
Gruppe gehören, die ein Mitarbeiter **bereits hält**, wird diesem Mitarbeiter
bevorzugt zugeteilt.

Der Bias ist **weich** und **kapazitätsachtend**: Der Bonus ist klein gegenüber dem
Auslastungs-Ratio. Passt eine Gruppe nicht mehr in eine Schicht (das Zusammenhalten
würde die Auslastung stärker verschieben als der Bonus ausgleicht), darf sie geteilt
werden — Fairness und das `< 5 s`-Determinismus-Budget bleiben unberührt.

**Bereich-Gating.** Der Bonus greift nur bei **Bereich-kompatiblen** Mitarbeitern: Eine
Lieferung wird nie zusammengehalten, indem Arbeit an jemanden geht, der den Bereich
(feste Lagerklasse/Skill) nicht bedient. Bereich-Routing schlägt Gruppen-Zusammenhalt
(`BEREICH_PENALTY` > `GROUP_AFFINITY_BONUS` > `SPECIALIST_PENALTY`).

> **Grenze der Lauf-Heuristik.** Ohne das „X von N"-Feld kann ein perfekt dichter
> `weBelegNo`-Lauf theoretisch mehrere physische Lieferungen verschmelzen. Der Default
> `maxWeBelegGap = 1` (streng fortlaufend) bricht den Lauf an JEDER fehlenden Nummer
> (Storno/Retoure/fremde Buchung dazwischen) und fragmentiert dadurch in der Praxis auf
> einzelne Lieferungen. Zusätzlich ist der Effekt durch die weiche, kapazitäts- und
> Bereich-gebundene Natur des Bias begrenzt. Das echte „X von N" bleibt das sauberste
> Boundary-Signal und wird beim ProHandel-Mapping nachgezogen.

### Sichtbarkeit

- **Teamlead Mitarbeiterboard (umgesetzt):** Badge „Lieferung ×n" pro Beleg + Warnung,
  wenn eine erkannte Lieferung über mehrere Mitarbeiter **gesplittet** ist. Das Backend
  (`BoardDto`) liefert `deliveryGroupId` + `deliveryGroupSize` aus derselben puren
  Engine-Funktion (Engine entscheidet, UI zeigt an — single-source Fachlogik).
- **Ablagen / employee-pwa (Folgeschritt):** Pool-/Today-Ansichten basieren auf
  `CaseSummaryDto` und sind noch nicht annotiert. Da der operative Kern (eine Lieferung
  geht an eine Person) bereits im Verteil-Bias gelöst ist, sind diese Badges reine
  Zusatz-Sichtbarkeit und werden nachgezogen, wenn die Pool-Projektion gruppenfähig
  wird (gleiche pure Engine-Funktion, dann auch über den ganzen Pool).

### Konfiguration

`RuleConfig.grouping { enabled, maxWeBelegGap }` (Admin/Regelpflege, §11), persistiert
im `AppConfig`-Singleton. Das Backend reicht die Grouping-Teilkonfiguration beim
`assignWork`-Aufruf in die Engine (`EngineConfig.grouping`) durch. Default:
`{ enabled: true, maxWeBelegGap: 1 }`.

## Determinismus

- Numerisches Parsen der `weBelegNo` + stabile Sortierung (numerisch, dann `id`).
- Union-Find ohne Zufall; Gruppen-ID = `dg-<kleinste-Beleg-Nummer>` der Komponente.
- Keine Zeit-/Zufallsabhängigkeit → `recalculate`/`Vorschau` bleiben reproduzierbar.
