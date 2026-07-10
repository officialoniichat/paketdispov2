# Zugang zum Kunden-Link — Übergabe an den Release-Task (6aa9b)

**Stand:** 10.07.2026 · **Branch:** `feat/employee-login-without-pin` · **Basis:** `origin/main` (35d93c3)

Dieser Task (a8b95 / T2) stellt den Zugang zur Mitarbeiter-App her. Er deployt **nicht**.
Deploy und die abschließende Production-Probe gehören zu Release-Task **6aa9b**.

---

## 1. Zugangsdaten für Dustin und Eva

### Mitarbeiter-App (`paketemployee-pwa-production.up.railway.app`)

**Anmeldung nur mit der Mitarbeiternummer. Es gibt kein PIN-Feld mehr.**

| Mitarbeiternummer | Name | Bereich | Hinweis |
| --- | --- | --- | --- |
| `ma-101` | Anna Berger | Hängebahn | Frühschicht, Tisch T1 |
| `ma-102` | Bernd Voss | Palette | Spätschicht, Tisch T2 |
| `ma-103` | Claudia Reich | Regal | Frühschicht, Tisch T3 |

Weitere gültige Nummern: `ma-104` … `ma-110`, sowie die beiden temporären Kräfte
`ma-201` (Azubi Mara) und `ma-202` (Aushilfe Tom). Alle im Seed
(`apps/backend-api/src/dev/scenarios/seed-data.ts`) angelegten Nummern funktionieren.

> Für die Feedback-Runde reicht **eine** Nummer. Wenn Dustin und Eva gleichzeitig durchklicken
> wollen, gebe man ihnen `ma-101` und `ma-102` — so sieht jeder sein eigenes Bündel und nicht
> dasselbe.

### Teamlead-Login am Backend

| Mitarbeiternummer | PIN |
| --- | --- |
| `tl-001` | `0000` |

Das ist **kein** Login-Screen im Dashboard, sondern nur der API-Endpunkt `POST /api/auth/login`.
Siehe Punkt 2.

---

## 2. Was wir dem Kunden NICHT sagen dürfen

**Das Teamlead-Dashboard ist nicht geschützt und war es nie.**

- `paketteamlead-web-production.up.railway.app` hat **keinen Login-Screen**. Wer die URL kennt,
  ist Teamlead.
- Es benutzt einen statischen Bearer-Token aus `apps/teamlead-web/src/data/api.ts:23`
  (`VITE_DEV_TOKEN`), der über `/env.js` **im Klartext ausgeliefert** wird und bis Juni 2027
  gültig ist.
- Das ist eine bewusste Entscheidung von Daniel (10.07.2026): es sind reine Demodaten, echte
  Teamlead-Authentifizierung wird ausdrücklich **nicht** gebaut.

Daraus folgt für die Kommunikation an Eva und Dustin:

> ❌ Nicht sagen: „Das Dashboard ist mit einem Login geschützt."
> ❌ Nicht sagen: „Wir haben den Passwortschutz für den neuen Link entfernt."
>    (Auf dem Dashboard gab es nie einen.)
> ✅ Sagen: „Die Mitarbeiter-App öffnet man mit der Mitarbeiternummer, ohne PIN — genau wie
>    besprochen. Das Teamlead-Dashboard ist für diese Demo bewusst ohne Anmeldung erreichbar;
>    es liegen dort nur Testdaten."

Eva hatte im Call vom 07.07. explizit gefragt, ob der Link geschützt sei. Die ehrliche Antwort
ist „nein, und zwar absichtlich" — nicht „ja".

---

## 3. Was sich technisch geändert hat

Die Regel steht **explizit an der Rolle**, nicht an den Daten
(`requiresPin()` in `apps/backend-api/src/auth/rbac.ts`):

- Rolle `employee` → **kein Geheimnis**. Login = Mitarbeiternummer.
- Rolle `teamlead` / `admin` / `it` → **PIN erforderlich**, geprüft gegen `pinHash`.
  Ein privilegierter Benutzer **ohne** gesetzten `pinHash` kommt gar nicht hinein — es gibt
  bewusst keinen „wenn pinHash null, dann durchlassen"-Fallback (das wäre ein Compat-Shim und
  ist laut CLAUDE.md verboten).

Der Seed (`dev/scenarios/lib.ts`) schreibt `pinHash = hash("0000")` für jede Rolle, die eine PIN
verlangt, und `null` für alle Mitarbeiter. Er läuft bei jedem Deploy über `prisma db seed`
(siehe `apps/backend-api/railway.json`) und repariert den Bestand deshalb auch auf der
bestehenden Production-Datenbank — der `upsert` setzt `pinHash` auch im `update`-Zweig.

`pin.ts`, `TokenIssuer`, `guards.ts`, `rbac.ts`, die Spalte `pinHash` und das PIN-Reset-UI im
Admin bleiben unangetastet. Es gibt **keine** neue Migration.

---

## 4. Verifikation

### Bereits erledigt (lokal, gegen echtes Postgres)

- `pnpm typecheck` → **13/13 grün**
- `pnpm test` → **grün** (backend-api 171 Tests, teamlead-web 94, employee-pwa)
- Integrationstest `auth-login.int.test.ts` → **7/7 grün** gegen echtes Postgres
  (Testcontainers) durch den echten Nest/Fastify-HTTP-Layer:
  Mitarbeiter ohne PIN → 200 · Teamlead mit `0000` → 200 · Teamlead ohne PIN → 401 ·
  Teamlead mit falscher PIN → 401 · unbekannte Nummer → 401.
- Playwright-E2E (`apps/employee-pwa/e2e`) → **4/4 grün**: echter Browser gegen echtes Backend,
  Login allein mit der Nummer, kein PIN-Feld im DOM, Bündel-Home erscheint.

### Production-Zustand VOR dem Deploy (live geprüft am 10.07.2026)

```
POST /api/auth/login {"employeeNo":"ma-101","pin":"1234"}  → 401 Ungültige Anmeldedaten
POST /api/auth/login {"employeeNo":"ma-101"}               → 400 pin must be a string
POST /api/auth/login {"employeeNo":"tl-001","pin":"0000"}  → 401 Ungültige Anmeldedaten
```

Alle drei sind kaputt — heute kommt niemand hinein. Das ist der Zustand, den dieser Change behebt.

### NACH dem Deploy im Release-Task auszuführen (Definition of Done)

```bash
API=https://paketbackend-api-production.up.railway.app

# 1. Mitarbeiter kommt allein mit der Nummer hinein  → erwartet: 200 + {"token":"..."}
curl -s -w '\n%{http_code}\n' -X POST $API/api/auth/login \
  -H 'Content-Type: application/json' -d '{"employeeNo":"ma-101"}'

# 2. Teamlead mit Nummer + 0000                      → erwartet: 200 + {"token":"..."}
curl -s -w '\n%{http_code}\n' -X POST $API/api/auth/login \
  -H 'Content-Type: application/json' -d '{"employeeNo":"tl-001","pin":"0000"}'

# 3. Teamlead OHNE PIN bleibt draußen                → erwartet: 401
curl -s -w '\n%{http_code}\n' -X POST $API/api/auth/login \
  -H 'Content-Type: application/json' -d '{"employeeNo":"tl-001"}'

# 4. Unbekannte Nummer bleibt draußen                → erwartet: 401
curl -s -w '\n%{http_code}\n' -X POST $API/api/auth/login \
  -H 'Content-Type: application/json' -d '{"employeeNo":"ma-999"}'
```

Zusätzlich im Browser: `paketemployee-pwa-production.up.railway.app` öffnen, `ma-101` eintippen,
„Anmelden" — es darf **kein PIN-Feld** zu sehen sein, und der Bündel-Home-Screen muss erscheinen.

> **Wichtig:** Punkt 2 funktioniert erst, nachdem der Pre-deploy-Seed einmal gelaufen ist
> (`prisma migrate deploy && prisma db seed`, siehe `apps/backend-api/railway.json`). Der Seed
> setzt den `pinHash` für `tl-001` per `upsert` auch auf dem bestehenden Datenbestand.
