# Runbook 50 — Probleme erfassen (Position/SKU) + Teilabschluss-Zwang

**Zweck:** Verifiziert die neue Problem-Erfassung der Mitarbeiter-App (`976d2fe`): Problem **pro
Position/SKU** mit **Problemart aus dem dynamischen Katalog**, **farbliche Markierung**, **KEIN
beleg-weites „Problem melden"**; **Mehr-/Minderlieferung + Preisabweichung erzeugen automatisch
ein Problem** und **erzwingen den Teilabschluss**; **Sammel-Meldung erst beim Teilabschluss**.

> ⚠️ **Dieses Runbook erzeugt Probleme und parkt den Beleg rot.** Der Kreislauf wird in
> **Runbook 60** (Teamlead klärt → MA erledigt) geschlossen. NICHT hier stehen bleiben —
> siehe „Weiter zu Runbook 60" am Ende.

**Voraussetzung:** Runbook 40 (Beleg **WE 3.540.946** geöffnet, Positionen-Tabelle sichtbar).

---

## Schritte

| # | Aktion | Erwartet | Ergebnis |
|---|--------|----------|----------|
| 1 | An Position 1 den Button **Problem** klicken | Dialog **„Problem melden – Position 1"**; Text „Das Problem wird **beim Teilabschluss gesammelt** an die Teamleitung gesendet."; Felder **Problemart\*** + **Größe (optional)** | **PASS** (Sammel-Meldung erst bei Teilabschluss) |
| 2 | Dropdown **Problemart** öffnen | Liste = **dynamischer Katalog** aus Runbook 20 (erste Option „falscher Artikel", …) → beweist **PWA übernimmt Katalog dynamisch** (`GET /api/problem-reasons`) | **PASS** |
| 3 | Einen Grund wählen (hier: **beschädigt**) → **Problem erfassen** | Position 1 erhält **rotes Chip „beschädigt ✕"** (farbliche Markierung, mit Entfernen-Kreuz) | **PASS** |
| 4 | Prüfen, ob es einen **beleg-weiten** „Problem melden"-Knopf gibt | **Nein** — nur **Problem pro Position** (5×) + document-level **„Teilabschluss (Problem melden)"**. Kein case-scope „Problem melden" | **PASS** (Punkt 8: kein beleg-weites Problem) |
| 5 | Bei Pos 2 · Größe 38 die **Ist**-Menge per **−** von 6 auf 4 senken | Spalte **Mehr-/Mindermenge** zeigt automatisch **„−2 Mindermenge"** → **implizites Problem** ohne Dialog | **PASS** (Mindermenge erzeugt Problem) |
| 6 | Bei Pos 1 · Größe 38 in **VK korrigiert** `12,90` eintragen (Original 14,50 / VK-Etikett 34,80) | Preiskorrektur wird als **implizites Preisabweichungs-Problem** geführt | **PASS** (Preisabweichung erzeugt Problem) |
| 7 | Statuszeile unten lesen + **Beleg erledigt** klicken | „**Abweichung/Problem erfasst – nur Teilabschluss möglich** …"; **„Beleg erledigt" bleibt wirkungslos/gesperrt** (Beleg wird NICHT abgeschlossen) | **PASS** (Beleg-erledigt-Guard) |
| 8 | **Teilabschluss (Problem melden)** klicken | Dialog **„Teilabschluss mit Problemen"**: „…rot geparkt und ist nicht bearbeitbar. Sobald die Teamleitung geklärt hat, kommt er grün markiert zu dir zurück." — **Zusammenfassung** aller Probleme, **kein Freitext-Feld**: <br>• **beschädigt — Position 1** <br>• **Minderlieferung −2 — Position 2 · 38** (Soll 6 · Ist 4 · 401232040946) <br>• **Preisabweichung — Position 1 · 38** (VK-Etikett 34,80 € → korrigiert 12,90 €) <br>Buttons: **Abbrechen** / **An Teamleitung senden** | **PASS** (Sammel-Zusammenfassung, kein Freitext) |
| 9 | **An Teamleitung senden** | Zurück zum Home-Screen; **WE 3.540.946** jetzt **rot** in „2 · Bearbeiten": „**Wartet auf Klärung durch die Teamleitung – nicht bearbeitbar.**", Badge **„Problem gemeldet"** | **PASS** (rot geparkt beim SELBEN MA) |

**Screenshots:** `screenshots/50-01-problemdialog-katalog.*`, `50-02-rotes-chip-beschaedigt.*`,
`50-03-mindermenge-minus2.*`, `50-04-status-nur-teilabschluss.*`,
`50-05-teilabschluss-zusammenfassung.*`, `50-06-rot-geparkt-home.*`

---

## Belegte Kundenforderungen (14.07)
- ✅ Problem **pro Position/SKU** mit Grund aus **admin-verwaltetem, dynamischem Katalog**.
- ✅ **Farbliche Markierung** (rotes Grund-Chip an der Position).
- ✅ **Kein beleg-weites „Problem melden"** — nur per Position; document-level nur Teilabschluss.
- ✅ **Mehr-/Minderlieferung** (Ist≠Soll) **und Preisabweichung** (VK korrigiert) erzeugen
  **automatisch** ein Problem und **erzwingen** den Teilabschluss („Beleg erledigt" gesperrt).
- ✅ **Sammel-Meldung erst beim Teilabschluss** (kein Freitext-Grund mehr) — alle Probleme
  gebündelt in der Bestätigungs-Zusammenfassung.

## Beobachtungen (siehe Runbook 90)
- Der Problemart-Dialog wird auf breitem Desktop-Viewport rechts unten (Bottom-Sheet-Stil)
  gerendert und ragt teils aus dem Sichtbereich; auf Mobil (Zielgerät) unkritisch.
- Nach dem Teilabschluss taucht die Hol-Aufgabe **HB-5/234 (WE 3.540.946)** in „1 · Ware holen"
  wieder als „offen" auf, obwohl der Beleg rot geparkt ist — rein kosmetisch.

## ⚠️ Endzustand dieses Runbooks = NICHT sauber (bewusst)
Es existiert jetzt **1 rot geparkter Problemfall** (WE 3.540.946) mit 3 offenen Problemen.
**Der Kreislauf MUSS geschlossen werden → weiter mit [Runbook 60](60-teilabschluss-loop.md)**
(Teamlead klärt → MA erledigt). Erst danach ist der Zustand verwaisungsfrei.

**Verdikt Runbook 50: PASS** (Auflösung in Runbook 60)
