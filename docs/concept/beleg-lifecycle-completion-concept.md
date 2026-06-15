# Konzept — Beleg-Lebenszyklus zu Ende gedacht: Abschluss, Archiv, Storno & die Belege-Ansicht

**Zweck:** Den **Endteil** des Beleg-Lebenszyklus durchgängig konzipieren — was nach dem ZST-Abschluss passiert, wo abgeschlossene/stornierte Belege leben, und wie die **Belege-Ansicht** (§10.4) vom „flachen Pool-Dump" zu einer lebenszyklus-bewussten Arbeitsfläche wird. Ergänzt `beleg-actions-critical-review.md` (Aktionen) um die **Sichten und Endzustände**.
**Status:** Konzept / Design — **kein Produktivcode**. Entscheidungsvorlage.
**Datum:** 2026-06-16
**Bezug:** §4.6 (Teilabschluss), §7.1 (Zustandsmaschine), §10.1/§10.4 (Cockpit/Belege), §15.1 (ZST/Export), Anhang A (Statuszählung).

---

## (0) Kernbefund — der Lebenszyklus hat keinen durchdachten Schluss

Anfang und Mitte sind designt (Import → Pool → Zuteilung → Arbeit → ZST). **Das Ende ist nur „hingeschoben":**

| Endzustand | Definiert? | Erreichbar? | Hat ein Zuhause in der UI? |
|------------|-----------|-------------|----------------------------|
| `completed` | ✓ (§7.1) | ✓ via `complete()` | **Nein** — fällt aus dem Cockpit, liegt unsortiert in der Belege-Liste |
| `zst_done` (Terminal) | ✓ + eigene Chip-Farbe „ZST erledigt" (`packages/ui/.../tokens.ts:91`) | **Nein** — kein Producer; nichts transitioniert je nach `zst_done` | — (toter Zustand) |
| `partially_completed` | ✓ (§4.6) | ✓, aber bucht Menge 0 (siehe Review F2) | **Nein** — Restmenge/Carry-over ohne Sicht |
| `cancelled` (Terminal) | ✓ (§7.1) | **Nein** — keine Aktion, kein `case.cancelled`-Event | — (toter Zustand) |

**Drei Lücken, die das Konzept schließen muss:**
1. **Es gibt keinen Ort für „fertig".** Cockpit-Pool/Lanes schließen `completed/zst_done/cancelled` aktiv aus (`teamlead-read.service.ts:126,130`). Die Belege-Liste liefert zwar *alle* Status (`listPool` ohne Default-Filter, `…:74-93`), aber unsegmentiert, nach `bookingDate asc` sortiert und ohne Status-Filter-UI (`BelegListPage.tsx` hat nur Freitext). Ab Tag 2 dominieren historische Belege die erste Seite; die Kopfzahl „Belege (N)" ist bedeutungslos.
2. **Es gibt keinen Übergang von „fertig" zu „abgegeben".** `completed → zst_done` (Export an Alt-/BI-System, §15.1) existiert als Kante, aber niemand geht sie. Belege sammeln sich unbegrenzt in `completed`.
3. **Es gibt keinen Weg, einen Beleg loszuwerden.** Fehlimport, Dublette, ProHandel-Korrektur — `cancelled` ist terminal definiert, aber es gibt weder Aktion noch Event-Typ.

---

## (1) Leitidee — fünf Lebenszyklus-Phasen als primäres mentales Modell

20 Einzelstatus sind für die operative Übersicht zu fein. Das Konzept führt eine **Phasen-Gruppierung** als Primärsicht ein; der Detailstatus bleibt sekundär (Tooltip/Chip). Dieselben fünf Phasen strukturieren Belege-Tab, Cockpit-Zählung (Anhang A) und KPI.

| Phase | Status (§7.1) | Bedeutung | Wo sichtbar |
|-------|---------------|-----------|-------------|
| **1 · Eingang** | `imported`, `parsed`, `needs_review` | Ingestion/Parser, ggf. Klärung | Belege (Scope „Eingang"); Cockpit nur als Zähler |
| **2 · Pool** | `ready`, `parked` | Plan-/parkbar | Cockpit-Lanes + Belege |
| **3 · In Arbeit** | `assigned`, `picking`…`boxing`, `issue_open`, `waiting_teamlead`, `released` | Mitarbeiter arbeitet / Problem | Cockpit-Board + Belege |
| **4 · Abgeschlossen** | `completed`, `partially_completed` | ZST gesetzt, Tagwerk fertig (Rest folgt) | **Tagesjournal** + Belege (Scope „Abgeschlossen") |
| **5 · Erledigt / Storniert** | `zst_done`, `cancelled` | An Altsystem übergeben bzw. verworfen | **Archiv** (Scope „Archiv") |

> Diese Phasen sind reine Sicht-/Gruppierungslogik — die §7.1-Maschine bleibt unverändert. Sie geben dem „Wo ist mein Beleg?" eine Antwort in einem Wort.

---

## (2) Die Belege-Ansicht neu gedacht (§10.4)

**Heute:** ein flacher Dump aller Status, `bookingDate asc`, nur Freitextfilter, Kopf „Belege (N)". **Soll:** die Belege-Ansicht ist die **Gesamtpopulation über die Zeit** (im Gegensatz zum Cockpit = „heute, operativ"). Sie braucht Segmentierung, nicht nur Filterung.

### 2.1 Scope-Umschalter (Primärnavigation der Ansicht)

Ein Segment-Control oben, Default **„Aktiv"**:

| Scope | Phasen | Default-Sortierung | Zweck |
|-------|--------|--------------------|-------|
| **Aktiv** | 1–3 | Priorität, dann letzte Aktivität | Tagesarbeit, was noch zu tun ist |
| **Abgeschlossen (heute)** | 4 | ZST-Zeit absteigend (neueste zuerst) | Tagesjournal, Kontrolle, Export |
| **Archiv** | 5 | Erledigt-/Storno-Zeit absteigend | Nachschlagen, Audit, Recherche |
| **Alle** | 1–5 | konfigurierbar | Suche über alles (heute der einzige Modus) |

Das löst sofort: aktive Belege werden nie von Historie verdrängt; die Kopfzahl je Scope ist aussagekräftig; „abgeschlossen" hat ein Zuhause.

### 2.2 Statusfilter als Facette (nicht nur Freitext)

Innerhalb eines Scopes: Filter-Chips je Status/Phase (z. B. innerhalb „In Arbeit": nur `issue_open`), plus die bestehenden Saved Views. Der Freitext bleibt zusätzlich.

### 2.3 Spalten ergänzen

- **Phase** (gruppiert, farbcodiert) als führende Spalte; Detailstatus als Chip dahinter.
- **Fortschritt** (Ist/Soll Menge) — sobald F4/F5 aus dem Review die echten Ist-Daten liefern; bis dahin als „—".
- **Abschluss-Zeit / Erledigt-Zeit** in den Scopes 4/5.
- **Letzte Aktivität** (jüngstes Audit-Event) für die „Aktiv"-Sortierung.

### 2.4 Backend-Konsequenzen (`listPool`)

- **Default-Filter:** ohne Scope-Param terminale Status (`zst_done`, `cancelled`) **ausblenden** — heute liefert `listPool` alles ungefiltert (`…:74-93`).
- **Scope-/Phasen-Param** statt nur Einzelstatus; serverseitige Sortierung je Scope (heute hart `bookingDate asc`).
- **Datumsfenster** für „Abgeschlossen (heute)"/„Archiv" (z. B. `completedFrom/To`), damit Pagination nicht mit der Zeit kippt.

---

## (3) Das Zuhause für „fertig": Tagesjournal & ZST-Export

### 3.1 Tagesjournal (Scope „Abgeschlossen heute" + eigenes Cockpit-Panel)

Eine read-only Sicht aller heute abgeschlossenen Belege:
- je Beleg: fertige Menge, Mitarbeiter, ZST-Zeit, Aufwandspunkte, Voll-/Teilabschluss;
- Tagessummen (Teile, Aufwand, Σ ZST) — speist die §15-KPIs;
- Teilabschlüsse zusätzlich markiert „Rest → morgen" (Carry-over, §4.6).

Datenquelle existiert bereits: `ZstRecord` (per Tag via `completedAt`, vgl. `teamlead-read.service.ts:272-302`). Es fehlt nur die Sicht.

### 3.2 Der fehlende Übergang `completed → zst_done` (Export-Lauf)

**Entscheidung nötig — wie wird `zst_done` erreicht?**

- **Option A (empfohlen): expliziter „Tagesabschluss / ZST-Export"** durch den Teamlead. Nimmt alle `completed`-Belege des Tages, erzeugt die ZST-CSV-Übergabe (§15.1; `zstRowsToCsv` existiert), markiert sie `zst_done`, emittiert `zst.exported`. **Das ist zugleich das Ziel des heute toten Export-Buttons** (Review F8).
- **Option B: automatischer Batch** beim Tageswechsel (Scheduler). Weniger Kontrolle, aber kein manueller Schritt.

Empfehlung: **A** für den Pilot (Mensch behält die Hand drauf, ein Klick), B als spätere Automatisierung. Bis dieser Lauf existiert, ist `completed` der faktische Terminalzustand und `zst_done` Kosmetik — das Konzept macht den Export zur **Brücke**, die `zst_done` erst real werden lässt.

---

## (4) Der fehlende Storno-Pfad (`cancelled`)

**Bedarf:** Fehlimport, Dublette, ProHandel-Korrektur, Beleg der nicht bearbeitet werden soll.

**Konzept — Aktion „Beleg stornieren (mit Grund)":**
- Teamlead-Aktion aus den Phasen **1–2** (`imported`/`parsed`/`needs_review`/`ready`/`parked`) und ggf. aus Problem-Zuständen.
- **Guard:** nicht erlaubt, solange `assigned`/in Arbeit (erst entziehen) oder bereits `completed`/`zst_done` (gebucht, nicht mehr stornierbar).
- → Zustand `cancelled`, **neues Event `case.cancelled`** (heute **nicht** im `WorkflowEventType`-Enum!), Grund + Audit (analog `case.parked`).
- Storno landet im **Archiv**-Scope, deutlich farblich getrennt von „erledigt".

> Ohne diese Aktion bleibt ein fehlerhafter Beleg dauerhaft im Pool und verzerrt Zählung/Kapazität.

---

## (5) Teilabschluss & Restmenge zu Ende gedacht (§4.6)

Heute: `partially_completed → ready` ist als Kante da, `carryOverToNextDay` emittiert `case.ready` — aber (a) der Teilabschluss bucht Menge 0 (Review F2), und (b) niemand löst das Carry-over aus, und (c) die **Restmenge wird nirgends geführt**.

**Konzept:**
- Beim Teilabschluss echte Teilmenge buchen; **Restmenge = `totalQuantity` − Σ bestätigte Menge** auf dem Case führen (neues Feld `remainingQuantity` oder aus `ZstRecord`s ableiten).
- **Reaktivierung:** explizit am Folgetag („Rest aktivieren") oder automatisch beim Tageswechsel → `partially_completed → ready`, nur noch mit der Restmenge.
- Im Tagesjournal als „teilweise, Rest N offen" sichtbar; im „Aktiv"-Scope taucht der Rest am Folgetag wieder auf.

---

## (6) Belegdetail (§10.4) — Review der 7 Tabs + was fehlt

**Gut:** Struktur Kopf/Priorität/Aufwand/Positionen+SKU/Boxen/Historie/Dokumente ist sinnvoll, read-only korrekt.

**Schwächen / Ergänzungen:**
1. **Kein Abschluss/ZST-Tab.** Für Belege der Phasen 4–5 fehlt die wichtigste Info: ZST-Datensatz (fertige Menge, Aufwand, Wer/Wann), Voll-/Teilabschluss, Carry-over, Export-Status (`zst_done`/`zst.exported`). → **Neuen Tab „Abschluss"** ergänzen, der für terminale Belege das Ergebnis statt des leeren Arbeitsstands zeigt.
2. **Positionen/Boxen sind für fertige Belege irreführend** (`open`/`pending`), weil Arbeits-Events nie persistiert werden (Review F4/F6/F10). Erst nach dem Event-Sync zeigt der Tab echten Ist-Stand.
3. **Problem-Historie nur als Boolean** (`hasOpenIssue`, `belege.ts:201`). Ein abgeschlossener Beleg, der einen Problemfall hatte, zeigt diesen nur im generischen History-Feed. → **Issue-Liste** im Detail (Typ, Scope, Grund, gelöst-von/wann).
4. **Dokumente** deaktiviert (EPIC 3) — bleibt abhängig.

---

## (7) Was konkret hinzukommen muss (Zusammenfassung)

### Neue Sichten / UX
- Belege-**Scope-Umschalter** (Aktiv / Abgeschlossen heute / Archiv / Alle) + Statusfacette + Phasenspalte.
- **Tagesjournal** (Scope + Cockpit-Panel) als Zuhause für „fertig".
- **Belegdetail-Tab „Abschluss"** + Issue-Liste.

### Neue Aktionen
- **ZST-Export / Tagesabschluss** (`completed → zst_done`, `zst.exported`, CSV) — belegt zugleich den toten Export-Button.
- **Beleg stornieren (mit Grund)** (`→ cancelled`).
- **Rest aktivieren** (`partially_completed → ready` mit Restmenge) — manuell oder automatisch.

### Daten-/Domänen-Ergänzungen
- **Event-Typ `case.cancelled`** (fehlt im Enum) und `zst.exported` real auslösen (definiert, nie gefeuert).
- **Restmenge** am Case führen (`remainingQuantity` oder aus ZST abgeleitet).
- **`listPool`:** Scope-/Phasen-/Datums-Param, terminale Status per Default ausblenden, serverseitige Sortierung je Scope.

### Statusmodell
- **Phasen-Gruppierung** (1–5) als gemeinsames Vokabular für Belege, Cockpit-Zählung (Anhang A) und KPI.

---

## (8) Empfohlene Reihenfolge (lean, baut auf dem Review auf)

> Voraussetzung für inhaltliche Korrektheit der Endzustände sind die CRITICALs aus `beleg-actions-critical-review.md` (F1/F2/F4) — ohne echte Ist-Mengen sind Journal & Abschluss-Tab nur Hüllen.

1. **Belege-Scope-Umschalter + `listPool`-Default (terminale ausblenden) + Sortierung.** Reiner Sicht-/Query-Umbau, sofort spürbar, keine Domänenänderung. Macht „Aktiv" wieder benutzbar.
2. **Tagesjournal** (Scope „Abgeschlossen heute") aus vorhandenen `ZstRecord`-Daten. Zuhause für „fertig".
3. **ZST-Export-Lauf** (`completed → zst_done`, CSV, `zst.exported`) + Export-Button beleben. Schließt den Lebenszyklus real.
4. **Storno-Aktion** + `case.cancelled`-Event. Pool sauber halten.
5. **Restmenge + Rest-Aktivierung** (nach F2). Teilabschluss zu Ende gedacht.
6. **Belegdetail-Tab „Abschluss" + Issue-Liste.** Detailtiefe für terminale Belege.
7. **Phasen-Gruppierung** als durchgängiges Vokabular (Belege-Spalte, Cockpit-Zähler, KPI).

> Schritte 1–2 sind reine Read-/UX-Konzepte ohne Risiko und liefern den größten „endlich sehe ich meine fertigen Belege"-Effekt. Ab 3 wird der Lebenszyklus auch fachlich geschlossen.
