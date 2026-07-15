# Runbook 40 — Positionen-Tabelle (BelegProcessScreen)

**Zweck:** Verifiziert die neue Positionen-Tabelle der Mitarbeiter-App (Teil von `976d2fe`):
**CatMan-Termin** pro Position, **Hauptshop/Shopnummern + Order-Nr** in der Kopfzeile (gleiche
Schriftgröße wie Art-Nr), **fixierte (sticky) Kopfzeile** beim Scrollen, **VK-korrigiert**-Spalte
(Preisabweichung) hinter dem VK-Etikett, Mengen-/Preis-Eingabe **an der EAN/SKU-Zeile**.

**Voraussetzung:** Runbook 30 (Bündel mit Belegen, mind. ein Beleg geholt/startbar).
**Zugang:** Mitarbeiter-App → einen Beleg in „2 · Bearbeiten" öffnen (hier: **WE 3.540.946**).

---

## Schritte

| # | Aktion | Erwartet | Ergebnis |
|---|--------|----------|----------|
| 1 | Beleg **WE 3.540.946** öffnen | Kopf: HB-5/234, WE 3.540.946, „3 Kartons – alle auf dem Karren suchen!", Badge **NOS_Nachorder**, **64 Teile**, Abschnitt **Arbeitsanweisung** (Sortieren, Prüfung Wareneingang 10 %, Sicherungsetikett …) | **PASS** |
| 2 | Nach unten zur Sektion **Positionen** scrollen | Tabellenkopf: **Pos · EAN · Größe · Online · Soll · Ist · Mehr-/Mindermenge · VK · VK korrigiert**; Hinweis „Dieser Fortschritt geht beim Neuladen der Seite verloren – erst ‚Beleg erledigt' oder der Teilabschluss sichert ihn dauerhaft." | **PASS** |
| 3 | Positions-Kopfzeile Pos 1 lesen | **ART-001 · schwarz** · **HShop 21 · Shop 21** · **Order ORD-3.540.946-1** — alle in Art-Nr-Schriftgröße; Chips: **CatMan 16.07.2026**, **Etikett**, **Sicherung**; Unterzeile WGR 218110 D-Bermuda, Sicherungstyp Hartetikett | **PASS** (CatMan-Termin, HShop/Shop, Order-Nr, Größe wie Art-Nr) |
| 4 | SKU-Zeile lesen | Je Größe eine Zeile: EAN (z. B. 401231040946), **Größe** (38/40), Online-Chip, **Soll**, **Ist** als **−/+ Stepper**, **VK** (z. B. 14,50) | **PASS** (Eingabe an der EAN-Zeile) |
| 5 | Weiter nach unten scrollen (bis Pos 3) | Tabellenkopf **bleibt fixiert** oben stehen (sticky), während die Positionszeilen durchlaufen; Pos 3 = ART-003 · rot · HShop 21 · Shop 21 · Order ORD-3.540.946-3 | **PASS** (sticky Header) |
| 6 | Spalte **VK korrigiert** prüfen (`read_page`/`find`) | Pro SKU-Größe ein **Zahlen-Eingabefeld** „Größe N: VK korrigieren" hinter dem VK-Wert (refs ref_54/ref_62/…) | **PASS** (DOM-bestätigt; funktional in Runbook 50 ausgelöst) |

**Screenshots:** `screenshots/40-01-belegkopf-arbeitsanweisung.*`, `40-02-positionen-kopfzeile-catman-hshop-order.*`,
`40-03-sticky-header-pos3.*`, `40-04-vk-korrigiert-spalte.*`

---

## Belegte Kundenforderungen (14.07)
- ✅ **CatMan-Termin pro Position** (Chip „CatMan 16.07.2026").
- ✅ **Hauptshop/Shopnummern** in der Kopfzeile, Schriftgröße wie Art-Nr („HShop 21 · Shop 21").
- ✅ **Order-Nr** in der Kopfzeile („Order ORD-3.540.946-1") — Ordernummer zur Fehlerlösung.
- ✅ **Fixierte Kopfzeile** beim Scrollen (sticky TableHead).
- ✅ **VK-korrigiert**-Feld pro SKU/Größe hinter dem VK-Etikett.
- ✅ Eingaben (Ist-Menge via Stepper, VK-Korrektur) direkt **an der EAN/SKU-Zeile**.

## Hinweis (Ansicht)
Die Mitarbeiter-App ist mobile-first; die Positionen-Tabelle ist breiter als der sichtbare
Bereich und scrollt horizontal. Die Spalte „VK korrigiert" liegt rechts außen und ist per DOM
(6 Preis-Korrektur-Inputs) sicher nachgewiesen; ihr funktionaler Effekt (implizites Problem +
Teilabschluss-Zwang) wird in Runbook 50 im Bild gezeigt.

## Endzustands-Check
- Nur Ansicht/Lesen — keine Eingabe gespeichert, kein Problem erzeugt. Kein verwaister Zustand.

**Verdikt Runbook 40: PASS**
