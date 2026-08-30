# Kundenfrage: Kartonanzahl je WE-Beleg — Nachprüfung des Ist-Stands

**Geprüft am:** 30.08.2026 · **Codestand:** `origin/main` @ `8fa580f`
**Art:** reine Verifikation einer älteren Q&A-Aussage — es wurde nichts implementiert und keine
Fachlogik geändert.

> Ablage-Hinweis: Ein Ordner `docs/kundenfragen/` existiert nicht. Diese Nachprüfung liegt daher in
> `docs/review/`, dem bestehenden Ort für Kundenfeedback- und Gap-Analysen
> (`dustin-feedback-review.md`, `kundencall-2026-07-07-gap-analyse.md`, `ordernummer-gap.md`).

---

## Originalfrage des Kunden

> „Wo sehe ich hier in der Ansicht, dass die Lieferung aus mehreren Kartons besteht (z. B. 6 Kartons
> auf R5)? Der MA muss wissen, wie viel Kartons zu der jeweiligen WE-Nummer gehören, damit er sie
> auch alle mitnimmt."

## Damalige Antwort (zu prüfen)

> „Derzeit an keiner Stelle. Die Kartonanzahl ist aktuell nicht in der Anzeige — weder unter
> ‚1 - Ware holen' (dort stehen WE-Nummer, Warenart, Filiale, Shopbereich, Etiketten-Art,
> Barcode-Knopf) noch auf dem Beleg-Bildschirm (Warenart, Teile-Anzahl). Die Zahl ist aber im System
> vollständig vorhanden und wird vom Server bereits an die App mitgeliefert — sie wird dort nur noch
> nicht dargestellt. (In den Demo-Daten haben 116 von 200 Belegen mehr als einen Karton.)"

---

## Verdikt

**Unverändert** — die Aussage stimmt für die Mitarbeiter-App weiterhin in vollem Umfang; korrigiert
werden müssen nur die Demo-Zahlen (heute **118 von 209** statt 116 von 200), und ergänzt gehört,
dass die Teamleitung die Zahl in ihrem Cockpit sehr wohl sieht.

---

## Aktualisierte Antwort für den Kunden

In der Mitarbeiter-App weiterhin an keiner Stelle. Unter **„1 · Ware holen"** stehen je Beleg
WE-Nummer, Warenart, Filiale, Shopbereich, die Etiketten-Art und der CatMan-Termin, dazu der Knopf
„Barcode anzeigen" — keine Kartonanzahl. Auf dem **Beleg-Bildschirm** steht im Kopf die Warenart, die
Teile-Anzahl und der CatMan-Termin — ebenfalls keine Kartonanzahl.

Die Zahl selbst ist unverändert im System vorhanden: Sie hängt am Beleg-Kopf, kommt aus dem
Warenwirtschafts-Import und wird vom Server bereits vollständig an die App mitgeliefert. Sie wird
dort weiterhin nur nicht angezeigt — es fehlt ausschließlich die Darstellung, keine Daten.

Ein Punkt ist zu ergänzen, den die damalige Antwort nicht erwähnt hat: **Die Teamleitung sieht die
Zahl.** Im Cockpit steht sie in der Beleg-Detailansicht unter „Kopf" als Zeile
**„Kartons (Anlieferung)"**. In den Kachel- und Listenansichten (Digitale Ablage, Belege-Liste,
Mitarbeiterboard) taucht sie dagegen nicht auf.

Zur Einordnung, warum die Anzeige heute fehlt: **Die Forderung war umgesetzt.** Am 06.07.2026 wurde
sie als Punkt C2 gebaut — „Anzahl Kartons der Anlieferung prominent" — und erschien im Beleg-Kopf als
`'📦 6 Kartons – alle auf dem Karren suchen!'`. In dieser Form stand sie in der Kundenpräsentation
vom 14.07.2026 und bestand am 15.07.2026 die E2E-Abnahme. Am Abend des 15.07.2026 wurde sie in zwei
Schritten aus dem Kopf genommen: zuerst der Satz durch eine kompakte Angabe ersetzt (die Kartonzahl
blieb), 64 Sekunden später die Kartonzahl ersatzlos gestrichen, mit der internen Begründung
„Warenart · Teile genügt". Ein Kundenauftrag dafür ist nicht dokumentiert.

Das erklärt auch, warum das Endnutzer-Handbuch die Anzeige heute noch beschreibt: Der
Handbuch-Abschnitt zum Beleg-Bildschirm nennt den Kartons-Hinweis, obwohl es ihn in der App nicht
mehr gibt. **Diese Handbuch-Stelle ist damit sachlich falsch und sollte korrigiert werden** —
unabhängig davon, ob die Anzeige zurückkommt.

**Herkunft der Zahl — durch die Kundenrückmeldung vom 06.08.2026 geklärt.** Die Kartonanzahl wird
beim Buchen von den Bucherinnen der Warenwirtschaft in ProHandel eingetragen und steht heute schon
auf den Arbeitsanweisungen („auf Lagerplatz W13 sechs Kartons zu Beleg 3551415"). Sie ist damit kein
erfundenes Feld, sondern ein bestehendes Prozess-Datum. Zwei Einschränkungen bleiben: Es ist **noch
kein Pflichtfeld** (die Kundenseite hat genau das angeregt), und in unserer Mapping-Tabelle fehlt
noch die Zeile mit dem konkreten ProHandel-Feld. Beides hindert den Einbau nicht — es bestimmt nur
die Regel für den Leerfall: **Ist keine Zahl hinterlegt, wird nichts angezeigt.** Ein
stillschweigendes „1 Karton" wäre genau der Fehler, den die Anzeige verhindern soll.

Wichtig für das gemeinsame Verständnis: Die Kartonanzahl der **Anlieferung** (in wie vielen Kartons
die Ware ankommt — das, wonach die Frage zielt) ist etwas anderes als die **Zielboxen**, in die der
Mitarbeiter die Ware für Filiale/Shopbereich/Etage einsortiert und für die Boxzettel gedruckt werden.
Beide Größen existieren im System nebeneinander; die Boxzettel tragen ihre eigene Boxnummer, aber
keine Gesamtzahl im Sinne von „Karton 2 von 6".

In den Demo-Daten hat sich die Größenordnung nicht verändert, die Zahlen selbst schon: Von aktuell
**209 Belegen** haben **118 mehr als einen Karton** (91 genau einen). Der größte Beleg besteht aus
8 Kartons, im Schnitt sind es 2,2 Kartons je Beleg. Die Aussage „mehr als die Hälfte der Belege
kommt in mehreren Kartons" gilt also unverändert.

### Kleinstmöglicher Umsetzungsvorschlag (nicht umgesetzt)

**Die frühere Vorbedingung (Datenherkunft) ist mit der Kundenrückmeldung vom 06.08.2026 erledigt.**
Der Einbau ist klein — keine Änderung an Server, Datenmodell oder Fachlogik nötig, die Zahl liegt
bereits in der App vor. Es genügt **eine** Stelle:

| | |
|---|---|
| **Komponente** | Die gemeinsame Beleg-Infozeile der Mitarbeiter-App. Sie wird identisch unter „1 · Ware holen" **und** unter „2 · Bearbeiten" gezeigt — eine Ergänzung deckt beide Ansichten auf einmal ab. |
| **Feld** | Die bereits mitgelieferte Kartonanzahl des Beleg-Kopfs. |
| **Label** | `\| 6 Kartons` als weiterer Block in derselben Zeile, in der schon „Filiale · Shopbereich \| Etikett mit Preis" steht. |
| **Regel** | Nur anzeigen, wenn es **mehr als einen** Karton gibt. „1 Karton" ist der Normalfall und wäre reines Rauschen — die Frage des Kunden zielt genau auf die Ausnahme. |
| **Ort ist entscheidend** | Die am 15.07.2026 entfernte Anzeige saß im **Beleg-Bildschirm** — also erst, nachdem die Ware geholt war. Gebraucht wird sie bei der **Entnahme**. Ein bloßes Zurückdrehen von `75aa260` löst das Problem daher nicht. |
| **Optional** | Zusätzlich in der Fakten-Leiste des Beleg-Bildschirms — als Kontrolle beim Bearbeiten. |
| **Pflicht-Nacharbeit** | Handbuch-Abschnitt A3 angleichen — er beschreibt heute eine Anzeige, die es nicht gibt. |
| **Leerfall** | Ist keine Kartonanzahl hinterlegt: **nichts** anzeigen. Niemals stillschweigend „1 Karton" annehmen — das Feld ist in ProHandel noch nicht verpflichtend. |

---

## Technischer Anhang

Alle Belege gegen `origin/main` @ `8fa580f` (30.08.2026). Der Arbeitsbaum stand auf `7c43102`
(10 Commits dahinter); die Differenz berührt den Karton-Pfad nicht:
`git log -S inboundCartonCount HEAD..origin/main` ist leer und
`git diff --stat HEAD origin/main -- apps/employee-pwa/ packages/domain-types/ apps/backend-api/prisma/`
ist leer. Alle Zeilennummern gelten für beide Stände.

### 1. Datenmodell — existiert die Kartonanzahl noch?

**Ja, unverändert, auf Beleg-Kopf-Ebene** (nicht an der Position). Das Feld heißt heute
`inboundCartonCount`.

| Ort | Beleg |
|---|---|
| Prisma | `apps/backend-api/prisma/schema.prisma:406-407` — `inboundCartonCount Int?` auf `model GoodsReceiptCase`, mit Kommentar „Anzahl der Kartons der Anlieferung (WE-Beleg-Kopf, mock-ERP, A6)" |
| Domain-Types | `packages/domain-types/src/cases.ts:156-157` — `inboundCartonCount: z.number().int().positive().optional()` |
| Ebene | Beleg-Kopf. `model ReceiptPosition` (`schema.prisma:474 ff.`) trägt **kein** Karton-Feld. |

**Abzugrenzen — die Zielboxen sind ein eigenes Konzept:**

| Ort | Beleg |
|---|---|
| Prisma | `apps/backend-api/prisma/schema.prisma:804-830` — `model TransportBox` mit `boxNo`, `branchNo`, `shopAreaNo`, `shopNo`, `floor`, `positionIds`, `labelStatus`, `sealCode`; Relation `GoodsReceiptCase.transportBoxes` (`:459`) |
| Domain-Types | `packages/domain-types/src/transport.ts:6-22` (`transportBoxSchema`), `:25-48` (`transportBoxTargetSchema`) |

Die Kartonanzahl ist reines Anzeigedatum: `grep -rn inboundCartonCount packages/assignment-engine/src/`
liefert **keinen Treffer** — die Engine rechnet nicht damit. Das deckt sich mit
`docs/review/dustin-feedback-v2-review.md:89` (D10): „`inboundCartonCount` is display-only, never fed
into detection."

### 2. API — liefert das Backend die Zahl weiterhin an die PWA?

**Ja, auf beiden Wegen, die die App nutzt.**

| Schicht | Beleg |
|---|---|
| DTO | `apps/backend-api/src/cases/cases.dto.ts:116-117` — `inboundCartonCount!: number \| null`, `@ApiPropertyOptional(… 'Kartons der Anlieferung (A6)')` auf `CaseSummaryDto` |
| Mapper | `apps/backend-api/src/cases/cases.service.ts:1084` — `inboundCartonCount: c.inboundCartonCount ?? null` in `mapSummary()` (Typ-Feld `:1046`) |
| `GET /api/me/today` | `apps/backend-api/src/cases/me.controller.ts:32` → `cases.service.ts:245` (`mapSummary`); die Prisma-Abfrage nutzt `include` (`:162-207`), alle Skalarfelder des Belegs kommen mit |
| `GET /api/me/cases/:caseId/aggregate` | `me.controller.ts:45-52` → `cases.service.ts:500` (`mapSummary`) |
| OpenAPI | `apps/backend-api/openapi.json:3787-3791` und `:5108-5112` |
| api-client | `packages/api-client/src/generated/schema.ts:1435` und `:1839` |
| Ankunft in der PWA | `apps/employee-pwa/src/data/caseAggregateMapper.ts:165` — `inboundCartonCount: c.inboundCartonCount ?? undefined` |

Gegenprobe, dass die Zahl in der App **nur ankommt, aber nie gerendert wird**:
`grep -rn "inboundCartonCount\|cartonCount" apps/employee-pwa/src/` liefert genau zwei Treffer —
`data/caseAggregateMapper.ts:165` (Mapper) und `test/exampleAggregate.ts:30` (Testfixture). Keine
Komponente liest das Feld.

### 3. Anzeige „1 · Ware holen" — wird die Kartonanzahl dort dargestellt?

**Nein.**

| Element | Beleg |
|---|---|
| Abschnitts-Überschrift | `apps/employee-pwa/src/screens/BundleHomeScreen.tsx:660` — „1 · Ware holen" |
| Lagerplatz je Stop | `:712-714` — `stop.locationCode` |
| WE-Nummer + Warenart-Chip | `:721-726` |
| Info-Zeile | `:727` → `BelegInfoLine` (`:400-431`): rendert `Filiale {branchNo}` · `Shopbereich {primaryShopAreaNo}` (`:416-417`), danach je Etikett-Variante Icon + Kurzlabel (`:418-427`), dann `CatManChip` (`:428`). **Kein Karton-Block.** |
| Barcode-Knopf | `:729-738` — „Barcode anzeigen" |
| Status-Chip | `:743-747` — „geholt" / „offen" |

Dieselbe `BelegInfoLine` wird unter „2 · Bearbeiten" wiederverwendet (`:843`) — auch dort keine
Kartonanzahl. Das ist zugleich der Grund, warum eine einzige Ergänzung beide Ansichten abdeckt.

### 4. Anzeige Beleg-Bildschirm (`BelegProcessScreen`) — wird sie dort dargestellt?

**Nein — sie war kurzzeitig da und wurde bewusst entfernt.**

| Element | Beleg |
|---|---|
| Hero + Ort | `apps/employee-pwa/src/screens/BelegProcessScreen.tsx:498-499` — Titel „WE <Nummer>", darüber „Lagerplatz <Code>" |
| Fakten-Leiste | `:517-541` — Warenart-Chip (`:529-531`), `{c.totalQuantity} Teile` (`:532-539`), `CatManChip` (`:540`). **Kein Karton-Block.** Der Kommentar `:517` lautet heute wörtlich „Warenart · Menge · CatMan-Termin". |

Historie:

| Zeitpunkt | Ereignis | Beleg |
|---|---|---|
| 06.07.2026 13:00 | **Auftrag umgesetzt.** `ce445e7` — Commit-Body wörtlich: „**C2: Anzahl Kartons der Anlieferung prominent ('alle auf dem Karren suchen!')**" | `git show -s ce445e7` |
| 14.07.2026 | **Dem Kunden so gezeigt.** Die Kundenpräsentation bildet den Beleg-Kopf mit Kartonzahl ab | `docs/presentation/kundenfeedback-14-07/index.html:312` („📦 1 Karton – alle auf dem Karren suchen!"), `flow-1-positionen-tabelle.md:57`, `index.html:371` („darunter die Kartonzahl") |
| 15.07.2026 18:28 | **E2E-Abnahme bestanden.** Runbook prüft den Kopf inkl. „3 Kartons – alle auf dem Karren suchen!" → **PASS** | `docs/review/runbooks/kundenfeedback-14-07/40-positionen-tabelle.md:17` (Commit `456ef50`) |
| 15.07.2026 21:34 | `11f2c8e` — Satz durch kompakte Leiste ersetzt; Commit-Body: „kompakte Fakten-Leiste Warenart · n Teile · **n Kartons**". **Die Kartonzahl bleibt.** | `git show -s 11f2c8e` |
| 15.07.2026 21:36 | **64 Sekunden später:** `75aa260` — „Kartons-Angabe aus Beleg-Header entfernt (Warenart · Teile genügt)". Entfernt den `inboundCartonCount`-Block ersatzlos (−12/+2 Zeilen) | `git show 75aa260` |

**Zur Auftragslage der Entfernung:** Jeder andere Commit dieser Session nennt seine Grundlage —
`3e01780` „nach Kundenfeedback 14.07", `976d2fe` „(Kundenfeedback 14.07.2026)", `4680427` „(Nachtrag
14.-15.07.2026)". `75aa260` nennt keine; die Begründung „(Warenart · Teile genügt)" ist eine
Bewertung, kein Zitat. Ein Kundendokument, das die Entfernung verlangt, existiert nicht:
`grep -rln "Nachtrag 15.07" docs/` ist leer, und die im Code als „Nachtrag 15.07.2026" markierten
Punkte betreffen ausnahmslos anderes (gestapelter Positions-Kopf, Ordernummer nur im Cockpit,
Barcode-Popup, Etikettpreis). *Vorbehalt:* Eine mündliche Anweisung in der Arbeitssitzung wäre in
Git nicht sichtbar — belegbar ist nur, dass es keinen schriftlichen Auftrag gibt und alle
schriftlichen Spuren (C2-Auftrag, Kundenpräsentation, bestandene Abnahme) in die Gegenrichtung
zeigen.

**Zwei Doku-Drifts als Folge dieser Entfernung (Befund, nicht behoben):**

- `apps/employee-pwa/src/screens/BelegProcessScreen.tsx:4` — der Datei-Docblock behauptet noch
  „the Kopf shows Kartons (C2)". Stimmt seit `75aa260` nicht mehr.
- `docs/handbook/a3-beleg-bearbeiten.md:47-50` — beschreibt noch
  „`'📦 <Anzahl> Karton / Kartons – alle auf dem Karren suchen!'`" auf dem Beleg-Bildschirm.
  Die Anzeige existiert nicht mehr; das Handbuch wurde zuletzt am 04.08.2026 angefasst, ohne diese
  Stelle nachzuziehen.
- Ergänzend: `docs/review/dustin-feedback-v2-review.md:42` führt Punkt M19 („Anzahl der Kartons …
  müssen dort stehen") als **DONE** mit Beleg `„📦 N Karton(s)" (:179-182)`. Dieser Nachweis ist
  seit `75aa260` gegenstandslos.

**Boxzettel-Umstellung (Hinweis aus der Aufgabenstellung) — bestätigt und ohne Einfluss auf diese
Frage:** Der frühere Boxzettel-Abschnitt der Positions-Anzeige ist entfallen; der Docblock hält das
in `BelegProcessScreen.tsx:22-24` fest („Der frühere Boxzettel-Abschnitt entfällt — seine Infos
(Filiale, Shopbereich, Shop, Etage, Warenart) stehen jetzt an der Position"). Die Zielboxen liefert
das Backend zwar weiter mit (`cases.service.ts:505` — `boxTargets: found.transportBoxes.map(…)`),
in der PWA werden sie aber nur noch in Tests referenziert
(`apps/employee-pwa/src/workflow/useCaseFlow.test.tsx:72`,
`apps/employee-pwa/src/data/useCaseAggregate.test.tsx:19`) — kein Renderpfad. Diese Umstellung
betrifft die **Zielboxen**, nicht die Anlieferungs-Kartonanzahl; sie ist also nicht die Ursache
dafür, dass die Kartonanzahl fehlt (das war `75aa260`).

### 5. Wird die Info an anderer Stelle gezeigt?

| Ort | Ergebnis | Beleg |
|---|---|---|
| **Teamlead-Cockpit, Beleg-Detail → „Kopf"** | **Ja** — Zeile `'Kartons (Anlieferung)'`, `–` wenn leer | `apps/teamlead-web/src/features/belege/BelegDetailPage.tsx:452`; Datenweg `data/belege.ts:380-381` + `:749`; Backend `cases/teamlead-read.service.ts:1053` (Liste: `:405`). Existiert seit `0994e46` (06.07.2026), also bereits vor der Entfernung in der App. |
| Belege-Liste (Cockpit) | Nein — keine Karton-Spalte | Spaltendefinitionen `BelegListPage.tsx:372-651`; auch nach dem Spalten-Menü-Ausbau (`2dc411e`) kein Karton-Eintrag |
| Digitale Ablage (Kacheln) | Nein | `AblagenBoard.tsx:821` nutzt `BelegInfoChips` (`components/BelegInfoChips.tsx`) → Filiale, Shop, Etiketten-Variante, „Sicherung" — kein Karton-Chip |
| Mitarbeiterboard / Bündel-Zuweisung | Nein | dieselbe `BelegInfoChips`-Komponente |
| Boxzettel-/Etikettendruck | Nein — nur die eigene Boxnummer, keine Gesamtzahl | `apps/backend-api/src/modules/print/print-jobs.ts:60-74` (`buildBoxSlipData` → `boxNo`, `quantity`, kein Gesamtwert); Nutzlast-Schema `packages/domain-types/src/print.ts:55-67` |
| Handbuch (korrekte Stelle) | Cockpit-Zeile ist richtig dokumentiert | `docs/handbook/b2-belege-ansicht.md:67` |

### 6. Seed-/Demo-Daten — stimmt „116 von 200"?

**Nein — heute sind es 118 von 209.** Größenordnung und Aussage bleiben identisch.

**Methode (dev-Datenbank unangetastet):** Wegwerf-Datenbank `seedcheck_tmp` im laufenden
Postgres-Container angelegt, Schema per `prisma db push` gespiegelt, den echten Seed
(`apps/backend-api/prisma/seed.ts` → `loadScenario(prisma, 'standard', { volume: 'typical' })`)
dagegen laufen lassen, gezählt, Datenbank wieder gelöscht. Seed-Ausgabe:

```
[seed] scenario=standard volume=typical users=13 shifts=0 activeLocations=25
       readyCases=189 blockedCases=2 deliveryGroups=58 totalCases=209
```

Ergebnis (`SELECT` auf `goods_receipt_cases`):

| Kennzahl | Wert |
|---|---|
| Belege gesamt | **209** |
| davon **mehr als 1 Karton** | **118** |
| genau 1 Karton | 91 |
| ohne Wert (`NULL`) | 0 |
| Maximum | 8 Kartons |
| Durchschnitt | 2,20 Kartons |

Verteilung: 1 → 91 · 2 → 67 · 3 → 18 · 4 → 15 · 5 → 5 · 6 → 2 · 7 → 4 · 8 → 7 Belege.

Gegenprobe: Die laufende Dev-Datenbank `paketlager` zeigt exakt dieselben Werte (209 / 118 / 91 / 0),
der Seed ist also reproduzierbar.

Herkunft der Werte im Seed:

| Quelle | Beleg |
|---|---|
| Generierter Ready-Pool + Lifecycle-Belege | `apps/backend-api/src/dev/scenarios/case-builders.ts:49-50` und `:1079` — `Math.max(1, Math.ceil(totalQuantity / 25))`, Kommentar „A6: Kartonanzahl der Anlieferung (~25 Teile je Karton)" |
| MA-108-Demo-Beleg | `case-builders.ts:609` — fest `inboundCartonCount: 2` |
| Mock-ProHandel-Charge | `apps/backend-api/src/prohandel/beleg-generator.ts:282` — `Math.max(1, Math.ceil(totalQuantity / int(rng, 20, 40)))`; Feld `:88`, Persistenz `beleg-persist.ts:109` |
| Szenario-Baukasten „eigener Beleg" | `apps/backend-api/src/dev/scenarios/definitions/custom-case.ts:108` |

### 7. Zusatzbefund: die Kartonanzahl ist in unserer Feld-Landkarte nicht verzeichnet

Nicht Teil der sechs Prüffragen. **Durch die Kundenrückmeldung vom 06.08.2026 entschärft** (siehe
Abschnitt 8): Die Zahl existiert im Prozess, sie fehlt nur in unserer Spezifikation.

| Prüfung | Ergebnis |
|---|---|
| ProHandel-Feldliste (jedes gelieferte Feld → interne Bedeutung → UI) | `docs/concept/prohandel-integration-concept.md:225-236` — **kein Karton-/Colli-Feld**. Die einzigen „Karton"-Treffer betreffen den Etikettentyp („Karton-Kleber" vs. „Hänger-Etikett", `:228`) |
| Datenfeld-Mapping der Discovery | `docs/discovery/01-datenfeld-mapping.md` — `grep -niE "karton\|colli\|packstueck"` **ohne Treffer** |
| Prisma-Kommentar am Feld selbst | `apps/backend-api/prisma/schema.prisma:406` — „(WE-Beleg-Kopf, **mock-ERP**, A6)" |
| Mock-ProHandel-Generator | `apps/backend-api/src/prohandel/beleg-generator.ts:12` führt „Kartonanzahl" unter den **erzeugten** Feldern; `:282` — `Math.ceil(totalQuantity / int(rng, 20, 40))` |
| Seed | `apps/backend-api/src/dev/scenarios/case-builders.ts:49-50` — `Math.ceil(totalQuantity / 25)`, Kommentar „~25 Teile je Karton" |
| Wo eine echte Zahl herkäme | `docs/concept/warenbezeichnung-position-data-model-concept.md:31-33` — im DESADV/ASN-Standard trägt die **Packstück-Ebene** (CPS/PAC, HL Tare/Pack) die „Karton/SSCC-Hierarchie". Diese Ebene wird heute nicht eingelesen; das Modell nutzt nur Kopf und Position |

**Einordnung:** Die Formulierung der damaligen Antwort — „Die Zahl ist im System vollständig
vorhanden" — beschreibt korrekt den Transportweg (Datenbank → Server → App); der heutige Wert ist
aber aus der Teile-Anzahl abgeleitet. Das ist allerdings **kein Sonderfall der Kartonanzahl**: Die
ProHandel-Anbindung ist insgesamt noch ein Mock ohne echten Aufruf
(`apps/backend-api/src/prohandel/prohandel.service.ts:9-16` — „Kein echter HTTP-Call"), der „Kartons"
ausdrücklich gleichrangig neben Preisen, WGR, CatMan, Sicherungstyp und Prüfstufe erzeugt. Alle
diese Felder werden heute angezeigt, obwohl sie aus derselben Mock-Quelle stammen. Ausgerechnet bei
der Kartonanzahl auf die echte Anbindung zu warten, wäre inkonsistent. Was fehlt, ist die Zeile in
der Mapping-Tabelle — nicht die Datenquelle.

**Randbefund:** Auch die Liefergruppen-Kennzeichnung `'Lieferung ×n'` — die den verwandten Fall
abdeckt, dass **eine** physische Anlieferung als **mehrere** WE-Belege gebucht wurde — existiert nur
im Cockpit (`apps/teamlead-web/src/components/LieferungChip.tsx:60`), nicht in der Mitarbeiter-App
(`grep -rn "deliveryGroup" apps/employee-pwa/src/` → nur ein inerter Platzhalter in
`caseAggregateMapper.ts:192`). Der Mitarbeiter hat damit **überhaupt kein** Signal, dass zu einer
WE-Nummer mehr als ein Packstück gehört. Das Handbuch-Glossar (`grundlagen-glossar.md:14`)
beschreibt den Chip als „auf dem Bildschirm sichtbar" — gemeint ist das Cockpit.

### 8. Fachliche Klärung durch den Kunden (Mail vom 06.08.2026)

Auf vier Rückfragen zum Kartonthema. Die Antworten legen Bedarf **und** Datenform fest.

| Frage | Antwort des Kunden | Was daraus fürs UI folgt |
|---|---|---|
| Kartons zusammen gelagert? | „Die zusammengehörenden Kartons werden immer auf **einen Platz** gelagert." | Ein Lagerplatz je Beleg genügt — das bestehende Modell (`GoodsReceiptCase.storageLocationId`) passt. Keine Mehrfach-Stops. |
| Warum reicht die Kennzeichnung nicht? | „Da auf diesen Plätzen jedoch auch noch weitere Kartons von **anderen Aufträgen** stehen können … Zwar sind sie gekennzeichnet, dennoch ist es für den MA besser zu wissen: muss er 1 Karton holen oder eventuell 5." | Es ist ein **Zähl-**, kein Identifikationsproblem. Der MA erkennt seine Kartons bereits; ihm fehlt nur, wann er fertig ist. → Es genügt die **Anzahl**. Keine Kartonnummern, keine Liste, kein Scan. |
| Woher kommt die Nummer? | Lieferschein und Karton werden „abgeklebt": dieselbe Nummer auf beiden, „die später als **WE-Nummer** … ins System übernommen wird (z. B. 2936053)". | Das Suchkriterium ist die WE-Nummer — die App zeigt sie bereits groß und als Code-128-Barcode. Die Ergänzung ist damit minimal: **eine Zahl neben eine Nummer, die schon da steht.** |
| Im ERP hinterlegt? | „Die Bucherinnen müssen dies beim Buchen der Belege im Pro Handel eintragen (… dass dies ein **Pflichtfeld** sein muss)." Auf den Arbeitsanweisungen steht es heute schon: „auf Lagerplatz W13 sechs Kartons zu Beleg 3551415". | Quelle ist geklärt. **Noch nicht verpflichtend** → Leerfall muss definiert sein: nichts anzeigen. |
| Karton→Positions-Zuordnung? | Implizit **nein** — es gibt nur die gemeinsame Nummer auf allen Kartons, keine Angabe, welche Position in welchem Karton liegt. | **`inboundCartonCount` als Zahl am Beleg-Kopf ist genau die richtige Form.** Keine Karton-Entität, keine Positions-Zuordnung — das Datenmodell muss nicht angefasst werden. |

**Die drei Abkleb-Varianten sind zwei verschiedene Features:**

| Variante | Verhältnis | Mechanismus | Stand |
|---|---|---|---|
| **2** (3 Kartons, 1 Lieferschein) und **3** (1:1) | 1 Beleg → *n* Kartons | `inboundCartonCount` | Feld vorhanden, **Anzeige fehlt** |
| **1** (1 Karton, mehrere Lieferscheine) | *n* Belege → 1 Karton | Liefergruppe („Lieferung ×n") | Logik vorhanden, **in der Mitarbeiter-App nicht sichtbar** |

Variante 1 wird von der Kartonanzahl **nicht** abgedeckt: Dort ist die Anzahl je Beleg 1, und
trotzdem gehört etwas zusammen — der Kunde schreibt: „ein Mitarbeiter muss **alle**
zusammengehörenden Lieferscheine aus einem Karton bekommen." Das ist eine Zuweisungs-Bedingung, die
die Liefergruppen-Logik bereits erfüllt; sichtbar ist sie aber nur im Cockpit
(`LieferungChip.tsx:60`), nicht in der App. Der Mitarbeiter sieht also nicht, dass drei seiner
Belege aus **einem** Karton stammen — und läuft im Zweifel dreimal zum selben Platz.

---

## Zusammenfassung der Befunde

1. **Datenmodell und Server sind vollständig** — Feld `inboundCartonCount` am Beleg-Kopf, über
   `/api/me/today` und den Beleg-Aggregat-Endpunkt an die App ausgeliefert, in OpenAPI und
   api-client typisiert.
2. **Die Mitarbeiter-App zeigt die Zahl an keiner Stelle** — die App liest das Feld nicht einmal;
   es endet im Mapper.
3. **Sie war einmal da** — als Kundenpunkt C2 gebaut (06.07.), dem Kunden gezeigt (14.07.), E2E
   abgenommen (15.07.) — und am 15.07.2026 mit `75aa260` ohne dokumentierten Auftrag entfernt.
4. **Das Cockpit zeigt sie** in der Beleg-Detailansicht (seit 06.07.2026).
5. **Zwei Dokumentations-Drifts** (Handbuch A3, Docblock in `BelegProcessScreen.tsx:4`) und ein
   überholter DONE-Nachweis (`dustin-feedback-v2-review.md:42`) beschreiben eine Anzeige, die es
   nicht mehr gibt.
6. **Demo-Daten:** 118 von 209 statt 116 von 200.
7. **Datenherkunft geklärt (Mail 06.08.2026):** Die Zahl wird von den Bucherinnen in ProHandel
   eingetragen und steht heute schon auf den Arbeitsanweisungen. Sie ist noch kein Pflichtfeld →
   Leerfall = nichts anzeigen. Der Einbau ist damit nicht mehr blockiert.
8. **Der Ort war schon beim ersten Einbau falsch:** Die 2026 entfernte Anzeige saß im
   Beleg-Bildschirm, gebraucht wird sie bei „Ware holen".
9. **Zweiter, offener Fall:** Variante 1 (mehrere Belege in einem Karton) braucht die
   Liefergruppen-Anzeige in der Mitarbeiter-App — die es dort bis heute nicht gibt.
