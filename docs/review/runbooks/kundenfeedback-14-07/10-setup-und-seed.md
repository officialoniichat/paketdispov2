# Runbook 10 — Setup & Seed

**Zweck:** Stack starten, Dev-Panel öffnen, deterministisches `standard`-Szenario laden,
sauberen Ausgangszustand verifizieren. Voraussetzung für alle folgenden Runbooks.

**Zugang / Umgebung**
- backend-api: `http://localhost:3000` (healthz muss 200 liefern)
- teamlead-web (Cockpit): `http://localhost:5174` — auto-auth via Dev-Token (tl-001 + admin-001)
- employee-pwa: `http://localhost:5175` — auto-auth via Dev-Token (ma-101)
- Tool: Claude-in-Chrome (`mcp__claude-in-chrome__*`). Session mit `tabs_context_mcp` beginnen,
  eigenen Tab via `tabs_create_mcp` anlegen (keine fremden Tabs wiederverwenden).

---

## Vorbereitung (Terminal)

| # | Aktion | Erwartet | Ergebnis |
|---|--------|----------|----------|
| 0.1 | `pnpm install` im Repo-Root (Lockfile hat sich geändert — sonst fehlen `turbo`/`jose` und `pnpm dev` bricht ab) | Exit 0 | **PASS** (exit 0) |
| 0.2 | Docker-Infra (nur Postgres) läuft: `docker compose up -d` | Postgres erreichbar | **PASS** (lief bereits) |
| 0.3 | `pnpm dev:setup` — mintet Teamlead- + Admin-Dev-Token in die `.env` der Frontends | `.env` mit `VITE_DEV_TOKEN` + `VITE_DEV_ADMIN_TOKEN` | **PASS** (Tokens vorhanden) |
| 0.4 | `pnpm dev` — startet alle Server (turbo) | backend:3000, teamlead:5174, employee:5175 laufen | **PASS** (Stack aktiv, `/healthz` = 200) |

> Hinweis Verifikationslauf 2026-07-15: Es lief bereits ein identischer Stack (Code-Stand
> `a2750c9`, Dev-Panel aktiv). `curl /api/problem-reasons` → 401 (Endpoint existiert, Auth nötig),
> `curl /api/dev/scenarios` → 401 (Dev-Panel aktiv). Damit war kein Neustart nötig.

---

## Browser-Schritte (Claude-in-Chrome)

| # | Aktion | Tool | Erwartet | Ergebnis |
|---|--------|------|----------|----------|
| 1 | `tabs_context_mcp` → neuen Tab anlegen | `tabs_context_mcp` / `tabs_create_mcp` | Frischer Tab | **PASS** |
| 2 | `navigate` → `http://localhost:5174` | `navigate` | Cockpit „Teamlead-Dashboard" lädt, eingeloggt (kein Login-Screen) | **PASS** |
| 3 | Screenshot Dashboard | `computer(screenshot)` | AUTOMATIK-DISPO, Pool-Zahl, ZST-Fortschritt sichtbar | **PASS** |
| 4 | Linke Nav → **Admin & Regeln** klicken | `computer(left_click)` | Tab-Leiste inkl. **Problemarten** und **Dev / Szenarien** sichtbar | **PASS** |
| 5 | Tab **Dev / Szenarien** öffnen | `computer(left_click)` | „AKTUELLER ZUSTAND", Zeit-Steuerung, Szenario-Katalog | **PASS** |
| 6 | Bei **Standard-Tag** auf **Szenario laden** klicken | `computer(left_click)` | Toast: „Szenario ‚standard' geladen · 189 Belege bereit · 2 geblockt · 58 Lieferungen · 13 Schichten · Basisdatum 2026-07-15" | **PASS** |
| 7 | Screenshot Endzustand | `computer(screenshot)` | Badge „Aktives Szenario: Standard-Tag", Server-Zeit 15.07.2026 | **PASS** |

**Screenshots:** `screenshots/10-01-dashboard-after-standard-seed.*`, `10-02-dev-panel-standard-geladen.*`

---

## Wichtige Semantik (aus `docs/dev/scenarios.md`)

- **Laden = Reset + Seed.** `standard` löscht den kompletten transaktionalen Case-Graphen
  (Belege, Bündel, Probleme, Events) und baut ihn deterministisch neu auf. Stammdaten
  (Team, Lagerplätze, **Problemarten-Katalog**) werden geupsertet, nie gelöscht.
- Damit ist „standard laden" auch das Standard-**Aufräum**-Mittel: löst jeden verwaisten
  Problemfall/Teilabschluss/rot geparkten Beleg aus vorherigen Läufen auf.

## Endzustands-Check
- ✅ Cockpit-Dashboard lädt, Pool ~189 Belege, deterministisch.
- ✅ Server-Zeit = 15.07.2026 (Zeit-Übersteuerung aktiv, Badge in App-Leiste).
- ✅ Keine Fehler in der Konsole (nur `favicon.ico` 404 — harmlos).

**Verdikt Runbook 10: PASS**
