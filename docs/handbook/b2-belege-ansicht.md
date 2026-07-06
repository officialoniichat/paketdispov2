# B2 – Belege-Ansicht

## Zweck

Die Belege-Ansicht ist die durchsuchbare Gesamtliste aller Belege mit Spalten, Filtern, Detailsicht,
Zuweisung, Archiv/DocuWare-Zugriff und dem Tagesabschluss-Export.

## Wann anwenden

Zum Suchen einzelner Belege, zum Zuweisen, zum Prüfen von Details und für den ZST-Export.

## Voraussetzungen

- Navigationseintrag `'Belege'`.

## Scopes (Lebenszyklus-Bereiche)

Oben schalten Sie zwischen Sichten um: `'Aktiv'`, `'Abgeschlossen'`, `'Archiv'`, `'Topf'`, `'Alle'`.
Der `'Topf'` zeigt zusätzlich eine Anzahl. Die Wahl bleibt gespeichert.

- **`'Topf'`**: „Belege mit „Besonderer Aufmerksamkeit" (Bucherinnen-Hinweis) sowie blockierte / zu
  prüfende Belege — hier zuweisen, freigeben oder entlassen." (siehe auch Kapitel B6)
- **`'Archiv'`**: „Belege bleiben im System erhalten; DocuWare ist das Langzeitarchiv."
- **`'Abgeschlossen'`**: hier liegt der Knopf `'Tagesabschluss / ZST-Export'` (siehe unten).

## Spalten

Wichtigste Spalten: `'WE-Beleg'`, `'Status'`, `'Shop'`, `'Filiale'`, `'Abschnitt'`, `'Warenart'`,
`'Prio'`, `'Menge (Teile)'`, `'Punkte'`, `'Etiketten'` (`'ja'`/`'nein'`), `'Buchungsdatum'`,
`'Lagerplatz'`, `'Lieferung'`, `'Zugeteilt'`. Im `'Archiv'` zusätzlich `'Abschlussdatum'` und
`'DocuWare'`, im `'Topf'` zusätzlich `'Hinweis'`.

Die Status-Spalte zeigt eine Phase: `'Eingang'`, `'Pool'`, `'In Arbeit'`, `'Abgeschlossen'` oder
`'Erledigt'`. Ist ein Bündel noch nicht gestartet, steht bei `'Zugeteilt'` der Zusatz
`'vorbereitet · Pos <n>'`.

## Filter

Über der Tabelle filtern Sie u. a. nach `'WE-Nr / Lagerplatz / Lieferschein'` (Freitext), `'Status'`,
`'Shop'`, `'Filiale'`, `'Abschnitt'`, `'Etiketten'`, `'Zugeteilt'` sowie `'Buchung ab'` und
`'Buchung bis'`. Sortieren geht per Klick auf sortierbare Spalten (z. B. `'WE-Beleg'`,
`'Menge (Teile)'`). Filter und Sortierung bleiben gespeichert. Leere Liste:
`'Keine Belege in diesem Scope.'`

## Einen Beleg zuweisen (aus der Liste)

1. Bei einem freien Beleg (Status im Pool) erscheint der Knopf **`'Zuweisen'`**.
2. Es öffnet der Dialog `'Beleg zuweisen — WE <Nr> · <Bereich> · <Menge> Teile'`.
3. Wählen Sie unter `'Mitarbeiter:in'` eine Person – ganz oben steht fett
   `'Mir zuweisen (Teamleitung)'`.
4. Weicht der Bereich ab, erscheint ein weicher Hinweis
   (`'Bereich-Hinweis: … Zuweisung bleibt möglich …'`) – bewusst entscheiden.
5. Optional `'Grund (optional)'` eintragen (wird protokolliert).
6. `'Zuweisen'` bestätigt, `'Abbrechen'` verwirft.

> Die Zuweisung über die WE-Nummer mit Plausibilitätsprüfung ist im **Mitarbeiterboard** (Kapitel
> B3) beschrieben.

## Beleg-Detail

Klick auf eine Zeile öffnet die Detailsicht mit der WE-Beleg-Nummer und Reitern (in dieser
Reihenfolge): `'Kopf'`, `'Priorität'`, `'Aufwand'`, `'Positionen'`, `'Boxen'`, `'Abschluss'`,
`'Problem'`, `'Historie'`.

| Reiter | Inhalt |
|---|---|
| `'Kopf'` | Stammdaten: WE-Belegnummer, Lieferschein, Filiale, Buchungsdatum, Lagerplatz, Shopbereich, Shops, Etage, `'Kartons (Anlieferung)'`, Etiketten, Belegmenge, Zugeteilt, DocuWare-Link `'Langzeitarchiv öffnen'`. |
| `'Priorität'` | Abschnitt (leer: `'– (Prio ist kein Abschnitt)'`), Prio-Flags, CatMan-Datum, Verladetag, Warenart. |
| `'Aufwand'` | Aufwandspunkte, geschätzte Minuten, Aufwandstreiber und die `'Aufwandsaufschlüsselung (Minuten)'`. |
| `'Positionen'` | je Position EAN, Größe, `'Soll'`, `'Ist'`, Status. |
| `'Boxen'` | Transportboxen: Box, Shopbereich, Etage, Menge, Boxzettel (`'Nicht nötig'` wenn nicht erforderlich), Plombe (`'Versiegelt'`/`'Offen'`). |
| `'Abschluss'` | ZST-Stand: gebuchte Menge, ZST-Datensätze, `'Exportiert (zst_done)'` / `'Noch nicht exportiert'`, Art `'Teilabschluss'`/`'Vollabschluss'`. |
| `'Problem'` | gemeldete Probleme; Freigabe erfolgt über die Kopf-Aktionen (Kapitel B5). |
| `'Historie'` | alle Ereignisse mit Zeit, Aktion und Verursacher (`'System'`, `'Mitarbeiter'`, `'Teamlead'`, `'Admin'`). |

Ein offenes Problem zeigt oben auf jedem Reiter das Banner `'Offenes Problem: <Art>'` mit dem Knopf
`'Zum Problem'`. Gehört der Beleg zu einer Lieferung, erscheint das Panel `'Zugehörige Lieferung'`
(siehe Kapitel B6).

## Archiv & DocuWare

Im Scope `'Archiv'` öffnet das DocuWare-Symbol den Beleg im Langzeitarchiv (Tooltip
`'Im DocuWare-Langzeitarchiv öffnen'`). Im `'Kopf'`-Reiter heißt der Link `'Langzeitarchiv öffnen'`.
Belege bleiben im System; DocuWare ist das dauerhafte Archiv.

## Tagesabschluss / ZST-Export

1. Scope `'Abgeschlossen'` wählen.
2. Knopf **`'Tagesabschluss / ZST-Export'`** – lädt eine Datei `zst-export-<Datum>.csv` herunter
   (während des Exports: `'Export läuft …'`). Bereits exportierte Belege werden **nicht** doppelt
   ausgegeben.

## Was passiert danach

- Zugewiesene Belege erscheinen im Bündel der Person und im Board.
- Nach dem ZST-Export gelten die Belege als endgültig übergeben.

## Häufige Fehler / FAQ

- **`'Belege konnten nicht geladen werden: …'`** – über `'Erneut laden'` erneut versuchen.
- **Kein `'Zuweisen'`-Knopf sichtbar** – der Beleg ist nicht (mehr) frei im Pool; ggf. schon
  zugeteilt, blockiert oder abgeschlossen.
- **Aufteilen eines großen Belegs** – über die Beleg-Aktion `'Aufteilen …'`; die Ergebnisse liegen
  unter `'Aufteilungen'` (`'Beleg <Nr> aufgeteilt — Leistung je Anteil unter „Aufteilungen".'`).
