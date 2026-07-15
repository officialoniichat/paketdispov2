# A4 – Positionen abarbeiten

## Zweck

Die einzelnen Artikelzeilen (Positionen) eines Belegs prüfen, auszeichnen, Mengen erfassen und als
geprüft markieren.

## Wann anwenden

Nachdem du die Arbeitsanweisung des Belegs gelesen hast (Kapitel A3), im selben Beleg-Bildschirm
unter `'Positionen'`.

## Voraussetzungen

- Beleg ist geöffnet, Ware liegt vor dir.

## Die Positionen-Tabelle (eine Tabelle, fixierte Kopfzeile)

Alle Positionen stehen in **einer** Tabelle. Die **Spaltenüberschriften bleiben beim Scrollen oben
stehen** – auch bei vielen Größenzeilen weißt du in jeder Zeile, welche Spalte du liest. Die Spalten
sind: `'Pos'`, `'EAN'`, `'Größe'`, (`'Online'`,) `'Soll'`, `'Ist'`, `'Mehr-/Mindermenge'`, `'EK'`,
`'VK'`, `'VK-Etikett'` und **`'VK korrigiert'`**.

Steht oben der Hinweis `'Jede Position prüfen – auch bei Prüfung Wareneingang = „Nein".'`, gilt: Du
gehst **jede** Position durch, egal welche Prüfstufe.

## Eine Position lesen

Jede Position hat oben einen Kopfblock, der zeigt:

- **`'Pos <Nr>'`**, Artikelnummer · Farbe des Lieferanten;
- **`'HShop <Nr> · Shop <Nr>'`** (Hauptshop und Shopnummer) und **`'Order <Nr>'`** (Ordernummer –
  hilft der Teamleitung beim Klären von Problemen);
- `'WGR <Nummer> <Bezeichnung>'` (Warengruppe im Klartext), ggf. `'· Saison <…>'`;
- rechts die Sollmenge `'Soll gesamt <Menge>'`, den Knopf **`'Position geprüft'`** und den roten
  Knopf **`'Problem'`**.

Zusätzliche Kennzeichen erscheinen nur, wenn sie zutreffen, z. B. `'♻️ NOS'`, den **CatMan-Termin**
mit Datum **`'CatMan <TT.MM.JJJJ>'`**, `'🏷️ Etikett'`, `'🔒 Sicherung'`, `'🌐 Online'`,
`'🔴 Rotpreis'`. Dazu ggf. Hinweiszeilen wie `'Etikett anbringen: <Ort>'`, `'Sichern: <Ort>'`,
`'Online: <Ort>'`, `'Hinweis: <Text>'`.

## Preisetikett & Sicherungs-Piktogramm

- **Preisetikett**: Wo `'🏷️ Etikett'` steht, bringst du am angegebenen Ort das Preisetikett an
  (`'Etikett anbringen: <Ort>'`).
- **Sicherung**: Wo `'🔒 Sicherung'` steht, siehst du – wenn hinterlegt – ein **Piktogramm** des
  Sicherungstyps und den Text `'Sicherungstyp: <Typ>'`. Mögliche Typen: `'Hartetikett'`,
  `'Farbetikett'`, `'Spinnensicherung'`, `'Safer-Box'`, `'Kabelschloss'`. Sichere die Ware genau so.

## Online-Größen verstehen (rot/grün)

Pro Größe kann ein Online-Kennzeichen stehen:

- **grün** = `'Onlineartikel-Highlight'`
- **rot** = `'Onlineartikel'`

Behandle die markierten Größen entsprechend der Online-Vorgabe (`'Online: <Ort>'`).

## Mengen erfassen (Mehr-/Mindermengen pro Größe)

Jede Größe ist eine eigene Zeile mit den Spalten `'EAN'`, `'Größe'`, `'Soll'`, `'Ist'`,
`'Mehr-/Mindermenge'`, `'EK'`, `'VK'`, `'VK-Etikett'`, `'VK korrigiert'`.

So zählst du:

1. In der Spalte `'Ist'` stehen ein **`'−'`**- und ein **`'+'`**-Knopf, dazwischen deine erfasste
   Menge.
2. Zähle die tatsächliche Menge und stelle sie mit **`'−'`** / **`'+'`** ein.
3. Weicht `'Ist'` von `'Soll'` ab, wird die Zahl **rot**, die **ganze Zeile wird rot markiert** und
   in der Spalte `'Mehr-/Mindermenge'` erscheint ein Chip:
   - **`'+<n> Mehrmenge'`** (mehr geliefert als Soll)
   - **`'−<n> Mindermenge'`** (weniger geliefert als Soll)

> **Wichtig:** Mengenabweichungen erfasst du **hier** mit `'−'`/`'+'`, **nicht** über „Problem".
> Eine Mengenabweichung ist **automatisch ein Problem** – der Beleg lässt sich dann nur noch über den
> **`'Teilabschluss (Problem melden)'`** abschließen (Kapitel A5/A6).

## Preis korrigieren (Spalte „VK korrigiert")

Weicht der tatsächliche Kassenpreis vom Etikett ab, trägst du ihn **in derselben Zeile** in der
Spalte **`'VK korrigiert'`** ein (Feld `'Preis'`). Auch das markiert die Zeile **rot** und ist
**automatisch ein Problem** – ohne separaten Dialog.

## „Position geprüft" setzen und zurücknehmen

- Hast du eine Position fertig geprüft, tippe **`'Position geprüft'`**.
- Sie wird dann als grüner Haken `'Position geprüft ✓'` angezeigt. Tippst du erneut, nimmst du die
  Prüfung wieder zurück (Umschalter).
- Stimmt an einer Position etwas nicht (falscher Artikel, Farbe, Größe, Schaden …), tippe den roten
  Knopf **`'Problem'`** an der Position → weiter mit Kapitel A6.

## Was passiert danach

- Erst wenn **alle** Positionen als `'Position geprüft ✓'` markiert sind und **kein offenes
  Problem** besteht, lässt sich der Beleg abschließen (Kapitel A5).

## Häufige Fehler / FAQ

- **Ich kann den Beleg nicht abschließen** – wahrscheinlich ist noch eine Position ungeprüft. Es
  erscheint `'Noch offen: Noch nicht alle Positionen geprüft'`.
- **Falsche Menge geliefert** – mit `'−'`/`'+'` erfassen (ergibt `'+<n> Mehrmenge'`/
  `'−<n> Mindermenge'`); das ist automatisch ein Problem, du musst es nicht zusätzlich melden.
- **Preis am Etikett falsch** – in der Spalte `'VK korrigiert'` den echten Preis eintragen; auch das
  ist automatisch ein Problem.
- **Größe/Artikel/Farbe falsch oder Ware beschädigt** – roter Knopf `'Problem'` an der Position.
