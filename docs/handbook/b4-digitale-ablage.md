# B4 – Digitale Ablagen

## Zweck

Die Digitalen Ablagen ordnen alle Belege in **Bahnen (Lanes)** nach ihrer aktuellen Rolle im Tag –
ein schneller visueller Überblick, was wo liegt und was Aufmerksamkeit braucht.

## Wann anwenden

Für den schnellen Tagesüberblick, zum Auffinden von Problem- und geparkten Fällen und zum
Weiterleiten.

## Voraussetzungen

- Navigationseintrag `'Digitale Ablagen'` (Seitenüberschrift `'Digitale Ablagen'`).

## Die Bahnen (Lanes)

Die Bahnen liegen nebeneinander (waagerecht scrollbar); jede Bahn scrollt für sich. Reihenfolge und
Einklappen bleiben gespeichert.

| Bahn | Was darin liegt |
|---|---|
| `'Prio'` | „Manuell priorisiert oder Prio-Kennzeichen". |
| `'Jeden-Tag-Ware'` | „Abschnitt 7, 4, 8". |
| `'Verladeplan heute'` | „Abschnitt 1, 2, 3 – heutiger Verladetag". |
| `'Verladeplan morgen'` | „Vorausschau für Starterpakete". |
| `'Sonstige'` | „Übrige Ware ohne festen Verladetag". |
| `'Geparkt'` | „Aus Automatik ausgeschlossen". |
| `'Weitergeleitet'` | „An Abteilung weitergeleitet" (nach Empfänger gruppiert). |
| `'Problemfälle'` | „Offene Issues". |

## Ansicht anpassen und speichern

Über den Bahnkopf verschieben oder klappen Sie Bahnen ein:

- `'Lane nach links'`, `'Lane nach rechts'` – Bahn verschieben.
- `'Lane einklappen'` – Bahn schmal machen.

Reihenfolge und eingeklappte Bahnen werden automatisch gespeichert und bleiben beim nächsten Öffnen
erhalten. Eine leere Bahn zeigt `'Leer.'`

## Eine Karte lesen

Jede Karte zeigt WE-Nr, Lagerplatz, Status, Prio-Kennzeichen, ggf. `'Abschnitt <n>'`, ein
Problem-Kennzeichen und – falls weitergeleitet – `'→ <Empfänger>'`. Unten stehen `'<n> Teile'`,
Minuten und die zugeteilte Person.

- **Geparkt-Kontext:** Bei geparkten Karten zeigt der Status-Chip als Tooltip, wer wann und warum
  geparkt hat (`'Aus Automatik ausgeschlossen — von TL geparkt · … — „<Grund>"'`), oder
  `'Kontext unbekannt'`.
- **Problem-Vorschau:** Bei offenen Problemen erscheint eine Zeile `'<Art> — „<Notiz>"'`.

Karten-Knöpfe: `'Details'` (in der Bahn `'Problemfälle'` direkt zum Problem-Reiter), das
Weiterleiten-Menü und die Beleg-Aktionen (Kapitel B5).

## Bahn `'Weitergeleitet'`

Hier sind die Karten nach Empfänger gruppiert, z. B. `'Retourenabteilung (<n>)'` und
`'Lieferscheinbucher (<n>)'`. Zum Zurückholen nutzen Sie die Beleg-Aktion `'Zurückholen'`
(Kapitel B5).

## Was passiert danach

- Aktionen aus den Karten (freigeben, parken, weiterleiten, stornieren, priorisieren) wirken sofort
  und verschieben den Beleg in die passende Bahn.

## Häufige Fehler / FAQ

- **Eine Bahn ist leer** – dort liegt aktuell nichts (`'Leer.'`); das ist normal.
- **Ich finde einen Problemfall nicht** – prüfen Sie die Bahn `'Problemfälle'`; von dort führt
  `'Details'` direkt zum Problem-Reiter.
