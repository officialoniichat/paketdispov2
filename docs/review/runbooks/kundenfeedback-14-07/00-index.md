# Runbooks — Verifikation Kundenfeedback 14.07.2026 (Mitarbeiter-App)

Ausführbare Test-Drehbücher **und** Beweis-Protokoll für alle Änderungen aus dem Kundenfeedback
vom 14.07.2026 (PDF „20260713 – Mitarbeiterapp ändern"), umgesetzt in den Commits
`064476b` + `3e01780` + `976d2fe` (Stack-Stand `a2750c9`).

**Doppelter Zweck:** (a) jemand ohne Vorwissen (oder eine spätere Claude-Session) kann jedes
Runbook **Schritt für Schritt nachfahren**; (b) pro Schritt ist das **Ergebnis (PASS/FAIL)** +
Screenshot-Referenz protokolliert. Verifiziert am **2026-07-15** im echten Browser via
**Claude-in-Chrome** (`mcp__claude-in-chrome__*`), Zustände zusätzlich per DB/Audit-Log geprüft.

---

## Voraussetzungen & Stack-Setup

1. **`pnpm install`** im Repo-Root (Lockfile hat sich geändert — sonst fehlen `turbo`/`jose`).
2. **Docker-Infra** (nur Postgres): `docker compose up -d`.
3. **`pnpm dev:setup`** — mintet Teamlead- + Admin-Dev-Token in die Frontend-`.env` (Dev-Panel).
4. **`pnpm dev`** — startet: backend `:3000`, teamlead-web `:5174`, employee-pwa `:5175`.
5. Health: `curl http://localhost:3000/healthz` → 200.

### Zugangsdaten (Dev)
| App | URL | Login |
|-----|-----|-------|
| Cockpit (Teamlead + Admin/Dev-Panel) | `http://localhost:5174` | Auto via Dev-Token (tl-001 + admin-001) |
| Mitarbeiter-App | `http://localhost:5175` | Mitarbeiternummer **`ma-101`** (Anna Berger), kein PIN |

> Dev-Panel-Gate: Backend `DEV_PANEL=1` **und** Dev-/Demo-Build. Der Tab „Dev / Szenarien" und
> „Problemarten" liegen unter **Cockpit → Admin & Regeln**.

### Browser-Session
- Immer mit `tabs_context_mcp` beginnen, eigenen Tab via `tabs_create_mcp` anlegen
  (keine fremden Tabs wiederverwenden). **Playwright NICHT parallel** verwenden — teilt sich
  die Chrome-Instanz und blockiert die Claude-in-Chrome-Tabs.

---

## Reihenfolge & Abhängigkeiten

| # | Runbook | Baut auf | Erzeugt Problem-Zustand? |
|---|---------|----------|--------------------------|
| [10](10-setup-und-seed.md) | Setup & Seed (`standard`) | — | nein |
| [20](20-admin-problemarten.md) | Admin: Problemarten-Katalog | 10 | nein (selbst-aufräumend) |
| [30](30-mitarbeiter-zuweisung-und-bundle.md) | MA: Zuweisung, Bündel, Home-Screen | 10 | nein |
| [40](40-positionen-tabelle.md) | Positionen-Tabelle | 30 | nein |
| [50](50-probleme-erfassen.md) | Probleme erfassen + Teilabschluss-Zwang | 40 | **JA → Auflösung in 60** |
| [60](60-teilabschluss-loop.md) | Teilabschluss-Loop schließen (MA→TL→MA) | 50 | löst 50 auf |
| [70](70-regression-smoke.md) | Regression-Smoke (ohne Probleme) | 10 | nein |
| [80](80-e2e-durchlauf.md) | Durchgehendes E2E (ein Beleg, Seed→fertig) | 10 | erzeugt **und** löst auf |
| [90](90-ergebnis-und-gaps.md) | Ergebnis-Rollup, Bugs, Gaps, No-Orphan-Bestätigung | alle | — |

Screenshots: `screenshots/<runbook>-<nr>-<name>.*`.

---

## HARTE REGEL — kein verwaister Zustand

Jeder Teilflow und das E2E müssen **jeden erzeugten Zustand wieder auflösen**: am Ende **kein**
offenes/ungelöstes Problem, **kein** hängender Teilabschluss, **kein** rot geparkter Problemfall.
Wer ein Problem erzeugt (Runbook 50), muss es bis zur **Klärung durch den Teamlead** UND der
**finalen Fertigstellung durch den MA** durchspielen (Runbook 60) — oder explizit darauf verweisen.
Jedes Runbook endet mit einem **Endzustands-/Aufräum-Check**. Universelles Aufräum-Mittel:
**`standard`-Szenario neu laden** (Reset + Seed des kompletten Case-Graphen).

---

## Gesamt-Ergebnistabelle

| Runbook | Verdikt |
|---------|---------|
| 10 · Setup & Seed | ✅ PASS |
| 20 · Admin Problemarten | ✅ PASS |
| 30 · MA Zuweisung & Bündel | ✅ PASS |
| 40 · Positionen-Tabelle | ✅ PASS |
| 50 · Probleme erfassen | ✅ PASS (Auflösung in 60) |
| 60 · Teilabschluss-Loop | ✅ PASS |
| 70 · Regression-Smoke | ✅ PASS |
| 80 · E2E-Durchlauf | ✅ PASS |
| 90 · Ergebnis & Gaps | ✅ PASS |
| **Gesamt** | **✅ Alle Kundenforderungen 14.07 erfüllt** |

**Offene Punkte (nicht blockierend, Details in Runbook 90):**
- **B6** — beobachtete, nicht reproduzierte Anomalie (zweiter Beleg desselben MA erhielt einen
  eigenen Teilabschluss); zur **Code-Review** markiert. Kein verwaister Zustand daraus (geklärt).
- **Ordernummer**: vorhanden & angezeigt; reale ERP-Feldquelle für den Piloten mit dem Kunden zu
  bestätigen (`docs/review/ordernummer-gap.md`).
- Kleinere kosmetische Beobachtungen B1–B5.

**Bestätigung:** Nach Abschluss sind **keine verwaisten Zustände** aus dieser Verifikation offen.
