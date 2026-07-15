# Runbook 60 — Teilabschluss-Loop schließen (MA → Teamlead → MA → fertig)

**Zweck:** Schließt den in **Runbook 50** geöffneten Problem-Loop vollständig: Teamlead sieht den
**gesammelten** Problemfall (nicht pro Position verstreut), **Ordernummer/WE-Nr/Lieferschein**
sichtbar, klärt per **„Probleme geklärt"**; der Beleg kommt beim **selben MA grün & bearbeitbar**
zurück; der MA **setzt fort und schließt ab** (`Beleg erledigt` → `completed`). Endzustand: kein
verwaister Problemfall.

**Voraussetzung:** Runbook 50 hat einen Beleg rot geparkt (hier WE 3.540.946 mit 3 Problemen).
**Zugang:** Cockpit `http://localhost:5174` (tl-001) + Mitarbeiter-App `http://localhost:5175` (ma-101).

---

## Teil A — Teamlead klärt (Cockpit)

| # | Aktion | Erwartet | Ergebnis |
|---|--------|----------|----------|
| 1 | Cockpit → **Tagescockpit** | Kachel **„Probleme offen: N — Belege mit gemeldetem Problem"**; Pool-Zeile „… davon mit offenem Problem"; Button **Ansehen →** | **PASS** |
| 2 | **Ansehen →** klicken | Board **Digitale Ablagen**; Lane **Problemfälle** enthält die Karte **3.540.946** (HB-5/234) mit Chips **Problem** + **TL-Priorität**, Kurzinfo **Minderlieferung**, **ma-101**, Aktionen **Details** / **Probleme geklärt** | **PASS** (gesammelter Problemfall) |
| 3 | **Details** öffnen (→ `/belege/…?tab=problem`) | Kopf: **WE-Nr: 3.540.946**, **Lieferschein: LS-25-136**; Hinweis „**Ordernummer je Position bei den einzelnen Problemen.**"; „Zugehörige Lieferung ×2" (erkannt über gleiche Lieferschein-Nr); **alle 3 Probleme gesammelt** mit Grund + Position + **Order-Nr** + Delta/Preis: <br>• **Minderlieferung** · Pos 2 · **Order ORD-3.540.946-2** · 38 · 401232040946 · **−2 Teile** <br>• **Preisabweichung** · Pos 1 · **Order ORD-3.540.946-1** · 38 · **VK-Etikett 34,80 € → korrigiert 12,90 €** <br>• **beschädigt** · Pos 1 · **Order ORD-3.540.946-1** | **PASS** (Grund/Order/Delta/Preis; WE-Nr + Lieferschein prominent; **Ordernummer sichtbar**) |
| 4 | **Probleme geklärt** klicken | Dialog „Probleme geklärt · Beleg 3.540.946", optionale **Anmerkung** (auditiert §8.4) + Schnell-Chips (Mit Mitarbeiter besprochen / Daten korrigiert / Lieferant informiert) | **PASS** |
| 5 | Chip „Mit Mitarbeiter besprochen" wählen, **Probleme geklärt** bestätigen | Kopf-Chip wechselt auf **Geklärt** (grün); Lieferungszeile 3.540.946 = **Geklärt**; alle Issues resolved | **PASS** |

## Teil B — MA setzt fort & schließt ab (Mitarbeiter-App)

| # | Aktion | Erwartet | Ergebnis |
|---|--------|----------|----------|
| 6 | Mitarbeiter-App neu laden | WE 3.540.946 in „2 · Bearbeiten" jetzt **grün**: „**Geklärt – zur Weiterbearbeitung freigegeben.**", Badge **Geklärt** (nicht mehr „Problem gemeldet"/rot) | **PASS** (grün & bearbeitbar zurück beim SELBEN MA) |
| 7 | Beleg-Karte anklicken (öffnet den Beleg **über den Home-Screen** → Zustand `problem_resolved → in_progress`, Event `case.resumed`) | Prozess-Screen bearbeitbar; frühere Abweichungen zurückgesetzt (Fortschritt ist client-lokal) | **PASS** |
| 8 | Alle Positionen **Position geprüft**, dann **Beleg erledigt** | Beleg wird abgeschlossen (`case.completed`), verschwindet aus der Arbeitsliste | **PASS** (verifiziert via DB: `status = completed`, `case.resumed` → `case.completed`) |

**Screenshots:** `screenshots/60-01-cockpit-problemfaelle-lane.*`, `60-02-problemdetail-order-lieferschein.*`,
`60-03-probleme-geklaert-dialog.*`, `60-04-geklaert-gruen.*`, `60-05-ma-gruen-bearbeitbar.*`,
`60-06-beleg-completed.*`

---

## Belegte Kundenforderungen (14.07)
- ✅ **Teilabschluss ohne Freitext-Dialog** (nur Zusammenfassung + „An Teamleitung senden", Runbook 50).
- ✅ Beleg **rot geparkt beim selben MA**, nicht bearbeitbar (Runbook 50).
- ✅ Cockpit zeigt den Problemfall **gesammelt** (ein Fall, alle Positions-Probleme darunter), **nicht** pro Position verstreut.
- ✅ **Ordernummer je Problem** + **WE-Nr** + **Lieferschein** für die Teamlead-Zuordnung sichtbar.
- ✅ „Probleme geklärt" → Beleg **grün & bearbeitbar** zurück beim MA → **fertig bearbeitet**.
- ✅ Kreislauf **MA → Teamlead → MA → completed** vollständig geschlossen.

## ⚠️ Wichtiger Bedienhinweis (verifiziert)
„Beleg erledigt" funktioniert nur, wenn der Beleg über den **Home-Screen** geöffnet wurde
(erzeugt `case.resumed`, `problem_resolved → in_progress`). Wird der Beleg per **Direkt-URL**
geöffnet, bleibt er `problem_resolved` und „Beleg erledigt" ist wirkungslos (kein Server-Event).
Für den Piloten unkritisch (der MA öffnet immer über die Liste); siehe Runbook 90 (Beobachtung B4).

## Endzustands-Check
- ✅ 3.540.946: `completed`, **0 offene Probleme**. Kein rot geparkter Rest-Problemfall.
- ✅ Problemfälle-Lane / Dashboard zeigen den geklärten Fall nicht mehr als offen.
- Reproduktions-Sauberkeit garantiert zusätzlich der abschließende **`standard`-Reload** (Runbook 90).

**Verdikt Runbook 60: PASS** — Kreislauf geschlossen, kein verwaister Zustand.
