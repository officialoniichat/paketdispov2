# Parser-Befundanalyse — IST gegen Konzept v1.5

**Modus:** Analyse-only. Keine Parser-Code-Änderungen vorgenommen.
**Stand:** 2026-06-15 · Branch `main` (Commit `5037ae0`).
**Referenz:** `LT_Digitale_Belegverteilung_MitarbeiterApp_Konzept_v1_5_Verifikation_Offene_Punkte.docx`
(Anhang G, §6, §4.2, §14.3, §8.2/Anhang B.3, Q5/Q6, Anhang F.1/F.2, Anhang H.2).
**Geprüfter Umfang:** `apps/parser-worker/**` (853 LOC src / 1073 LOC tests), `packages/domain-types/src/{documents,effort,enums}.ts`, `apps/backend-api/prisma/schema.prisma`, gesamtes `apps/backend-api/src` (Suche nach Document-Service-Pfad).

---

## (a) Executive Summary

Der reine **Extraktionskern** des Python-Parsers ist sauber gebaut: kleine, pure Funktionen, gute Trennung von Extraktion / Mapping / Confidence, und die *fachlichen Leitplanken aus Anhang F.2 sind explizit und korrekt kodiert* (Prüfung Nein → `quantity_only`; Prio/NOS niemals Abschnitt; Position gruppiert SKU-Zeilen). Das ist die Stärke.

Die Schwächen sind **architektonisch und in der Reichweite**, nicht im Regex-Detail:

1. **Der „Document Service" existiert nicht.** Das Konzept (§4.2, §12.2 „Document Service: DocumentSet-Verwaltung, Parserstatus, Originaldateien, Validierung", Zeile 747) verlangt eine Backend-Komponente, die Dateien importiert, zu DocumentSets **gruppiert**, den Parser anstößt, das Ergebnis **gegen §14.3 validiert** und in `GoodsReceiptCase` + `WorkInstructionHeader` + `ReceiptPosition` + `ReceiptSkuLine` **persistiert**. Diese Komponente fehlt vollständig. Der `parser-worker` ist eine **Insel**: kein TS-Code im gesamten Repo enqueued einen Parse-Job, niemand konsumiert `ParseJobResult`, kein Backend-Code schreibt `DocumentSet`/`Document`/`ReceiptPosition` (verifiziert per repo-weiter Suche — 0 Treffer). Das laufende System wird über Dev-Seeds gefüttert, der Parser ist im Betrieb komplett umgangen.

2. **Das AW↔WE-Domain-Mapping ist nicht implementiert.** Der Parser liefert zwei *getrennte* Strukturen (`ParsedWorkInstruction.positions`, `ParsedReceipt.positions`). Anhang G.4 verlangt die *Verschmelzung* (`ReceiptPositionWithSkuLines`: AW-Positionsnummer verbindet Etikett/Sicherung-Anweisung mit Artikel/SKU aus dem WE-Beleg). Es gibt nur einen Plausibilitäts-Set-Vergleich der Positionsnummern, aber keinen Join, der die Per-Positions-Instruktion auf die WE-Position überträgt. `PositionInstruction` (Prisma) bleibt damit unbefüllbar.

3. **§14.3 ist nur zur Hälfte umgesetzt.** Cross-Dokument-Checks (Belegnr-Match, Mengen-Plausibilität, Positionsabgleich) sind da und gut. Aber **Lagerplatz gegen LocationMaster** und **Belegnr-Eindeutigkeit/Duplikat** fehlen — beide erfordern den nicht existierenden Document Service / DB-Zugriff.

4. **Die Golden-Master „Variantenabdeckung" ist zirkulär und gibt falsche Sicherheit.** Alle 14 Varianten sind *synthetische* Text-PDFs, die aus Strings gebaut werden, die exakt an die Regex-Annahmen des Parsers angepasst sind (gleiche Wörter, gleiche Abstände). Der Golden-Gate testet den Parser gegen seine eigene Layout-Annahme, nicht gegen echte L+T-Dokumente. Anhang H.5 verbietet ausdrücklich, Variantenbeherrschung ohne echte Belege zu behaupten („Parserfreigabe erfolgt erst nach Test gegen echte Varianten, nicht nur gegen die zwei Beispiel-PDFs").

5. **Felddatentiefe unter §6.3.** Preise (`ekPrice`/`vkPrice`/`vkLabelPrice`), `redPrice`/Rotpreis, `season`, `onlineRelevant`, `sustainabilityFlag`, `labelType`, `weDate`, `catManDate`, `loadPlanDate` werden nicht extrahiert. Damit kann der `EffortInputVector` (§8.2/Anhang B.3, speist sich u.a. aus `redPriceRequired`, `onlineRelevantPositionCount`) nicht vollständig aus Parserdaten gebildet werden.

**Gesamturteil:** Der Kern ist solide, aber das System ist **nicht durchgängig**. Die Bewertung „unzureichend durchdacht" trifft zu *im Sinne der Reichweite und Integration*: ein gut getesteter Extraktor ohne Service, ohne Domain-Mapping, ohne echte Validierung, mit zirkulär-synthetischer Testabdeckung. Für einen Piloten ist der Parser in diesem Zustand **nicht freigabefähig** (H.5).

---

## (b) Befundtabelle

Severity: **CRITICAL** (blockt Pilot / Datenkorrektheit) · **HIGH** (fachlich falsch / Konzeptverletzung) · **MEDIUM** (Lücke / Robustheitsrisiko) · **LOW** (Hygiene).

| # | Prüfpunkt | Status | Sev. | Fundstelle / Beleg |
|---|-----------|--------|------|--------------------|
| **1. Mapping-Vollständigkeit (Arbeitsanweisung-Punkte)** ||||
| 1.1 | Punkt 1 Preisetikettendruck → `priceLabelPrintRequired` | **PASS** | – | `work_instruction.py:41,102` |
| 1.2 | Punkt 4 Warenbezeichnung/Abschnitt → `sectionText` | **PASS** | – | `work_instruction.py:47,128` |
| 1.3 | Punkt 5 Sortieren → `sortByArticleColorSizeRequired` | **PASS** | – | `work_instruction.py:42,103` |
| 1.4 | Punkt 6 Prüfung → `goodsReceiptCheckMode` | **PASS** | – | `work_instruction.py:107-112`, `guardrails.py:40-55` |
| 1.5 | Punkt 8 Etikett anbringen je Position → `labelAttachRequired` | **PASS** | – | `work_instruction.py:118,122,140` |
| 1.6 | Punkt 9 Boxzettel → `boxLabelRequired` | **PASS** | – | `work_instruction.py:45,104` |
| 1.7 | Punkt 10 Sicherung je Position → `securityRequired` | **PASS** | – | `work_instruction.py:119,123-126,141` |
| 1.8 | Punkt 11 ZST → `zstRequired` | **PASS** | – | `work_instruction.py:46,105` |
| 1.9 | §6.3-Felddatentiefe (Preise, Rotpreis, season, online, labelType, weDate, catManDate, loadPlanDate) | **FAIL** | HIGH | Preise nie gecaptured: `we_beleg.py:29-32` (`_SKU` hat keine Preisgruppen); `models.py:102-119` Felder existieren, werden nie befüllt; `redPrice/onlineRelevant/season/...` nicht extrahiert |
| **2. Guardrails** ||||
| 2.1 | „Prüfung Nein" → `quantity_only` (nicht `none`) | **PASS** | – | `guardrails.py:51-52`; Test `golden_variants.py:116-117` |
| 2.2 | Prio als Flag, nicht Abschnitt | **PASS** | – | `guardrails.py:69-80`, `work_instruction.py:153-154` (`section=None`) |
| 2.3 | NOS getrennt vom Abschnitt | **PASS (mit Risiko)** | MEDIUM | `models.py:83`, `work_instruction.py:129` — getrennt gespeichert ✔, aber Erkennung ist Whole-Doc-Substring `"nos" in text.lower()` und wird *allen* Positionen identisch zugewiesen (s. 6.x) |
| 2.4 | ReceiptPosition mit darunterliegenden ReceiptSkuLines | **PASS** | – | `we_beleg.py:48-76` (strukturelles Nesting), Test `_expect_sku_grouping` `golden_variants.py:178-188` |
| 2.5 | Lieferschein nur Archiv, nicht App-Basis | **PASS** | – | `pipeline.py:43` (Lieferschein wird mitgeführt, nie geparst) |
| **3. AW-POS ↔ WE-POS Mapping** ||||
| 3.1 | Verknüpfung AW-Position ↔ WE-Position (Join zu `ReceiptPositionWithSkuLines`, G.4) | **FAIL** | HIGH | Nicht vorhanden. `ParsedWorkInstruction.positions` und `ParsedReceipt.positions` bleiben getrennt; kein Merge. `pipeline.py` macht nur Set-Vergleich |
| 3.2 | Belegmenge gegen Summe SKU-Mengen plausibilisiert | **PASS** | – | `pipeline.py:109-113` |
| 3.3 | Per-Position-Instruktion (Etikett/Sicherung) auf WE-Position übertragen → `PositionInstruction` | **FAIL** | HIGH | Kein Code befüllt `PositionInstruction`; AW-Flags landen nie an der WE-Position |
| **4. Validierung §14.3** ||||
| 4.1 | AW vs WE Belegnr-Match | **PASS** | – | `pipeline.py:104-107` |
| 4.2 | Belegmenge ↔ SKU-Summe | **PASS** | – | `pipeline.py:109-113` |
| 4.3 | Positionsnummern AW im WE vorhanden | **PASS** | – | `pipeline.py:115-118` |
| 4.4 | Prio/Abschnitt/CatMan getrennt | **PASS** | – | `guardrails.py:17-37,69-80` |
| 4.5 | parseConfidence < Schwelle → `needs_review` | **PASS** | – | `confidence.py:33-44` |
| 4.6 | **Belegnr-Eindeutigkeit / Duplikaterkennung** | **FAIL** | HIGH | Nicht implementiert. Erfordert DB/Service; Prisma hat `weBelegNo @unique` (`schema.prisma:356`) + `importKey @unique` (313), aber kein Code prüft/routet Duplikate → `needs_review` |
| 4.7 | **Lagerplatz gegen LocationMaster** | **FAIL** | HIGH | Lagerplatz wird extrahiert (`work_instruction.py:34`), aber nie gegen `Location` geprüft; §14.3 „muss bekanntem Location-Code entsprechen oder in needs_review landen" nicht erfüllt |
| **5. DocumentSet-Gruppierung (§4.2)** ||||
| 5.1 | Dateien → DocumentSet gruppieren (Belegnr/Zeitfenster), Kind-Klassifikation | **FAIL** | CRITICAL | Nicht vorhanden. `ParseJobInput.files[].kind` wird als *bereits klassifiziert* angenommen (`models.py:50-59`); niemand bildet Sets. §4.2 Schritt 2 unimplementiert |
| 5.2 | Mehrseitenfälle | **PASS (synthetisch)** | MEDIUM | `pdf_text.py:44-48` iteriert Seiten; Test nur über synthetischen `--PAGEBREAK--` (`golden_variants.py:354-365`), nie an echtem mehrseitigem Beleg |
| 5.3 | Batch 20-30 | **PASS (synthetisch)** | MEDIUM | `tests/test_load_batch.py` existiert, aber gegen generierte PDFs; kein echter Batch |
| **6. Robustheit / Varianten (Anhang H.2)** ||||
| 6.1 | Golden-Master real vs synthetisch | **FAIL** | CRITICAL | Alle Fixtures synthetisch & zirkulär: Generator schreibt exakt die Strings, die die Regex erwartet (`generate_pdfs.py:18-49`, `golden_variants.py:64-78`). 0 echte L+T-Dokumente. Verstößt gegen H.5 |
| 6.2 | Tabellen-/Layoutrobustheit WE-Beleg | **RISIKO** | HIGH | `_SKU`/`_POS`/Header-Regex setzen einzeilige `KEY value`-Tokens voraus (`we_beleg.py:20-32`). Echte WE-Belege sind Tabellen mit Spalten; Whitespace-getrennte Spalten brechen die Regex |
| 6.3 | Varianten Prio/Sicherung Ja/Online/Rotpreis/Prüfung%/mehrere Shopbereiche/Hängeware/CatMan/ohne Etikett | **RISIKO** | HIGH | Im Code „abgedeckt", aber nur gegen selbstgebaute Strings (`golden_variants.py:219-422`). H.2 listet genau diese als „nicht verifiziert" — Status unverändert |
| 6.4 | Palettenware | **FAIL** | MEDIUM | In H.2/H.3 gefordert, keine Variante vorhanden (nur Hängeware) |
| 6.5 | OCR-Fallback / gescannte Bild-PDFs | **RISIKO (by design)** | MEDIUM | `pdf_text.py:5-7` — OCR bewusst nicht automatisch; Bild-PDF → sparse text → `needs_review`. Korrekt konservativ, aber bedeutet: image-only Belege nie automatisch |
| **7. Architektur / Durchdachtheit** ||||
| 7.1 | Trennung Extraktion / Mapping / Validierung | **PASS** | – | `extraction/`, `mapping/`, `confidence.py`, `guardrails.py` sauber getrennt |
| 7.2 | Parser → Backend-Persistenz / Document Service | **FAIL** | CRITICAL | Kein Producer/Consumer. Repo-weite Suche `document-parse\|ParseJobResult\|parse_document_set` in `*.ts` → 0 Treffer; keine `prisma.*.create` für Doc-Modelle |
| 7.3 | Geteilter Contract Py↔TS | **FAIL** | HIGH | `models.py:3` referenziert `packages/domain-types/src/parser-contract.ts` — **Datei existiert nicht**. `ParsedWorkInstruction`/`ParseJobResult` haben kein TS-Gegenstück; „Mirrors the shared Zod contract" ist falsch |
| 7.4 | Confidence-Berechnung | **RISIKO** | MEDIUM | `confidence.py:21-25` — ungewichteter Mittelwert über binäre (0.0/0.95/0.7) Feldscores, gemischt aus kritisch + optional. Sparse-aber-korrekte Belege können fälschlich < 0.8 fallen; „Konfidenz" ist verkleidetes found/not-found, kein echtes Erkennungsmaß |
| 7.5 | Fehlerpfade | **PASS** | – | Extraktionsfehler → `failed` im Queue-Adapter (`pipeline.py:74-78` Kommentar); unvollständiges Set → `needs_review` |
| 7.6 | Idempotenz | **PASS (ungenutzt)** | LOW | Pipeline pur/deterministisch; `parser_version` mitgeführt (`pipeline.py:82`); Prisma-Unique-Keys vorhanden, aber mangels Service unausgeübt |
| 7.7 | EffortInputVector aus Parser gespeist (§8.2/B.3) | **FAIL** | HIGH | `effort.ts:5-18` verlangt `redPriceRequired`, `onlineRelevantPositionCount`, `securityRequiredPositionCount`, `handlingClass`, `wgrCodes`; Parser extrahiert redPrice/online/handlingClass/Preise nicht → Vector unvollständig |

---

## (c) Konkrete Lücken & Fehlannahmen

1. **Fehlannahme „Parser = Pipeline".** Die Implementierung setzt das Wort „Parser" mit dem Extraktionskern gleich. Das Konzept meint mit dem Importflow (§4.2) eine Kette **Import → Gruppierung → Parse → Validierung → Persistenz → Case-Erzeugung**. Vier von fünf Gliedern fehlen. Folge: nichts vom Geleisteten ist im laufenden System wirksam.

2. **Fehlannahme „kind ist bekannt".** `ParseJobInput.files[].kind` (`models.py:51`) nimmt an, dass jemand vorher delivery_note/goods_receipt/work_instruction klassifiziert hat. §4.2 Schritt 2 verlangt aber genau diese Klassifikation + Gruppierung im System. Sie existiert nirgends.

3. **Lücke AW↔WE-Join.** Der fachliche Kern von Anhang G — die *eine* Position, die Anweisung (Etikett/Sicherung) **und** Artikel/SKU vereint — wird nie gebildet. Ohne diesen Join kann die Mitarbeiter-App die Positionskarte aus G.3 („Artikel/Farbe/EAN/Größen aus WE-Beleg; Etikett anbringen; keine Sicherung") nicht aus Echtdaten rendern.

4. **Lücke Validierung gegen Stammdaten.** Belegnr-Duplikat und Lagerplatz-gegen-LocationMaster (§14.3) sind die zwei Regeln, die DB-Kontext brauchen. Beide fehlen — genau weil der Service fehlt, der den Kontext hätte.

5. **Fehlannahme „Variantenabdeckung".** `golden_variants.py:17-19` gibt selbst zu, die Specs seien „synthetic but structurally faithful". Das Problem: *structurally faithful to the parser's own assumption*, nicht zu echten Belegen. Der Test kann strukturell keine Layout-/Tabellen-/Schreibvarianten finden, weil der Generator dieselbe Annahme wie der Parser benutzt. Grüner Golden-Gate ≠ Robustheit.

6. **Fehlannahme Confidence.** Felder bekommen 0.0 oder 0.95/0.7 — ein Boolean als Float. Der Mittelwert mischt kritische und optionale Felder; ein knapper, aber korrekt erkannter Beleg (wenige optionale Felder vorhanden) kann unter 0.8 rutschen und unnötig in `needs_review` landen, während ein Beleg mit vielen *vorhandenen aber inhaltlich falschen* Feldern hoch scort. Confidence misst Vorhandensein, nicht Korrektheit.

7. **Contract-Drift.** `models.py:3-4` behauptet Spiegelung eines `parser-contract.ts`, das nicht existiert. Die TS-Seite kennt nur `DocumentSet`/`DocumentRef` (`documents.ts`), nicht das Parse-Ergebnis. Ein „geteilter Vertrag" ist einseitig.

8. **Preise/Rotpreis fehlen komplett.** Für Preisetikettendruck (Punkt 1, der erste operative Schritt!) und Rotpreis-Handling braucht es `ekPrice/vkPrice/vkLabelPrice/redPrice`. Die `_SKU`-Regex (`we_beleg.py:29-32`) erfasst nur EAN/Größe/Menge. Die Modellfelder existieren als Karteileichen.

---

## (d) Priorisierte Fix-Empfehlungen *(nicht umgesetzt)*

**P0 — Pilot-Blocker**

- **F-1 (Document Service bauen).** Backend-Modul `documents/` in `apps/backend-api/src`: Upload/Ingest-Endpoint → Kind-Klassifikation → DocumentSet-Gruppierung (Belegnr + Zeitfenster) → Parse-Job enqueuen → `ParseJobResult` konsumieren → §14.3-Validierung → Persistenz `DocumentSet`/`Document`/`GoodsReceiptCase`/`WorkInstructionHeader`/`ReceiptPosition`/`ReceiptSkuLine`/`PositionInstruction`. Erst damit wird der Parser wirksam.
- **F-2 (Echte Golden-Master).** 20-30 echte, anonymisierte L+T-Belegsets (H.3) als Fixtures; synthetische als Smoke-Test behalten, aber nicht mehr als „Variantenabdeckung" deklarieren. Golden-Gate gegen echte Dokumente neu kalibrieren.
- **F-3 (DocumentSet-Gruppierung + Kind-Klassifikation).** Teil von F-1, aber eigenständig priorisiert, da §4.2 Schritt 2 ohne ihn nicht erfüllbar ist.

**P1 — Fachlich falsch / Konzeptverletzung**

- **F-4 (AW↔WE-Join).** Merge-Schritt der `ParsedWorkInstruction.positions` (Etikett/Sicherung) auf `ParsedReceipt.positions` über `positionNo` → `PositionInstruction` befüllen. Entweder im Parser (neue Ausgabestruktur G.4) oder im Document Service.
- **F-5 (Stammdaten-Validierung §14.3).** Lagerplatz gegen `Location`, Belegnr-Duplikat gegen `GoodsReceiptCase.weBelegNo`/`DocumentSet.importKey` → bei Verstoß `needs_review`.
- **F-6 (Felddatentiefe §6.3).** Preise/Rotpreis/season/onlineRelevant/labelType/weDate/catManDate extrahieren; danach **F-7 (EffortInputVector vollständig speisen)** (§8.2/B.3).
- **F-8 (WE-Beleg Tabellenparser).** Robustes Spalten-/Tabellen-Parsing (pdfplumber-Tabellen statt einzeiliger Regex) für echte WE-Layouts.
- **F-9 (Contract reparieren).** Entweder `parser-contract.ts` (Zod) erzeugen und Py-Pydantic dagegen verifizieren (CI-Check), oder den falschen Docstring-Verweis entfernen.

**P2 — Robustheit / Qualität**

- **F-10 (Confidence-Modell).** Gewichtung kritisch vs. optional; optional-fehlende Felder nicht in den Mittelwert ziehen; ggf. Erkennungsqualität (z.B. Tabellen-Match-Score) statt binär.
- **F-11 (NOS/section/floor je Position).** Statt Whole-Doc-Substring je Position aus der jeweiligen Positionszeile lesen.
- **F-12 (Palettenware-Variante)** ergänzen (H.3).

---

## (e) Offene Datenanforderungen *(blockieren echte Freigabe — H.3/H.5)*

| Bedarf | Wofür | Konzeptbezug |
|--------|-------|--------------|
| **50-100 echte Belegsets** (Lieferschein + AW + WE), inkl. Prio, Sicherung Ja/Nein, Etikett Ja/Nein, Online, Rotpreis, Prüfung %, mehrere Shopbereiche, Hängeware, Palette, mehrseitig | Golden-Master F-2, Layout-/Tabellenrobustheit F-8 | H.3, F.3, H.5 |
| **Schnittstellenprobe Prohandel/Export/PDF-Ablage** + Dateinamen, Ordnerstruktur, Batchlogik, Zugriffsweg | DocumentSet-Gruppierung & Kind-Klassifikation F-3 | H.2 (Dokumentensatz-Gruppierung), §4.2 |
| **Echter Prio-Beleg** mit konkretem Feld/Label/Pattern | Prio-Erkennung verifizieren (aktuell Keyword-Heuristik) | H.2 (Prio-Kennzeichen), H.4 |
| **CatMan-Fälligkeitsdatum-Quelle** (≠ CatMan-Summe) | `catManDate` extrahieren statt nur Flag | H.4, F.1 (Q6) |
| **Lagerplatzliste** (Regal 1-40, Palette A/B/C/E, D 1-9, Hängebahn 1-7) | LocationMaster-Validierung F-5 | H.3, §14.3 |
| **WE-Beleg-Preis-/Spaltenlayout** (EK/VK/VK-Etikett/Rotpreis-Spalten) | Preis-/Rotpreis-Extraktion F-6, EffortInputVector F-7 | §6.3, §8.2/B.3 |
| **Barcode-/Scanprobe** (AW, Buchungsbeleg, Lagerplatz) | spätere Scan-Korrelation; aktuell ungenutzt | H.2 (Barcode/Scan) |

---

## (f) Cleanup / Over-Engineering *(Zusatzauftrag — nicht umgesetzt)*

Der Parser leidet weniger an zu wenig, mehr an **breit gebauter Infrastruktur um einen ungenutzten Kern**. Empfehlung: erst F-1 (Service) bauen, dann diese Punkte bereinigen — sonst wird Scaffolding für eine Kette poliert, die noch nicht existiert.

| # | Over-Engineering / Redundanz | Fundstelle | Empfehlung |
|---|------------------------------|------------|------------|
| C-1 | **Test:Code-Verhältnis 1073:853 LOC** für einen Kern, der nie an einem echten Dokument lief. Der elaborierte 529-LOC-Variantenkatalog erzeugt vor allem zirkuläre Sicherheit. | `tests/fixtures/golden_variants.py` (529 LOC) | Auf wenige echte Fixtures (F-2) eindampfen; synthetische Generatoren als schlanker Smoke-Test behalten, nicht als „Abdeckung" verkaufen |
| C-2 | **BullMQ-Worker + Redis-Adapter** gebaut, obwohl kein Producer existiert. Spekulativ (YAGNI) bis F-1. | `queue.py:51-68` | Behalten ist ok, aber nicht weiter ausbauen, bevor der Service ihn befüllt |
| C-3 | **camelCase-Aliasing + Contract-Mirroring-Doku** für einen Vertrag, dessen TS-Gegenstück fehlt. | `models.py:3-4,39-47` | Mit F-9 zusammenlegen: entweder echten Contract erzeugen oder Anspruch zurücknehmen |
| C-4 | **Drei Extraktionsstrategien** (PyMuPDF + pdfplumber + OCR-Hook) vor jeder echten Layout-Erfahrung. | `pdf_text.py` | Vertretbar; aber pdfplumber sollte zuerst für echtes **Tabellen**-Parsing (F-8) genutzt werden, nicht nur als „sparse"-Fallback |
| C-5 | **`field_confidences`-Dict + `parser_version`-Plumbing** vollständig durchgereicht, downstream ungenutzt. | `pipeline.py:80-89` | Belassen (billig), aber als „noch ungenutzt" markieren statt als fertiges Feature |

**Leitsatz für den Cleanup:** Nicht den Extraktor verschlanken (der ist gut), sondern die **Behauptungsfläche** schrumpfen — Tests, Docstrings und „Abdeckungs"-Aussagen auf das reduzieren, was an echten Daten wirklich gezeigt wurde (H.4: „Annahmen nicht als Fakten verkaufen").

---

### Methodik / Geprüfte Artefakte
- Konzept: Anhang G (1542-1623), §6.1-6.3 (226-332), §4.2 (164-177), §14.3 (882-890), Anhang F.1/F.2/F.3 (1444-1542), Anhang H.2/H.4/H.5 (1623-1727), effort/Q5/Q6.
- Code: `apps/parser-worker/src/parser_worker/{pipeline,models,confidence,guardrails}.py`, `mapping/{work_instruction,we_beleg,normalize}.py`, `extraction/pdf_text.py`, `queue.py`; `tests/fixtures/{generate_pdfs,golden_variants}.py`; `packages/domain-types/src/{documents,effort}.ts`; `apps/backend-api/prisma/schema.prisma` (310-470).
- Negativbeleg (Insel): repo-weite Suche nach `document-parse|ParseJobResult|ParseJobInput|parse_document_set` in `*.ts/*.tsx` → 0 Treffer; keine `prisma.{documentSet,document,receiptPosition,workInstructionHeader}.create/upsert` in `apps/backend-api/src`.
