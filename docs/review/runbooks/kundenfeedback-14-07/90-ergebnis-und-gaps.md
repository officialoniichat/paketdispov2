# Runbook 90 — Ergebnis-Rollup, Bugs & Gaps

**Verifikationslauf:** 2026-07-15, echter Browser via Claude-in-Chrome, Stack-Stand `a2750c9`
(Commits `064476b` + `3e01780` + `976d2fe`). Zustände zusätzlich per DB/Audit-Log gegengeprüft.

---

## 1 · PASS/FAIL-Rollup (alle Kundenforderungen 14.07.2026)

| Feature (Kundenfeedback) | Runbook | Ergebnis |
|---|---|---|
| Admin: frei definierbarer **Problemarten-Katalog** (CRUD, Reihenfolge, aktiv/inaktiv) | 20 | ✅ PASS |
| PWA übernimmt Katalog **dynamisch** | 20/50 | ✅ PASS |
| **Weiteres Bündel anfordern** trotz offenem Bündel (Bündel wird erweitert) | 30 | ✅ PASS |
| **Freie Reihenfolge** — kein „Start Bearbeitung"-Zwang | 30 | ✅ PASS |
| Beleg-Übersicht: **WE-Nr, Filiale, Shopbereich, Etikettenart** | 30 | ✅ PASS |
| **Code-128-Barcode inline** je Beleg | 30 | ✅ PASS |
| **CatMan-Termin pro Position** | 40 | ✅ PASS |
| **Hauptshop/Shopnummern** in Kopfzeile (Größe wie Art-Nr) | 40 | ✅ PASS |
| **Fixierte (sticky) Kopfzeile** beim Scrollen | 40 | ✅ PASS |
| **VK-korrigiert**-Feld hinter VK-Etikett, Eingabe an der EAN | 40 | ✅ PASS |
| **Problem pro Position/SKU** (Grund aus Katalog), farbliche Markierung | 50 | ✅ PASS |
| **Kein beleg-weites „Problem melden"** | 50 | ✅ PASS |
| **Mehr-/Minderlieferung + Preisabweichung** → automatisch Problem, erzwingt Teilabschluss | 50 | ✅ PASS |
| **Sammel-Meldung erst bei Teilabschluss** (kein Freitext) | 50 | ✅ PASS |
| Teilabschluss → **rot geparkt beim selben MA**, nicht bearbeitbar | 50/60 | ✅ PASS |
| Cockpit: Problemfall **gesammelt** (nicht pro Position), klären | 60 | ✅ PASS |
| **„Probleme geklärt"** → grün & bearbeitbar zurück → **fertig** | 60 | ✅ PASS |
| **Kreislauf** MA → Teamlead → MA → completed geschlossen | 60/80 | ✅ PASS |
| Regression: bestehende Kern-Flows unverändht funktionsfähig | 70 | ✅ PASS |
| **Ordernummer** für den Teamlead (offene Frage) | §3 | ✅ VORHANDEN & angezeigt |

**Gesamt: alle Kundenforderungen erfüllt (PASS).**

---

## 2 · Gefundene & behobene Punkte

Reiner Verifikations-Task — die Features waren bereits umgesetzt und korrekt. Im Lauf gefunden:

- **UX-Gotcha „Speichern nach Zeilen-Löschung" (Admin Problemarten).** Nach dem Löschen einer
  Zeile rückt der **Speichern**-Button nach oben. Die UI zeigt die Löschung sofort optimistisch
  (Zeile weg), aber ohne bestätigtes **Speichern** wird sie **nicht persistiert**. Der Backend-
  Replace-all-Delete selbst ist korrekt (`PUT /api/admin/problem-reasons` → GET liefert die
  reduzierte Liste, per API bestätigt). **Kein Code-Bug**; als Bedien-/Testhinweis in Runbook 20
  dokumentiert. (Testdaten-Rest „ZZ Verifikationstest" wurde im Lauf über die API entfernt →
  Katalog wieder exakt 9 Einträge.)

Es wurden **keine funktionalen Code-Bugs** gefunden, die einen Fix erforderten; `pnpm typecheck`
blieb grün (13/13).

---

## 3 · Offene Frage „Ordernummer für den Teamlead" — GEKLÄRT

Der Kunde fragte nach der **Ordernummer zur Fehlerlösung** (UX-Hilfe für den Teamlead).

**Ergebnis: vorhanden und angezeigt.** Die Ordernummer ist auf **Positions-Ebene** modelliert
(`ReceiptPosition.orderNo`, ASN/DESADV-konform) und im Browser verifiziert:
- **Mitarbeiter-App**, Positions-Kopfzeile: `Order ORD-3.540.946-1` (in Art-Nr-Größe).
- **Teamlead-Klärung** (`/belege/…?tab=problem`): je Problem die Order-Nr, z. B.
  „Position 2 · **Order ORD-3.540.946-2** · 38 · 401232040946", zusätzlich **WE-Nr** und
  **Lieferschein LS-25-136** prominent am Kopf.

**Rest-Klärung (Datenquelle, kein Blocker):** Die Mock-Ordernummer `ORD-<beleg>-<pos>` ist ein
Platzhalter. Aus welchem realen ProHandel-/ERP-Feld die Ordernummer stammt (ProHandel-Order vs.
Lieferanten-Auftragsnummer), ist mit dem Kunden für den Piloten zu klären; der Connector mappt
sie dann 1:1 auf `ReceiptPosition.orderNo` — Datenmodell und beide UIs sind vorbereitet.
Siehe `docs/review/ordernummer-gap.md`.

---

## 4 · Beobachtungen / kleinere Gaps (kein Blocker)

| # | Beobachtung | Bewertung |
|---|---|---|
| B1 | Mitarbeiter-PWA auf **breitem Desktop**-Viewport: viel Kopf-Leerraum, letzte Beleg-Karte per Scroll schwer erreichbar; Problem-/Teilabschluss-Dialog als Bottom-Sheet teils außerhalb des Sichtbereichs. | Mobile-first; auf Zielgerät (Tablet/Scanner) unkritisch. Optional: Desktop-Breakpoint prüfen. |
| B2 | Begrüßung „Guten **Abend**" richtet sich nach **Geräte-Uhrzeit**, nicht nach eingefrorener Server-Zeit. | Rein kosmetisch. |
| B3 | Einmalige MUI-Warnung „out-of-range value … select" auf der Ablagen-Ansicht (leerer Select-Wert). | Kosmetisch, kein Funktionsfehler. |
| B4 | „Beleg erledigt" wirkt nur, wenn der Beleg **über die Liste** geöffnet wurde (erzeugt `case.resumed`). Bei **Direkt-URL** bleibt der Beleg `problem_resolved` und der Button ist wirkungslos. | Für den Piloten unkritisch (MA öffnet immer über die Liste). Optional: bei Direkt-Öffnen automatisch resumen oder Button klar deaktivieren/hinweisen. |
| B5 | Nach Teilabschluss taucht die **Hol-Aufgabe** des rot geparkten Belegs in „1 · Ware holen" wieder als „offen" auf. | Kosmetisch. |
| **B6** | **⚠️ Beobachtete Anomalie (nicht reproduziert):** Während des E2E erhielt ein **zweiter** in Arbeit befindlicher Beleg desselben MA (WE 3.540.011) einen **eigenen** Teilabschluss mit Problem „falscher Artikel" (Audit: `case.problems_reported` ma-101, 2 min nach dem bewussten Teilabschluss von 3.540.946), obwohl ich Probleme **nur** auf 3.540.946 erfasst hatte. Beide wurden anschließend korrekt geklärt (0 offene Probleme). | **Zur Code-Review empfohlen (HIGH-Kandidat).** Möglich: (a) client-seitige Doppel-/Stale-Übertragung des Teilabschlusses gegen den falschen Case, oder (b) ein Test-Interaktionsartefakt (versehentlicher Klick). In einem kontrollierten Retry **nicht reproduzierbar** (Umgebungs-Reibung: Self-Pull ohne aktive Schicht liefert kein Bündel). Hartes Audit-Log-Evidence liegt vor; siehe §5. |

---

## 5 · Detail zur Anomalie B6 (für Folge-Review)

- **Evidenz (workflow_events):** `case.problems_reported` auf 3.540.011 durch `employee:ma-101`,
  Grund `manual / "falscher Artikel" / sku_line`, mit eigenem `zst.created` (44 Teile) — ein
  vollständiger, separater Teilabschluss ~2 min nach dem bewussten Teilabschluss von 3.540.946.
- **Code-Sichtung:** `useCaseFlow` schlüsselt den lokalen Fortschritt strikt pro `caseId`
  (`['local','caseProgress',caseId]`), `partialComplete` nutzt den Hook-`caseId` (Route-Param) —
  **kein** offensichtlicher Shared-State-Pfad in der Inspektion. Der auslösende Mechanismus des
  separaten 011-Teilabschlusses konnte allein aus dem Audit-Log **nicht** eindeutig belegt werden.
- **Empfehlung:** In einer kontrollierten Umgebung reproduzieren (2 Belege im Bündel eines MA,
  Automatik zu aktiver Schichtzeit laufen lassen), dabei Backend-HTTP-Log der
  `POST /api/cases/:id/partial-complete`-Requests mitschneiden. Prüfen, ob (i) ein Retry/Doppel-
  Submit oder (ii) ein Stale-Mutation gegen einen anderen Case möglich ist.

---

## 6 · Bestätigung: keine verwaisten Zustände

- Alle im Verlauf erzeugten Probleme wurden **geklärt** (Teamlead) und die Belege **abgeschlossen**
  bzw. der `standard`-Reload hat alle Test-Cases entfernt.
- **DB-Endstand (nach `standard`-Reload):** 200 Cases, **1** Case mit offenem Problem = die
  **deterministische Seed-Demo-Problematik** (Baseline, kein Test-Rest). Problemarten-Katalog =
  **9** (Testdaten entfernt).
- **Explizite Bestätigung: Es sind keine verwaisten Zustände aus dieser Verifikation offen** —
  kein offener Problemfall, kein hängender Teilabschluss, kein rot geparkter Rest-Beleg.

**Verdikt Runbook 90 / Gesamtverifikation: PASS** (1 Anomalie B6 zur Code-Review markiert, nicht blockierend).
