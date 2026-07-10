# Lokale Vorab-Abnahme — `preview/vor-release`

**Datum:** 10.07.2026
**Branch:** `preview/vor-release` (Merge-Commit `519e33a`)
**Basis:** `origin/main` = `35d93c3` (der deployte Stand)
**Zweck:** Gesamtstand lokal sehen, bevor Release-Task `6aa9b` nach Railway deployt.
**Es wurde nichts deployt und nichts nach `main` gepusht.**

---

## Empfehlung

**Ja — `6aa9b` (Deploy) kann starten.** Alle harten Prüfpunkte sind grün: Merge sauber,
`typecheck` 13/13, `lint` 0 Fehler, `test` 13/13, der Seed läuft lokal, `recalculate` erzeugt
Bündel, die Anmeldung ohne PIN funktioniert, die Positionen-Tabelle nutzt die volle Breite, und
**jeder** Admin-Tab speichert ohne 400er.

Drei Dinge muss Daniel vor dem Klick wissen — keines davon ist ein Blocker, aber zwei davon sieht
der Kunde:

1. Zwei Zahlen im Cockpit sind **nicht** de-DE formatiert (`7.9 h`, `1.05` statt `7,9 h`, `1,05`).
   Genau der Punkt, den Eva adressiert hat. Zwei Zeilen Fix — siehe [B1](#b1).
2. Nach dem Deploy **muss** `recalculate` laufen, und zwar **möglichst früh am Tag**. Die Kapazität
   wird gegen `now` gerechnet; ein Aufruf am späten Nachmittag verteilt fast nichts, und „Ware holen"
   ist wieder leer. Siehe [C4](#c4). Das ist der Grund, warum Dustin das Feature für fehlend hielt.
3. Der Mitarbeiter-Login akzeptiert einen mitgeschickten PIN kommentarlos. Das ist **so gebaut und
   getestet**, nicht kaputt — aber es ist nicht das, was die Prüfliste wörtlich verlangt. Siehe [A1](#a1).

---

## 1 · Merge

```
git switch -c preview/vor-release main
git merge fix/railway-deploy-safety feat/positionen-tabelle \
          feat/employee-login-without-pin feat/deutsche-texte
```

**Sauber. Keine Konflikte.** Octopus-Merge, Exit 0, `519e33a`. Die Merge-Probe mit `git merge-tree`
hat nicht getäuscht — es musste kein einziger Konflikt fachlich aufgelöst werden.

| Branch | Commits über `main` |
| --- | --- |
| `fix/railway-deploy-safety` | 3 |
| `feat/positionen-tabelle` | 1 |
| `feat/employee-login-without-pin` | 1 |
| `feat/deutsche-texte` | 4 |

69 Dateien, +2749 / −562.

---

## 2 · Qualität

| Gate | Ergebnis | Beleg |
| --- | --- | --- |
| `pnpm typecheck` | **13/13 grün** | `Tasks: 13 successful, 13 total` |
| `pnpm lint` | **8/8 grün, 0 Fehler** | 57 Warnungen (`consistent-type-imports`), alle vorbestehend, keine aus dem Merge |
| `pnpm test` | **13/13 grün** | backend-api 171 Tests, teamlead-web 94 Tests, alle bestanden |

Nach meiner Demodaten-Änderung (Abschnitt 3) erneut geprüft — weiterhin 13/13 / 0 Fehler / 13/13.
**Der Merge hat nichts zerrissen.**

---

## 3 · Demo-Datenstand

### Seed läuft lokal — der Deploy-Fix hat *nicht* zu breit gegriffen

Das war der explizite Blocker-Verdacht. Er ist ausgeräumt.

`apps/backend-api/prisma/seed.ts:31` sperrt ausschließlich, wenn **beides** zutrifft:

```ts
if (process.env.NODE_ENV === 'production' && process.env.SEED_ON_DEPLOY !== '1') {
```

Lokal ist `NODE_ENV=development` → der Seed läuft normal durch:

```
[seed] scenario=standard volume=typical users=13 shifts=12 activeLocations=25
       readyCases=189 blockedCases=2 deliveryGroups=61 totalCases=200
```

Der Release-Task kann den Demo-Datenstand also herstellen.

### `recalculate`

```
POST /api/teamlead/assignments/recalculate   →  HTTP 201
{ "bundleCount": 10, "assignedCaseCount": 41, "unassignedCaseCount": 148, "durationMs": 4 }
```

Danach hat der Demo-Mitarbeiter ein Bündel, und „Ware holen" ist gefüllt. **Ohne diesen Aufruf ist
`assignment_bundles` leer** (vor dem Aufruf gemessen: `bundles=0`).

### Die drei geforderten Merkmale

| Gefordert | Vorher | Jetzt |
| --- | --- | --- |
| Beleg mit `priceLabelPrintRequired` → Chip „Etiketten drucken" | ✅ alle 195 Belege | ✅ **125 von 195** — der Chip trägt jetzt Information (`case-builders.ts:152`) |
| Beleg mit `securityTypeCode` → Sicherungs-Piktogramm | ✅ 196 Positionen (`hard-tag`) | unverändert |
| Position mit Online-Markierung → farbiger Chip je Größe | ❌ **fehlte im Bündel** | ✅ 96 Positionen |

> **Nachtrag (nach Erstfassung dieses Berichts):** Der Etikettendruck stand ursprünglich auf **jedem**
> Beleg — damit sagte der Chip „🏷️ Etiketten drucken" nichts aus, obwohl Dustin genau daran erkennen
> will, ob er zum Drucker muss. Er hängt jetzt an einer deterministischen Teilmenge (zwei von drei
> Belegen). Nachgemessen im Bündel von `ma-108`: 2 von 3 Belegen tragen den Chip.

**Das dritte fehlte und wurde in den Demodaten korrigiert — nicht im Produktivcode.**

Ist-Zustand vorher: die neun online-relevanten Positionen hingen ausschließlich an der Fixture
`definitions/online-groessen.ts`. Deren Belege sind `ready`, aber **keinem Bündel zugeteilt** — und
`GET /api/me/cases/:id/aggregate` antwortet für nicht zugeteilte Belege mit **403**. Der farbige
Chip war für einen Mitarbeiter also strukturell unerreichbar.

Fix in `apps/backend-api/src/dev/scenarios/case-builders.ts` (Demodaten, `src/dev/scenarios/`):
Position 1 jedes **zweiten** Belegs ist online-relevant. Deren WGR `218110` hat eine Größen-Präferenz
(`38` bevorzugt, `40` Ausweich) und genau `38`/`40` werden geliefert — die PWA rendert damit
**einen grünen und einen roten** Chip. Bewusst nicht auf jedem Beleg, sonst wäre in der Demo jeder
Artikel ein Onlineartikel.

Gegenprobe am Aggregat (`WE 3.540.634`):

```
Pos 1  wgr 218110  securityTypeCode hard-tag
   Größe 38 | onlineMark green | EK 14.5 | VK 34.8 | VK-Etikett 34.8
   Größe 40 | onlineMark red   | EK 14.5 | VK 34.8 | VK-Etikett 34.8
```

Die Aufwandsrechnung ist davon **nicht** betroffen: der Effort-Vektor zählt
`PositionInstruction.onlineHandlingRequired` (`apps/backend-api/src/assignment/effort-vector.ts:68`),
nicht `ReceiptPosition.onlineRelevant`. Dieses Feld blieb `false`.

---

## 4 · Prüfliste

### Mitarbeiter-App (`http://localhost:5175`)

| Punkt | Ergebnis | Beleg |
| --- | --- | --- |
| Anmeldung allein mit Mitarbeiternummer, **kein PIN-Feld** | ✅ | Login-Screen enthält genau ein Textfeld „Mitarbeiternummer" + „Anmelden". Vorbelegt mit `ma-108` → ein Klick genügt. `screenshots/01-anmeldung-ohne-pin-1920x1080.png` |
| Startseite: je Beleg der Lagerplatz | ✅ | 4 Stops `R5`, `R11`, `R25`, `R27`; je Beleg `storageLocationCode` |
| Mehrfachauswahl | ✅ | Nach zwei Klicks: „2/4 Plätze", beide Stops „geholt" |
| „Rest parken" funktioniert | ✅ | `POST /api/me/park → 201`, Meldung **„2 Belege geparkt – kommen ins nächste Bündel."**, Abschnitt 2 danach entsperrt |
| Chip „Etiketten drucken" | ✅ | `WE 3.540.633 · 🏷️ Etiketten drucken`. Seit der B3-Änderung an einer Teilmenge — im Bündel von `ma-108` an 2 von 3 Belegen, damit der Chip unterscheidet. `screenshots/02-startseite-ware-holen-1920x1080.png` (zeigt den älteren Stand mit Chip an jedem Beleg) |
| Positionen als Tabelle mit **festen Spaltenüberschriften** | ✅ | Echtes `<table>`: `Pos · EAN · Größe · Online · Soll · Ist · Mehr-/Mindermenge · EK · VK · VK-Etikett` |
| EK-/VK-Preis **rechts** | ✅ | `EK` ab x=1320, `VK-Etikett` endet bei x=1903 (Viewport 1920). `text-align: right`, `14,50 €` / `34,80 €` |
| Mehr-/Mindermengen **daneben** | ✅ | Eigene Spalte zwischen `Ist` und `EK` |
| Screenshot 1920×1080 | ✅ | `screenshots/03-positionen-tabelle-1920x1080.png` |
| Screenshot 2560×1440 | ✅ | `screenshots/04-positionen-tabelle-2560x1440.png` |
| Sicherungs-Piktogramm sichtbar | ✅ | `<img src=".../static/pictograms/hard-tag.svg" alt="Hartetikett">`, geladen (`naturalWidth: 96`), daneben „Sicherungstyp: Hartetikett" |
| Online-Chips je Größe | ✅ | Größe 38 → grün „Onlineartikel-Highlight", Größe 40 → rot „Onlineartikel" |
| Keine englischen Texte | ⚠️ **fast** | Sichtbarer Fließtext komplett deutsch, keine rohen Enum-Schlüssel, 0 Konsolenfehler. **Eine Ausnahme:** siehe [B2](#b2) |

#### Dustins Kernbeschwerde ist messbar erledigt

> „Es ist alles sehr geballt an Infos … und wir haben rechts unfassbar viel Leerplatz."

Gemessen im DOM, nicht geschätzt:

| Viewport | Tabellenbreite | Rechter Rand | Flächendeckung |
| --- | --- | --- | --- |
| 1920 × 1080 | 1886 px (x = 17 → 1903) | **17 px** | **98 %** |
| 2560 × 1440 | 2526 px (x = 17 → 2543) | **17 px** | **99 %** |

Die rechte Bildhälfte ist nicht mehr leer: bei 2560 px beginnt allein die EK-Spalte erst bei
x = 1762, die Preise liegen rechtsbündig ganz außen.

### Teamlead-Cockpit (`http://localhost:5176`)

**Jeder geforderte Tab speichert ohne 400er.** Sechsmal `Regeln speichern` geklickt:

```
PUT http://localhost:3002/api/admin/rules => [200] OK     (Priorität)
PUT http://localhost:3002/api/admin/rules => [200] OK     (Bündel)
PUT http://localhost:3002/api/admin/rules => [200] OK     (Aufwand)
PUT http://localhost:3002/api/admin/rules => [200] OK     (Lieferungen)
PUT http://localhost:3002/api/admin/rules => [200] OK     (Verladeplan)
PUT http://localhost:3002/api/admin/rules => [200] OK     (Schichtende)
```

Kein einziges `400 Ungültige Regelkonfiguration`. Der ValidationPipe-/`whitelist:true`-Bug ist
erledigt. Bestätigung im UI: **„Regeln gespeichert."**
`screenshots/05-admin-regeln-gespeichert-1920x1080.png`

Rohe Enum-Schlüssel und Englisch — alle Fundstellen der Gap-Analyse (A5) nachgeprüft:

| Fundstelle laut Gap-Analyse | Jetzt |
| --- | --- |
| Lagerplatz-Dropdown `haengebahn`, `palette_a` … | ✅ „Hängebahn", „Palette A" |
| Belege-Statusfilter `needs_review`, `zst_done` … | ✅ „Prüfung nötig", „ZST erledigt", „Storniert" … (12 Optionen, alle deutsch) |
| Beleg-Detail `issueType` / `scope` / `IssueStatus` | ✅ „falsche Farbe" / „Beleg" / „Offen" |
| Beleg-Detail ZST-`source` | ✅ `mobile_app` → „Mitarbeiter-App" |
| Mitarbeiter-Rolle `employee`, `teamlead` | ✅ „Mitarbeiter", „Teamleitung" |
| `ShiftSource` `(pattern)` | ✅ „(Wochenmuster)" |
| `IntegrationenTab` Button `Retry` | ✅ „Erneut versuchen" |
| `unwrap()` → „Backend request failed: rules" | ✅ nirgends mehr auffindbar |
| Ablagen-Board roher `issueType` | ✅ keine rohen Schlüssel |

Geprüfte Seiten: Tagescockpit, Digitale Ablagen, Mitarbeiterboard, Belege (Liste + Detail:
Kopf/Problem/Abschluss), Aufteilungen, Admin (alle 11 Tabs). **Kein roher Enum-Schlüssel, keine
englischen `aria-label`/`title`-Attribute, 0 Konsolenfehler.**

Datumsformat de-DE: ✅ (`05.07.2026`, `10.07. 14:32`, keine ISO-Leaks).
Zahlenformat de-DE: ❌ **zwei Verstöße** → [B1](#b1).

### API direkt

```
$ curl -s -X POST localhost:3002/api/auth/login -H 'Content-Type: application/json' \
       -d '{"employeeNo":"tl-001","pin":"0000"}'
HTTP 200 → { "token": "eyJhbGciOiJSUzI1Ni…" }   (552 Zeichen)
   sub=employee:tl-001  employee_no=tl-001  realm_access.roles=["teamlead"]
```

✅ **Teamlead bekommt ein Token.**

```
$ curl -s -X POST localhost:3002/api/auth/login -H 'Content-Type: application/json' \
       -d '{"employeeNo":"ma-101"}'
HTTP 200 → { "token": … }
   sub=employee:ma-101  employee_no=ma-101  realm_access.roles=["employee"]
```

✅ **Mitarbeiter kommt ohne `pin`-Feld durch.**

Alle Gegenproben:

| Anfrage | Antwort | Bewertung |
| --- | --- | --- |
| Mitarbeiter + falscher PIN `9999` | **200, Token** | ❌ [A1](#a1) — kommentarlos akzeptiert |
| Mitarbeiter + überflüssiger PIN `0000` | **200, Token** | ❌ [A1](#a1) |
| Mitarbeiter + leerer PIN `""` | 400 `["pin must be longer than or equal to 4 characters"]` | ⚠️ englische Validator-Meldung, nur via API sichtbar |
| Teamlead **ohne** PIN | 401 „Ungültige Anmeldedaten" | ✅ |
| Teamlead + falscher PIN `1234` | 401 „Ungültige Anmeldedaten" | ✅ |
| Unbekannte Mitarbeiternummer | 401 „Ungültige Anmeldedaten" | ✅ (keine User-Enumeration) |
| `admin-001` + PIN `0000` | 401 | ℹ️ [C1](#c1) — es gibt gar keinen Admin-Benutzer im Seed |

---

## 5 · Was NICHT funktioniert

<a id="a1"></a>
### A1 — Mitarbeiter mit falschem/überflüssigem PIN wird kommentarlos akzeptiert

**Datei:** `apps/backend-api/src/auth/login.service.ts:50-53`

```ts
if (requiresPin(effectiveRoles)) {
  const pinValid = pin !== undefined && (await verifyPin(pin, user.pinHash));
  if (!pinValid) return null;
}
```

Für die Mitarbeiterrolle ist `requiresPin(...)` `false`; der übergebene `pin` wird **nie angesehen**.
`{"employeeNo":"ma-101","pin":"9999"}` liefert deshalb `200` + Token.

**Das ist Absicht, nicht ein Bug:** `apps/backend-api/src/auth/login.service.test.ts:68` heißt
wörtlich *„ignores a PIN that is sent anyway"* und ist grün. Es ist auch **kein** Sicherheits-Downgrade
— Mitarbeiter haben per Entscheidung gar kein Geheimnis, die Mitarbeiternummer *ist* die vollständige
Anmeldeinformation.

**Aber:** Die Prüfliste verlangt wörtlich „ein Mitarbeiter mit falschem/überflüssigem PIN wird nicht
kommentarlos akzeptiert". Nach dieser Formulierung **fällt der Punkt durch**. Entscheidung liegt bei
Daniel: entweder die Prüfliste an das bewusste Design anpassen, oder das DTO das `pin`-Feld für
Mitarbeiter mit `400` ablehnen lassen. Ich habe **nichts geändert** — Produktivcode war für diesen
Task nicht freigegeben.

<a id="b1"></a>
### B1 — Zwei Zahlen im Cockpit sind nicht de-DE formatiert

Beide vom Kunden sichtbar. Beide einzeilig zu beheben.

1. `apps/teamlead-web/src/features/board/MitarbeiterBoard.tsx:221`
   ```tsx
   {row.plannedHours} h geplant        →  zeigt "7.9 h geplant"
   ```
   Erwartet: `7,9 h geplant`.

2. `apps/teamlead-web/src/features/admin/EmployeeDetailPanel.tsx:280`
   ```tsx
   Produktivitätsfaktor: {productivity.toFixed(2)}   →  zeigt "1.05"
   ```
   Erwartet: `1,05`.

Dass es ein Versehen ist und keine Absicht, zeigt die Nachbardatei
`apps/teamlead-web/src/features/admin/SchichtplanTab.tsx:78`, die es **richtig** macht:
`(min / 60).toFixed(1).replace('.', ',')`.

Eva hat genau diesen Punkt („alles auf Deutsch") adressiert. Ich empfehle, das vor dem Link zu fixen.

<a id="b2"></a>
### B2 — Englischer Tooltip „Close" in der Mitarbeiter-App

**Datei:** `apps/employee-pwa/src/screens/BundleHomeScreen.tsx:270`

```tsx
<Alert severity="info" sx={{ mb: 2 }} onClose={() => setParkMsg(undefined)}>
```

MUI rendert ohne `closeText`-Prop einen Schließen-Button mit `title="Close"` **und**
`aria-label="Close"`. Der Tooltip ist beim Hovern sichtbar. `closeText` wird im gesamten Repo
nirgends gesetzt. Erscheint genau nach „Rest parken" — also in dem Flow, den Dustin vorführen wird.

Kein Blocker, aber ein englischer String im Nutzer-UI.

---

## 6 · Umgebungs-Befunde (kein Produktcode-Fehler, aber wichtig)

<a id="c1"></a>
### C1 — Es gibt keinen Admin-Benutzer in den Demodaten

Der Seed legt 13 Benutzer an: `ma-101`…`ma-110`, `ma-201`, `ma-202` (alle Rolle `employee`,
**ohne** `pinHash`) und **genau einen** `tl-001` (Rolle `teamlead`, mit `pinHash`).
Ein `admin`-Benutzer existiert nicht — `admin-001 + 0000` ergibt korrekt `401`.

Das ist kein Fehler: Das Cockpit meldet sich nicht an, es benutzt den statischen Token aus
`apps/teamlead-web/src/data/api.ts:23`, und das Admin-Dev-Panel den `VITE_DEV_ADMIN_TOKEN` aus
`dev-setup`. Nur falls jemand erwartet, sich „als Admin einloggen" zu können: **geht nicht**, und
laut Daniels Entscheidung soll es auch nicht gebaut werden.

### C2 — Ports 3000 und 5174 waren belegt (Fremdprozesse)

Auf diesem Rechner laufen fremde Prozesse:

| Port | Belegt durch |
| --- | --- |
| 3000 | Docker-Container `gotenberg-fahrauftrag` |
| 5173, 5174 | Vite-Dev-Server aus den `busverwaltung`-Worktrees (PID 3651, 9052) |
| 3001, 3004, 5177 | weitere fremde Node-Prozesse |

Auf Daniels Anweisung wurde **nichts Fremdes gestoppt**; die Umgebung läuft auf Ausweichports
(Abschnitt 7). Zwei Folgen davon:

* Die `.env`-Dateien (permission-geschützt, nicht angefasst) zeigen weiterhin auf `localhost:3000`.
  Die Ausweichports werden per **Umgebungsvariable** gesetzt, nicht per Datei.
* Die CORS-Allowlist des Backends steht defaultmäßig auf `5174, 5175`
  (`apps/backend-api/src/main.ts:45`). Der Teamlead auf `5176` wird ohne `CORS_ORIGINS` **blockiert**
  (17 Konsolenfehler, Dashboard leer). Deshalb startet das Backend hier mit gesetztem `CORS_ORIGINS`.
  **Auf Railway ist das irrelevant** — dort greifen die echten Origins.

### C3 — `dist/` ist über Worktrees hinweg geteilt (echte Stolperfalle)

Im Worktree sind `node_modules` **und alle fünf `packages/*/dist`** Symlinks in den Haupt-Checkout
`~/Documents/packetdispov2`:

```
packages/ui/dist -> /Users/danielkashi/Documents/packetdispov2/packages/ui/dist   (gleiche Inode)
```

Der Haupt-Checkout steht auf `main` (`35d93c3`) und besitzt `packages/ui/src/theme/labels.ts`
**nicht** — aber ein `dist/theme/labels.js` liegt dort trotzdem. Heißt: **wer zuletzt baut, gewinnt**,
branch-übergreifend. Vites Warnung „Sourcemap … points to missing source files" war genau das.

Ich habe die Pakete deshalb aus dem gemergten Stand neu gebaut
(`turbo run build --filter=@paket/… --force`), bevor ich das UI geprüft habe. Die Screenshots und
Messungen oben zeigen also `preview/vor-release`, nicht `main`.

**Für Daniel:** Wenn du in einem anderen Worktree baust, überschreibst du dieses `dist` wieder.
Vor dem Prüfen im Zweifel `pnpm turbo run build --filter='./packages/*' --force` laufen lassen.
`dist` ist gitignored, es geht nichts verloren.

<a id="c4"></a>
### C4 — `recalculate` ist tageszeitabhängig — das entscheidet, ob „Ware holen" gefüllt ist

Die Kapazität wird gegen `now` gerechnet (`apps/backend-api/src/assignment/assignment.service.ts:169`,
`assignWork(input, engineConfig, { now: now.toISOString() })`). Die Demo-Schichten laufen
`04:00–12:00` bzw. `08:00–16:00`.

Gemessen, gleicher Seed, gleicher Branch:

| Aufruf um | Kapazität je Mitarbeiter | Zugeteilte Belege |
| --- | --- | --- |
| **02:39** (vor Schichtbeginn) | 363–443 min | **41** auf 10 Bündel |
| **12:55** (Schicht fast vorbei) | 17–20 min | **16** auf 9 Bündel |

Um 12:55 bekam `ma-101` **genau einen** Beleg. Wird nach einem Nachmittags-Deploy `recalculate`
aufgerufen, sieht der Kunde ein fast leeres „Ware holen" — **exakt der Eindruck, der Dustin schon
einmal glauben ließ, das Feature fehle.**

**Empfehlung für `6aa9b`:** `recalculate` nach dem Deploy **morgens** auslösen, oder vor der Übergabe
kurz prüfen, dass `ma-101` mehrere Belege hat. Das ist ein Betriebs-, kein Codefehler.

### C5 — Bekannte Restlücke, unverändert

Der Abhak-Zustand in „Ware holen" ist rein lokal (`BundleHomeScreen.tsx:128-137`). Nach einem Reload
stand wieder „0/4 Plätze". Bekannt und dokumentiert (Gap-Analyse B(a), Restlücke 1), nicht beauftragt.

---

## 7 · Laufende Umgebung

Die Umgebung **läuft jetzt** und ist von Daniel direkt benutzbar:

| Dienst | Port | Status |
| --- | --- | --- |
| `@paket/backend-api` | **3002** (statt 3000) | `/healthz` 200, `/readyz` 200 |
| `@paket/employee-pwa` | **5175** (regulär) | 200 |
| `@paket/teamlead-web` | **5176** (statt 5174) | 200 |
| PostgreSQL | 5432 | healthy |
| Redis / MinIO / Caddy | 6379 / 9000+9001 / 80+443 | healthy |

### Selbst wieder hochfahren (Worktree `preview/vor-release`)

```bash
cd /Users/danielkashi/.cline/worktrees/048a6/packetdispov2

pnpm infra:up          # Postgres, Redis, MinIO, Caddy

# Backend — PORT schlägt API_PORT aus der .env; CORS_ORIGINS ist wegen 5176 nötig
PORT=3002 CORS_ORIGINS=http://localhost:5175,http://localhost:5176 \
  pnpm --filter @paket/backend-api dev

# Mitarbeiter-App
VITE_API_BASE_URL=http://localhost:3002 \
  pnpm --filter @paket/employee-pwa exec vite --port 5175 --strictPort

# Teamlead-Cockpit
VITE_API_BASE_URL=http://localhost:3002 \
  pnpm --filter @paket/teamlead-web exec vite --port 5176 --strictPort
```

Danach **einmal** den Demo-Datenstand herstellen (sonst ist „Ware holen" leer):

```bash
TL=$(curl -s -X POST localhost:3002/api/auth/login \
      -H 'Content-Type: application/json' \
      -d '{"employeeNo":"tl-001","pin":"0000"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")

curl -s -X POST localhost:3002/api/teamlead/assignments/recalculate \
     -H "Authorization: Bearer $TL" -H 'Content-Type: application/json' -d '{}'
```

Anmelden in der Mitarbeiter-App: Das Feld ist mit **`ma-108`** vorbelegt — einmal „Anmelden"
klicken, kein PIN. Jede andere Nummer (`ma-101` … `ma-110`) lässt sich darüberschreiben.

**Wie viel `ma-108` sieht, hängt am Zeitpunkt des `recalculate`** ([C4](#c4)) — die Bündelgröße wird
gegen `now` gerechnet. Zwei Messungen desselben Seeds:

| `recalculate` um | `ma-108` |
| --- | --- |
| 02:39 (vor Schichtbeginn) | 5 Belege, 4 Lagerplätze, 3 mit Online-Chips |
| 14:49 (Schicht fast vorbei) | 3 Belege, 3 Lagerplätze, 2 mit Online-Chips, 2 mit Etikett-Chip |

Beides reicht für die Vorführung (Mehrfachauswahl und „Rest parken" brauchen ≥ 2 Lagerplätze).
Wer den vollen Datenstand will, ruft `recalculate` morgens auf. Welcher Mitarbeiter gerade am
meisten trägt, kann dabei wechseln — um 14:49 lag `ma-107` mit 5 Belegen vorn.

> **Wenn du 3000 und 5174 freiräumst** (Container `gotenberg-fahrauftrag` stoppen, die beiden
> `busverwaltung`-Vite-Server beenden), genügt schlicht `pnpm dev` — dann stimmen auch die `.env`-
> Defaults wieder und `CORS_ORIGINS` ist nicht nötig.

### Den Branch im Haupt-Workspace auschecken

Solange **dieser** Worktree den Branch hält, verweigert git das Auschecken im Haupt-Workspace:

```
$ git -C ~/Documents/packetdispov2 switch preview/vor-release
fatal: 'preview/vor-release' is already used by worktree at
       '/Users/danielkashi/.cline/worktrees/048a6/packetdispov2'
```

Der Haupt-Checkout steht unverändert auf `main` (`35d93c3`). Drei Wege:

```bash
# a) Einfach diesen Worktree benutzen — die Umgebung läuft dort bereits.

# b) Nur ansehen, ohne den Worktree anzufassen (detached, kein Branch-Konflikt):
git -C ~/Documents/packetdispov2 switch --detach preview/vor-release

# c) Den Branch freigeben und regulär auschecken:
git -C /Users/danielkashi/.cline/worktrees/048a6/packetdispov2 switch --detach
git -C ~/Documents/packetdispov2 switch preview/vor-release
```

Bei (c) laufen die Dev-Server weiter, aber der Worktree zeigt dann nicht mehr auf den Branch.

---

## 8 · Änderungen auf diesem Branch

Über den reinen Merge hinaus:

| Datei | Änderung | Warum |
| --- | --- | --- |
| `apps/backend-api/src/dev/scenarios/case-builders.ts` | Position 1 jedes zweiten Belegs ist `onlineRelevant` | Demodaten-Lücke: ohne das ist der farbige Online-Chip für keinen Mitarbeiter erreichbar (403). Demodaten, kein Produktivcode. |
| `apps/employee-pwa/src/screens/LoginScreen.tsx` | Feld „Mitarbeiternummer" mit `ma-108` vorbelegt | Auf Wunsch von Daniel: der Demo-Link soll ohne Tippen in den vollen Datenstand führen. Konstante `DEMO_EMPLOYEE_NO`, Feld bleibt editierbar. |
| `docs/review/vorab-abnahme-preview.md` | dieser Bericht | |
| `docs/review/screenshots/*.png` | 5 Belege | |

C4-Diagramme wurden **nicht** angefasst: kein Container, kein Modul, keine Engine-Pipeline, kein
Prisma-Schema und keine Type-Chain hat sich geändert. Die Merge-Commits bringen die von den
Feature-Branches bereits aktualisierten `.mmd`/SVG mit.

### Nach der Erstfassung dieses Berichts hinzugekommen

| Commit | Inhalt |
| --- | --- |
| `95e8167` | E2E-Tests für die neun Kundenforderungen aus dem Call; darin die B3-Änderung: Etikettendruck nur noch auf zwei von drei Belegen |
| `5d45e7d` | E2E der Kundenforderungen im Cockpit gegen ein echtes, geseedetes Backend |
| `038ea9d` | `fix(cases)`: `/api/me/today` sortiert nach der Bündel-Reihenfolge der Engine |
| `812d5e9`, `212e4c8` | Merges der beiden Test-Branches |

Gegen diesen Stand erneut geprüft: `typecheck` 13/13, `lint` 0 Fehler, `test` 13/13
(backend-api 171, teamlead-web 94, employee-pwa 74, assignment-engine 166). Seed und
`recalculate` laufen, `ma-108` hat ein Bündel. **Die Empfehlung bleibt unverändert.**

---

## 9 · Automatisierte Abnahme

Jede Forderung des Kunden an das Teamlead-Cockpit ist jetzt ein Playwright-Test gegen ein **echtes,
geseedetes Backend** — kein Mock. Lauf:

```bash
pnpm --filter @paket/teamlead-web e2e     # 25 passed, exit 0
```

`e2e/fixtures/global-setup.ts` startet eine Postgres per Testcontainers, migriert, spielt den
echten Szenario-Seed ein (`prisma db seed` → 189 ready-Belege) und ruft einmal
`POST /api/teamlead/assignments/recalculate`. Das Cockpit hat keinen Login; die Suite holt sich
den Bearer-Token über den echten `POST /api/auth/login` und schiebt ihn — genau wie die Produktion
über `scripts/write-runtime-env.mjs` — als `/env.js` in die Seite (`e2e/fixtures/test.ts`).
Ports 3098/5184, damit die Suite weder den Dev-Stack noch die `employee-pwa`-Suite (3099/5185)
verdrängt.

### Welcher Test deckt welche Forderung ab

| # | Kundenforderung | Test | Status |
| --- | --- | --- | --- |
| 1 | Eva: Admin & Regelpflege speichert in **jedem** Tab | `admin-regelpflege.spec.ts` — 6 Tests, je ein Tab (Priorität, Bündel, Aufwand, Lieferungen, Verladeplan, Schichtende) | 🟢 6/6 |
| 2 | Eva: „Ich möchte euch bitten, **alles auf Deutsch** zu machen." | `deutsche-texte.spec.ts` — 8 Tests | 🟢 8/8 |
| 3 | Dustin: „Der Rest wird dann im **Geparkt** stehen." | `geparkt.spec.ts` | 🔴 **1 rot** (`test.fail()`) |
| 4 | Dustin: „Könnte ich auch nur das **Mittelstück** eingeben, 0-0-3-0-5?" | `belegsuche.spec.ts` — API + Zuweisen-Dialog | 🟢 2/2 |
| 5 | Anmeldung auf API-Ebene (das Dashboard hat bewusst keinen Login) | `login-api.spec.ts` — 4 Tests | 🟢 4/4 |

Zu **1**: Alle sechs Tabs teilen sich einen `PUT /api/admin/rules`. Jeder Test ist ein Roundtrip —
Wert ändern → speichern → **HTTP-Status der PUT-Antwort** prüfen (nicht nur den grünen Toast) →
Seite neu laden → Persistenz beweisen. Genau das war der alte Bug: die globale ValidationPipe mit
`whitelist: true` verwarf DTO-Felder ohne class-validator-Dekorator still, die Zod-Prüfung im
Service antwortete mit `400 Ungültige Regelkonfiguration`. Die `@Allow()`-Dekoratoren an
`handlingClassFactors`/`wgrFactors` (`admin.dto.ts`) halten das heute; der Aufwand-Tab ist der
eigentliche Wächter.

Zu **2**: geprüft über Tagescockpit, Belege, Digitale Ablagen, Mitarbeiterboard und die sechs
Regel-Tabs — keine englischen Wortmarken, keine rohen Enum-Schlüssel (`snake_case`/`SCREAMING_SNAKE`),
de-DE-Datum, Prozent mit Leerzeichen, kein ISO-/US-Datum. Ein Test provoziert einen Backend-Fehler
und belegt, dass die Meldung deutsch ist („Laden der Regeln fehlgeschlagen …") — der alte Wortlaut
`Backend request failed: rules (…)` aus `http.ts:31` ist weg. `DevScenariosTab` ist ausgenommen: der
Production-Build enthält den Code nicht (`AdminPage.tsx:46-51`).

Zu **5**: Teamlead `tl-001` + PIN `0000` → 200, Rolle `teamlead`. Mitarbeiter **ohne `pin`-Feld** →
200, Rolle `employee`. Unbekannte Nummer → 401. Teamlead mit falscher PIN → 401, **und** Teamlead
ohne PIN → 401: der PIN-Wegfall für Mitarbeiter hat den privilegierten Pfad nicht mitgeöffnet.

### Was rot ist — und warum

<a id="d1"></a>
#### D1 — „Rest parken" landet **nicht** im Geparkt (Dustins Forderung ist unerfüllt)

`geparkt.spec.ts` ist mit `test.fail()` als bekannter Fehlschlag markiert. Er ist **nicht
weichgespült**: der Test behauptet weiterhin genau das, was Dustin verlangt hat, und schlägt fehl.

Ursache, verifiziert:

- `POST /api/me/park` (`cases.service.ts:222`) setzt den Beleg auf **`status: 'ready'`**, hängt ihn
  vom Bündel ab und emittiert `case.parked_by_employee`. Der Beleg wandert also zurück in den
  freien Pool und wird ins nächste Bündel eingeplant.
- Die Spalte „Geparkt" der Digitalen Ablagen nimmt aber **ausschließlich** Belege mit
  `status === 'parked'` auf (`remoteDataset.ts:253`).
- Ergebnis: ein vom Mitarbeiter geparkter Beleg erscheint je nach Prio-Kennzeichen in „Prio" oder
  „Sonstige" — **nie** in „Geparkt". Nur der Teamlead-Pfad
  (`POST /api/teamlead/cases/:id/park`) setzt `parked`.

Der Test wurde beim Lauf konkret mit Beleg `3.540.310` widerlegt, der nach dem Parken in der
Prio-Spalte stand, während der Zähler von „Geparkt" auf 1 (dem Seed-Beleg) stehen blieb.

Entscheidung nötig: entweder der Mitarbeiter-Park-Pfad setzt künftig `parked`, oder Dustin bekommt
gesagt, dass „der Rest" bewusst in den Pool zurückfällt. Sobald jemand es umstellt, meldet Playwright
den Test als „passed unexpectedly" — das `test.fail()` muss dann weg.

### Zwei Befunde am Rande, die beim Bauen der Suite aufgefallen sind

1. **Die alte Spec war bereits rot.** `e2e/teamlead-flow.spec.ts` prüfte eine Oberfläche, die es
   nicht mehr gibt (`Heute – Logistik Warenauszeichnung`, `Netto-Kapazität`, Button `Neu berechnen`),
   und `playwright.config.ts` behauptete im Kommentar, die Suite laufe „against the seeded in-memory
   cockpit store … without any backend" — während `store.tsx:2` seit Längerem „backed by the live
   backend" sagt. Ohne Backend konnte die Spec nie grün sein. Beides ist korrigiert.
2. **Der §8.4-Grundzwang beim Verteilungs-Commit existiert nicht mehr.** Der alte Test verlangte für
   „Live zuweisen" einen Pflichtgrund. Heute heißt der Dialog „Verteilungs-Vorschlag" und
   `SimulationPanel.handleCommit` (`SimulationPanel.tsx:50`) ruft `recalculate.mutate()` **ohne
   Grund**. Für Park/Priorisieren greift das Audit-Gate unverändert (`teamlead-flow.spec.ts`
   beweist es). Ob der Commit einen Grund braucht, ist eine Produktentscheidung — nicht stillschweigend
   von mir wegtestbar, deshalb hier benannt.

### Was die Suite **nicht** abdeckt

- **Befund [B1](#b1)** (de-DE-Zahlen) bleibt ungeprüft: `MitarbeiterBoard.tsx:221` zeigt
  `{row.plannedHours} h geplant` nur dann mit Punkt, wenn die Stundenzahl gebrochen ist — im
  aktuellen Seed ist sie es nicht; `EmployeeDetailPanel.tsx:280` (`toFixed(2)`) liegt im Admin-Tab
  „Mitarbeiter", der nicht zu den sechs beauftragten Regel-Tabs gehört.
- Die Admin-Tabs **Lagerplätze, Mitarbeiter, Schichtplan, Integrationen** sind weder im Speicher-
  noch im Sprach-Test — beauftragt waren die sechs Regel-Tabs.
- `e2e/` liegt außerhalb von `tsconfig.json#include` (`["src", "vite.config.ts"]`) und wird damit von
  `pnpm typecheck` nicht erfasst. Das ist die bestehende Konvention, `employee-pwa` handhabt es
  identisch — hier bewusst nicht geändert.

---

## 10 · Fazit

**`6aa9b` darf starten.** Zwei Nachbesserungen empfehle ich vorher, beide winzig:

1. `MitarbeiterBoard.tsx:221` und `EmployeeDetailPanel.tsx:280` auf de-DE-Zahlen umstellen ([B1](#b1)).
2. `closeText="Schließen"` an `BundleHomeScreen.tsx:270` ([B2](#b2)).

Und eine Betriebsauflage, die wichtiger ist als beide Fixes zusammen:
**nach dem Deploy `recalculate` aufrufen — früh am Tag** ([C4](#c4)). Sonst steht Dustin wieder vor
einem leeren „Ware holen" und hält ein Feature für fehlend, das seit dem 07.07. funktioniert.

Offen bleibt eine **Produktentscheidung, kein Bug im Code**: „Rest parken" schiebt die Belege
zurück in den Pool statt in die Spalte „Geparkt" ([D1](#d1)). Dustin erwartet laut Call das
Gegenteil. Vor der Feedback-Runde mit Eva klären — der Playwright-Test hält die Forderung
so lange rot fest.
