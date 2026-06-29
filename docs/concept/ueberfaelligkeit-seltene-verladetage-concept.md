# Überfälligkeit bei seltenen Verladetagen — Settings-UX-Konzept (Teamlead-Punkt 4, Folgeausbau)

> **Status:** Konzept + Settings-Mockup, kein Code.
> **Baut auf:** [`overdue-loadplan-relative-concept.md`](./overdue-loadplan-relative-concept.md) (Pkt. 4, bereits auf `main`).
> **Mockup:** [`ueberfaelligkeit-seltene-verladetage-mockup.html`](./ueberfaelligkeit-seltene-verladetage-mockup.html)

---

## 1. Ausgangslage — das Problem ist halb gelöst

Dustins Punkt 4 lautete:

> Manche Shops haben nur einmal pro Woche Verladetag. Wenn die Überfälligkeitsschwelle
> auf die **Stundendifferenz** zwischen Verladetagen gesetzt wird, greift sie praktisch
> nie. Hier brauchen wir eine **alternative Logik oder shopspezifische Konfiguration**.

Die **„alternative Logik" ist bereits implementiert** (Pkt. 4, `main`): Überfälligkeit wird
nicht mehr über eine Stundendifferenz, sondern als **Vorlauf relativ zum nächsten
Verladetag** des Cases berechnet:

```
Verladeplan-Case wird dringend/überfällig, wenn:
    heute >= Verladetag − overdueLeadDays      (Vorlauf-Fenster offen)
 oder
    Verladetag < heute                          (Verladetag verpasst)
```

Das **funktioniert auch bei wöchentlichen Verladetagen** — der Vorlauf ist in *Tagen vor
dem Verladetag* definiert, nicht als fixe Stundenschwelle. Die Engine kann pro Case sogar
einen **shop-/abschnittsspezifischen Vorlauf** auflösen (`overdueLeadDaysOverrides`).

**Die zweite Hälfte — „shopspezifische Konfiguration" — fehlt aber im UI.** Die Fachlogik
liegt fertig in Engine + Backend; der Teamlead kann sie nur nicht bedienen. Genau das
schließt dieses Konzept.

---

## 2. Was die Codebasis heute kann (Fachlogik, fertig)

| Baustein | Datei | Verhalten |
| --- | --- | --- |
| Überfälligkeits-Arithmetik | `assignment-engine/src/priority/priority-engine.ts` (`classifyPriority`, `resolveLeadDays`) | Rein. `heute >= Verladetag − leadDays` → Klasse `load_plan_due`. Override-Match (shopAreaNo/section) most-specific-first, Fallback auf globalen `overdueLeadDays`. |
| Verladetag-Auflösung | `backend-api/src/assignment/load-plan.ts` (`resolveLoadPlanDate`) | Pro Case: Match über `(shopAreaNo, floor)`, frühestes Wochentags-Vorkommen ≥ `bookingDate`, innerhalb `validFrom`/`validTo`. **Pro Shop-Bereich/Etage eigene Verladetage** (mehrere möglich). |
| Konfig-Schema | `domain-types/src/admin-config.ts` | `priority.overdueLeadDays` (global) · `priority.overdueLeadDaysOverrides[]` (`{shopAreaNo?, section?, leadDays}`) · `loadPlan[]` (`LoadPlanRow`: `shopAreaNo, floor, weekday, validFrom, validTo?, specialDay`). |

**Kernpunkt:** Pro `(shopAreaNo, floor)` existieren beliebig viele `LoadPlanRow`-Einträge
mit je einem Wochentag. Ein Shop, der nur **einen** Wochentag hat, ist also einfach ein
Shop-Bereich mit **genau einer** Verladeplan-Zeile. Die Logik ist bereits „rare-day-safe".

---

## 3. Die echten Lücken — alle im Settings-UX (Admin / Regeln)

Bearbeitet wird der Verladeplan im **Admin-Bereich → Tab „Verladeplan"** (`AdminPage.tsx`,
persistiert via `PUT /api/admin/rules`), **nicht** im Cockpit-Dashboard.

| # | Lücke | Fundstelle | Wirkung |
| --- | --- | --- | --- |
| **L1** | Verladeplan-Tab ist **read-only** (reine Textliste). | `AdminPage.tsx:392-405` | Teamlead kann für einen Wochen-Shop **keinen** Verladetag, kein Gültigkeitsfenster und keinen Sondertag anlegen/ändern. Genau der Fall aus Pkt. 4 ist im UI nicht konfigurierbar. |
| **L2** | `overdueLeadDaysOverrides[]` hat **gar keine** Bearbeitungs-UI. | nur Schema, kein Editor | Der shop-/abschnittsspezifische Vorlauf (das Kernmittel gegen seltene Verladetage) ist unsichtbar und unerreichbar. |
| **L3** | **Irreführender Hinweis** im Priorität-Tab: „Shop-spezifische Ausnahmen siehe Verladeplan-Tab" — der Tab bietet aber nichts dergleichen. | `AdminPage.tsx:150-172` | Teamlead sucht eine Funktion, die nicht existiert. UX-Lüge. |
| **L4** | Dashboard-Kachel „Überfällig" zählt **nur** das persistierte Flag `'overdue'`, **nicht** die live berechnete Klasse `load_plan_due`. | `remoteDataset.ts:139`, `teamlead-read.service.ts:27` | Verladeplan-getriebene Überfälligkeit ist für den Teamlead **unsichtbar**. Die korrekte Logik wirkt nur intern auf das Ranking. |

---

## 4. Entscheidung

**Keine neue Engine-Logik.** Die Fachlogik bleibt unangetastet und single-source (Engine
entscheidet, UI zeigt nur). Wir schließen ausschließlich die Konfigurations- und
Transparenz-Lücken im Admin-Settings-UX.

### 4.1 Verladeplan-Tab editierbar machen (schließt L1)

Aus der read-only-Liste wird ein **Editor pro Shop-Bereich**, gruppiert nach
`(shopAreaNo, floor)`:

- Wochentage als **Toggle-Chips** (Mo–So). Ein Wochen-Shop hat genau einen aktiven Chip.
- Pro Shop-Bereich: **Gültig ab / bis** (`validFrom`/`validTo`), **Sondertag**-Markierung.
- Zeilen hinzufügen / entfernen (clean: löschen statt deaktivieren).
- Jeder aktive Chip = ein `LoadPlanRow`. Mehrere Chips = mehrere Zeilen (bestehende
  Many-rows-pro-Shop-Semantik bleibt erhalten).

### 4.2 Vorlauf pro Shop-Bereich editierbar machen (schließt L2)

Direkt **am selben Shop-Bereich** ein Feld **„Überfälligkeits-Vorlauf"**:

- Leer → globaler `overdueLeadDays` gilt (als Platzhalter sichtbar, z. B. „Standard: 2 Tage").
- Gefüllt → schreibt einen `overdueLeadDaysOverride` für diesen `shopAreaNo`.
- Den Vorlauf **am Shop-Bereich** zu verorten (statt in einer separaten Override-Tabelle)
  macht die shopspezifische Konfiguration dort sichtbar, wo der Teamlead den Verladetag
  ohnehin pflegt. Ein „Erweitert"-Bereich erlaubt zusätzlich abschnittsfeine Overrides
  (`section`), für die seltenen Fälle, in denen ein Shop-Bereich abschnittsweise differiert.

### 4.3 Smarter Vorlauf-Vorschlag aus der Kadenz (Zero-Config-Hilfe)

Aus den aktiven Wochentagen eines Shop-Bereichs lässt sich das **Intervall** ableiten
(z. B. genau ein Tag/Woche → 7 Tage Kadenz). Das UI **schlägt** daraus einen sinnvollen
Vorlauf vor — als **Hinweis**, niemals automatisch gesetzt:

> „Nur 1 Verladetag/Woche erkannt → empfohlener Vorlauf **3 Tage** (halbe Kadenz).
> [Übernehmen]"

Heuristik (rein im UI, kein Engine-Eingriff): `empfohlen = clamp(round(kadenzTage / 2), 1, kadenzTage − 1)`.
- 1×/Woche (7 Tage Kadenz) → 3 Tage.
- 2×/Woche (≈3–4 Tage) → 2 Tage.
- täglich → 1 Tag (oder 0 = „nur am Verladetag").

So bleibt volle manuelle Kontrolle, der Standardfall ist aber ein Klick.

### 4.4 Transparenz-Vorschau pro Shop-Bereich (schließt das „greift nie"-Gefühl)

Neben jedem Shop-Bereich eine **Live-Vorschau** des konkreten Effekts (vom Backend-Resolver
abgeleitet, read-only):

```
Shop 21 · EG · Verladetag Mo · Vorlauf 3 Tage
   Nächster Verladetag:   Mo 06.07.
   Wird dringend ab:      Fr 03.07.   (heute + … )
   Status heute (29.06.): noch nicht im Vorlauf-Fenster
```

Macht für den Teamlead **sichtbar**, wann genau die Schwelle bei *diesem* Shop greift — der
direkte Konter gegen „bei wöchentlichen Verladetagen greift sie praktisch nie".

### 4.5 Hinweis korrigieren (schließt L3)

Der Priorität-Tab-Hinweis verweist künftig korrekt: „Shop-spezifische Vorläufe pflegst du
im Tab **Verladeplan** direkt am Shop-Bereich." Der globale `overdueLeadDays` bleibt der
Default/Fallback.

### 4.6 „Überfällig"-Kachel ehrlich machen (schließt L4) — optional, empfohlen

Die Dashboard-Kennzahl „Überfällig" sollte auch live `load_plan_due`-Cases einschließen
(bzw. getrennt ausweisen: „Überfällig · davon Verladeplan n"). Read-Model-Anpassung, keine
Engine-Änderung. Im Mockup als Kennzeichnung skizziert; Umsetzung gehört strenggenommen ins
Cockpit-Read-Model und ist hier nur als Anschluss vermerkt.

---

## 5. Schichtung / Clean-Code

| Schicht | Änderung |
| --- | --- |
| **Engine** (`priority-engine`) | **keine.** Vorlauf-Arithmetik + Override-Auflösung existieren. |
| **Backend** (`load-plan.ts`, `assignment.service`) | **keine** für die Konfig. (Optional 4.6: Read-Model der „Überfällig"-Kachel.) |
| **domain-types** | **keine** Schemaänderung nötig — `loadPlan[]` + `overdueLeadDaysOverrides[]` reichen. (Konsistenz-Hinweis siehe §6.) |
| **teamlead-web `AdminPage`** | read-only-Block (L1) → editierbarer Shop-Bereich-Editor; Vorlauf-Feld + Kadenz-Vorschlag + Vorschau; korrigierter Hinweis. Alles über bestehendes `patch()` → `PUT /api/admin/rules`. |

Konsistent mit „clean code, no legacy": der read-only-Block wird **ersetzt**, nicht
ergänzt. Kein Compat-Shim.

---

## 6. Datenmodell-Konsistenz (eine Entscheidung mitnehmen)

`LoadPlanRow` schlüsselt über **`shopAreaNo + floor`**, `overdueLeadDaysOverride` über
**`shopAreaNo + section`**. Das ist kein Bug (Verladetag = physische Etage; Vorlauf =
fachlicher Abschnitt), aber im UI muss klar sein: der **Shop-Bereich-Vorlauf** (4.2) matcht
über `shopAreaNo` (floor-übergreifend); abschnittsfeine Vorläufe sind der „Erweitert"-Fall.
Empfehlung: UI-seitig den `shopAreaNo`-Vorlauf als Normalfall führen, `section` nur im
Erweitert-Bereich — keine Schemaänderung, nur saubere Bedienführung.

---

## 7. Edge Cases

- **Kein passender `LoadPlanRow`** → kein `loadPlanDate` → Case wird **nicht** über
  Verladeplan überfällig (fällt auf andere Prioritätsregeln zurück). Vorschau zeigt
  „kein Verladetag hinterlegt".
- **Verladetag verpasst** (`Verladetag < heute`) → bleibt überfällig (Anker `bookingDate`),
  springt nicht jede Woche zurück. Vorschau zeigt „verpasst seit …".
- **Mehrere Verladetage/Woche** → kürzere Kadenz → kleinerer Vorschlag; frühester Tag ≥
  bookingDate gewinnt (bestehende Resolver-Semantik).
- **Sondertag / Gültigkeitsfenster** → wie bisher in `isRowActiveOn`; im Editor pflegbar.
- **`overdueLeadDays = 0`** → exakt die alte „heute = Verladetag"-Regel.

---

## 8. Nicht in Scope

- Keine Änderung der Engine-Rangordnung (§8.1-Ladder bleibt).
- Keine neue Persistenz/Prisma-Tabelle (tote `LoadPlanRule` bleibt tot).
- Kalender-/Feiertags-Automatik für Sondertage (separater Bedarf).
- Cockpit-Kachel-Umbau (4.6) nur als Anschlusspunkt skizziert.
