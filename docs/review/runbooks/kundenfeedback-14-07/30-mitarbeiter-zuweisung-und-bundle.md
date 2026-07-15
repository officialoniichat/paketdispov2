# Runbook 30 — Mitarbeiter: Zuweisung, Bündel & Home-Screen

**Zweck:** Verifiziert den überarbeiteten Home-Screen der Mitarbeiter-App (Commits `3e01780`
+ `064476b`): Tisch-/Arbeitsplatz-Login, Bündel-Anzeige, **„Weiteres Bündel anfordern" trotz
offenem Bündel**, Beleg-Übersicht mit **WE-Beleg-Nr / Filiale / Shopbereich / Etikettenart**,
**Code-128-Barcode inline**, **freie Reihenfolge** (kein „Start Bearbeitung"-Zwang), Ware-holen-Schritt.

**Voraussetzung:** Runbook 10 (Stack, `standard`).
**Zugang:** Mitarbeiter-App `http://localhost:5175` — auto-Login als **Anna Berger (ma-101), Tisch 1**.

> **Zeit-Hinweis (wichtig für „Weiteres Bündel"):** Der Self-Pull respektiert das Schichtende.
> Bei Server-Zeit **17:xx** (Anna schon nach Cutoff) liefert der Button bewusst die Info
> „Schichtende – kein neues Bündel mehr…". Um den **Positiv-Pfad** zu testen, im Cockpit unter
> **Admin → Dev / Szenarien → Zeit-Steuerung** die Server-Zeit auf **15.07.2026 09:00** setzen
> (Feld `ref` via `form_input`, dann **Setzen**). Badge „Server-Zeit eingefroren: …" erscheint.

---

## Schritte

| # | Aktion | Erwartet | Ergebnis |
|---|--------|----------|----------|
| 1 | `navigate` → `http://localhost:5175`, Screenshot | Kopf „Guten Abend, Anna Berger", Unterzeile **„Arbeitsplatz: Tisch 1"**; Sektionen **„1 · Ware holen"** und **„2 · Bearbeiten"** | **PASS** (Tisch-Login sichtbar) |
| 2 | Beleg-Karte in „2 · Bearbeiten" lesen | **WE 3.540.011** · **Filiale 001 · Shopbereich 23** · **Etikettendruck** · Badges **Prio**, **In Arbeit** | **PASS** (Filiale/Shopbereich/Etikettenart) |
| 3 | Button **Barcode anzeigen** klicken | Inline **Code-128**-Barcode wird gerendert (echte Balken), darunter Klartext **„3.540.011"**; Button wechselt zu **Barcode ausblenden** | **PASS** (Code-128 inline, kein Bild/kein externer Dienst) |
| 4 | *(bei Server-Zeit 17:xx)* **Weiteres Bündel anfordern** | Info-Banner „**Schichtende – kein neues Bündel mehr, damit nichts offen liegen bleibt.**" (Self-Pull-Cutoff greift) | **PASS** (Guard korrekt) |
| 5 | Server-Zeit im Cockpit auf **09:00** setzen, PWA neu laden | Home-Screen unverändert, offenes Bündel (WE 3.540.011) weiterhin da | **PASS** |
| 6 | **Weiteres Bündel anfordern** (jetzt mitten in der Schicht) | **Offenes Bündel wird ERWEITERT** (nicht blockiert): neue Hol-Aufgabe **HB-5/234 · WE 3.540.946 · offen** in „1 · Ware holen (0/1 Plätze)"; in „2 · Bearbeiten" erscheint zusätzlich **WE 3.540.946** (Filiale 001 · Shopbereich 21 · **Digitale Etiketten** · NOS_Nachorder), zunächst ausgegraut | **PASS** (Kern von `064476b`: offenes Bündel blockiert Pull nicht mehr) |
| 7 | Info-Banner in „2 · Bearbeiten" lesen | „**Ausgegraute Belege erst holen — geholte Belege kannst du in beliebiger Reihenfolge starten.**" | **PASS** (freie Reihenfolge, kein Start-Zwang) |
| 8 | Hol-Aufgabe **HB-5/234** anklicken (Ware holen) | Zeile grün mit **✓ geholt**, „1/1 Plätze"; WE 3.540.946 in „2 · Bearbeiten" nicht mehr ausgegraut → **beide Belege in beliebiger Reihenfolge startbar** | **PASS** |

**Screenshots:** `screenshots/30-01-home-tisch1.*`, `30-02-belegkarte-filiale-shop-etikett.*`,
`30-03-code128-inline.*`, `30-04-weiteres-buendel-schichtende.*`, `30-05-buendel-erweitert.*`,
`30-06-freie-reihenfolge-banner.*`, `30-07-ware-geholt.*`

---

## Belegte Kundenforderungen (14.07)
- ✅ **Weiteres Bündel anfordern**, obwohl ein Bündel offen ist → Bündel wird erweitert (`064476b`).
- ✅ **Kein „Start Bearbeitung WE x"-Zwang** — geholte Belege in beliebiger Reihenfolge startbar.
- ✅ Beleg-Übersicht: **WE-Beleg-Nr, Filiale, Shopbereich, Etikettenart** (Etikettendruck / Digitale Etiketten).
- ✅ **Code-128-Barcode inline** je Beleg (Toggle „Barcode anzeigen/ausblenden").
- ✅ Self-Pull respektiert **Schichtende** (Cutoff-Guard).

## Beobachtung (kein Bug)
Die Begrüßung „Guten **Abend**" richtet sich nach der **Geräte-Uhrzeit** des Browsers, nicht nach
der eingefrorenen Server-Zeit (09:00). Rein kosmetisch; kein Einfluss auf Fachlogik. Siehe Runbook 90.

## Endzustands-Check
- Anna hat ein offenes Bündel mit 2 Belegen (normaler Arbeitszustand — **kein** Problem/kein
  Teilabschluss, also kein verwaister Zustand). Wird über „standard neu laden" bzw. das E2E (80)
  vollständig abgearbeitet/zurückgesetzt.

**Verdikt Runbook 30: PASS**
