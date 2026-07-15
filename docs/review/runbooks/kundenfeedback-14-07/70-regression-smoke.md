# Runbook 70 — Regression-Smoke (Kern-Flows ohne Probleme)

**Zweck:** Sicherstellen, dass die Kundenfeedback-Änderungen **nichts Bestehendes gebrochen** haben.
Happy-Path ohne Probleme über beide Apps, plus Konsole/Netzwerk auf Fehler prüfen.

**Voraussetzung:** Runbook 10 (`standard`). Für einen frisch zugeteilten Bündel braucht es aktive
Schichten + gelaufene Automatik zur eingestellten Server-Zeit (sonst „Kein Bündel zugeteilt").

---

## Schritte

| # | Aktion | Erwartet | Ergebnis |
|---|--------|----------|----------|
| 1 | **MA-Login**: Mitarbeiter-App → Mitarbeiternummer `ma-101` → **Anmelden** | Home „Guten …, Anna Berger · Arbeitsplatz: Tisch 1" | **PASS** |
| 2 | **Teamlead-Login**: Cockpit `http://localhost:5174` (Dev-Token) | „Teamlead-Dashboard" lädt | **PASS** |
| 3 | **Ware holen**: Hol-Aufgabe (z. B. HB-5/234) antippen | Zeile **✓ geholt**, „n/n Plätze"; zugehöriger Beleg wird startbar | **PASS** |
| 4 | **Position prüfen**: Beleg öffnen → je Position **Position geprüft** | Positionen als geprüft markiert; keine Abweichung | **PASS** |
| 5 | **Beleg erledigt** (ohne Problem, alle geprüft, Ist = Soll) | Beleg wird `completed`, verschwindet aus der Liste (verifiziert: `case.resumed`→`case.completed` bzw. direkt `case.completed`) | **PASS** |
| 6 | **Mitarbeiterboard** (Cockpit → Mitarbeiterboard) | Board rendert; aktive/ freie Mitarbeiter-Zeilen | **PASS** (rendert; bei großen Mengen bekannt langsam — Alt-Thema, kein Regress) |
| 7 | **Belege-Liste** (Cockpit → Belege) | Liste rendert, Filter/Suche vorhanden | **PASS** |
| 8 | **Digitale Ablagen** (Board) | Lanes rendern (Problemfälle/Geparkt/Weitergeleitet/…) | **PASS** |
| 9 | **Konsole prüfen** (`read_console_messages`) | Keine App-Fehler | **PASS** (nur `favicon.ico` 404 = harmlos) |
| 10 | **Netzwerk prüfen** (`read_network_requests`) | Keine 5xx auf `/api/*` im Happy-Path | **PASS** |

**Screenshots:** `screenshots/70-01-ma-login.*`, `70-02-ware-geholt.*`, `70-03-position-gepr.*`,
`70-04-beleg-completed.*`, `70-05-board.*`, `70-06-belege-liste.*`, `70-07-ablagen.*`

---

## Konsole/Netzwerk-Befund (Verifikationslauf 2026-07-15)
- Konsole (teamlead-web): nur `Failed to load resource: 404 favicon.ico` + gelegentliche
  React-DevTools-Info. **Keine** JS-Errors im Happy-Path.
- Eine MUI-Warnung „out-of-range value … for the select component" trat einmalig auf der
  Ablagen-Ansicht auf (leerer Select-Wert). Kosmetisch, kein Funktionsfehler → Runbook 90 (B3).
- Mitarbeiter-PWA: sauber; Code-128-Barcode und Positionen-Tabelle rendern ohne Fehler.

## Beobachtung (siehe Runbook 90)
- **B1 (Ansicht):** Mitarbeiter-PWA auf breitem Desktop-Viewport hat viel Kopf-Leerraum und die
  letzte Beleg-Karte kann per Scroll schwer erreichbar sein (mobile-first Layout). Auf dem
  Zielgerät (Tablet/Scanner) unkritisch.

## Endzustands-Check
- ✅ Happy-Path-Belege sauber `completed`; kein Problem erzeugt → **kein verwaister Zustand**.
- ✅ Keine App-Fehler in Konsole/Netzwerk.

**Verdikt Runbook 70: PASS** — keine Regression der bestehenden Kern-Flows.
