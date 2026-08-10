---
title: "Dashboard-Änderungen — Kundenfeedback vom 07.08.2026"
lang: de
---

# Dashboard-Änderungen — Kundenfeedback vom 07.08.2026

Das Feedback vom 07.08.2026 enthielt fünf Punkte zum Teamlead-Cockpit. Alle fünf sind
umgesetzt. Nachfolgend je Punkt: was gewünscht war, was daraus geworden ist und ein
Screenshot aus dem laufenden System.

Die Screenshots stammen aus dem Demo-Szenario „Standard-Tag" (209 Belege, 12 aktive
Mitarbeiter).

\newpage

## 1 · Digitale Ablage — Infos auf der Beleg-Kachel

**Gewünscht:** Auf jeder Beleg-Kachel zusätzlich kompakt Filiale, Shop, Etiketten,
Digi Tags und Sicherung anzeigen — ohne die Kacheln aufzublähen.

**Umgesetzt:** Jede Kachel trägt jetzt eine schmale Chip-Zeile. Sie zeigt die Filiale
(`Fil. 001`), den Shop (bei Mehr-Shop-Belegen `Shop 21 +2`), die auf dem Beleg
**tatsächlich vorkommenden** Etikett-Varianten — `Etikett`, `Digi Tag`, `Kein Etikett`,
und zwar nur die, die es dort wirklich gibt — sowie `Sicherung`, sobald mindestens eine
Position gesichert werden muss. Die vollständige Bezeichnung steht jeweils im Tooltip.

Nichts davon wird neu erfunden: die Angaben werden aus den vorhandenen Positionsdaten
abgeleitet. Gerechnet wird das einmal im Backend — die Oberfläche zeigt nur an.

![Digitale Ablagen (Original-Reiter): Jede Karte trägt unter den Status-Chips die neue Infozeile. Gut zu sehen, dass nur vorkommende Varianten erscheinen — Beleg 3.540.310 hat ausschließlich Digi-Tag-Positionen, 3.540.011 alle drei Varianten.](assets/p1a-ablagen-kachel-infos.png){width=16.5cm}

![Dieselbe Infozeile in der Kombi-Ansicht „Experiment DA.M.B" — es ist bewusst dieselbe Komponente, damit die Darstellung nicht auseinanderlaufen kann.](assets/p1b-damb-kachel-infos.png){width=16.5cm}

\newpage

## 2 · Mitarbeiterboard — „Bündel anlegen"

**Gewünscht:** Beim Auswählen der Belege je Zeile dieselben Infos wie auf den Kacheln,
in gleicher Optik.

**Umgesetzt:** Die Beleg-Zeilen im Zuweisen-Dialog — sowohl in der Live-Suche als auch
in „Durchsuchen & mehrere auswählen" — tragen dieselbe Chip-Zeile. Das ist buchstäblich
dieselbe Komponente wie auf den Ablagen-Karten, nicht eine zweite Implementierung mit
ähnlichem Aussehen.

![Mitarbeiterboard → „Bündel anlegen" → „Durchsuchen & mehrere auswählen": Unter jeder Beleg-Zeile stehen Filiale, Shop, die Etikett-Varianten und die Sicherung — identisch zur Kachel-Darstellung.](assets/p2-buendel-anlegen-zeilen.png){width=16.5cm}

\newpage

## 3 · Admin & Regeln — Skill-Radar statt Bereich/Skill

**Gewünscht, im Wortlaut:** *„Diese Bereiche werden grundsätzlich nicht benötigt … Es
gibt keine Mitarbeiter, die nur z. B. HW bearbeiten. Jeder MA macht alles."* — Die Zeile
„Bereich / Skill · Allrounder (übernimmt alles)" samt Erklärtext soll aus der
Mitarbeiter-Ansicht verschwinden, stattdessen ein Skill-Radar.

**Umgesetzt:** Die Bereichs-Auswahl ist aus der Mitarbeiter-Ansicht entfernt — dort gibt
es nichts mehr einzustellen. An ihrer Stelle steht ein Können-Profil als
Netz-/Spinnendiagramm: sechs Achsen (Tempo, Sorgfalt, Hängeware, Boxen/Liegeware,
Etiketten & Sicherung, Vielseitigkeit) auf einer Skala von 0 bis 5, rein zum Ansehen.

**Wichtig:** Die Werte sind **Platzhalter**. Sie sind je Person fest (aus der
Personalnummer abgeleitet), damit das Bild einer Person stabil bleibt — sie sagen aber
noch nichts über die tatsächliche Leistung aus. Der Hinweis dazu steht direkt über dem
Diagramm. Sobald die Auswertung steht, kommen die Werte aus echten Arbeitsdaten
(ZST-Durchsatz, Problemquote); die Darstellung bleibt dieselbe.

**Bewusste Abgrenzung:** Geändert wurde nur diese eine Admin-Ansicht. Die Bereichs-Logik
der Verteilung und alle anderen Ansichten sind unverändert — das von Ihnen angesprochene
„überall entfernen" ist eine größere, separate Entscheidung.

![Admin & Regeln → Mitarbeiter: Die Stammdaten enthalten keine Bereichs-Auswahl mehr. Darunter das Skill-Radar mit dem Vorschau-Hinweis und den sechs Achsen samt Werteliste.](assets/p3-admin-skill-radar.png){width=16.5cm}

\newpage

## 4a · Belege-Tabelle — Spalten ausblenden

**Gewünscht:** Spalten ausblendbar über ein kleines Icon im Spaltenkopf (nicht über den
Kopf-Klick, der schon sortiert), Wieder-Einblenden über ein sichtbares „Spalten"-Menü,
Zustand über Reload hinweg gespeichert, getrennt je Ansicht.

**Umgesetzt:** Jeder Spaltenkopf trägt rechts ein kleines Augen-Icon zum Ausblenden. Der
Kopf-Klick bleibt unverändert das Sortieren — die beiden Bedienungen kommen sich nicht
in die Quere. Über der Tabelle sitzt ein „Spalten"-Icon mit einer Checkbox-Liste aller
Spalten; die kleine Zahl daran zeigt, wie viele gerade ausgeblendet sind, und
„Alle einblenden" stellt alles mit einem Klick wieder her.

Der Zustand überlebt den Reload und ist **je Ansicht getrennt**: der Belege-Reiter und
die Kombi-Ansicht DA.M.B können unterschiedlich konfiguriert sein. Nicht ausblendbar
ist die Aktionen-Spalte — ohne das Drei-Punkte-Menü wäre die Zeile nicht mehr bedienbar;
ebenso lässt sich die letzte verbliebene Spalte nicht auch noch abwählen.

![Das „Spalten"-Menü mit allen 13 Spalten der aktuellen Ansicht. Die Augen-Icons in den Spaltenköpfen sind ebenfalls zu sehen.](assets/p4a-belege-spalten-menue.png){width=16.5cm}

![„Warenart" und „Buchung" ausgeblendet: Die Tabelle rückt zusammen, das Spalten-Icon trägt die Zahl 2, und der Eintrag „Alle einblenden" erscheint.](assets/p4b-belege-spalten-ausgeblendet.png){width=16.5cm}

\newpage

## 4b · Belege-Tabelle — Filter „Digi Tags" und „Sichern"

**Gewünscht:** Zwei zusätzliche Filter — „Digi Tags" (mindestens eine Position mit
DigiTag-Druckvariante) und „Sichern" (mindestens eine Position mit Sicherung) — in
beiden Ansichten.

**Umgesetzt:** Beide Filter stehen im aufklappbaren Filterblock, zwischen „Etiketten"
und „Zugeteilt", jeweils mit „ja" und „nein". Sie filtern serverseitig über **genau
dieselbe** Ableitung, die auch die Chips auf den Kacheln anzeigen — was Sie in der
Kachel sehen, finden Sie also auch über den Filter wieder. Da Belege-Reiter und
DA.M.B-Kombi dieselbe Tabelle verwenden, stehen die Filter automatisch in beiden
Ansichten zur Verfügung.

![Der Filterblock mit den beiden neuen Einträgen „Digi Tags" und „Sichern".](assets/p4c-belege-filter-digitags-sichern.png){width=16.5cm}

![„Sichern = ja" gesetzt: Von 202 aktiven Belegen bleiben 189 übrig, der Filter-Knopf zeigt „(1)".](assets/p4d-belege-filter-sichern-aktiv.png){width=16.5cm}

\newpage

## 5 · DA.M.B — Grund ist kein Pflichtfeld mehr

**Gewünscht:** Beim manuellen Zuordnen bzw. Hineinziehen eines Belegs zu einem
Mitarbeiter oder von Mitarbeiter zu Mitarbeiter soll der Grund optional sein — der
Dialog soll nicht blockieren. Das Audit-Event soll weiterhin geschrieben werden, nur
gegebenenfalls ohne Text.

**Umgesetzt:** Der Dialog heißt jetzt „Grund (optional)", „Bestätigen" ist sofort
anwählbar, und ein leeres Feld ist ein gültiger Abschluss. Die Vorschlags-Knöpfe
bleiben als Abkürzung erhalten. Das Audit-Event wird unverändert geschrieben — nur eben
ohne Text, wenn keiner eingegeben wurde.

Das gilt für die Zuordnungs-Gesten der Matrix: Ablage → Mitarbeiter, vorbereitetes
Bündel → Mitarbeiter, Mitarbeiter → Mitarbeiter, Pack → Pack sowie das Einsortieren
zwischen geplante Belege. **Nicht** geändert wurden Pause/Abwesenheit und das Entziehen
eines Belegs — dort bleibt der Grund Pflicht, weil Ihr Feedback ausdrücklich das
Zuordnen betraf.

![DA.M.B: Beleg 3.540.011 auf die Zeile von Anna Berger gezogen. Das Feld heißt „Grund (optional)", der Hinweistext sagt „Kann leer bleiben — der Eingriff wird so oder so auditiert", und „Bestätigen" ist trotz leerem Feld anwählbar.](assets/p5-damb-grund-optional.png){width=16.5cm}

\newpage

## Zusammenfassung

| # | Punkt | Stand |
| --- | --- | --- |
| 1 | Kachel-Infos in der Digitalen Ablage (Original + DA.M.B) | umgesetzt |
| 2 | Gleiche Infos je Zeile beim „Bündel anlegen" | umgesetzt |
| 3 | Skill-Radar statt Bereich/Skill in Admin & Regeln | umgesetzt (Werte noch Platzhalter) |
| 4a | Spalten ausblendbar, „Spalten"-Menü, je Ansicht gespeichert | umgesetzt |
| 4b | Filter „Digi Tags" und „Sichern" in beiden Ansichten | umgesetzt |
| 5 | Grund beim Zuordnen/Verschieben optional | umgesetzt |

**Offen bzw. bewusst nicht enthalten**

- Die Skill-Radar-Werte sind Platzhalter, bis die Auswertung aus ZST und Problemquote
  steht. Die sechs Achsen sind ein Vorschlag — wenn Sie andere Kriterien für
  aussagekräftiger halten, ändern wir sie, bevor die Berechnung gebaut wird.
- Bereiche/Skills wurden nur in der Mitarbeiter-Ansicht entfernt. Ob sie auch aus der
  Verteilungslogik und den übrigen Ansichten verschwinden sollen, sollten wir getrennt
  besprechen — das betrifft die Zuteilung selbst.
