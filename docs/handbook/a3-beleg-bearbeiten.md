# A3 – Beleg bearbeiten

## Zweck

Einen einzelnen Beleg bearbeiten: die Arbeitsanweisung Schritt für Schritt abarbeiten und die Ware
korrekt auszeichnen.

## Wann anwenden

Wenn du die Ware eines Belegs geholt hast und ihn durch Tippen auf seine Karte in
`'2 · Bearbeiten'` öffnest. **Du bestimmst die Reihenfolge selbst** — es gibt keinen
vorgegebenen „Start"-Beleg.

## Voraussetzungen

- Der Lagerplatz-Stop des Belegs ist geholt (Kapitel A2). Belege noch nicht geholter Stops sind
  ausgegraut.

## Die Bearbeiten-Liste verstehen (`'2 · Bearbeiten'`)

Jede Beleg-Karte zeigt (in dieser Reihenfolge):

- ein **Lagerplatz-Icon**: Regal (Raster), Palette (Stapel), Hängeware (Kleiderbügel), gemischt
  (Karton);
- **`'WE <Nummer>'`** (fett);
- **`'Filiale <Nummer>'`** und **`'Shopbereich <Nummer>'`** — so kannst du Zusammengehörendes
  nacheinander abarbeiten;
- **`'<Anzahl> Kartons'`** (fett) — **nur, wenn zu dem Beleg mehr als ein Karton gehört**. Auf dem
  Lagerplatz stehen auch Kartons anderer Aufträge; deine erkennst du an der WE-Nummer, aber erst
  diese Zahl sagt dir, wann du vollständig bist. Steht dort nichts, ist es ein einzelner Karton
  (oder die Anzahl wurde beim Buchen nicht erfasst);
- **`'Etikettendruck'`** (mit Etiketten-Symbol) oder **`'Digitale Etiketten'`**;
- den **CatMan-Termin** als **`'CatMan <TT.MM.JJJJ>'`** mit Kalender-Symbol, falls der Beleg einen
  hat — bis dahin muss die Ware auf der Verkaufsfläche stehen. Ist der Termin schon vorbei, steht
  der Chip **rot** als **`'CatMan <TT.MM.JJJJ> · überfällig'`**. Der Termin ist **nur zur
  Kontrolle**: er ändert weder die Reihenfolge deiner Belege noch sperrt er etwas;
- optional eine Warenart wie `'Vororder'`, `'Nachorder'`, `'NOS'`, `'Extrabestellung'`;
- einen Status: `'Offen'`, `'In Arbeit'`, `'Fertig'`, `'Problem gemeldet'` (rot) oder `'Geklärt'`
  (grün). Ein rot geparkter Beleg (`'Problem gemeldet'`) lässt sich nicht öffnen – er wartet auf die
  Klärung durch die Teamleitung (Kapitel A5);
- bei einem **geteilten Beleg** (Kapitel A7) eine **goldene** Markierung mit
  `'Geteilt mit <Name>'` bzw. `'Geteilt · <n> Personen'` und dem gemeinsamen Fortschritt
  `'<geprüft>/<gesamt> geprüft'`.

Belege, bei denen **du** als Helfer mitarbeitest, gehören nicht zu deinem Bündel, stehen unter
**`'2 · Bearbeiten'`** aber **ganz oben** – vor deinen eigenen. Sie sind nie ausgegraut, und die
Ware holt der Inhaber.

## WE-Nummer als Barcode (Etiketten per Scanner anfordern)

Unter jeder Beleg-Karte gibt es den Knopf **`'Barcode anzeigen'`** — bei **jedem** Beleg, egal ob
Etiketten nötig sind oder nicht. Er klappt die WE-Beleg-Nummer direkt in der Karte als
**Code-128-Barcode** auf (kein neues Fenster). Damit forderst du Etiketten per Scanner an.
`'Barcode ausblenden'` klappt ihn wieder zu.

## Der Beleg-Bildschirm

Oben steht `'‹ Zurück'`, darüber der Lagerplatz-Code, und als große Überschrift
**`'WE <Nummer>'`**.

Im Kopf siehst du die **Warenart** (z. B. `'Vororder'`) und die Gesamtmenge `'<Anzahl> Teile'`.
Statt technischer Abschnitts-Nummern zeigt die App bewusst die Warenart-Bezeichnung.

Trägt der Beleg einen **CatMan-Termin**, steht er daneben als `'CatMan <TT.MM.JJJJ>'` – bzw. rot als
`'CatMan <TT.MM.JJJJ> · überfällig'`, wenn er schon vorbei ist. Angezeigt wird der **früheste** Termin
des Belegs, damit du ihn nicht in den Positionszeilen suchen musst; welche Position genau wann fällig
ist, steht weiterhin an der Position selbst (Kapitel A4).

Bei einem **geteilten Beleg** steht oben rechts zusätzlich der Umschalter **`'Team-Ansicht'`**: Er
teilt den Bildschirm und zeigt rechts, wie weit die anderen Beteiligten sind. `'Position geprüft'`
trägt dann die Initialen der Person, die geprüft hat, und der Hauptknopf unten heißt zunächst
`'Teilbeleg erledigt'` (Kapitel A7).

## Die Arbeitsanweisung Schritt für Schritt

Unter `'Arbeitsanweisung'` steht eine **nummerierte Liste**. Sie kommt aus den Beleg-Daten – arbeite
sie von oben nach unten ab. Typische Punkte:

1. **`'Nach Artikel, Farbe, Größe sortieren'`** – Wert `'Ja'`/`'Nein'`.
2. **`'Prüfung Wareneingang'`** – wie genau geprüft wird (siehe unten). Wert `'Nein'`, `'Ja'` oder
   ein Prozentwert wie `'30 %'`; dahinter ggf. die Prüfstufe.
3. **`'Sicherungsetikett'`** – z. B. `'Sichern für die Position(en): 1, 2'`.
4. **`'Rotpreis'`** – z. B. `'für Position(en): 1'`.
5. **`'Beschriftung Boxzettel'`** – `'Ja'`/`'Nein'`.
6. **`'Online-Handling'`** – nur wenn nötig.

Manche Schritte tauchen **absichtlich nicht** als eigener Punkt auf: Das Drucken der Preisetiketten
passiert vorgelagert, das Anbringen steht direkt an der jeweiligen Position (Kapitel A4), und der
Tagwerk-Stempel (ZST) wird über den Knopf `'Beleg erledigt'` gesetzt.

## Prüfstufen verstehen – „Nein" heißt nicht „nichts"

Beim Punkt `'Prüfung Wareneingang'` kannst du auf **`'Was heißt das?'`** tippen, um die Erklärung
aufzuklappen (`'Weniger'` klappt wieder zu). **Wichtig:** Auch bei `'Nein'` prüfst du etwas!

| Prüfstufe | Was du tust |
|---|---|
| **`'Nein'`** | Keine Wareneingangsprüfung. Nur Mindestmengen-Check: Kartons zählen und Beleg-Gesamtmenge plausibilisieren. |
| **`'10 %'`** | Stichprobe: jede zehnte Position vollständig auszählen (EAN, Größe, Menge), Abweichungen als Problem melden. |
| **`'20 %'`** | Stichprobe: jede fünfte Position vollständig auszählen, zusätzlich Größenlauf und Farbe mit den Solldaten abgleichen. |
| **`'Voll'`** | Vollprüfung: jede Position und jede EAN/Größen-Zeile komplett zählen, Preise/Etiketten kontrollieren, jede Abweichung dokumentieren. |

## Rotpreis & Boxzettel

- **Rotpreis**: Steht `'Rotpreis'` in der Arbeitsanweisung (mit Positionsangabe), zeichnest du diese
  Positionen als Rotpreis aus. An der Position selbst erscheint dazu das Kennzeichen `'Rotpreis'`.
- **Boxzettel**: Ganz unten am Beleg findest du unter `'Boxzettel'` je Box eine Karte mit
  `'Box <n>'`, der Teile-Zahl, Shop-Angaben und der Warenart. Der Boxzettel ist **nur zur Info** und
  blockiert den Abschluss nicht.

## Was passiert danach

- Als Nächstes arbeitest du die **Positionen** ab (Kapitel A4).
- Abschließen kannst du erst, wenn die Abschluss-Bedingungen erfüllt sind (Kapitel A5).

## Häufige Fehler / FAQ

- **Ich sehe keinen Druck-Schritt** – richtig so: Das Drucken ist vorgelagert und kein eigener
  Schritt in dieser Liste.
- **„Prüfung: Nein" – muss ich wirklich zählen?** – Ja, den Mindestmengen-Check (Kartons zählen,
  Gesamtmenge plausibilisieren) machst du immer. Tipp `'Was heißt das?'` für die genaue Erklärung.
