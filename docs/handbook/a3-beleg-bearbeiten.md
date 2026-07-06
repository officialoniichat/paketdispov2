# A3 – Beleg bearbeiten

## Zweck

Einen einzelnen Beleg bearbeiten: die Arbeitsanweisung Schritt für Schritt abarbeiten und die Ware
korrekt auszeichnen.

## Wann anwenden

Wenn du die Ware geholt hast und einen Beleg öffnest (`'Start Bearbeitung WE <Nummer>'` oder Tippen
auf eine Karte in `'2 · Bearbeiten'`).

## Voraussetzungen

- Alle Stops des Bündels geholt (Kapitel A2).

## Die Bearbeiten-Liste verstehen (`'2 · Bearbeiten'`)

Jede Beleg-Karte zeigt:

- ein **Warenart-Icon**: Regal 🗄️, Palette 🟧, Hängeware 🧥, gemischt 📦;
- **`'WE <Nummer>'`** (fett);
- den Lagerplatz-Code, bei Hängeware zusätzlich `'· <Anzahl> Teile'`;
- optional eine Warenart wie `'Vororder'`, `'Nachorder'`, `'NOS'`, `'Extrabestellung'`;
- einen Status: `'Offen'`, `'In Arbeit'`, `'Fertig'`, `'Teilabschluss'` oder `'Problem'`.

## Der Beleg-Bildschirm

Oben steht `'‹ Zurück'`, darüber der Lagerplatz-Code, und als große Überschrift
**`'WE <Nummer>'`**. Gibt es mehrere Kartons, steht darunter
`'📦 <Anzahl> Karton / Kartons – alle auf dem Karren suchen!'` – ein Hinweis, dass zu diesem Beleg
mehrere Kartons gehören, die du **alle** brauchst.

Im Kopf siehst du die **Warenart** (z. B. `'Vororder'`) und die Gesamtmenge `'<Anzahl> Teile'`.
Statt technischer Abschnitts-Nummern zeigt die App bewusst die Warenart-Bezeichnung.

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
  Positionen als Rotpreis aus. An der Position selbst erscheint dazu das Kennzeichen `'🔴 Rotpreis'`.
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
