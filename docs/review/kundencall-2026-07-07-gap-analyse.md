# Gap-Analyse Kundencall 07.07.2026 — Was muss vor dem neuen Railway-Link passieren?

**Erstellt:** 09.07.2026
**Quelle der Forderungen:** `transcript07-07-26.vtt` (Auto-Transkript, stellenweise lückenhaft — im Zweifel fachlich interpretiert)
**Teilnehmer:** Daniel, Moritz (wir) · Dustin Feldmann, Eva Raberg (L&T Logistics)
**Abgeglichen gegen:** `origin/main` = `35d93c3` — **das ist der tatsächlich auf Railway deployte Stand**, nicht der lokale.
**Nicht doppelt umgesetzt:** Vorrunden in `docs/review/dustin-feedback-review.md` (29.06.) und `docs/review/dustin-feedback-v2-review.md` (03.07.).

> **Hinweis zum Arbeitsstand:** Das lokale `main` ist **110 Commits hinter** `origin/main` und gleichzeitig **1 Commit voraus**: der ungepushte P2002-Fix `36d08fa` sitzt auf der alten Basis `f95b86e`. Dieser Fix ist **nicht deployed**. Er ist über die Branches `main` und `fix/recalculate-p2002-stranded-item` erreichbar (das primäre Arbeitsverzeichnis steht auf einem detached HEAD, der Commit ist dadurch aber nicht gefährdet). Vor dem Weiterarbeiten sollte `fix/recalculate-p2002-stranded-item` auf `origin/main` rebased und gepusht werden — sonst geht der Fix in der Divergenz unter.

---

## Legende

| Feld | Bedeutung |
| --- | --- |
| Status | `ALREADY_DONE` · `PARTIAL` · `MISSING` · `BROKEN` |
| Aufwand | **S** < 2 h · **M** ≈ halber Tag · **L** > 1 Tag |
| Risiko | Fachliches/technisches Risiko, nicht Aufwand |

**Blast-Radius-Kürzel:** `PWA` = employee-pwa · `TL` = teamlead-web · `API` = backend-api · `DT` = domain-types · `AE` = assignment-engine · `AC` = api-client (Regenerierung) · `DB` = Prisma-Schema + Migration · `C4` = Architektur-Diagramme (`docs/architecture/`)

---

## Zusammenfassung vorab

Dustin hat **genau einen** Punkt explizit zur Vorbedingung für den neuen Link gemacht: das **Positionen-Layout in der Mitarbeiter-App** (A1). Moritz hat darüber hinaus vier Dinge zugesagt (Abschnitt B).

Die Analyse gegen den deployten Code fördert allerdings **drei Blocker zutage, die im Call niemand angesprochen hat** — weil niemand sie sehen konnte:

1. **Niemand kann sich in der Mitarbeiter-App anmelden** (A2). Der Seed setzt keine PIN, `verifyPin` lehnt `null` ab. Der Link wäre für Eva und Dustin eine reine Login-Maske.
2. **Das Teamlead-Dashboard hat überhaupt keinen Login** und veröffentlicht einen gültigen Teamlead-JWT im Klartext unter `/env.js` (A3). Live verifiziert, gültig bis 16.06.2027.
3. **Jedes Deploy löscht den Belegbestand** und deaktiviert kundenseitig angelegte Lagerplätze (A4). Genau die Frage, die Dustin im Call gestellt hat („wird das dann wieder rausgelöscht?") und die unbeantwortet blieb.

Der Rest ist ehrliche Wunschliste — priorisiert in Abschnitt C.

---

# Abschnitt A — Deploy-Blocker (muss vor dem Link erledigt sein)

---

## A1 — Positionen-Layout: tabellarisch, EK/VK nach rechts

> **Dustin (explizite Link-Vorbedingung):** „Eine Sache wäre aber für mich wichtig, dass ihr das macht, **bevor wir den neuen Link bekommen**, ist das Layout von den Mitarbeitern da unten einmal anpassen, dass die Daten wie Verkaufspreis, EK-Preis weiter rechts stehen."
> **Dustin (Konkretisierung):** „In der Theorie wäre es ja auch möglich, dass du mit **Spaltenüberschriften** arbeitest, dass die Positionen immer an der gleichen Stelle stehen. Also … steht immer Position 1, und dann steht da EAN-Nummer, dann steht da Größe, und die stehen so immer untereinander … und daneben gibt es dann Minder- und Mehrmengen, damit wir den Platz besser nutzen können."
> **Dustin (Begründung):** „Es ist alles sehr geballt an Infos … und sehr unübersichtlich, und wir haben rechts unfassbar viel Leerplatz."
> **Eva:** „Ja, und das ist übersichtlicher." · „Und das ist zu klein."
> **Dustin (Zielgerät — wichtig!):** „Wir planen tatsächlich aktuell eher damit, dass wir den Mitarbeitenden ein **Touchdisplay** zur Verfügung stellen und es **nicht auf mobilen Endgeräten** machen werden … eher Richtung normaler Bildschirm, **24, 22 Zoll**."

**Status: MISSING**

**Ist-Zustand.** Die Positionen sind ein vertikaler Stapel aus Karten, keine Tabelle. Es existiert **im gesamten `employee-pwa` kein `<table>`, kein `role="table"`, keine MUI-`Table`, keine `DataGrid`**.

- `apps/employee-pwa/src/screens/BelegProcessScreen.tsx:299` — eine `<Paper variant="outlined">`-Karte pro Position, Block ≈ `:283–467`:
  ```tsx
  <Paper key={pos.id} variant="outlined" sx={{ p: 1.5 }}>
    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
  ```
- EK und VK stehen **nicht rechts**, sondern werden zu **einer Inline-Textzeile zusammengeklebt** und links unter der Größe/EAN-Zeile gerendert:
  ```tsx
  // apps/employee-pwa/src/screens/BelegProcessScreen.tsx:368-374
  const prices = [
    price(s.ekPrice) ? `EK ${price(s.ekPrice)}` : null,
    price(s.vkPrice) ? `VK ${price(s.vkPrice)}` : null,
    price(s.vkLabelPrice) ? `VK-Etikett ${price(s.vkLabelPrice)}` : null,
  ].filter(...).join(' · ');
  ```
  gerendert in `apps/employee-pwa/src/screens/BelegProcessScreen.tsx:391-395`.
- **Kein Desktop-Layout.** Kein `useMediaQuery`, keine Breakpoints, kein `Grid` in `apps/employee-pwa/src`. Der Content-Container ist `apps/employee-pwa/src/components/StepScaffold.tsx:73` (`px: 2`, ohne `maxWidth`). Auf 24" zieht der Einspalter über die volle Breite — der „unfassbar viele Leerplatz rechts" entsteht genau dadurch, dass jede Karte ihren Inhalt links zusammendrängt.

**Soll.** Positionen als echte Tabelle mit fixen Spaltenüberschriften: `Pos · EAN · Größe · Soll · Ist · Mehr-/Mindermenge · EK · VK · VK-Etikett`. EK/VK in eigenen, rechtsbündigen Spalten. Layout auf 22–24"-Desktop ausgelegt (Touch-Targets bleiben groß, aber mehrspaltig).

**Aufwand: M.** Reine Umstrukturierung eines bestehenden JSX-Blocks; alle Daten liegen bereits vor (`ekPrice`, `vkPrice`, `vkLabelPrice` auf `ReceiptSkuLine`, `apps/backend-api/prisma/schema.prisma:475-477`). Kein Backend, kein Schema, kein `api-client`.

**Risiko: mittel — und größer, als es im Call klang.** Nicht die Tabelle ist das Problem, sondern die stillschweigende Prämissenänderung dahinter: Die PWA ist heute als **mobile-first Einspalter mit Touch-Buttons** gebaut (`StepScaffold`, `TouchButton`). Dustin hat im selben Call das Zielgerät auf einen **22–24"-Desktopmonitor** festgelegt. Das ist keine Layout-Korrektur an einer Stelle, sondern eine neue Grundannahme für die gesamte App. Wenn nur die Positionen-Tabelle entsteht und der Rest bleibt ein schmaler Touch-Einspalter, wirkt das inkonsistent. Empfehlung: A1 auf die Positionen-Tabelle begrenzen (das ist, was Dustin verlangt hat), die App-weite Desktop-Frage als eigenen Punkt (C15) führen und beim nächsten Termin explizit ansprechen.

**Blast Radius:** `PWA` (1 Datei). Keine `DT`/`DB`/`AC`/`C4`-Änderung.

---

## A2 — Mitarbeiter-App: Login ist unmöglich (kein Seed-PIN)

> **Nicht im Call angesprochen** — konnte niemand sehen. Direkte Konsequenz aus Moritz' Zusage (d) „kein Passwortschutz auf dem Link".

**Status: BROKEN**

**Ist-Zustand.** Die Kette ist lückenlos:

1. Der Seed legt Benutzer an, **schreibt aber nie `pinHash`** — `apps/backend-api/src/dev/scenarios/lib.ts:127-137` (`seedUsers`; `profile` enthält `measured`, `bereiche`, `productivityFactor`, `skillTier`, `workstationId`, `weeklyPattern` — kein `pinHash`). Eine Suche nach `pinHash` in `prisma/` und `src/dev/` trifft ausschließlich Schema und Migration, **keine einzige Schreibstelle**.
2. Die Spalte ist nullable: `apps/backend-api/prisma/schema.prisma:217` — `pinHash String?`
3. `verifyPin` lehnt `null` grundsätzlich ab:
   ```ts
   // apps/backend-api/src/auth/pin.ts:9-11
   export async function verifyPin(pin: string, hash: string | null | undefined): Promise<boolean> {
     if (!hash) return false;
   ```
4. `login()` gibt daraufhin `null` zurück → 401: `apps/backend-api/src/auth/login.service.ts:38`
   (`const pinValid = await verifyPin(pin, user.pinHash); if (!pinValid) return null;`)

**Live gegen Production verifiziert (09.07.2026):**
```
POST https://paketbackend-api-production.up.railway.app/api/auth/login
     {"employeeNo":"ma-101","pin":"1234"}
→ 401 {"message":"Ungültige Anmeldedaten"}
```

Der einzige Weg, überhaupt eine PIN zu setzen, ist das Admin-UI: `apps/teamlead-web/src/features/admin/EmployeeDetailPanel.tsx:301-360` → `PATCH /api/admin/employees/:id/pin` (`apps/backend-api/src/employees/employees.controller.ts:74-84`). Solange das niemand manuell für jeden Mitarbeiter getan hat, ist die Mitarbeiter-App hinter der Login-Maske **komplett unerreichbar**.

**Soll.** Der Kunde muss die Mitarbeiter-App über den Link ohne Hürde öffnen können. Das ist inhaltlich identisch mit Entscheidung **D1 (PIN-Rückbau)** — Dustin will den PIN ohnehin weghaben. Lautet D1 „PIN raus", ist A2 automatisch erledigt. Wird D1 vertagt, muss als Minimalmaßnahme der Seed für die Demo-Benutzer PINs setzen **und** diese dem Kunden mitgeteilt werden — was Moritz' Zusage (d) direkt widerspricht.

**Aufwand: S** (Seed-PIN) bzw. **M** (sauberer PIN-Rückbau, siehe D1).

**Risiko: hoch.** Ohne diesen Punkt ist der neue Link für Eva und Dustin wertlos: Sie sehen ausschließlich `LoginScreen.tsx`. Gleichzeitig sind alle vier Moritz-Zusagen (Abschnitt B) hinter genau diesem Login eingesperrt — A2 blockiert B(a), B(b) und B(c) faktisch mit.

**Blast Radius:** `API` (+ `DB` falls Rückbau) · `TL` (PIN-UI entfällt) · `PWA` (LoginScreen) · `AC` · `C4`

---

## A3 — Teamlead-Dashboard: kein Login, gültiger Admin-Token im Klartext veröffentlicht

> **Nicht im Call angesprochen.** Direkt relevant für Evas Frage: „Ist Ihr Passwort jetzt geschützt, sozusagen, oder mit einem Login geschützt?" — und für Moritz' Zusage (d).

**Status: BROKEN** (Sicherheit)

**Ist-Zustand.** Das Teamlead-Dashboard hat **keinen Login-Screen**. Es benutzt für jeden Besucher denselben statischen Bearer-Token:

```ts
// apps/teamlead-web/src/data/api.ts:23
const token = resolveEnv('VITE_DEV_TOKEN');
```

Dieser Token wird beim Start in eine **öffentlich ausgelieferte** Datei geschrieben — `VITE_DEV_TOKEN` steht auf der `PUBLIC_KEYS`-Allowlist in `apps/teamlead-web/scripts/write-runtime-env.mjs:22-27`.

**Live gegen Production verifiziert (09.07.2026):**
```
GET https://paketteamlead-web-production.up.railway.app/env.js
→ window.__ENV__ = { ..., "VITE_DEV_TOKEN": "<gültiger RS256-JWT>" }

Decodierte Claims: sub=dev:tl-001 · employee_no=tl-001
                   realm_access.roles=["teamlead"] · exp=1813172774 → 2027-06-16

GET /api/teamlead/cases  mit diesem Token → 200 OK
```

Wer die Dashboard-URL kennt, ist damit ohne jede Anmeldung Teamlead — und kann den Token aus `/env.js` abgreifen und bis Juni 2027 direkt gegen die API verwenden. `employee-pwa` veröffentlicht analog einen `employee`-Token für `ma-101`, den die PWA selbst allerdings gar nicht liest (reines Alt-Artefakt).

**Die gute Nachricht:** Die Dev-Endpunkte (`/api/dev/*`, u. a. „Szenario laden" = Datenbank zurücksetzen) sind doppelt geschützt: `@Roles(Admin)` (`apps/backend-api/src/dev/dev.controller.ts:39`) und `DevPanelGuard` (`apps/backend-api/src/dev/dev-panel.guard.ts:13-19`, aus bei `NODE_ENV=production`). Live-Probe mit dem geleakten Teamlead-Token: **403** — die Rollentrennung hält.

**Soll.** Entscheidung Daniel (siehe **D4**). Das Spektrum reicht von „bewusst so lassen, ist Pre-Pilot mit Demodaten" bis „echter Login". In jedem Fall muss gelten: der Token darf **nicht länger im Klartext ausgeliefert** werden, und wir dürfen dem Kunden nicht sagen, das Dashboard sei geschützt.

**Aufwand: S** (Token-Laufzeit drastisch kürzen + aus `PUBLIC_KEYS` nehmen — bricht allerdings sofort das Dashboard, weil es keine Alternative gibt) bis **L** (echter Teamlead-Login / OIDC).

**Risiko: hoch, aber kontextabhängig.** Es sind heute ausschließlich Demodaten. Trotzdem: Wir sind im Begriff, dem Kunden einen Link zu geben und ihm dabei zu sagen, wir hätten den Passwortschutz entfernt. Faktisch war das Dashboard **nie** geschützt, und die Mitarbeiter-App ist umgekehrt so geschützt, dass niemand hineinkommt (A2). Genau invers zur Erwartung im Raum. Das muss Daniel wissen, bevor er den Link herausgibt.

**Blast Radius:** `TL` · `API` (auth) · Railway-Variablen · `C4` (`c1`, `c2`, `c3-backend`, `c3-teamlead`)

---

## A4 — Jedes Deploy löscht den Belegbestand und deaktiviert Kunden-Lagerplätze

> **Dustin (im Call, unbeantwortet geblieben):** „Wenn Eva jetzt rein theoretisch dort einen Verladeplan anlegt … und das jetzt bei sich da so ein bisschen rumexperimentiert, würde aber irgendwann, wenn wir weiter in dem Prozess sind, das Ganze wieder rausgelöscht werden müssen? … sondern das wird nachher alles wieder auf Reset gedrückt?"
> **Moritz:** „Sie können einfach die Daten migrieren."
> **Daniel:** „Das macht Kopfschmerzen. Bitte erst mal noch nichts eingeben."
> **Eva zuvor:** „Okay, also könnte ich schon ein, zwei Shops mal spaßeshalber eingeben?" — **Sie wird es tun.**

**Status: BROKEN** (im Sinne von: die im Call gegebene Beruhigung deckt sich nicht mit dem Code)

**Ist-Zustand.** Railway führt **bei jedem Deploy** vor dem Start aus:
```json
// apps/backend-api/railway.json:8
"preDeployCommand": "... 'prisma migrate deploy && (prisma db seed || echo seed-skipped)'"
```
Das `|| echo seed-skipped` fängt nur einen **Absturz** des Seeds ab. Ein *erfolgreicher* Seed läuft jedes Mal durch. Und der Seed setzt **immer zuerst zurück**:

```ts
// apps/backend-api/src/dev/scenarios/index.ts:43-44
await resetCaseGraph(prisma);
await scenario.seed(...);
```
```ts
// apps/backend-api/src/dev/scenarios/lib.ts:55-63
export async function resetCaseGraph(prisma: ScenarioPrisma): Promise<void> {
  await prisma.zstRecord.deleteMany({});
  await prisma.assignmentItem.deleteMany({});
  await prisma.goodsReceiptCase.updateMany({ data: { assignedBundleId: null } });
  await prisma.assignmentBundle.deleteMany({});
  await prisma.goodsReceiptCase.deleteMany({});   // Cascade: Positionen, SKU-Lines, Boxen, Issues
}
```

Konkret nach jedem Deploy:

| Datenart | Schicksal |
| --- | --- |
| Belege, Positionen, Bündel, ZST, Transportboxen, Probleme | **gelöscht**, ersetzt durch das Demo-Szenario `standard` |
| Kundenseitig angelegte **Lagerplätze** | **auf `active = false` gesetzt** — `apps/backend-api/src/dev/scenarios/lib.ts:205-210` (`updateMany({ where: { code: { notIn: LOCATIONS…} }, data: { active: false } })`) |
| Seed-Mitarbeiter (`ma-101` …) | auf Seed-Werte **zurückgesetzt** |
| Kundeneigene Mitarbeiter (eigene `employeeNo`) | bleiben |
| Verladeplan (`LoadPlanRule`) und `RuleConfig` | bleiben (`seedRuleConfig` schreibt nur, wenn die Zeile fehlt) |

Also: Evas Verladeplan **überlebt**. Ihre Lagerplätze **verschwinden aus dem aktiven Bestand**. Ihre Belege sind **weg**. Das ist eine differenziertere — und unangenehmere — Antwort als die im Call gegebene.

**Soll.** Den destruktiven Seed in Production hinter einen expliziten Schalter legen (z. B. `SEED_ON_DEPLOY=1`, Default aus), sodass ein Redeploy Kundendaten nicht anfasst. Separat: dem Kunden **verbindlich** sagen, was ein Redeploy anfasst und was nicht.

**Aufwand: S** (Env-Flag + `preDeployCommand` anpassen) · **M**, wenn zusätzlich eine saubere, nicht-destruktive Demo-Datenbefüllung entstehen soll.

**Risiko: hoch.** Eva hat im Call angekündigt, Daten einzugeben. Wenn ihre Lagerplätze nach dem nächsten Deploy stumm auf `inactive` stehen, ist das ein Vertrauensschaden, der teurer ist als der Fix. Zusätzlich hängt hieran ein **operativer** Punkt: damit „Ware holen" (B(a)) im Link überhaupt etwas anzeigt, muss dem Demo-Mitarbeiter ein Bündel zugeteilt sein — nach jedem Seed muss also einmal `recalculate` laufen. Sonst sieht der Kunde einen leeren Screen und hält B(a) erneut für unerfüllt.

**Blast Radius:** `API` (`railway.json`, `prisma/seed.ts`, `src/dev/scenarios/`) · Railway-Variablen

---

## A5 — Deutsche Texte: rohe Enum-Schlüssel im Admin-UI

> **Eva:** „Ich meine bei den Admin-Regeln. Ich möchte euch bitten, **alles auf Deutsch** zu machen."
> **Moritz:** „Wir haben das entfernt. Das ist einfach nur für uns." / „Diesen Stand packen wir auch nochmal wieder auf den Link."

Dies ist Moritz' Zusage (c) und gehört formal in Abschnitt B — es steht hier, weil es **nicht erledigt ist** und der Kunde exakt auf diesen Punkt schauen wird.

**Status: PARTIAL**

**Ist-Zustand.** Der Fließtext im Admin-Bereich ist durchgehend idiomatisches Deutsch — Eva übertreibt. Was leakt, sind zwei Dinge: **eine systemische Fehlermeldung** und **roh gerenderte Enum-Schlüssel** an genau den Stellen, die eine Admin nicht umgehen kann.

**Root Cause zuerst (wichtigster Einzelfund).** Jede Query läuft durch `unwrap()`:
```ts
// apps/teamlead-web/src/data/http.ts:31
throw new Error(`Backend request failed: ${label} (${JSON.stringify(result.error)})`);
```
Die ~20 `label`-Argumente sind englisch (`'rules'`, `'save rules'`, `'locations'`, `'employees'`, `'case search'`, …). Ergebnis: **deutscher Präfix, englischer Schwanz** in mindestens 14 Alert-Boxen, u. a. `AdminPage.tsx:171` („Regeln konnten nicht geladen werden: **Backend request failed: rules (…)**"), `AdminPage.tsx:181`, `LocationMasterEditor.tsx:116,126`, `EmployeeSettings.tsx:89,226`, `EmployeeDetailPanel.tsx:91,248,394,445`, `SchichtplanTab.tsx:111`, `BelegListPage.tsx:535`, `CockpitPage.tsx:223`, `AssignBrowseDrawer.tsx:176`, `AssignDialog.tsx:241`.

Der **Mutations**-Pfad ist bereits korrekt: `apps/teamlead-web/src/data/mutations.ts:29` baut `` `${operation} fehlgeschlagen (…)` `` mit deutschen Labels. Nur der Query-Pfad wurde vergessen. **Ein Fix an `http.ts:31` räumt 14 Stellen auf einmal ab.**

Latent, heute ohne Render-Stelle, aber einen `{error.message}` davon entfernt: `apps/teamlead-web/src/data/store.tsx:270,282,294,306,318,330,342,354,366` (`'export failed'`, `'park failed'`, `'cancel failed'`, …).

**Rohe Enum-Schlüssel:**

| # | Ort | Was der Kunde sieht |
| --- | --- | --- |
| 1 | `apps/teamlead-web/src/features/admin/LocationMasterEditor.tsx:172` (Block `:170-174`) | Lagerplatz-Dropdown „Art": `regal`, `palette_a`, `palette_b`, `palette_c`, `palette_e`, `haengebahn`, `lagerplatz_d`, `workstation`, `printer`, `conveyor_packages`, `conveyor_finished_goods` |
| 1b | `apps/teamlead-web/src/features/admin/LocationMasterEditor.tsx:166` | **Zweite Fundstelle:** der *zugeklappte* Select zeigt für jede bestehende Zeile denselben rohen `LocationKind` (`value={r.kind}`) |
| 2 | `apps/teamlead-web/src/features/belege/BelegListPage.tsx:604-608` | Status-Filter: `needs_review`, `blocked`, `ready`, `parked`, `assigned`, `in_progress`, `issue_open`, `partially_completed`, `completed`, `zst_done`, `cancelled` |
| 3 | `apps/teamlead-web/src/features/belege/BelegDetailPage.tsx:583` | Problem-Tab: roher `issueType` (`wrong_color`, `damaged_goods`, …) |
| 4 | `apps/teamlead-web/src/features/belege/BelegDetailPage.tsx:584` | roher `scope` (`case`, `position`, `sku_line`, `transport_box`) |
| 5 | `apps/teamlead-web/src/features/belege/BelegDetailPage.tsx:588` | roher `IssueStatus` (`open`, `in_review`, `waiting_external`, …) |
| 6 | `apps/teamlead-web/src/features/belege/BelegDetailPage.tsx:455` | rohe SKU-Zeilen-Status |
| 7 | `apps/teamlead-web/src/features/belege/BelegDetailPage.tsx:561` | rohe ZST-`source` |
| 8 | `apps/teamlead-web/src/features/admin/IntegrationenTab.tsx:352` | Button-Text **`Retry`** (echtes Englisch, im Admin-Tab) |
| 9 | `apps/teamlead-web/src/features/ablagen/AblagenBoard.tsx:563` | **Auf jeder Problemkarte im Ablagen-Board:** roher `issueType` (`{card.openIssue.kind}`, Typ `kind: string` laut `data/types.ts:82`) → der Kunde liest `wrong_color`, `damaged_goods`, `security_problem` |
| 10 | `apps/teamlead-web/src/features/admin/IntegrationenTab.tsx:343` | `{q.reason}` — Quarantäne-Grund direkt aus dem Backend, technisch/englisch. Vor dem Fix prüfen, welche Werte das Backend liefert. |
| 11 | `apps/teamlead-web/src/features/belege/BelegDetailPage.tsx:256` | **Zweite `issueType`-Stelle:** `Offenes Problem: <strong>{openIssue.issueType}</strong>` im Kopf-Alert jedes Belegs |
| 12 | `apps/teamlead-web/src/features/admin/EmployeeSettings.tsx:156` | Mitarbeiter-Spalte **„Rolle"**: `{emp.roles.join(', ')}` → `employee`, `teamlead`, `admin`, `it` |
| 13 | `apps/teamlead-web/src/features/admin/EmployeeDetailPanel.tsx:104` | dieselbe Rolle roh im Detail-Panel |
| 14 | `apps/teamlead-web/src/features/admin/EmployeeDetailPanel.tsx:108` | roher `ShiftSource`: `` `(${emp.todayShift.source})` `` → „Heute geplant: 420 min **(pattern)**" |
| 15 | `apps/teamlead-web/src/features/board/MitarbeiterBoard.tsx:216` | `BUNDLE_STATUS_LABELS[row.bundleStatus] ?? row.bundleStatus` — der **Fallback** leakt jeden nicht gemappten `AssignmentStatus` roh |
| 16 | `apps/teamlead-web/src/features/split/AufteilungenPage.tsx:123` | `label={split.captureMode}` — geringe Schwere (Werte sind `getrennt`/`anteilig`), und `:97` derselben Datei rendert es bereits korrekt als „getrennt erfasst" |

Zusätzlich englisch, aber niedrigere Priorität: `IntegrationenTab.tsx:291` (`<StatusRow label="Cursor">`), `EmployeeDetailPanel.tsx:351` („Employee-App-Anmeldung", während `:363` dasselbe Gerät „Mitarbeiter-Tablet" nennt), `EmployeeSettings.tsx:67` („+ Temp-Mitarbeiter"), sowie die Skill-Stufen-Labels `Starter`/`Dummy` (`EmployeeDetailPanel.tsx:48-49`, `TierChip.tsx:18-19`) — Letztere hängen an **E8**. Screenreader-Texte: `AblagenBoard.tsx:417,428,431` („Lane nach links/rechts", „Lane einklappen").

Anglizismen, die eine Team-Entscheidung sind und kein Bug: „Starter-Pack"/„Folge-Pack"/„Self-Pull" (`AdminPage.tsx:216,224,230,236,239,242`), „Box-Splitting" (`:328,333`), „Pull-Intervall"/„Jetzt pullen"/„Letzter Pull" (`IntegrationenTab.tsx:147,230,231,243,248,288,297`). Mit Eva klären, nicht einfach übersetzen.

Beispiel (`LocationMasterEditor.tsx:170-173`):
```tsx
{KINDS.map((k) => (
  <MenuItem key={k} value={k}>
    {k}                       {/* → "haengebahn" */}
  </MenuItem>
))}
```

Dazu in der PWA **ein** englischer Text, der den Nutzer wirklich erreicht:
```ts
// apps/employee-pwa/src/data/apiErrorHandling.ts:28-30
if (result.error) { throw new Error('API request failed'); }
```
durchgereicht nach `apps/employee-pwa/src/screens/BundleHomeScreen.tsx:207`
(`setParkMsg(err instanceof Error ? err.message : 'Parken fehlgeschlagen')`).
Schlägt „Rest parken" fehl, steht dort wörtlich **„API request failed"**.

**Soll.** In dieser Reihenfolge, weil der erste Schritt der billigste ist:
1. **`http.ts:31` auf Deutsch** (analog `mutations.ts:29`) → räumt 14 Alert-Boxen ab.
2. Deutsche Label-Maps für die rohen Enums (Tabelle oben).
3. `Retry` → „Erneut versuchen"; PWA-Fallback auf Deutsch.

**Die deutschen Mapper existieren teilweise schon und werden nicht benutzt — das ist ein CLAUDE.md-Verstoß, kein fehlendes Feature:**
- `packages/ui/src/theme/tokens.ts:102-108` definiert `issueStatusMeta` (`open`→„Offen", `in_review`→„In Prüfung", `resolved`→„Gelöst", …) und `packages/ui/src/components/chips.tsx:147` exportiert `ProblemChip`. `BelegDetailPage.tsx:29` **importiert `ProblemChip` bereits** — und baut daneben trotzdem von Hand ein `<Chip label={i.status} />` (`:588`). Das ist Punkt 5 der Tabelle: die Lösung liegt eine Zeile weiter oben in derselben Datei.
- `apps/employee-pwa/src/screens/ProblemMeldenScreen.tsx:29-34` hat die vollständige deutsche `IssueType`-Tabelle („Minderlieferung", „falsche Farbe", „beschädigt", …). `teamlead-web` hat **keine**. Derselbe Enum ist in der Mitarbeiter-App deutsch und im Cockpit englisch. Nach `packages/ui` bzw. `domain-types` heben, **nicht** duplizieren (Single-Source-Regel). Deckt Punkte 3, 9 und 11 ab.
- Zum Kontrast, damit klar ist, dass das System grundsätzlich funktioniert: `CaseStatus` wird überall korrekt über `CaseStatusChip`/`caseStatusMeta` gerendert, `WorkflowEventType` ist in `data/audit.ts:47-89` vollständig gemappt. `LocationKind`, `EmployeeRole`, `ShiftSource`, `IssueType`, `IssueScope` sind schlicht die Enums, zu denen niemand gekommen ist.

**Ausdrücklich KEIN Blocker (nicht anfassen):**
- `apps/teamlead-web/src/features/admin/DevScenariosTab.tsx:333` („Quick-Knobs") und `:337` („Mock-ProHandel Pull") sind **dev-only**. Ein Production-Build enthält den Code gar nicht: `AdminPage.tsx:47-49` (`import.meta.env.VITE_DEV_PANEL === '0' ? false : import.meta.env.DEV || VITE_DEV_PANEL === '1'`) schaltet den lazy `import()` weg.
- **Falsche Fährten, geprüft und verworfen:** `BelegListPage.tsx:640` rendert `SECTION_OPTIONS` roh, das sind aber Zahlen (`[1,2,3,4,7,8]`, `:85`). `AssignDialog.tsx:384` (`ASSIGN_REASONS`, `:39`) und `SplitDialog.tsx:389` (`REASON_SUGGESTIONS`, `:74`) rendern roh, sind aber bereits deutsche Klartexte („Kapazität frei", „Koffer / sperrig"). `VerladeplanTab.tsx:350,353` sind generische `PreviewLine`-Props, keine Enums.

**Aufwand: M** (nach oben korrigiert von ursprünglich S). Der Root-Cause-Fix ist S, aber es sind rund **28 Fundstellen im Admin-Bereich und ~14 außerhalb**; das Anheben der `IssueType`-Tabelle nach `packages/ui` berührt zwei Apps.

**Risiko: niedrig technisch, hoch symbolisch.** Eva hat diesen Punkt explizit adressiert, Moritz hat ihn explizit zugesagt. Wenn `haengebahn` weiterhin im Lagerplatz-Dropdown steht und jede Fehlermeldung „Backend request failed" endet, ist das der erste Eindruck des neuen Links.

**Blast Radius:** `TL` (≈ 12 Dateien, davon 1 als Root Cause) · `PWA` (2 Dateien) · `packages/ui` (`tokens.ts`, `chips.tsx`)

**Verifikationsstand dieses Abschnitts:** `http.ts:31`, `mutations.ts:29`, `BelegDetailPage.tsx:29/256/588`, `EmployeeSettings.tsx:156`, `EmployeeDetailPanel.tsx:104/108`, `MitarbeiterBoard.tsx:216` und `IntegrationenTab.tsx:352` habe ich direkt in der Datei nachgesehen. **Nicht bestätigt:** die Behauptung, `IntegrationenTab.tsx:135` enthalte den Status `ready` im Fließtext — dort steht `</Typography>`. Zeile vor dem Fix suchen.

---

# Abschnitt B — Zugesagt für den Link (Moritz' Zusagen a–d)

| Zusage | Status | Kern |
| --- | --- | --- |
| **(a)** Reparierter „Ware holen"-Screen | **ALREADY_DONE** (Code) / **blockiert durch A2 + A4** | Fix ist deployed. Sichtbar wird er nur mit Login und zugeteiltem Bündel. |
| **(b)** Etikettendruck-Info | **ALREADY_DONE** (auf „Ware holen") | Chip vorhanden. „Digitale Etiketten"/Digitex ist etwas anderes und fehlt ganz → Abschnitt C. |
| **(c)** Alle Texte auf Deutsch | **PARTIAL** | → siehe **A5**, ist ein Blocker. |
| **(d)** Kein Passwortschutz auf dem Link | **BROKEN, invers zur Erwartung** | → siehe **A2** und **A3**. |

---

## B(a) — „Ware holen"-Screen

> **Moritz im Call:** „Normalerweise würde hier ‚Ware holen' stehen … der Regalplatz … und die, die man nicht ausgewählt hat, könnte man parken. Aber das ist gerade nicht drin." · „Kaputt gegangen, weil ich habe die Demo ersetzt durch richtig, dass es halt richtig zugewiesen wird."
> **Dustin:** „Wenn da 10 Belege stehen, ich kann nur 6 auf meinen Wagen packen, kann ich die 6 anklicken, habe gesagt ‚abgeholt', und der Rest wird dann im ‚Geparkt' stehen." — „Sehr gut. Also, das ist schon mal implementiert."
> **Moritz:** „Das mit dem Ware holen sollte in dem Link drin sein."

**Status: ALREADY_DONE im deployten Code — mit zwei realen Restlücken**

„Ware holen" ist kein eigener Screen, sondern Abschnitt 1 der Startseite (`apps/employee-pwa/src/App.tsx:55-59` kennt nur `/`, `/case/:caseId`, `/case/:caseId/problem`). Er liest echte Backend-Daten (`useMeToday()` → `GET /api/me/today`).

- Stops mit Lagerplatz: `apps/employee-pwa/src/screens/BundleHomeScreen.tsx:327` (`{stop.locationCode}`)
- Einzeln abhakbar, `toggleStop(stop.id)`: `apps/employee-pwa/src/screens/BundleHomeScreen.tsx:158-165`
- „Rest parken": `apps/employee-pwa/src/screens/BundleHomeScreen.tsx:349-361` → `POST /api/me/park`
- Der von Moritz beschriebene Bruch ist **behoben**: Commit `563d5c8` „fix(employee-pwa): track Ware-holen stop collection by id, not sequence" vom **07.07.2026, 00:06** ist Vorfahre von `35d93c3` (04:39). Der Call fand danach statt — Moritz hat vermutlich gegen einen älteren Deploy demonstriert.

**Restlücken:**

1. **Der Abhak-Zustand ist rein lokal.** `apps/employee-pwa/src/screens/BundleHomeScreen.tsx:128-137` dokumentiert es selbst: „there is no backend mutation yet to persist a ‚Ware holen' stop check-off … this is a local-only echo". Ein Reload mitten im Holen verliert den Fortschritt. **Aufwand M** (neuer Endpoint + Persistenz). **Risiko: mittel** — fällt erst im echten Betrieb auf, nicht in der Demo.
2. **Toter Code.** `apps/employee-pwa/src/workflow/collect.ts` (`toggleStop`, `isCollectComplete`, `collectCounts`) wird **nirgends** importiert außer im eigenen Test; `BundleHomeScreen` implementiert die Logik inline neu. Das ist genau der Legacy-Rest aus dem Demo→Echt-Umbau, den CLAUDE.md („kein Legacy, alten Code löschen") verbietet. **Aufwand S** (löschen).

**Wichtigster Punkt:** Der Screen zeigt nur etwas, wenn der eingeloggte Mitarbeiter **heute ein Bündel hat**. Nach jedem Deploy-Seed (A4) ist das nicht der Fall, bis `recalculate` gelaufen ist. Ohne diesen Schritt sieht der Kunde einen leeren Screen und hält B(a) erneut für unerfüllt.

---

## B(b) — Etikettendruck-Info

> **Dustin:** „Steht jetzt dabei auch schon, ob ein Etikettendruck notwendig ist oder nicht? … das sollte ja vorher auch schon bei ‚Ware holen' tatsächlich stehen."
> **Moritz:** „Im Link kannst du das ganz sicher sehen."

**Status: ALREADY_DONE** (für genau das, was zugesagt wurde)

Das Feld existiert durchgehend: `apps/backend-api/prisma/schema.prisma:404` (`priceLabelPrintRequired`) → `packages/domain-types/src/cases.ts:92` → `apps/employee-pwa/src/data/caseAggregateMapper.ts:68`. Angezeigt genau dort, wo Dustin es haben wollte:

```tsx
// apps/employee-pwa/src/screens/BundleHomeScreen.tsx:335
label={`WE ${b.weBelegNo}${b.priceLabelPrintRequired ? ' · 🏷️ Etiketten drucken' : ''}`}
```

Bewusst **nicht** im Beleg-Bearbeiten-Screen (`apps/employee-pwa/src/screens/BelegProcessScreen.tsx:50-54`, `ACTION_POINT_KEYS` schließt `price_label_print` als vorgelagerten Schritt aus).

**Abgrenzung — nicht zugesagt, fehlt komplett:** „Digitale Etiketten"/**Digitex**
(Eva: „Und Digitex fehlt mir bisher noch ganz."; Dustin: „Es würde dann draufstehen ‚digitale Etiketten' … und das würde aber auch schon im Vorfeld da stehen müssen.").
Repo-weit **null Treffer** für `Digitex` oder „digitale Etikett". Kommt laut Dustin aus dem ERP → siehe C14 und E5.

---

## B(c) — Alle Texte auf Deutsch → **siehe A5** (nicht erledigt, Blocker)

## B(d) — Kein Passwortschutz auf dem Link → **siehe A2 + A3**

> **Eva:** „Ist Ihr Passwort jetzt geschützt, sozusagen, oder mit einem Login geschützt? Könnt ihr uns das mitteilen für den neuen Link?"
> **Moritz:** „Ja, oder wir können sogar für den neuen Link einfach entfernen."

Die Realität ist genau umgekehrt zur Annahme im Raum:
- **Mitarbeiter-App:** hat einen echten Login — und **niemand kommt hinein** (A2).
- **Teamlead-Dashboard:** hat **gar keinen** Login und veröffentlicht einen bis 2027 gültigen Teamlead-Token (A3).

Moritz' Zusage lässt sich nur einlösen, indem **beide** Punkte bewusst entschieden werden (D1, D4). Sie ist kein Konfigurationsschalter.

---

# Abschnitt C — Gefordert, aber nach dem Link machbar (nach Aufwand sortiert)

## Aufwand S

### C1 — Suchfeld vergrößern
**Eva:** „Das müsste wahrscheinlich größer werden."
**Status: PARTIAL.** Das Haupt-Suchfeld ist das einzige ohne `size`-Prop (also `medium`), während alle übrigen Suchfelder `size="small"` sind — Eva meinte vermutlich die *Trefferliste*/den Dialog, nicht das Eingabefeld. `apps/teamlead-web/src/components/AssignDialog.tsx:190` (`autoFocus fullWidth`, kein `size`). Vergleich: `apps/teamlead-web/src/features/belege/BelegListPage.tsx:587-592` (`size="small"`, `minWidth: 220`).
**Soll:** Dialogbreite + Trefferliste vergrößern, Feldgrößen vereinheitlichen. **Risiko: niedrig.** Beim nächsten Termin kurz rückfragen, was genau „größer" meinte.
**Blast Radius:** `TL`

### C2 — Hinweis („besondere Aufmerksamkeit") dem Mitarbeiter zeigen
**Eva:** „Wer sieht das? Ich als Admin oder der Mitarbeiter?" · **Moritz:** „Ja, das macht natürlich Sinn, dass auch die Mitarbeiter …"
**Status: BROKEN (halb verdrahtet).** Der Teamlead setzt den Hinweis (`apps/teamlead-web/src/components/AttentionDialog.tsx`) und sieht ihn (`apps/teamlead-web/src/features/belege/BelegDetailPage.tsx:261-265`). Die PWA **mappt** `attentionFlag`/`attentionNote` bereits (`apps/employee-pwa/src/data/caseAggregateMapper.ts:199-200`), **rendert sie aber nirgends** — der Feldname kommt in `apps/employee-pwa/src` außerhalb des Mappers und der Testfixtures nicht vor.
**Soll:** Hinweis-Banner im Beleg-Screen der PWA. **Aufwand S** (Daten liegen an). **Risiko: niedrig.**
**Blast Radius:** `PWA` (1 Datei)

### C3 — „Genauer" als Pflichtfeld
**Dustin:** „Wenn ich diesen Problemfall habe, dann ist dieses ‚genauer' ja eigentlich nicht optional, sondern das ist ein Pflichtfeld. Entweder muss ich sagen ‚ganze Position' … oder ich habe eine Mehrfachnennung möglich." **Eva:** „Ja."
**Status: MISSING.** Heute ist die Auswahl optional, Default „Ganze Position": `apps/employee-pwa/src/screens/ProblemMeldenScreen.tsx:139-153` (`label="Genauer (optional)"`, `<MenuItem value="">Ganze Position</MenuItem>`).
**Soll:** Explizite Pflichtwahl zwischen „ganze Position" und konkreten EANs. **Hängt an C7** (Mehrfachauswahl) — sinnvoll gemeinsam. **Aufwand S** allein, **M** zusammen mit C7. **Risiko: niedrig.**
**Blast Radius:** `PWA`

### C4 — Foto-Funktion: streichen statt bauen
**Eva:** „Die werden mit Sicherheit keine Fotos machen. Und je weniger wir an Daten [erfassen], umso schneller geht es ja auch nachher." **Moritz (kurz zuvor):** „Fotos, eine sehr gute Idee. Das machen wir dann auch."
**Status: totes Gerüst.** Kein Upload-Control existiert; nur ein statisches Label `apps/employee-pwa/src/screens/ProblemMeldenScreen.tsx:175-177` („Foto: optional") und ungenutzte Durchleitung `apps/employee-pwa/src/data/persist.ts:25,98` (`photoKeys?: string[]`, nie befüllt). Das Prisma-Feld existiert (`apps/backend-api/prisma/schema.prisma:644`, `photoKeys String[]`).
**Soll (Empfehlung):** Eva ist die Nutzerin und rät ab → **ersatzlos entfernen** (Label + tote Durchleitung), im Sinne von CLAUDE.md „kein Legacy". Ob das Prisma-Feld mitfällt: Entscheidung in **E7**.
**Aufwand S. Risiko: niedrig**, aber Moritz hat es im Call zugesagt → vorher kurz mit dem Kunden klären.
**Blast Radius:** `PWA` (ggf. `DB`)

### C5 — „Hauptjob"/Shop-Zuordnung pro Position vollständig anzeigen
**Eva:** „Wir brauchen hier auch noch Hauptjob und Job." · „Wenn ich Position 1,2,3,4 den einen Shop habe, 5,6,7,8 den nächsten Shop … muss ich sehen, welche Positionen in welche Box gehören."
**Dustin:** „Positionsebene direkt meinte Eva. Damit ich direkt bei der Auszeichnung der Ware erkennen kann: das ist jetzt Shop 21, nächste Position ist Shop 22." · „Du brauchst die komplette Nummer, also die vierstellige."
**Status: PARTIAL.** Die Shop-Nummer steht bereits pro Position (`apps/employee-pwa/src/screens/BelegProcessScreen.tsx:312-314`, `Shop {pos.shopNo}`). Was fehlt, ist `hShopNo` („Haupt-Shop-Nr."): existiert in `packages/domain-types/src/cases.ts:73` und wird backendseitig für die Box-Aufteilung benutzt (`apps/backend-api/src/modules/transport/box-splitting.ts:88`), wird in der PWA aber **nie gemappt** (`apps/employee-pwa/src/data/caseAggregateMapper.ts:79-138`).
Die Vierstelligkeit ist nirgends erzwungen (`shopNo` ist `String`, `apps/backend-api/prisma/schema.prisma:429`) — laut Dustin kommt die echte Nummer erst aus ProHandel („Das ist einfach nur ein Platzhalter gerade").
**Soll:** `hShopNo` mappen und neben `shopNo` rendern. **Aufwand S. Risiko: niedrig.** Vierstelligkeit ist ein ERP-Thema (E5).
**Blast Radius:** `PWA`

### C6 — Catman-Termin anzeigen
**Eva:** „Hier steht Catman. Aber welcher Catman — mir fehlt das Datum."
**Dustin:** „Es müsste auch der entsprechende Catman-Termin … das ist praktisch ein Datum … kommt aus dem ERP-System, aber es sollte der Platz dafür gegeben sein."
**Status: PARTIAL.** Das Boolean wird angezeigt (`apps/employee-pwa/src/screens/BelegProcessScreen.tsx:326`, Chip „Catman"). Das Datum existiert im Schema (`apps/backend-api/prisma/schema.prisma:362`, `catManDate DateTime? @db.Date`; `packages/domain-types/src/cases.ts:151`), wird im PWA-Mapper aber **hart verworfen**: `apps/employee-pwa/src/data/caseAggregateMapper.ts:191` → `catManDate: undefined`. Der speisende `CaseSummaryDto` führt es gar nicht mit.
**Soll:** DTO erweitern, `api-client` regenerieren, Datum am Beleg anzeigen. **Aufwand S–M** (wegen `AC`-Regenerierung). **Risiko: niedrig.**
**Blast Radius:** `API` (DTO) · `AC` · `PWA`

---

## Aufwand M

### C7 — Problem melden: Mehrfachauswahl von Positionen/EANs
**Eva:** „Aber ich kann auch mehrere Positionen als Problem melden." · „…dann müsste ich ja nicht jeden einzelnen Artikel anklicken, sondern müsste auf Positionsebene sagen: anstatt grau ist es in weiß gekommen."
**Dustin:** „Das Mehrfach-Auswählen, das ist auf jeden Fall wichtig. Das brauchen wir, weil manchmal sind von den 4 EAN-Nummern 2 davon betroffen und 2 nicht."
**Moritz:** „Gerade muss man das einzeln machen."

**Status: MISSING.**
- Frontend ist strikt einwertig: `apps/employee-pwa/src/screens/ProblemMeldenScreen.tsx:58-59` (`issueType`, `skuId` je ein `useState` mit Einzelwert); `send()` baut genau ein `{scope, scopeId}` (`:101-115`).
- **Und das Datenmodell auch:** `apps/backend-api/prisma/schema.prisma:639-640` — `scope IssueScope` + **`scopeId String?`** (Einzahl). Ein `Issue` zeigt auf genau ein Zielobjekt. DTO analog: `apps/backend-api/src/cases/cases.dto.ts:924-951`.

**Soll:** Mehrere EANs in einem Vorgang melden. Entweder n `Issue`-Zeilen aus einem Request, oder eine Join-Tabelle.
**Aufwand: M–L. Deutlich größer, als es im Call klang** — Dustin und Eva beschreiben es als Checkbox-UI, tatsächlich ist es eine Änderung am Issue-Datenmodell inkl. Migration, DTO, `api-client` und Teamlead-Anzeige.
**Risiko: mittel.** Die Vorrunde (`dustin-feedback-v2-review.md`, M30) hat bewusst ein **Einfach**-Dropdown gebaut — hier wird eine frühere Entscheidung revidiert. Nicht als „Bugfix" einplanen.
**Blast Radius:** `PWA` · `API` · `DT` · `DB` (Migration) · `AC` · `TL` · `C4` (`domain-model.mmd`)

### C8 — Preisabweichung an der Position erfassen
**Eva:** „Der Mitarbeiter prüft ja den Preis … wenn der Lieferant die Ware mit 25 € ausgezeichnet hat, bei uns steht sie mit 23 im System, dann brauche ich die Info: der Mitarbeiter muss es dort irgendwo vermerken und mir den Beleg zuschicken … am besten an der Position machen, wo es auch aufgetaucht ist."
**Moritz:** „Da muss man nur mit Zahlen eingehen." · **Eva:** „Das ist eine gute Idee." · **Moritz:** „Okay, ja, das machen wir dann."
**Status: MISSING (vollständig).** EK/VK liegen auf `ReceiptSkuLine` (`apps/backend-api/prisma/schema.prisma:475-477`) und sind **reine Anzeige** (`apps/employee-pwa/src/screens/BelegProcessScreen.tsx:368-374`). Es gibt **kein** Feld für einen beobachteten Abweichungspreis (repo-weit null Treffer für `observedPrice`/`priceDeviation`). Das einzige editierbare Zahlenfeld je Größe ist der Mengen-Stepper (`:396-421`).
**Soll:** Numerisches Feld je SKU-Zeile + Weiterleitung an den Teamlead.
**Aufwand: M. Größer, als es klang:** neues Feld durch die ganze Kette `DB → DT → OpenAPI → AC → PWA → TL`, plus die fachliche Frage, ob eine Preisabweichung den Beleg blockiert (Eva: „und ich muss es noch mal prüfen" → klingt nach Problem-/Freigabe-Workflow, nicht nur nach einem Eingabefeld).
**Risiko: mittel.** Interagiert mit C7 (ist eine Preisabweichung ein `Issue` vom Typ `other`, oder ein eigenes Konzept?). **Vor Umsetzung klären → E3.**
**Blast Radius:** `DB` · `DT` · `API` · `AC` · `PWA` · `TL` · `C4` (`domain-model.mmd`)

### C9 — Mehrere Bündel gleichzeitig anfordern
**Eva:** „Kann der Mitarbeiter 2 Bündel gleichzeitig anfordern?" … „Eine Mitarbeiterin ist überdurchschnittlich gut, schafft über 100 Teile die Stunde … die müsste sehr häufig loslaufen. Diese überdurchschnittlich guten Mitarbeiter nehmen sich in der Regel mehr Arbeit an den Platz, damit sie einfach nicht so viel rennen müssen." **Moritz:** „Ja, ja. Okay."
**Status: MISSING (bewusst gesperrt).** Zwei Ebenen:
- Engine: `packages/assignment-engine/src/assignment/distribute.ts:122` — `if (st.assignedProtos.length > 0) continue; // ein Starter-Pack je Person`
- API (die operative Sperre): `apps/backend-api/src/assignment/assignment.service.ts:231-244` — zählt offene Fälle des Tages, `if (open > 0) return { assigned: false, reason: 'active_bundle' }`

Keine DB-Constraint. PWA-seitig nur eine Render-Bedingung (`apps/employee-pwa/src/screens/BundleHomeScreen.tsx:426-442`, Button nur wenn `allDone`).
**Soll:** N offene Bündel erlauben (konfigurierbar, vermutlich abhängig von `productivityFactor`/`skillTier`).
**Aufwand: M. Risiko: mittel-hoch** — das ist Fachlogik in der `assignment-engine` (CLAUDE.md: „die Engine entscheidet"). Ein hart verdrahtetes „Limit = 2" wäre falsch; es braucht eine Regel. Berührt zudem Kapazitätsrechnung und Schichtende-Cutoff.
**Blast Radius:** `AE` · `API` · `PWA` · ggf. `DT` (RuleConfig) · `C4` (`c4-engine-pipeline.mmd`)

### C10 — Bereich aus Admin-/Belegansichten entfernen
**Eva:** „Aber der Bereich kann ja überall weg." · „Ist für uns völlig uninteressant."
**Dustin:** „Wir brauchen das in bestimmten Punkten. Es muss eingegeben werden für die Mitarbeiter: Wo muss ich mein Paket abholen? Und es muss vielleicht nachher für eine eventuelle Wegeoptimierung herhalten. Aber effektiv muss der Admin nicht mit dem Bereich Hängebahn, Palette oder Regal arbeiten. Also der Bereich kann weg."

**Ist der Widerspruch auflösbar? Ja — sauber, wenn man Anzeige und Logik trennt.** Der Mitarbeiter braucht den **Lagerplatz** (`stop.locationCode`, `apps/employee-pwa/src/screens/BundleHomeScreen.tsx:327`), **nicht** den abgeleiteten Bereich. Der Bereich ist eine reine Aggregation über `LocationKind` (`packages/domain-types/src/location.ts:26,30-45`). Er kann also aus der Teamlead-Oberfläche verschwinden, ohne dem Mitarbeiter etwas zu nehmen.

**Status: PARTIAL.** Vollständiges Inventar, getrennt nach Anzeige und Verhalten:

*Reine Anzeige (löschbar):*
- `apps/teamlead-web/src/components/AssignDialog.tsx:180-181,267,308` — Bereich-Chips
- `apps/teamlead-web/src/components/BelegSearchResultRow.tsx:54`
- `apps/teamlead-web/src/features/belege/AssignFromListDialog.tsx:111,134,140-146`
- `apps/teamlead-web/src/features/board/MitarbeiterBoard.tsx:233-237`
- `apps/teamlead-web/src/features/cockpit/CockpitPage.tsx:442`

*Verhalten (nicht einfach löschbar):*
- `apps/teamlead-web/src/components/AssignDialog.tsx:104` — schränkt die Suche auf den Bereich des Mitarbeiters ein (Commit `adfb6f7`). Wenn der Chip verschwindet, die Einschränkung aber bleibt, wird die Suche **unerklärlich**.
- `apps/teamlead-web/src/components/AssignBrowseDrawer.tsx:56,61-66` — serverseitige Einschränkung
- `apps/teamlead-web/src/features/ablagen/AblagenFilterBar.tsx:157-169` + `ablagenFilters.ts:105,164,211-231` — Filter **und** „Gruppieren nach: Bereich"
- `apps/teamlead-web/src/features/admin/EmployeeDetailPanel.tsx:139-186` — `bereiche` des Mitarbeiters (Engine-Eingabe!)
- `apps/backend-api/src/cases/case-search.ts:44-49` — `bereich`-Parameter
- `packages/assignment-engine/src/assignment/distribute.ts:38-46,131` — weicher Malus; `bundling.ts:125` — Bündel bereichshomogen
- `apps/backend-api/src/assignment/assignment.service.ts:305` — **harter Filter** beim Selbst-Ziehen

**Soll:** Anzeige-Stellen entfernen; Engine-Eingabe und Selbst-Zieh-Filter bleiben — **es sei denn, D2 (Skills-Modell) macht sie ohnehin obsolet.**
**Aufwand: M. Risiko: mittel.** Der persistierte `groupBy`-State in `localStorage` muss migriert werden (Präzedenz: Commit `f7a7496` „sanitize stale groupBy").
**Wichtig:** **C10 nicht vor D2 umsetzen.** Wenn Bereiche als Mitarbeiter-Skill fallen (D2), verschwindet ein Großteil dieser Stellen automatisch. Sonst macht man die Arbeit zweimal.
**Blast Radius:** `TL` (≈ 9 Dateien) · ggf. `API`/`AE`

### C11 — Lieferschein-Gruppe („Päckchen") in einer Aktion zuteilen
**Eva:** „Das kann man sich als Päckchen packen, sozusagen, und dann dem Mitarbeiter zuteilen? Muss jeder einzelne Lieferschein zugeteilt werden?" · „Dieses gehört zusammen. Das wird ein Päckchen, weil wir haben ja nicht immer fortlaufende Nummern bei denen, die zusammengehören."
**Status: PARTIAL.** Erkennung und Zusammenhalt funktionieren bereits: `packages/assignment-engine/src/grouping/delivery-group.ts` (`detectDeliveryGroups`) und `bundling.ts:107-115,129,134-137` (ein Bündel bricht nie mitten in einer Gruppe). Die UI zeigt Gruppen (`apps/teamlead-web/src/components/LieferungChip.tsx`), erlaubt Merge/Split/Release (`apps/teamlead-web/src/features/belege/DeliveryGroupPanel.tsx`) und filtert „Nur Gruppen" (`apps/teamlead-web/src/features/ablagen/AblagenFilterBar.tsx:185-203`).
**Was fehlt:** kein Knopf „Diese Lieferung als Ganzes an X zuteilen". Manuell muss man die Mitglieder einzeln auswählen. Das Board **warnt** sogar, wenn eine Gruppe auf mehreren Mitarbeitern landet (`apps/teamlead-web/src/features/board/MitarbeiterBoard.tsx:74-87`).
**Soll:** Gruppen-Zuteilung in einer Aktion. **Aufwand: M. Risiko: niedrig** (Engine kann es bereits, nur UI + Bulk-Endpoint fehlen).
**Blast Radius:** `TL` · `API`

### C12 — Mitarbeiter-Problemfallbox
**Dustin:** „Ich glaube, es kann gar nicht so falsch sein, wenn der Mitarbeiter auch eine Problemfallbox hat, wo diese Dokumente auch als Kopie abgelegt werden, damit er nachhalten kann: Was liegt denn jetzt noch an Problemen bei meinem Teamlead? … Wo warte ich denn noch auf Antwort?"
**Eva:** „Vor allem, weil manche Probleme werde ich weiterleiten müssen … und dass die dann praktisch zu dem Kollegen zurückgehen, damit der seine Ware vom Tisch bekommt."
**Status: MISSING.** Probleme landen heute nur beim Teamlead (`apps/teamlead-web/src/features/ablagen/AblagenBoard.tsx`, Lane `probleme`). Die PWA hat keine Übersicht offener eigener Probleme.
**Soll:** Eigener PWA-Bereich „Meine Problemfälle" inkl. Status (wartet auf Teamlead / weitergeleitet / gelöst) und Rücksprung zum Beleg.
**Aufwand: M. Risiko: niedrig-mittel** (neuer Endpoint `GET /api/me/issues`, neuer Screen; das Statusmodell existiert bereits: `IssueStatus` = `open|in_review|waiting_external|resolved|rejected`).
**Blast Radius:** `PWA` · `API` · `AC` · `C4` (`c3-employee-pwa-components.mmd`)

---

## Aufwand L

### C13 — Spalten in der Belege-Tabelle verschieben und ausblenden
**Eva:** „Hier wäre es gut, wenn wir die Spalten genauso wie vorne in der digitalen Ablage hin und her schieben können." · „Mein Lager ist für mich z. B. uninteressant." **Dustin:** „Also per Drag and Drop, festhalten, Linksklick."
**Status: MISSING (Belege) / PARTIAL (Ablagen).**
- Ablagen kann **Lanes** (Kanban-Spalten) per Knopf verschieben und einklappen — **kein** Drag & Drop: `apps/teamlead-web/src/features/ablagen/AblagenBoard.tsx:164` (`moveLane`, ◀/▶-Buttons) und `:175` (`toggleCollapsed`). Eva bezieht sich also auf etwas, das es so gar nicht gibt.
- Die Belege-Tabelle nutzt TanStack Table (`apps/teamlead-web/src/components/DataTable.tsx:67`), Spalten sind fest im Code (`apps/teamlead-web/src/features/belege/BelegListPage.tsx:274-492`), nur Sortierung ist verdrahtet.
- **Halb vorbereitet:** `columnVisibility` wird bereits durchgereicht (`apps/teamlead-web/src/components/DataTable.tsx:37,70`), aber nie gesetzt, und es gibt keine Bedien-UI.
- **Keine Drag-&-Drop-Bibliothek im Repo** (kein `@dnd-kit`, kein `react-dnd`).
**Soll:** Spalten-Picker (ausblenden) + Reihenfolge, persistiert in `BelegeSavedView`.
**Aufwand: M** für Ausblenden allein (halb da), **L** mit echtem Drag & Drop (neue Abhängigkeit + `columnOrder`-State + Persistenz).
**Risiko: niedrig.** Empfehlung: erst Ausblenden liefern (der eigentliche Schmerz — „mein Lager ist uninteressant"), Drag & Drop separat und beim Kunden rückfragen, ob Pfeiltasten reichen.
**Blast Radius:** `TL` (+ ggf. neue Dependency)

### C14 — Digitex / digitale Etiketten
**Eva:** „Und Digitex fehlt mir bisher noch ganz."
**Dustin:** „Wir haben bestimmte Bereiche im ERP-System hinterlegt, welche davon kriegen Digital-Etiketten … es würde dann draufstehen ‚digitale Etiketten', und dann weiß der Mitarbeiter: Okay, ich gehe jetzt nicht zum Drucker … und das würde aber auch schon im Vorfeld da stehen müssen, in der vorherigen Ansicht, wo auch Etikettendruck steht."
**Status: MISSING (repo-weit null Treffer).**
**Soll:** Neues Feld analog `priceLabelPrintRequired`, angezeigt auf „Ware holen" **und** am Beleg.
**Aufwand: S** rein technisch — **aber blockiert:** die Quelle ist das ERP („nur für bestimmte Lieferanten, weil wir da noch in der Testphase sind"). Ohne ProHandel-Schnittstelle kein echter Wert → **abhängig von E5.**
**Risiko: niedrig technisch, hoch bzgl. Reihenfolge** — jetzt bauen heißt: Platzhalter bauen.
**Blast Radius:** `DB` · `DT` · `API` · `AC` · `PWA` · `C4`

### C15 — Desktop-Layout für die gesamte Mitarbeiter-App
**Dustin:** „Wir gehen eher in Richtung normaler Bildschirm … 24, 22 Zoll." (nicht mobil, nicht iPad)
**Status: MISSING.** Siehe A1: keinerlei Responsive-Behandlung in `apps/employee-pwa/src`.
**Soll:** Layout-Grundsatz für 22–24"-Touchscreens.
**Aufwand: L. Risiko: mittel.** Dies ist die **Prämissenänderung**, die A1 nur punktuell adressiert. Sie betrifft `StepScaffold`, `TouchButton`, alle Screens. Bewusst planen, nicht nebenbei mit A1 erledigen.
**Blast Radius:** `PWA` (app-weit) · ggf. `packages/ui`

### C16 — Aufteilung: Prozente nur intern, keine Teileanzahl
**Moritz:** „Wir würden einfach machen, dass man für einen Beleg mehrere Mitarbeiter hinzufügen kann … die kriegen einfach einen prozentualen Anteil automatisch."
**Dustin:** „Ich glaube, das ist schwierig, so zu planen, mit sowohl prozentual als auch Teileanzahl … Auch das Prozentuale ist nicht umsetzbar, weil … die werden die Belege einfach zusammen abarbeiten. Da gibt es keine Vorgabe: Du machst Position 1 bis 3 und der andere macht 4 bis 6."
**Moritz:** „Ich meinte das einfach nur so im Hintergrund … für die Auslastung … nicht dem Mitarbeiter konkret das anzeigen." **Dustin:** „Dann würde ich damit mitgehen."
**Status: BROKEN gegenüber der Absprache.** Der heutige Stand macht genau das, was Dustin ablehnt:
- Aufteilung **nach Teilemenge**: `apps/teamlead-web/src/features/split/SplitDialog.tsx:106` (`splitMode='quantity'`)
- **Prozente werden angezeigt**: `apps/teamlead-web/src/features/split/AufteilungenPage.tsx:113` (Spalte „Anteil"), `:129` (`{s.sharePct} %`), plus Fortschrittsbalken `SplitDialog.tsx:280`
- Und das Ganze ist **nur Session-State**, nicht persistiert: `apps/teamlead-web/src/features/split/SplitProvider.tsx:118-153`
**Soll:** Teile-Aufteilung entfernen; Prozentanteil nur als interne Auslastungsgröße, nicht in der Mitarbeiter-Sicht.
**Aufwand: M. Risiko: mittel** — hängt eng an **E1** (Zusammenarbeit mehrerer Mitarbeiter an einem Beleg), das ungeklärt ist. **Nicht umsetzen, bevor E1 beantwortet ist**, sonst bauen wir zweimal.
**Blast Radius:** `TL` · ggf. `API`/`AE`

---

## Bereits erledigt — Wahrnehmungslücke, kein Task

Drei Punkte hielten Dustin/Eva für fehlend; sie sind implementiert. Vermutlich sahen sie einen **veralteten Link** und/oder Demodaten ohne die entsprechenden Flags. Vor dem nächsten Termin lohnt es, den Datenstand so zu setzen, dass diese Features sichtbar sind.

| Punkt | Beleg |
| --- | --- |
| **Sicherungstyp-Piktogramm** — Dustin: „Das Piktogramm, wo es hin muss … das fehlt gerade tatsächlich." | Implementiert: `apps/employee-pwa/src/screens/BelegProcessScreen.tsx:343-358`, URL-Bau `:108-110`. **Live geprüft:** `GET /static/pictograms/hard-tag.svg` → `200`, `image/svg+xml`, 549 Bytes. Bogus-Pfad → `404`. Die Assets sind echt. |
| **Online-Absortierung auf Positionsebene** — Eva/Dustin: „Damit es auch auf Positionsebene noch mal steht." | Implementiert je Größe als farbiger Chip: `apps/employee-pwa/src/screens/BelegProcessScreen.tsx:387-389` (`onlineMarks`), plus Positions-Anweisung `onlineHandlingRequired`. Heißt im Code nur nicht „Absortierung". |
| **Suche über Nummern-Mittelstück** — Dustin: „Könnte ich auch nur das Mittelstück eingeben, 0-0-3-0-5?" | Ja: `apps/backend-api/src/cases/case-search.ts:36-40` nutzt `contains` (case-insensitive) über `weBelegNo`, `deliveryNoteNo`, `storageLocation.code`, `primaryShopNo`, `branchNo`. Exakte Treffer werden nur höher gerankt (`matchTier`, `:56-61`). |

Ebenfalls bereits vorhanden und im Call teils gesucht: Verladeplan inkl. Sondertag und Datumsfeldern (`apps/teamlead-web/src/features/admin/VerladeplanTab.tsx:260-284`), Lagerplatz-Stammdatenpflege (`apps/teamlead-web/src/features/admin/LocationMasterEditor.tsx`), Weiterleiten an Retourenabteilung/Lieferscheinbucher (`apps/teamlead-web/src/components/ForwardDialog.tsx`).

---

# Abschnitt D — Konflikte und Entscheidungen, die Daniel treffen muss

---

## D1 — PIN-Login: komplett zurückbauen oder optional machen?

> **Moritz:** „Ein Mitarbeiter soll sich einloggen können über einen PIN oder ohne PIN, einfach so direkt, nur mit der Mitarbeiternummer oder dem Namen."
> **Eva:** „Da müssten wir ja auch für Azubis und studentische Aushilfen jedes Mal ein extra Passwort vergeben, richtig? … Ich finde es so umständlich."
> **Dustin:** „Ich finde es auch umständlicher, und ohne PIN wäre es genauso machbar. Niemand hat Interesse daran, die Mitarbeiternummer von jemand anderem zu benutzen. Keiner will für den anderen mitarbeiten, und keiner will dem anderen eins reindrücken. Das schließe ich konsequent aus, dieses Thema. **Deswegen kann es ohne PIN laufen.**"

**Der Konflikt.** Genau dieser PIN-Login wurde in den letzten ~15 Commits gebaut und ist live: bcrypt (`apps/backend-api/src/auth/pin.ts`, `SALT_ROUNDS = 12`), RS256-JWT (`apps/backend-api/src/auth/token-issuer.ts`), Admin-PIN-Reset-UI (`apps/teamlead-web/src/features/admin/EmployeeDetailPanel.tsx:301-360`), Migration `20260706165606_add_user_pin_hash`.

**CLAUDE.md ist eindeutig:** „Beim Ersetzen eines Konzepts den alten Code löschen. Keine Compat-Shims." Eine Variante „PIN ist optional, wenn `pinHash` null ist, wird die Prüfung übersprungen" wäre **exakt der verbotene Shim** — und nebenbei ein stiller Sicherheits-Downgrade, den niemand im Code sieht. **Diese Option ist regelwidrig und scheidet aus.**

**Der Haken, den im Call niemand kannte:** Es gibt **keine getrennte Teamlead-/Admin-Authentifizierung**. Teamlead und Admin melden sich über **denselben** Endpoint an; die Rolle kommt aus der Datenbank:

```ts
// apps/backend-api/src/auth/login.service.ts:41-44
const roles = user.roles.map(...).filter(...);
const effectiveRoles = roles.length > 0 ? roles : [Role.Employee];
```

„PIN raus" bedeutet daher wörtlich: **auch Teamlead und Admin melden sich ohne jedes Geheimnis an, allein mit einer Mitarbeiternummer.** Dustins Begründung („keiner will für den anderen arbeiten") trägt für Mitarbeitende. Sie trägt **nicht** für ein Cockpit, das die Tagesdisposition des ganzen Lagers steuert.

**Optionen:**

| | Beschreibung | Bewertung |
| --- | --- | --- |
| **1** | PIN vollständig raus, für **alle** Rollen. Login = Mitarbeiternummer. | Erfüllt Dustin wörtlich. CLAUDE.md-konform. **Öffnet aber das Admin-Cockpit für jeden, der eine Teamlead-Nummer errät.** |
| **2 (Empfehlung)** | PIN raus **für die Mitarbeiterrolle**; Teamlead/Admin bekommen echte Authentifizierung (perspektivisch OIDC, bis dahin mindestens ein Passwort). | **Kein Compat-Shim**, sondern rollendifferenzierte Auth — ein legitimes Design, kein Legacy-Fallback. Erfüllt Dustins Anliegen (er sprach über Mitarbeitende). Behebt zugleich **A3**. |
| **3** | PIN optional, wenn `pinHash` null. | ❌ **Regelwidrig** (Compat-Shim), stiller Sicherheits-Downgrade. Nicht wählen. |

**Blast Radius bei Option 1/2 (identisch für den Mitarbeiterpfad):**
- **Löschen:** `apps/backend-api/src/auth/pin.ts` (+ `pin.test.ts`); `resetPin` in `apps/backend-api/src/employees/employees.controller.ts:74-84` und `employees.service.ts:274-288`; `PinResetDto`; `hasPinSet` (`employees.service.ts:418`); Event-Literal `'employee.pin_reset'` (`packages/domain-types/src/enums.ts:196`); PIN-UI in `apps/teamlead-web/src/features/admin/EmployeeDetailPanel.tsx:301-360`; Spalte `pinHash` (`apps/backend-api/prisma/schema.prisma:217`) + neue Migration; Integrationstest `auth-login.int.test.ts`.
- **Umschreiben:** `login.service.ts`, `login.dto.ts`, `login.controller.ts`; `apps/employee-pwa/src/screens/LoginScreen.tsx`.
- **Behalten (Token-Vertrag bleibt gleich):** `TokenIssuer`, `token-verifier.ts`, `guards.ts`, `rbac.ts`. Nachgelagerte Verbraucher hängen nur an `employee_no` (`apps/backend-api/src/assignment/assignment.service.ts:194-198`) und `realm_access.roles` (globale `APP_GUARD`, `auth.module.ts:50-51`).
- **Regenerieren:** OpenAPI → `packages/api-client` (`schema.ts:1159-1163`, `:2158`, `:1003`).
- **C4 aktualisieren (Pflicht laut CLAUDE.md):** `c1-system-context.mmd:14,16,20` · `c2-container.mmd:11,14,27` · `c3-backend-components.mmd:21,102-103` · `c3-employee-pwa-components.mmd:3,18,30,40-41` · `domain-model.mmd` (wenn `pinHash` fällt).

**Aufwand: M** (Option 1) · **L** (Option 2, wegen echter Teamlead-Auth).
**Risiko: hoch, wenn Option 1 ohne Nachdenken gewählt wird.** Empfehlung: **Option 2**, und A3 im selben Zug lösen.

---

## D2 — Skills-/Bereiche-Modell: Bereiche raus, Qualifikationen aus dem Beleg

> **Eva:** „Ja, wobei Palette und Regal — so was brauchen wir hier nicht. Wir sind kein großes Logistiklager, wo ein Mitarbeiter den ganzen Tag nur Hängeware bearbeitet. **Diese Skills können raus.**"
> **Moritz:** „Also Sicherung, Rotpreis — die sollen als Qualifikation da rein?" **Eva:** „Ja." **Dustin:** „Ja."
> **Eva (Kernforderung):** „Diese Ansicht deckt es nicht ab, weil hier wird nicht abgefragt: Was kann ein Mitarbeiter? **Weil die Belege müssen nach Qualifikation zugeordnet werden.**"
> **Eva (Darstellung):** „Vielleicht könnt ihr bei den Skill-Stufen mit dem Ampelsystem arbeiten … dass die Benennungen farblich unterschiedlich sind."
> **Moritz (Vorschlag):** „Dass die Skillstufen anlegbar sind — dass z. B. bei ‚fortgeschritten' geht Sicherungsetikett, bei ‚Basis' geht kein Sicherungsetikett."

**Der Konflikt mit CLAUDE.md.** Die Standing Rule lautet heute wörtlich: „**Bereiche/Skills are a fixed vocabulary** derived from `LocationKind`, not a free-text admin catalog." Evas Forderung kippt genau diese Regel. **Die Regel selbst muss also geändert werden** — CLAUDE.md ist Teil des Change-Sets, nicht Randbedingung.

**Ist-Zustand — präziser, als der Call vermuten lässt:**

| Konzept | Wo | Rolle in der Engine |
| --- | --- | --- |
| `LocationKind` (11 Werte) | `apps/backend-api/prisma/schema.prisma:57-69`, `packages/domain-types/src/enums.ts:105-117` | Quelle des Bereichs |
| `Bereich` (3 Werte) | `packages/domain-types/src/location.ts:26,30-45` | **abgeleitet**, kein eigenes Modell |
| `User.bereiche` | `apps/backend-api/prisma/schema.prisma:207` (`String[]`) | Mitarbeiter-Zuordnung |
| `SkillTier` (5 Stufen) | `apps/backend-api/prisma/schema.prisma:174-180` | **harte Auto-Sperre** |

Entscheidend: **Der Bereich ist heute gar kein harter Filter im Auto-Pfad**, sondern nur ein weicher Malus von 0,04:
```ts
// packages/assignment-engine/src/assignment/distribute.ts:38-46, angewandt :131
bereichMismatchPenalty(...)   // BEREICH_PENALTY = 0.04
```
Die **harte** Auto-Sperre ist die Skill-Stufe:
```ts
// packages/assignment-engine/src/assignment/plan.ts:111-113
const autoShifts = input.shifts.filter(s => AUTO_ASSIGNABLE_SKILL_TIERS.includes(s.skillTier ?? 'profi'));
// packages/domain-types/src/enums.ts:51-55 → ['profi','fortgeschritten','basis']
```
Ein **harter** Bereichsfilter existiert nur beim Selbst-Ziehen: `apps/backend-api/src/assignment/assignment.service.ts:305`.

**Die gute Nachricht.** Der Beleg trägt die von Eva gewünschten Qualifikationsmerkmale **bereits**:

| Qualifikation | Feld | Ort |
| --- | --- | --- |
| Sicherung | `securityRequired`, `securityTypeCode`, `securityLocation` | `apps/backend-api/prisma/schema.prisma:453,456,454` |
| Rotpreis | `redPriceRequired` | `apps/backend-api/prisma/schema.prisma:459` |
| Online-Handling | `onlineHandlingRequired` | `apps/backend-api/prisma/schema.prisma:457` |
| Catman | `catMan` | `apps/backend-api/prisma/schema.prisma:436` |
| Etikettenart | `labelType` | `apps/backend-api/prisma/schema.prisma:434` |

Die **Datenseite ist also billig**. Teuer ist die **Semantik**.

**Die eigentliche Entscheidung: harter Gate oder weicher Malus?**
Eva sagt „Belege **müssen** nach Qualifikation zugeordnet werden" — das klingt nach hartem Gate. Ein harter Gate über belegabgeleitete Merkmale ist aber gefährlich: Ein Beleg mit `securityRequired` wäre für **niemanden** zuteilbar, solange keiner die Qualifikation hat. Die Bereichslogik ist heute bewusst weich, damit die Verteilung nie leerläuft. Ein Wechsel auf hart braucht einen definierten Rückfallpfad („bleibt im manuellen Pool") — sonst steht am ersten Pilottag die Automatik.

Moritz' Vorschlag im Call (Stufe → freigeschaltete Qualifikationen) verbindet beides sauber: `SkillTier` bleibt die grobe Auto-Sperre, die Qualifikationsmenge je Stufe wird konfigurierbar. **Empfehlung: diesen Weg gehen** — kleinste Änderung an der Engine-Semantik, erfüllt Evas Forderung wörtlich.

**Blast Radius (vollständig):**
- `AE`: `assignment/plan.ts`, `assignment/distribute.ts`, `assignment/bundling.ts`, `types.ts` (`EnrichedCase.bereich`)
- `DT`: `location.ts` (`BEREICHE`, `bereichFromLocationKind` — Kandidaten zum Löschen), `workforce.ts`, `enums.ts`
- `DB`: `User.bereiche` → `User.qualifications`; Migration
- `API`: `assignment.service.ts` (beide Pfade!), `assignment.mappers.ts`, `employees.service.ts`
- `AC`: Regenerierung
- `TL`: `EmployeeDetailPanel.tsx`, `AblagenFilterBar.tsx`, `ablagenFilters.ts`, `AssignDialog.tsx`, `AssignBrowseDrawer.tsx` — **überschneidet sich vollständig mit C10**
- Seed: `apps/backend-api/src/dev/scenarios/seed-data.ts:120-130`
- **CLAUDE.md**: Standing Rule neu formulieren
- **C4**: `domain-model.mmd:39,44` · `c3-engine-components.mmd:31-32,43` · `c4-engine-pipeline.mmd:13,26` · `c3-backend-components.mmd:44`

**Aufwand: L** (deutlich mehr als ein Tag).
**Risiko: hoch.** Dies ist der teuerste Punkt des gesamten Calls und klang wie ein Aufräumen („diese Skills können raus"). Er berührt die Kernentscheidungslogik, die laut CLAUDE.md Single Source ist. **Nicht vor dem Link. Nicht ohne E8.**

**Nebenpunkt (S), kann vorgezogen werden:** Evas Ampel existiert halb — `apps/teamlead-web/src/components/TierChip.tsx:15-19` färbt fünfstufig (`profi`=grün, `fortgeschritten`=blau, `basis`=primary, `starter`=orange, `dummy`=grau). Eva fand die Reihenfolge trotzdem unverständlich. Reine Beschriftungs-/Farbklärung ist **S** und unabhängig von D2 machbar.

---

## D3 — Bereich: Eva will ihn weg, Dustin braucht ihn — auflösbar?

**Ja, widerspruchsfrei.** Zusammengefasst aus C10:
- Der Mitarbeiter braucht den **Lagerplatz** (`stop.locationCode`), nicht den Bereich.
- Der Bereich ist eine reine Ableitung über `LocationKind` und existiert nicht als eigenes Datum.
- Er kann daher aus allen Teamlead-Ansichten verschwinden, ohne dem Mitarbeiter etwas zu nehmen.

**Aber eine Bedingung:** Die Bereichs-**Logik** (Suche einschränken, Bündel homogen halten, Selbst-Zieh-Filter) darf nicht unsichtbar weiterlaufen. Entweder sie fällt mit D2, oder sie wird beibehalten und **sichtbar erklärt**. Einen Chip zu entfernen, während `AssignDialog.tsx:104` die Suche weiterhin still einschränkt, produziert einen Bug-Report von Eva.

**Entscheidung für Daniel:** C10 nach D2 einplanen, nicht davor.

---

## D4 — Teamlead-Dashboard: Login, oder bewusst offen lassen?

Faktenlage siehe **A3** (live verifiziert). Zu entscheiden:

1. **Bewusst offen lassen** für die Feedback-Phase (Demodaten), Token-Laufzeit aber von ~1 Jahr auf Tage kürzen. Ehrlich gegenüber dem Kunden kommunizieren. **Aufwand S.**
2. **Minimaler Schutz** (ein gemeinsames Teamlead-Passwort). **Aufwand M.** Kollidiert scheinbar mit Moritz' Zusage „kein Passwortschutz" — beim Kunden abstimmen: Die Zusage bezog sich erkennbar auf die **Mitarbeiter-App**, Eva fragte explizit nach der Mitarbeiter-App.
3. **Echte Auth / OIDC.** **Aufwand L.** Sinnvoll vor dem Pilot, nicht vor diesem Link.

**Empfehlung:** Option 1 jetzt, Option 3 als Pilot-Voraussetzung — und in D1 gleich mitdenken.

---

# Abschnitt E — Offene Rückfragen an den Kunden

*(Bewusst keine Tasks. Diese Punkte sind im Call offen geblieben oder wurden vom Kunden selbst vertagt.)*

### E1 — Zusammenarbeit mehrerer Mitarbeiter an einem Beleg
**Dustin:** „Das Thema ist tatsächlich für mich noch nicht richtig durchdacht … Dazu fehlt mir die Praxis. Ich kann echt schwer theoretisch abbilden, wie sich das System verhalten müsste."
Im Call widersprechen sich zudem die beiden Kundenvertreter:
- **Eva:** „Wenn die Mitarbeiter sagen, ich kann das nicht alleine, dann sprechen sie selber die Kollegen an … dann müssen sie es selber entscheiden." Und: „Ich entscheide nicht: Du arbeitest jetzt mit Bettina diese Koffer ab. Das mach ich nicht."
- **Dustin:** „Du würdest doch den Mitarbeitern die Belege zusteuern … Das legst du ja eigentlich fest, wenn das mehrere zusammen machen müssen, oder?"
- Ausnahme, in der beide übereinstimmen: Großaktionen („Frühjahrsaktion Koffer", „4, 5, 6 Leute gleichzeitig") teilt Eva aktiv zu.

**Frage:** Gibt es zwei getrennte Fälle — (a) Mitarbeiter organisieren sich selbst, (b) Teamlead teilt bei Großaktionen aktiv mehrere Personen ein? Sollen beide abgebildet werden? Wie sieht der Mitarbeiter, dass er mit jemandem zusammenarbeitet?
**Blockiert:** C16, teilweise C9.

### E2 — Ist der Teilabschluss-Button überflüssig?
**Dustin:** „Wenn ich jetzt ein Problem festgestellt habe, kann ich nur auf Teilabschluss gehen — ist das richtig, oder wofür habe ich dann diese Funktion Teilabschluss?" … „Ist nicht nötig."
**Moritz:** „Im Hintergrund halt, aber der Button ist nicht notwendig." **Eva:** „Mach das mal bitte." **Dustin:** „Ja, dann sprechen wir noch mal selber drüber."

**⚠️ Die Prämisse der Frage stimmt im Code nicht.** Ein gemeldetes Problem führt **keinen** impliziten Teilabschluss aus. Direkt in der Datei nachgeprüft:
- ZST-Sätze werden ausschließlich über den privaten Helfer `writeZst` geschrieben (`apps/backend-api/src/cases/cases.service.ts:454`, Insert bei `:464` via `tx.zstRecord.create`). Dieser Helfer hat **genau zwei Aufrufer**: `complete` (`:411`) und `partialComplete` (`:441`).
- `POST /api/issues` → `reportIssue` (`apps/backend-api/src/cases/cases.service.ts:490-520`) legt nur die Issue an (`tx.issue.create`) und setzt den Status auf `issue_open`. Es ruft `writeZst` **nicht** auf → **kein ZST-Satz, keine gebuchte Arbeit.**
- Teilabschluss ist ein **eigener** Endpoint mit anteiligem ZST: `POST /api/cases/:caseId/partial-complete` → `partialComplete` (`:420`), ZST-Aufruf bei `:441` mit `proratedEffort(totalQuantity, completedQuantity, effortPoints)`.
- Und: `issue_open` kann **nicht** nach `completed` übergehen — nur nach `in_progress` oder `cancelled` (`apps/backend-api/src/workflow/case-status.ts:29`).

**Konsequenz:** Würde man den Teilabschluss-Button heute ersatzlos entfernen, verlöre der Mitarbeiter die **einzige** Möglichkeit, angefangene Arbeit zu buchen, sobald ein Problem offen ist — denn `issue_open → completed` ist gesperrt. Der Button ist erst dann überflüssig, wenn „Problem melden" selbst prorata bucht.

Auch die im Call skizzierte Erwartung „der Beleg verschwindet beim Mitarbeiter und landet in der Problemablage bei dir" (Dustin, von Moritz bestätigt) ist **so nicht implementiert**: Eine „Problemablage" gibt es als eigenständiges Konzept nicht; es gibt die Ablagen-Lane `probleme` und das separate „Weiterleiten".

**Frage:** Soll das Melden eines Problems den bearbeiteten Teil buchen (impliziter Teilabschluss) — und erst *dann* wird der Button überflüssig? Oder soll der Button bleiben, weil es zwei verschiedene Dinge sind (Schichtende vs. Problem)?
**Wichtig:** Bevor wir den Button entfernen, muss diese Semantik geklärt sein — sonst verlieren Mitarbeiter die Möglichkeit, angefangene Arbeit zu buchen.

### E3 — Problemarten-Liste gemeinsam durchgehen
**Eva:** „Die Problemarten müssten wir uns noch mal angucken."
Heute definiert: 11 Arten (`packages/domain-types/src/enums.ts:146-159`), davon **9 auswählbar** — `missing_quantity` und `overdelivery` sind aus dem Dropdown gefiltert, weil Mengenabweichungen über die +/−-Stepper an der Position erfasst werden (`apps/employee-pwa/src/screens/ProblemMeldenScreen.tsx:46-50`).
**Frage:** Liste gemeinsam durchgehen. Sind „Etikettenproblem", „Sicherungsproblem", „Druckerproblem" die richtigen Kategorien? Fehlt „Preisabweichung" als eigene Art (→ Zusammenhang mit C8)?

### E4 — CSV-Matching Warengruppe → Größen für die Online-Absortierung
**Dustin:** „Ich weiß nicht, ob das umsetzbar ist … dass wir eine CSV hinterlegen mit den Größen, die für die jeweilige Warengruppe absortiert werden sollen, dass die auch markiert wird — welche Größe davon soll ein Online-Artikel werden? Könnt ihr so was matchen darüber?"
**Fragen:** Welches **Format** genau (Spalten, Trennzeichen, Encoding)? Welche **Quelle** (ERP-Export, manuelle Pflege durch Eva)? Welche **Kadenz** (einmalig, täglich, saisonal)? Wer pflegt sie? Was passiert bei einer Warengruppe ohne Eintrag?
Hinweis: Die Zielanzeige existiert bereits (Online-Markierung je Größe, `apps/employee-pwa/src/screens/BelegProcessScreen.tsx:387-389`) — es fehlt ausschließlich die Datenquelle.

### E5 — Welche Felder liefert ProHandel wann?
Mehrere Forderungen hängen an ERP-Daten, die es heute nicht gibt:
- **Catman-Termin** (C6) — Dustin: „kommt allerdings auch wieder aus dem ERP-System"
- **Digitex / digitale Etiketten** (C14) — „bestimmte Bereiche im ERP-System hinterlegt … nur für bestimmte Lieferanten, weil wir da noch in der Testphase sind"
- **Vierstellige Shop-Nummer** (C5) — „bei euch könnte dieser Shop auch dann nachher unsere vierstellige Shopnummer sein. Das ist einfach nur ein Platzhalter gerade."
- **Lagerplätze** — Dustin: „Die API wird euch keine Informationen über die Lagerplätze geben … die würde Eva manuell anlegen müssen." (Bestätigen: `LocationMasterEditor` existiert bereits.)

**Frage:** Für welche dieser Felder gibt es einen zugesagten Liefertermin über die Schnittstelle? Ohne Antwort bauen wir Platzhalter.

### E6 — Was darf ein Redeploy löschen?
Direkt aus **A4**. Dustin hat die Frage im Call gestellt, sie blieb unbeantwortet („Bitte erst mal noch nichts eingeben").
**Frage:** Ab wann dürfen Eva und Dustin produktiv Stammdaten pflegen (Shops, Verladeplan, Lagerplätze), ohne dass ein Deploy sie anfasst? Sollen Belege bei jedem Deploy weiterhin auf ein Demo-Szenario zurückgesetzt werden (praktisch für Vorführungen) oder ab sofort erhalten bleiben?

### E7 — Foto-Funktion: bauen oder streichen?
**Moritz:** „Fotos, eine sehr gute Idee. Das machen wir dann auch." · **Eva unmittelbar danach:** „Die werden mit Sicherheit keine Fotos machen. Und je weniger wir an Daten erfassen, umso schneller geht es ja auch nachher."
**Frage:** Eva ist die Anwenderin und rät ab. Streichen wir die Funktion ersatzlos (Empfehlung, siehe C4)?

### E8 — Skill-Stufen: verbindliche Reihenfolge und Bedeutung
**Eva, dreimal im Call:** „Was ist die Basis und was ist der Fortgeschrittene? … Das ist mir immer noch nicht klar." · „Das muss auch jemand relativ schnell drin haben, wenn ich mal nicht da bin."
**Dustin:** „Starter, Basis, fortgeschritten, Profi — in der Reihenfolge."
Der Code hat fünf Stufen inkl. `dummy` (`apps/backend-api/prisma/schema.prisma:174-180`).
**Fragen:** Ist `dummy` (Azubi/studentische Aushilfe) eine eigene Stufe oder gleich `starter`? Welche **Qualifikation** schaltet jede Stufe frei (Moritz' Vorschlag: „bei fortgeschritten geht Sicherungsetikett, bei Basis nicht")? Das ist die Eingabe, die **D2** braucht.

### E9 — Bündel vs. Einzelbeleg am Schichtende
**Moritz:** „Wenn man noch nicht am Ende der Schicht ist, würde hier ein komplettes Bündel geholt werden. Aber wenn man schon am Ende der Schicht ist, dann nur noch einzelne Belege, und das kann man dann einstellen."
**Eva:** „Was meinst du mit ‚einstellen'? … Was kannst du einstellen?" — im Transkript unbeantwortet.
**Frage:** Was genau soll konfigurierbar sein — der Zeitpunkt, ab dem auf Einzelbelege umgeschaltet wird? (Im Code existiert der Cutoff bereits: `packages/assignment-engine/src/capacity/shift-end.ts`.)

### E10 — Verladeplan-Sondertag und Kalender
**Eva:** „Dieser Sondertag, einmalige Abweichung — muss man das immer …?" **Moritz:** „Es macht natürlich Sinn, das mit dem Kalender zu verbinden."
**Frage:** Welcher Kalender? Feiertage, Betriebskalender, Outlook? Heute sind es native Datumsfelder plus Wochentags-Chips (`apps/teamlead-web/src/features/admin/VerladeplanTab.tsx:260-284`).

---

# Abschnitt F — Konkreter Schnitt der Folge-Tasks

## Reihenfolge und Abhängigkeiten

```
                    ┌─────────────────────────────┐
   ENTSCHEIDUNGEN   │ D1 (PIN)  ·  D4 (TL-Auth)   │   ← Daniel, vor T2
   (Daniel)         │ D2/D3 (Skills) → braucht E8 │   ← Daniel + Kunde
                    └──────────────┬──────────────┘
                                   │
  ┌────────────────────────────────┴───────────────────────────────┐
  │                      RELEASE-GATE: neuer Link                   │
  │                                                                 │
  │   T1 ──┐                                                        │
  │   T2 ──┼──► T5 (Verifikation + Demo-Datenstand) ──► LINK RAUS   │
  │   T3 ──┤                                                        │
  │   T4 ──┘                                                        │
  └────────────────────────────────┬───────────────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
        T6 (Quick Wins)      T7 (Problem-        T8 (Skills-Umbau)
         parallel             & Preis-Flow)       ← blockiert: D2 + E8
                              ← blockiert: E2,E3        │
                                                        ▼
                                                  T9 (Bereich-
                                                      Bereinigung, C10)
```

---

## Release-Gate — muss vor dem Link fertig sein

### **T1 — Positionen-Tabelle in der Mitarbeiter-App**
- **Inhalt:** A1
- **Abhängigkeiten:** keine. **Sofort startbar.**
- **Aufwand:** M · **Blast Radius:** `PWA` (1 Datei)
- **Definition of Done:** Positionen als Tabelle mit fixen Spaltenüberschriften; EK/VK/VK-Etikett in eigenen, rechtsbündigen Spalten; Mehr-/Mindermengen daneben; auf 24" geprüft.
- **Nicht enthalten:** app-weites Desktop-Layout (→ C15/T13). Bewusst abgegrenzt — sonst wird T1 zu L.

### **T2 — Zugang zum Link herstellen**
- **Inhalt:** A2 + A3 + Umsetzung von **D1** und **D4**
- **Abhängigkeiten:** **blockiert durch Entscheidung D1 und D4.** Ohne diese Entscheidungen ist T2 nicht schneidbar.
- **Aufwand:** M (D1 Option 1) bis L (D1 Option 2 + echte TL-Auth)
- **Blast Radius:** `API` · `DB` · `TL` · `PWA` · `AC` · `C4` (5 Diagramme)
- **Definition of Done:** Mitarbeiter kommt mit der Mitarbeiternummer in die App. Teamlead-Zugang ist bewusst entschieden und dokumentiert. Kein langlebiger Token mehr in `/env.js`. `pnpm typecheck` 13/13. C4-Diagramme neu gerendert.

### **T3 — Deutsche Texte**
- **Inhalt:** A5 (Moritz' Zusage c)
- **Abhängigkeiten:** keine. **Sofort startbar, parallel zu T1.**
- **Aufwand:** M · **Blast Radius:** `TL` (≈ 12 Dateien) · `PWA` (2 Dateien) · `packages/ui`
- **Definition of Done:** `http.ts:31` deutsch (räumt 14 Alerts ab); kein roher Enum-Schlüssel mehr im UI; `Retry` → „Erneut versuchen"; PWA-Fehlermeldung deutsch. Bestehende Label-Tabellen aus `packages/ui/src/theme/tokens.ts` wiederverwenden, `IssueType`-Map aus der PWA nach `packages/ui` heben — **nicht duplizieren** (Single-Source-Regel). `DevScenariosTab.tsx` nicht anfassen (tree-shaken).

### **T4 — Deploy-Sicherheit: Seed entschärfen**
- **Inhalt:** A4
- **Abhängigkeiten:** keine. **Sofort startbar.**
- **Aufwand:** S · **Blast Radius:** `API` (`railway.json`, `src/dev/scenarios/`) · Railway-Variablen
- **Definition of Done:** Ein Redeploy löscht keine Kundendaten mehr (Flag-gesteuert). Verhalten in `docs/deploy/railway.md` dokumentiert. Antwort auf E6 vorbereitet.

### **T5 — Verifikation + Demo-Datenstand (Release-Gate)**
- **Inhalt:** Zusammenführen; **Demo-Datenstand herstellen**, damit B(a), B(b) und die drei „Wahrnehmungslücken"-Punkte tatsächlich sichtbar sind.
- **Abhängigkeiten:** **T1, T2, T3, T4.**
- **Aufwand:** S–M
- **Definition of Done:**
  - Login mit Mitarbeiternummer funktioniert gegen Production.
  - `recalculate` gelaufen: Demo-Mitarbeiter hat ein Bündel → „Ware holen" zeigt Stops mit Lagerplatz.
  - Mindestens ein Beleg trägt `priceLabelPrintRequired`, `securityTypeCode` und eine Online-Markierung, damit Etikettendruck-Chip, Piktogramm und Online-Chip sichtbar sind.
  - Beide Frontends manuell durchgeklickt; `/healthz` = 200.
  - **Zusätzlich:** Railway-Healthcheck-Pfad auf `/healthz` setzen. Heute ist keiner konfiguriert, und `/api/health` existiert nicht — die Routen liegen ungepräfixt in `apps/backend-api/src/health/health.module.ts:14,21` (`healthz`, `readyz`; kein `setGlobalPrefix` in `main.ts`).

---

## Nach dem Link

### **T6 — Quick Wins (parallel, unabhängig)**
- **Inhalt:** C1 (Suchfeld), C2 (Hinweis an Mitarbeiter), C5 (`hShopNo`), C6 (Catman-Termin), Aufräumen des toten `collect.ts` (B(a) Restlücke 2), Ampel-/Beschriftungsklärung der Skill-Stufen (D2-Nebenpunkt)
- **Abhängigkeiten:** keine
- **Aufwand:** je S, gesamt ≈ M

### **T7 — Problem- und Preis-Flow**
- **Inhalt:** C7 (Mehrfachauswahl), C3 (Pflichtfeld), C8 (Preisabweichung), C4-Streichung (Foto), C12 (Problemfallbox)
- **Abhängigkeiten:** **blockiert durch E2, E3, E7** — und C8 muss fachlich gegen C7 abgegrenzt werden (ist eine Preisabweichung eine Issue-Art?).
- **Aufwand:** L (Summe) · **Blast Radius:** `DB` · `DT` · `API` · `AC` · `PWA` · `TL` · `C4`
- **Hinweis:** C7 revidiert eine bewusste Entscheidung aus der Vorrunde (`dustin-feedback-v2-review.md`, M30 = Einfach-Dropdown). Nicht als Bugfix führen.

### **T8 — Skills-/Qualifikationsmodell**
- **Inhalt:** D2
- **Abhängigkeiten:** **blockiert durch Entscheidung D2 und Rückfrage E8.** Nicht ohne beides beginnen.
- **Aufwand:** L · **Blast Radius:** `AE` · `DT` · `DB` · `API` · `AC` · `TL` · Seed · **CLAUDE.md** · `C4` (4 Diagramme)
- **Definition of Done:** Standing Rule in CLAUDE.md neu formuliert; Engine-Semantik (harter Gate vs. weicher Malus) explizit dokumentiert; Rückfallpfad für nicht zuteilbare Belege existiert und ist getestet.

### **T9 — Bereich-Bereinigung**
- **Inhalt:** C10 / D3
- **Abhängigkeiten:** **nach T8.** Vorher ausgeführt, wird die Arbeit zweimal gemacht.
- **Aufwand:** M · **Blast Radius:** `TL`

### **T10 — Engine-Regeln**
- **Inhalt:** C9 (mehrere Bündel), C16 (Aufteilung ohne Teile/Prozente)
- **Abhängigkeiten:** C16 **blockiert durch E1**; C9 berührt Kapazität und Schichtende-Cutoff.
- **Aufwand:** M je Punkt

### **T11 — Tabellen-Komfort**
- **Inhalt:** C13 (Spalten ausblenden zuerst, Drag & Drop separat), C11 (Gruppen-Zuteilung in einer Aktion)
- **Abhängigkeiten:** keine
- **Aufwand:** M–L

### **T12 — ERP-abhängig, zurückstellen**
- **Inhalt:** C14 (Digitex), vierstellige Shop-Nummer, Catman-Termin-Befüllung, CSV-Matching (E4)
- **Abhängigkeiten:** **blockiert durch E5 und E4.** Vorher gebaut = Platzhalter.

### **T13 — Desktop-Layout der Mitarbeiter-App**
- **Inhalt:** C15
- **Abhängigkeiten:** T1 (baut darauf auf); Bestätigung des Zielgeräts beim Kunden
- **Aufwand:** L

---

## Auswirkungen auf das bestehende Backlog

Vor dem Weiterarbeiten prüfen:

1. Jeder Backlog-Task, der den **PIN-Login erweitert oder pflegt** (PIN-Reset-UI, PIN-Validierung), ist durch **D1** potenziell hinfällig. **Nicht starten, bevor D1 entschieden ist.**
2. Jeder Task, der auf **`bereiche` als Mitarbeiter-Skill** aufsetzt, ist durch **D2** potenziell hinfällig. Betrifft Admin-Formulare, Ablagen-Filter und Engine-Malus.
3. Ein Task „Bereich aus der UI entfernen" (C10) gehört **hinter** T8, nicht davor.
4. Ein Task „Foto-Upload bauen" ist durch **E7** infrage gestellt — Eva rät explizit ab.
5. Ein Task „Teilabschluss-Button entfernen" darf **nicht** ohne **E2** ausgeführt werden: Die Annahme, ein gemeldetes Problem schließe implizit teilab, ist im Code **falsch** (`apps/backend-api/src/cases/cases.service.ts:490-520`).

---

## Quellen und Verifikationsstand

- Codeanalyse gegen einen `git worktree --detach origin/main` (`35d93c3`), **nicht** gegen das lokale Arbeitsverzeichnis.
- Live-Probes gegen Production am 09.07.2026:
  - `GET /healthz` → 200 · `GET /readyz` → 200 · `GET /api/health` → **404**
  - `POST /api/auth/login {"employeeNo":"ma-101","pin":"1234"}` → **401**
  - `GET https://paketteamlead-web-production.up.railway.app/env.js` → enthält gültigen Teamlead-JWT, `exp` = 2027-06-16
  - `GET /api/teamlead/cases` mit diesem Token → **200**
  - `GET /api/dev/scenarios` mit diesem Token → **403** (Rollentrennung hält)
  - `GET /static/pictograms/hard-tag.svg` → 200, `image/svg+xml`; unbekannter Pfad → 404
- `pnpm typecheck` konnte im Prüf-Worktree nicht laufen (keine `node_modules`; bewusst nicht installiert).
