# Dev-Panel & Szenario-Katalog

Das Dev-Panel ist ein rein für Entwicklung/Demo gedachter Admin-Tab **„Dev / Szenarien"**
im Teamlead-Cockpit. Es lädt per Knopfdruck deterministische Demo-Welten (die 15 Szenarien
unten), steuert eine serverseitige Zeit-Übersteuerung und bietet Quick-Knobs
(ProHandel-Pull, Automatik, Schichten materialisieren). Es ist **kein Produktfeature**:
Produktions-Builds enthalten keinerlei Dev-Panel-Code, und das Backend beantwortet
`/api/dev/*` ohne Freischaltung mit 404.

## Aktivierung

Das Gate hat zwei unabhängige Hälften — beide müssen an sein:

| Schicht | Schalter | Wirkung |
| --- | --- | --- |
| Backend | Env `DEV_PANEL=1` (`config.dev.panelEnabled`) | Ohne den Schalter antwortet **jede** `/api/dev/*`-Route mit 404 (DevPanelGuard). Zusätzlich verlangt jede Route die Rolle **Admin**. |
| Frontend (teamlead-web) | Dev-Server (`import.meta.env.DEV`) **oder** Build mit `VITE_DEV_PANEL=1` | Der Tab wird zur Build-Zeit ein- bzw. ausgebaut (Tree-Shaking): ein normaler Prod-Build enthält den Code **gar nicht**. In Dev-/Demo-Builds kann die Laufzeit-Env (`window.__ENV__`, `VITE_DEV_PANEL=0`) den Tab ohne Rebuild abschalten. |
| Token | `apps/backend-api/scripts/dev-setup.mjs` | Der Dev-Setup-Schritt (`pnpm dev:setup`) mintet neben dem Teamlead-Token auch einen **Admin-Dev-Token** (`VITE_DEV_ADMIN_TOKEN`, Nutzer `admin-001`) in die teamlead-web `.env` — der Panel-Client spricht `/api/dev` damit. |

Kurzrezept lokal: `DEV_PANEL=1` in der Backend-`.env`, `pnpm dev:setup`, `pnpm dev` —
der Tab erscheint unter Admin → „Dev / Szenarien".

## Zeit-Übersteuerung (Server-Zeit)

Die Zeit-Übersteuerung ist **serverseitig und persistent** (AppConfig-Eintrag
`dev_time_override`, gelesen vom globalen `ClockService`): sie gilt für *alle*
zeitabhängigen Backend-Pfade — Automatik/Neuberechnung, Self-Pull, Dashboard, Board,
Kapazität, KPIs, ProHandel-Pull — bis sie explizit zurückgesetzt wird
(„Zurück zu Echtzeit"). Solange sie aktiv ist, zeigt das Cockpit ein **globales Badge
in der App-Leiste** (DevTimeBadge, „Server-Zeit …"), damit niemand versehentlich gegen
eine verstellte Uhr arbeitet. Szenarien wie B10 (Schichtende) und B11 (Feiertag) sind
bewusst für diese Übersteuerung gebaut.

## Quick-Knobs

Drei Buttons für die häufigsten Handgriffe, jeweils mit Ergebnis-Toast:

- **ProHandel-Pull** — zieht die Mock-ProHandel-Charge (Anzahl neuer Belege im Toast).
- **Automatik ausführen** — Neuberechnung/Verteilung (entspricht der normalen Automatik).
- **Schichten materialisieren** — legt die Schichten für ein Datum an (Default: der
  Tag der aktiven Zeit-Übersteuerung).

## Szenario laden: Semantik & Garantien

- **Laden = Reset + Seed.** `POST /api/dev/scenarios/:key/load` **löscht den kompletten
  transaktionalen Case-Graphen** (Belege, Bündel, Probleme, Events …) und baut ihn neu
  auf. Stammdaten (Team, Lagerplätze, Kataloge) werden upsertet, nie gelöscht.
  Ungespeicherte Tagesarbeit ist danach weg — deshalb nur in Dev-/Demo-Umgebungen.
- **Deterministisch.** Jedes Szenario ist eine reine Funktion aus Seed-RNG + `baseDate`:
  derselbe Key erzeugt byte-identische Daten (durch die Integrationstests per
  SHA-256-Digest abgesichert).
- **Kein Config-Leak.** Alle Nicht-Standard-Szenarien forcieren das Default-Regelwerk
  (plus gezielte Overrides, z. B. die Verladeplan-Sonderzeile in B11) — vorherige
  Admin-Experimente verfälschen die Demo nicht.
- **„Zurücksetzen auf Standard"** lädt das Standard-Szenario (`standard`) neu; dasselbe
  macht `prisma db seed`.
- **Wiederverwendung in Tests.** Das Framework ist HTTP-/Nest-frei: die
  Integrationstests (`apps/backend-api/src/integration/scenarios.int.test.ts`,
  Testcontainers) importieren `loadScenario(prisma, key, { baseDate })` direkt und
  prüfen je Szenario die Headline-Erwartung. Der DevController ist nur ein dünner
  API-Adapter über derselben Funktion.

Quelle der Wahrheit für Katalog und Texte:
`apps/backend-api/src/dev/scenarios/catalog.ts` (+ `definitions/*`); das Panel liest
Name/Beschreibung/Erwartung vom Backend (`GET /api/dev/scenarios`).

---

## Die 15 Szenarien

### B1 · `standard` — Standard-Tag

Realistischer Arbeitstag aus dem echten Volumenprofil des Kunden: generierter
Ready-Pool (typisch 171 Belege) über alle Bereiche, Lieferungs-Runs, Lifecycle-Belege
für alle Scopes, eine Mock-ProHandel-Charge sowie Intake-Gate- und Pool-Hold-Fixtures.
Das ist zugleich der Seed-Default (`prisma db seed`, „Zurücksetzen auf Standard").

**Was man danach sehen sollte:** Pool ≈ 189 ready-Belege (171 generiert + 16
Mock-ProHandel + 2 Pool-Hold), 2 blockierte Belege („zurück an Bucher"),
~60 Liefergruppen, gefüllte Ablage-Lanes; nach „Neu berechnen" ein voller Tagesplan
über alle Schichten.

### B2 · `peak-tag` — Peak-Tag (315 Belege)

Wie B1, aber mit dem Spitzen-Volumenprofil (315 generierte Belege, der stärkste
beobachtete Tag mit Feb/Aug-Peaks) inkl. längerer Lieferungs-Runs (23–40 Belege).
Lasttest für Board, Belege-Liste und Engine (< 5 s Budget).

**Was man danach sehen sollte:** Pool ≈ 333 ready-Belege; nach „Automatik ausführen"
ein voller Plan in < 5 s. Belege-Liste und Ablagen-Board zeigen das bekannte
Skalierungslimit (200er-Kappung) — genau dafür ist dieses Szenario der Prüfstein.

### B3 · `gemischtes-buendel` — Gemischtes Bündel (3 Bereiche)

Ausgewogener Pool über alle drei Bereiche: 16× Regal, 12× Hängebahn, 12× Palette à
~52 Teile — bei Starter-Pack-Größe 200–250 Teile ergeben sich ~10 Packs, eines je
Mitarbeiter. **Ehrliche Einordnung:** die Engine hält jedes Pack bewusst
**Bereich-rein** (Routing zum passenden Spezialisten); die „Mischung" entsteht auf
**Team-Ebene** und über den Tag (Folge-Packs per Self-Pull können einen anderen
Bereich haben) — nicht innerhalb eines einzelnen Packs.

**Was man danach sehen sollte:** Nach „Automatik ausführen" hat jeder der 10
auto-planbaren Mitarbeiter genau EIN Bereich-reines Starter-Pack (~200 Teile,
4 Belege); über das Board verteilt sind alle drei Bereiche sichtbar — je Zeile
Bereich-Chip und Teile-Anzeige. Hängebahn-Packs zuerst (NOS+Hängeware-Tier) und
bevorzugt bei den Hängebahn-Spezialisten. Die Offline-Demo der Mitarbeiter-App
spiegelt dieses Szenario.

### B4 · `lieferung-zusammenhaengend` — Lieferung zusammenhängend

Drei mehrteilige Lieferungen, je eine pro Erkennungssignal: (a) fortlaufende
Belegnummern 9.401.101–103 (Run, „vermutet"), (b) identischer Lieferschein LS-77001
auf 9.401.201/.215/.230 („wahrscheinlich"), (c) der **harte Brax-Fall**
9.401.310/.317/.325: NICHT-fortlaufende Lieferscheinnummern, aber durchlaufende
Kartonnummerierung (KTN 4711/1–3, im Beleg-Hinweis dokumentiert).
**Ehrliche Einordnung:** Kartonnummern-Kontinuität ist heute **kein**
Gruppierungssignal — der Brax-Fall demonstriert bewusst diese Erkennungslücke.

**Was man danach sehen sollte:** (a) „Lieferung ×3" (vermutet) auf 9.401.101–103,
unter dem Default-Regelwerk NICHT automatisch verteilt (wartet auf TL-Bestätigung);
(b) „Lieferung ×3" (wahrscheinlich) auf der LS-77001-Gruppe, nach „Automatik
ausführen" geschlossen bei EINEM Mitarbeiter; (c) die Brax-Belege bekommen KEINE
Gruppen-Badge, obwohl die Kartonnummern im Beleg-Hinweis durchlaufen.

### B5 · `lieferung-unvollstaendig` — Lieferung unvollständig (Pool-Hold)

Eine bestätigte Lieferung „Lieferschein X von 4", von der erst 2 Belege gebucht sind
(9.402.501/.502) → Lieferungs-Pool-Hold: die Engine hält alle anwesenden Mitglieder
zurück, bis die Lieferung vollständig ist oder der Teamlead sie mit „Trotzdem
bearbeiten" freigibt (wirkt durchgängig bis in die Engine). Dazu eine vollständige
3-von-3-Kontrastgruppe.

**Was man danach sehen sollte:** Lieferungen-Ansicht: Gruppe „2 von 4 · 2 fehlen".
„Automatik ausführen" lässt beide im Pool (Grund „Lieferung unvollständig"); die
3-von-3-Gruppe wird normal und geschlossen verteilt. Nach TL-Freigabe verteilt die
nächste Automatik auch die beiden Hold-Belege.

### B6 · `datenqualitaet` — Datenqualität (zurück an Bucher)

Drei Belege mit fehlenden Pflichtdaten im Intake-Gate: 9.403.701 ohne Lagerplatz,
9.403.705 ohne Lieferschein, 9.403.709 ohne beides → Status „blockiert", Aktion
„zurück an Bucher", niemals im Verteil-Pool. Dazu 9.403.713 als bereits
nachgepflegter Fall (Daten ergänzt → wieder ready) und drei normale Belege.

**Was man danach sehen sollte:** Die drei blockierten Belege erscheinen in der
„Zurück an Bucher"-Ablage mit ihren fehlenden Feldern und tauchen NIE im Plan auf.
9.403.713 ist wieder ready und wird normal verteilt. Live-Nachpflege testen: an einem
blockierten Beleg „Intake vervollständigen" ausfüllen → er wechselt zu ready und die
nächste Automatik plant ihn ein.

### B7 · `gross-beleg-knecki` — Groß-Beleg „Knecki"

Ein 2.400-Teile-Beleg (9.404.801) über der Monster-Schwelle (2.000 Teile) wartet im
Pool auf die manuelle Teamlead-Entscheidung. Zusätzlich hängt Dirk Hansen (ma-104)
noch an einem GESTERN begonnenen 2.600-Teile-Beleg (9.404.802, teilabgeschlossen am
Vortages-Bündel) — die Folgetag-Fortsetzung greift: keine neuen Belege für ihn.

**Was man danach sehen sollte:** „Automatik ausführen": 9.404.801 bleibt unverteilt
im Pool (Grund „Groß-Beleg — manuelle TL-Entscheidung", zuweisbar über
Mitarbeiterboard → Zuweisen); Dirk Hansen erhält KEIN neues Starter-Pack, sein
Self-Pull antwortet „continuation". Alle anderen werden normal beplant.

### B8 · `shop-31-nos` — Shop 31: NOS-Einzelanlieferungen

22 kleine NOS-Einzelanlieferungen (~10 Teile) für Shopbereich 31, jede mit eigenem
Lieferschein und nicht-fortlaufender Belegnummer (keine Liefergruppen), plus 6
gewöhnliche Vororder-Belege als Kontrast. Zeigt: Packs sind TEILE-dimensioniert
(200–250) ohne Beleg-Obergrenze, und NOS ist ein echter Prioritätstreiber (Tier 2
vor FIFO).

**Was man danach sehen sollte:** Das erste Pack enthält ≥ 18 NOS-Belege (keine
Maximal-Beleg-Kappung — die Teile-Summe entscheidet). Alle NOS-Belege liegen in der
Verteil-Reihenfolge VOR den 6 Vororder-Kontrastbelegen.

### B9 · `prio-leiter` — Prio-Leiter (alle Ränge)

Je Rang der Prioritätsleiter genau ein Beleg (Rang 3 und 5 in allen Varianten):
Ausschluss (geparkt) → manuelle TL-Priorität → Prio-Kennzeichen → tägliche Verladung
(EB-Abschnitt 7, Shopbereich 120, Shopbereich 90) → NOS + Hängeware →
Verladeplan-fällig (Abschnitte 1/2/3, Abschnitt 2 überfällig) → FIFO. Alle Belege
sonst identisch (30 Teile), damit NUR die Leiter die Reihenfolge bestimmt.

**Was man danach sehen sollte:** Exakte Verteil-Reihenfolge: 9.405.905 (manuell) ·
9.405.909 (Prio) · 9.405.913 (EB-Abschnitt 7) · 9.405.917 (Shop 120) · 9.405.921
(Shop 90) · 9.405.925 (NOS) · 9.405.929 (Hängeware) · 9.405.933 (Verladeplan
Abschn. 1) · 9.405.937 (Abschn. 2, überfällig) · 9.405.941 (Abschn. 3) · 9.405.945
(FIFO). 9.405.901 (geparkt, Rang 0) liegt in der Ablage „Geparkt" und wird NIE verteilt.

### B10 · `schichtende` — Schichtende (Cutoff 50 min)

12 mittlere Belege plus die normalen Schichten (Frühschicht 06:00–14:00, Spätschicht
10:00–18:00) mit dem Default-Cutoff von 50 Minuten (Cutoff-Punkte 13:10 bzw. 17:10).
Demo-Ablauf mit der Zeit-Übersteuerung: (1) Vormittags-Zeit setzen (z. B. 09:00) und
„Automatik ausführen" → voller Plan. (2) Zeit auf 13:25 → nicht begonnene
Frühschicht-Bündel lösen sich in den Pool auf, nur die Spätschicht wird neu beplant.
(3) Zeit auf 13:50: Self-Pull eines Frühschichtlers → „shift_ending".

**Was man danach sehen sollte:** Bei Zeit 13:25 (nach Cutoff-Punkt 13:10) erhält KEIN
Frühschichtler mehr Arbeit aus der Automatik — vorher zugeteilte, nicht begonnene
Bündel sind aufgelöst, die Belege zurück im Pool; die Spätschicht wird normal beplant
und arbeitet fertig. Self-Pull kurz vor 14:00 antwortet „shift_ending".

### B11 · `feiertag-sonderregelung` — Feiertag / Sonderregelung (DO→MI)

Verladeplan mit Sonderregelung: Shopbereich 23/EG verlädt regulär donnerstags; wegen
Feiertag zieht eine Sonderzeile (specialDay) die Verladung auf den Mittwoch davor vor
und unterdrückt in ihrem Gültigkeitsfenster den regulären Donnerstag. Beleg 9.407.010
(Shop 23/EG) hängt an dieser Regel; Vergleichs-Beleg 9.407.020 (Shop 21/EG) behält
seinen regulären Montags-Termin. Alle Daten relativ zum Ladetag (nächster DO ab heute).

**Was man danach sehen sollte:** Admin → Verladeplan zeigt die Sonderzeile
(Shop 23/EG, specialDay, Fenster Mi–Do). Nach „Automatik ausführen" trägt 9.407.010
als Verladetag den VORGEZOGENEN Mittwoch — fällt der auf heute oder früher, ist der
Beleg sofort Verladeplan-fällig/überfällig (Tier 3). 9.407.020 behält den regulären
Montag.

### B12 · `skill-tiers-crew` — Skill-Tiers & Crew

Die volle Crew über alle fünf Skill-Stufen (profi/fortgeschritten/basis + starter
„Azubi Mara" und dummy „Aushilfe Tom", beide measured=false → aus der
Leistungsmessung ausgenommen) mit einem kompakten 13-Beleg-Pool. Ein Beleg trägt die
Warengruppe 812770 „Koffer/Reisegepäck" — Koffer ist eine WGR, KEIN Bereich; sein
Bereich bleibt durch den Lagerplatz (Regal) fixiert.

**Was man danach sehen sollte:** Nach „Automatik ausführen" erhalten NUR
profi/fortgeschritten/basis Packs; „Azubi Mara" und „Aushilfe Tom" bleiben als freie
Zeilen auf dem Board (nur manuelle Zuweisung; Self-Pull antwortet „skill_tier").
Beleg 9.321.037 zeigt im Belegdetail die Position mit WGR 812770. KPI: Durchsatz
zählt alle, Leistung nur measured-Kräfte.

### B13 · `online-groessen` — Online-Größen (Rot/Grün)

Drei online-relevante Belege gegen die Präferenz-Regeln aus der eingecheckten
CSV-Fixture (`src/dev/scenarios/fixtures/online-size-preferences.csv`, identisches
Format wie der Admin-CSV-Upload — Seed und Upload-Demo haben dieselbe Quelle):
9.408.101 liefert die Wunschgröße (218110 → 38), 9.408.105 nur die Alternative
(312400 → 31/32 statt 32/32), 9.408.109 weder Wunsch noch Alternative (511100 →
beliebige Größe).

**Was man danach sehen sollte:** Im Belegdetail der Mitarbeiter-App: 9.408.101 →
Größe 38 GRÜN, 40 rot; 9.408.105 → 31/32 GRÜN (Alternative greift), 30/32 rot;
9.408.109 → 42 GRÜN (beliebige Größe), 44 rot. Admin → Online-Größen listet exakt
die Zeilen der Fixture.

### B14 · `problemfaelle-ablage` — Problemfälle & Ablage

Alle digitalen Ablage-Lanes gleichzeitig gefüllt: 2 offene Probleme (Falsche Farbe /
Fehlmenge), 2 geparkte Belege, Weiterleitungen an BEIDE Empfänger (Retourenabteilung
+ Lieferscheinbucher), ein ZST-Teilabschluss (40 von 100 Teilen), TL-Topf
(needs_review + Aufmerksamkeits-Flag), in Arbeit, Abgeschlossen, Archiv (zst_done mit
DocuWare-Link) und storniert — plus ein kleiner ready-Pool.

**Was man danach sehen sollte:** Ablagen-Board: JEDE Lane zeigt mindestens einen
Beleg (Probleme ×2, Geparkt ×2, Weitergeleitet ×2 nach Empfänger gruppiert,
Teilabschluss 9.409.125 „40 von 100", Archiv mit DocuWare-Link auf 9.409.141).
Deep-Link testen: Problem-Eintrag auf 9.409.101 anklicken → Belegdetail öffnet mit
dem offenen Problem „Farbe weicht ab".

### B15 · `leerer-tag` — Leerer Tag

Nur Stammdaten: Team, Schichten, Tische, Lagerplätze, Kataloge und Regelwerk — aber
KEIN einziger Beleg. Zeigt sämtliche Leerzustände der Oberflächen.

**Was man danach sehen sollte:** Dashboard mit 0-Kennzahlen, leeres Mitarbeiterboard
(alle Zeilen „frei"), leere Belege-Liste, leere Ablage-Lanes; „Automatik ausführen"
meldet 0 Bündel / 0 Belege; Self-Pull antwortet „pool_empty". Keine Fehler, nirgends.
