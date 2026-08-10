# Beleg-Aufteilung auf mehrere Mitarbeitende

**Status:** umgesetzt (Backend + Cockpit) · Stand 2026-08-10
**Begleitendes Mockup:** `docs/concept/beleg-split-multi-employee-ux-mockup.html` (UX-Vorlage des Dialogs)

---

## 0. Anforderung (L&T / Daniel, verbatim)

> „Moin, es müsste auch möglich sein gezielt Belege (z.B aufgrund des Mengenvolumens
> oder Aufwand (Koffer oder eine Sendung von 3000 Teilen)) auch an mehrere
> Mitarbeitende zu verteilen und am Ende auch die Leistung getrennt aufzunehmen oder
> anteilig anzurechnen.
>
> Vielleicht müsste man bei der Belegverteilung ab einer bestimmten Menge ein Hardcut
> machen, und den Teamlead die Steuerung manuell überlassen, damit der Beleg nicht
> automatisiert verteilt wird."

Ergänzt durch den Teamlead-Fragenkatalog vom 07.08.2026:

> „In welcher Spalte der Digitalen Ablage finde ich diese [Monster-Belege]?" und
> „Aufteilen, ohne schon jemanden auswählen zu müssen — die Automatik soll verteilen."

---

## 1. Die Entscheidung: echte Teil-Belege

Ein aufgeteilter Beleg wird in **eigenständige Kind-Belege** zerlegt. Kein virtueller
Split, keine Unter-Einheit unterhalb des Belegs.

**Warum.** Der gesamte Stack — Engine, Bündel, Status, ZST, Probleme, Positionen, Pickup,
Tagesabschluss — rechnet pro `GoodsReceiptCase`-Zeile. Ein virtueller Split (eine Zeile,
die intern für n Arbeitseinheiten steht) müsste **jedem** dieser Konsumenten beibringen,
dass eine Zeile mehrere Bearbeiter, mehrere Fortschritte und mehrere Abschlüsse haben
kann. Das ist ein Querschnitts-Eingriff mit zwei Wahrheiten, der an jeder künftigen Stelle
neu mitgedacht werden müsste. Echte Kind-Belege kosten einmal Schreibarbeit beim Anlegen
und sind danach für den ganzen Rest des Systems einfach: normale Belege.

Der Preis dieser Entscheidung ist bewusst akzeptiert: eine Aufteilung ist nicht rückgängig
zu machen (die Teile werden getrennt zugeteilt, bearbeitet, abgeschlossen), und sie ist ein
schreibender Eingriff statt einer Anzeige-Interpretation.

### Datenmodell

`GoodsReceiptCase` trägt eine Self-Relation:

| Feld | Bedeutung |
|---|---|
| `parentCaseId` | Container-Beleg des Teils; `null` bei normalen Belegen **und** beim Container selbst |
| `partNo` | 1-basierte Teil-Nummer für die Anzeige; `null` außerhalb von Teilen |
| `status = split_container` | Das Original nach der Aufteilung: nur noch fachliche Klammer |

Die Belegnummer des Teils **ist** die Anzeige-Nummer: `WE-2026-000207 (2)`. Damit bleibt
der Bezug zum Original in jeder Liste, Suche und Meldung sichtbar, ohne dass irgendeine
Oberfläche eine eigene Formatierung erfindet — und `weBelegNo` bleibt eindeutig.

`split_container` ist ein eigener Status statt eines Flags, weil jede Pool-Abfrage im Stack
ohnehin über den Status partitioniert und dabei mit **Erlaubnislisten** arbeitet
(`ABLAGEN_STATUSES`, `PREVIEW_POOL_STATUSES`, `assignableSearchWhere`). Der Container fällt
damit überall automatisch heraus, statt an n Stellen einzeln ausgeschlossen zu werden.
Er ist terminal (`CASE_TRANSITIONS`).

---

## 2. Wie die Ware auf die Teile fällt

`apps/backend-api/src/cases/case-split.ts` (rein, getestet) ist die **einzige** Stelle, die
das entscheidet. Zwei Regeln:

1. **Eine Größenzeile bleibt ganz.** Die SKU-Zeile (EAN + Größe) ist die kleinste zählbare
   Einheit im Lager — 12 Stück einer Größe lassen sich nicht auf zwei Personen aufteilen,
   ohne dass beide dieselbe Kiste anfassen.
2. **Positionen bleiben beieinander.** Die Zeilen werden in Positions-/Größenordnung
   durchlaufen; eine Position darf an der Grenze zwischen zwei Teilen aufgehen.

Daraus folgt: **die Mengen im Dialog sind Ziele, keine Zusagen.** Das Ergebnis meldet die
tatsächlich verteilten Mengen zurück. Die Summe über alle Teile ist immer die Gesamtmenge
des Belegs — es geht nichts verloren, und ein Teil bleibt nie leer.

Der Aufwand (`effortPoints`, `estimatedMinutes`) wird mengenproportional umgelegt; der
letzte Teil trägt die Rundungsdifferenz, damit die Summe exakt dem Original entspricht.

### Was der Kind-Beleg erbt

Beleg-Kopf (Filiale, Lieferschein, Abschnitt, Warenart, Shop/Etage, Lagerplatz,
Prioritäts-Flags, CatMan-/Verladetermin), die Arbeitsanweisung des Kopfes und je Position
deren Instruktion. Nicht geerbt werden die Lieferungs-Gruppen-Schlüssel: eine Aufteilung
existiert gerade, um die Arbeit zu verteilen — die Teile sollen **nicht** per
Gruppen-Affinität wieder auf einer Person landen.

Die Positionen des Originals werden beim Aufteilen gelöscht. Sie stehen zu lassen hieße,
dieselben Mengen zweimal zu führen; der Container behält seinen Kopf inklusive
`totalQuantity` als Klammer.

---

## 3. Mit und ohne Zuweisung — ein Mechanismus

`POST /api/teamlead/cases/:id/split` nimmt je Teil eine Menge und **optional** eine
Mitarbeiter-Nr.

- **Ohne Zuweisung** (Normalfall bei Monster-Belegen): die Teile starten als `ready` und
  unassigned im Topf. Die Automatik verteilt sie beim nächsten Starter-Pack bzw. Self-Pull
  regulär. Liegt jeder Teil unter der Monster-Schwelle, ist er damit wieder
  auto-verteilbar — genau der Zweck der Aufteilung.
- **Mit Zuweisung**: dieselbe Aufteilung, danach der unveränderte §8.4-Zuweisungspfad
  (`findOrCreateBundleTx` + `addCaseToBundleTx`).

Es gibt bewusst **keinen** zweiten Code-Weg für die beiden Fälle.

**Guards** (alle im Backend, das Cockpit zeigt nur die Meldung): nur `ready`/`parked`,
nicht bereits ein Teil-Beleg, nicht in einem Bündel, Summe der Teilmengen = Gesamtmenge,
mindestens zwei Teile, nicht mehr Teile als Größenzeilen.

---

## 4. Leistungserfassung

Mit echten Teil-Belegen entfällt die frühere Unterscheidung „getrennt vs. anteilig"
ersatzlos: **jeder Teil ist ein eigener Beleg mit eigenem `ZstRecord`**, also immer real
gemessen. Die anteilige Division war nur nötig, solange ein Beleg ungeteilt blieb und seine
Leistung rechnerisch auf Personen verteilt werden musste.

---

## 5. Monster-Belege sichtbar machen

Die Engine nimmt Belege ab `RuleConfig.bundle.largeBelegTeileThreshold` (Regelpflege,
Default 2000 Teile) aus der Auto-Verteilung (C6, `plan.ts`, Skip-Grund `large_beleg`). Im
Cockpit waren sie bis 08/2026 durch nichts von einem normalen bereiten Beleg zu
unterscheiden — die Frage „in welcher Spalte finde ich die?" hatte keine Antwort.

Das Backend rechnet die Zugehörigkeit einmal gegen dieselbe Schwelle und liefert sie als
`PoolItemDto.isMonster`; derselbe Wert bedient den Serverfilter `monster=yes|no`. Angezeigt
wird ein roter Chip „Monster" auf der Beleg-Karte in den Digitalen Ablagen und in der
Teile-Spalte der Belege-Tabelle. Die UI rechnet nichts.

---

## 6. Bewusst ausgeklammert

- **Kein Re-Split eines Teil-Belegs** (Nesting würde die Anzeige-Nummer mehrdeutig machen).
- **Kein Zusammenführen** aufgeteilter Belege.
- **Keine Positions-Auswahl im Dialog** — die Aufteilung folgt Mengen; die Positions- und
  Größengrenzen respektiert der Algorithmus automatisch.
- **Kein automatischer Split durch die Engine.** Sie markiert (Monster) und verteilt nicht;
  aufgeteilt wird ausschließlich auf Teamlead-Entscheid.
