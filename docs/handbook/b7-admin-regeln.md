# B7 – Admin & Regeln

## Zweck

Unter `'Admin & Regeln'` (Seitenüberschrift `'Admin & Regelpflege'`) pflegen Sie die Regeln, nach
denen die Automatik entscheidet: Priorität, Bündelgrößen, Aufwand, Lieferungs-Erkennung,
Verladeplan, Lagerplätze, Mitarbeiter, Schichtplan, Integration und Schichtende.

## Wann anwenden

Bei Einrichtung und immer, wenn sich Rahmenbedingungen ändern (neue Verladetage, neue Mitarbeitende,
andere Bündelgrößen …).

## Voraussetzungen

- Navigationseintrag `'Admin & Regeln'`. Auf den Regel-Tabs speichern Sie mit
  `'Regeln speichern'` (Rückmeldung `'Regeln gespeichert.'`). Jedes Zahlenfeld hat ein
  ⓘ-Symbol mit Erklärung.

## Die Tabs im Überblick

Reihenfolge: `'Priorität'`, `'Bündel'`, `'Aufwand'`, `'Lieferungen'`, `'Verladeplan'`,
`'Lagerplätze'`, `'Mitarbeiter'`, `'Schichtplan'`, `'Integrationen'`, `'Schichtende'`,
`'Problemarten'`.

### `'Priorität'` – die Prio-Leiter

Hier steht, was die Automatik zuerst zuteilt. Die Leiter (oberste passende Stufe gewinnt):

1. **Manuell (Teamlead)** – ein manuell gesetzter Prio-Beleg schlägt alle Automatikregeln
   (`'Manuelle Prio gewinnt'`).
2. **Prio** – Belege mit Prio-Kennzeichen.
3. **Tägliche Verladung** – Abschnitte 7, 4, 8 und die hier gepflegten Shopbereiche
   (`'Tägliche Verladung — Shopbereiche'`, Chips wie `'Shop 120'`). Diese kommen **vor NOS**.
4. **NOS & Hängeware** – NOS-Ware und Bereich Hängebahn.
5. **Verladeplan** – Abschnitte 1, 2, 3, **fällig ab dem Verladetag – ohne Vorlauf**.
6. **FIFO** – der Rest, ältester Beleg zuerst (`'FIFO aktiv'`).

`'FIFO aktiv'`: „bei gleicher Priorität wird der älteste Beleg zuerst zugeteilt." `'Manuelle Prio
gewinnt'`: „Ein vom Teamlead manuell gesetzter Prio-Beleg schlägt alle Automatikregeln."

### `'Bündel'` – Teile-Größen und geteilte Belege

Legt die Bündelgrößen in **Teilen** fest: `'Starter-Pack min (Teile)'`, `'Starter-Pack max
(Teile)'`, `'Folge-Pack min (Teile)'`, `'Folge-Pack max (Teile)'` sowie die
`'Monster-Beleg-Schwelle (Teile)'` – „Belege ab dieser Teilezahl werden NICHT automatisch verteilt,
sondern warten auf die manuelle Teamlead-Entscheidung." (Groß-Belege, Kapitel B6). Dieselbe Schwelle
setzt im Cockpit den roten Chip `'Monster'` (Digitale Ablagen + Belege-Tabelle) und bedient dort den
Filter `'Monster'`. Ändern Sie den Wert, ändern sich Chip, Filter und Verteilung gemeinsam — es gibt
nur diese eine Grenze.

Außerdem steht hier der Schalter **`'Beim geteilten Beleg erst mithelfen'`** – „Wer an einem
geteilten Beleg beteiligt ist, bekommt kein neues Pack, bis alle Positionen geprüft sind."
Standard: **aus**.

- **Aus:** Wer seinen Anteil an einem geteilten Beleg mit `'Teilbeleg erledigt'` gemeldet hat und
  sonst nichts Offenes im laufenden Pack hat, darf sich mit `'Nächstes Pack anfordern'` neue Arbeit
  holen – der geteilte Beleg hält ihn nicht auf.
- **An:** Inhaber wie Helfer bekommen beim Anfordern die Meldung `'Erst den geteilten Beleg zu Ende
  bringen – es sind noch Positionen offen.'`, solange der geteilte Beleg weder fertig ist noch mit
  Problemen bei Ihnen in Klärung liegt. Auch die Automatik gibt diesen Personen kein neues
  Starter-Pack, bis der Beleg durch ist (Kapitel A7/A8).

### `'Aufwand'` – Kalibrierung

Die echten Aufwandsparameter der Engine, u. a. `'Grundzeit je Beleg'`, `'Minuten je Teil'`,
Etiketten, Warensicherung, Online-Behandlung, Rotpreis, Box-Splitting, `'Punkte je Minute'`, dazu
Prüf- und Handling-Multiplikatoren. Rechts läuft die `'Live-Vorschau · Beispiel-Beleg'` mit, die
jede Änderung sofort zeigt. Der Aufwand beeinflusst **Bündelgröße und Lastverteilung**, **nicht** die
Priorität.

### `'Lieferungen'` – Gruppierungsregeln (Brax-Fall)

Steuert, wie zusammengehörige Lieferungen erkannt werden. Drei Signale:

1. **`'Signal: Quelle (X von N)'`** – „Gleiche Quell-Lieferung" (bestätigt).
2. **`'Signal: gleiche Lieferschein-Nr'`** – wahrscheinlich.
3. **`'Signal: fortlaufende Belegnummern'`** – „Kartons einer Lieferung mit fortlaufenden Nummern"
   (der **„Brax-Fall"**, vermutet).

Weitere Schalter: `'Erkennung aktiv'`, `'Lauf nur am selben Tag'`, `'Lauf nur im selben Bereich'`,
`'Vermutete automatisch zuteilen'` sowie `'Max. Beleg-Abstand'` (1 = streng aufeinanderfolgend).
Nicht fortlaufende Belege müssen manuell gruppiert werden.

### `'Verladeplan'` – inkl. Sonderregelung/Feiertag

Pro Shop-Bereich und Etage werden die Verladetage (Wochentage `'Mo'`–`'So'`) gepflegt. Ein Beleg ist
**zum Verladetag fällig – ohne Überfälligkeits-Vorlauf**.

- Felder je Karte: `'Shop-Bereich'`, `'Etage'`, Wochentags-Chips, `'Gültig ab'`,
  `'Gültig bis (optional)'`.
- **Sonderregelung/Feiertag:** Der Chip `'Sondertag (einmalige Abweichung)'` markiert einen
  einmaligen Verladetag, der den regulären Wochenplan in seinem Zeitfenster ersetzt (z. B. Feiertag
  Donnerstag → Verladung auf Mittwoch vorgezogen).
- Die `'Vorschau — Wirkung heute'` zeigt den nächsten Verladetag und ab wann Belege fällig sind.
- Neue Zeile über `'+ Shop-Bereich hinzufügen'`.

### `'Lagerplätze'` – Bereiche aus der Lagerklasse

Verwaltet die Lagerplätze (`'Neuer Lagerplatz'`, Spalten `'Code'`, `'Bezeichnung'`, `'Art'`,
`'Zone'`, `'Sortier-Index'`, `'Aktiv'`). Wichtig: „Bereiche, Icons und Handling leiten sich aus der
Lagerklasse (Art) ab." Es gibt genau drei Bereiche – **Regal, Palette, Hängebahn** – abgeleitet aus
der Art des Lagerplatzes. Das ist **kein** Wegeoptimierungs-Tool; chaotische Lagerhaltung ist ok.
Speichern mit `'Lagerplätze speichern'`.

### `'Mitarbeiter'` – Skill-Stufe, Arbeitsplatz/Tisch, Temp/Dummy

Links die Mannschaft, rechts das Profil der gewählten Person. Über der Liste steht der Hinweis,
dass die Mitarbeiterdaten künftig aus dem **SEAK-Personalmanagement** fließen sollen (Schnittstelle
geplant) — bis dahin ist die Pflege hier der Fallback. Im Profil pflegen Sie u. a.:

- **`'Anzeigename'`** – so erscheint die Person in Board, Bündeln und Auswertungen. Gespeichert
  wird beim Verlassen des Feldes (oder mit Enter).
- **`'Skill-Stufe'`** (Profi/Fortgeschritten/Basis/Starter/Dummy) – „Profi = alles automatisch;
  Starter/Dummy = nur manuelle Zuteilung."
- **`'Arbeitsplatz / Tisch'`** – fester Tisch optional (`'— kein Tisch —'` lässt die Person
  flexibel).
- **`'Bereich / Skill'`** – Hängebahn/Palette/Regal; leer = `'Allrounder (übernimmt alles)'`.
- **`'Produktivitätsfaktor'`** und **`'Überstunden-Toleranz'`** (Einsatz-Parameter).

**Temp-Kräfte / Dummys:** Über `'+ Temp-Mitarbeiter'` legen Sie Azubis/Aushilfen an (Dialog
`'Temporäre Kraft anlegen'`). Sie tragen den Chip `'Temp · ohne Messung'`: Sie werden ganz normal
verplant, zählen aber **nicht** in die Leistungsmessung (nur in den Durchsatz).

**Entfernen:** Ganz unten im Profil steht `'Mitarbeiter löschen …'`. Gelöscht wird nur, solange
nichts Operatives an der Person hängt. Steht sie heute in einer aktiven Schicht, hat sie Bündel,
Belege in Arbeit oder Leistungs-/Meldungshistorie, nennt der Dialog genau diesen Grund und bietet
`'Stattdessen deaktivieren'` an — dann verschwindet die Person aus Planung und Auswahl, die
Historie bleibt lesbar. Ist nichts blockiert, fällt der Datensatz samt seiner reinen
Anzeige-Anhänge (geplante Schichten, Abwesenheiten, Nachrichten); das lässt sich nicht rückgängig
machen. In der Praxis ist Löschen damit der Weg für den versehentlich angelegten Datensatz,
Deaktivieren der Weg für alle, die schon gearbeitet haben.

### `'Schichtplan'` – Wochenmuster

Pro Person und Wochentag `'Frühschicht'` (06:00–14:00), `'Spätschicht'` (10:00–18:00) oder `'Frei'`.
Daraus berechnet das System die Kapazität. Änderungen speichern automatisch.

### `'Integrationen'` – ProHandel & „Jetzt pullen"

Die Anbindung an ProHandel (ERP) als Quelle für Aufträge, Positionen, Größenverteilung,
Arbeitsanweisung und Lagerplatz. „Belege entstehen direkt im Status „ready"."

- Felder: `'Basis-URL'`, `'Pull-Intervall'`, ausgewählte Filialen (MANDANT/FILIALE).
- **`'Jetzt pullen'`** zieht sofort die neuen Buchungen (Rückmeldung
  `'Pull abgeschlossen · <n> neue Belege übernommen.'`). Weitere Knöpfe: `'Verbindung testen'`,
  `'Speichern'`.
- Zugangsdaten werden **nur** per Umgebung gesetzt (`'Secrets werden nicht in der UI gepflegt.'`).
- Ein STATUS-Bereich zeigt Verbindung, letzten Pull, Cursor und nächsten Pull; fehlerhafte Buchungen
  landen in der `'Quarantäne'` (mit `'Retry'`, nie verworfen).

### `'Schichtende'`

Ein Feld: `'Auto-Stopp vor Schichtende (Min.)'` – „So viele Minuten vor Schichtende stoppt die
automatische Verteilung; den Rest holen Mitarbeitende selbst aus dem Pool (0 = bis Schichtende
durchverteilen)." (siehe Kapitel B8).

## Was passiert danach

- Gespeicherte Regeln wirken bei der nächsten Verteilung/Neuberechnung.
- Änderungen an Stammdaten (Mitarbeiter/Lagerplätze) stehen sofort zur Verfügung.

## Häufige Fehler / FAQ

- **`'Speichern fehlgeschlagen: …'`** – erneut versuchen; prüfen, ob das Backend erreichbar ist.
- **Aufwands-Änderungen wirken scheinbar nicht auf die Prio** – richtig: Aufwand steuert
  Bündelgröße/Last, nicht die Priorität.
- **Starter/Dummy bekommt keine Automatik-Arbeit** – so gewollt: Diese Stufen erhalten nur manuell
  zugeteilte Belege.
