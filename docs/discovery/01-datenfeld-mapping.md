# 01 — Verbindliches Datenfeld-Mapping

**Auftrag:** Datenfeld-Mapping Arbeitsanweisung + Wareneingangsbeleg (WE-Beleg) + Lieferschein → Systemfelder.
**Anker:** Anhang A (Types), G.1/G.4 (Feld-für-Feld-Mapping Beispiel-Arbeitsanweisung), D.5 (fehlende Inputdaten), 6.x (Domain Model).
**Status-Legende:** siehe [README](README.md). Felder ohne Beleg sind als ⚠️/❓ markiert, nicht als Fakt.

> **Grenze der Belegbarkeit (H.2/H.4):** Bisher sind **nur die Beispiel-Arbeitsanweisung [Q5] und der Beispiel-WE-Beleg [Q6]** sauber integriert. Felder, die nur in *einem* Beispiel vorkamen, sind ✅ für genau diese Variante, aber ❓ für die Gesamtheit der Varianten (Prio, Sicherung Ja, Online, Rotpreis, Prüfung %, mehrseitig). Das endgültige Mapping ist **erst nach dem Variantenkatalog** ([02](02-variantenkatalog-golden-master.md)) verbindlich.

---

## A. Arbeitsanweisung → System (operative Regelquelle, [G.1])

Die Arbeitsanweisung wird **nicht als PDF** ausgespielt, sondern in App-Schritte übersetzt ([G.5], H.1).

### A.1 Kopfdaten

| AW-Feld | Systemfeld (Type) | Typ/Format | MVP | Status | Beleg / offener Punkt |
|---------|-------------------|-----------|-----|--------|-----------------------|
| Filiale | `GoodsReceiptCase.branchNo` | string | ✅ | ✅ BELEGT | [G.1]: „Filiale 1" |
| Lagerplatz | `GoodsReceiptCase.storageLocation` → `StorageLocation.code` | string | ✅ | ✅ BELEGT | [G.1]: „Lagerplatz 27"; Codeformat → [03](03-lagerplatzliste-sortiermatrix.md) |
| Shopbereich | `GoodsReceiptCase.primaryShopAreaNo` | string | ✅ | ✅ BELEGT | [G.1]: „Shopbereich 21" |
| Lieferschein-Nr. | `GoodsReceiptCase.deliveryNoteNo` | string | ✅ | ✅ BELEGT | [G.1]: „Lieferschein 1" |
| Beleg-Nr. (WE) | `GoodsReceiptCase.weBelegNo` | string | ✅ | ✅ BELEGT | [G.1]: „Beleg-Nr. 3.656.860" → normalisiert `3656860` |
| Beleg-Menge | `GoodsReceiptCase.totalQuantity` | number | ✅ | ✅ BELEGT | [G.1]: „Beleg-Menge 9" |
| Etage | `GoodsReceiptCase.primaryFloor` / Position `floor` | string | ✅ | ✅ BELEGT | [G.1]: „Etage: EG" |
| Buchungsdatum | `GoodsReceiptCase.bookingDate` | ISODate `YYYY-MM-DD` | ✅ | ❓ ZU VERIFIZIEREN | Feldlage/Format auf realem Beleg prüfen |
| WE-Datum | `GoodsReceiptCase.weDate` | ISODate | ✅ | ❓ ZU VERIFIZIEREN | Quelle/Format prüfen |
| Abschnitt (1,2,3,4,7,8) | `GoodsReceiptCase.section` (`SectionCode`) | enum | ✅ | ⚠️ ANNAHME | [G.1]: Beispiel „Abschnitt: Vororder" = Abschnitt 1; numerisches Mapping Text↔Code ❓ je Variante belegen |
| Warenart-Text | `GoodsReceiptCase.goodsTypeText` (`GoodsTypeText`) | enum | ✅ | ✅ BELEGT | [Anhang A] Enum; Textvarianten ❓ aus [02] |
| Prio-Kennzeichen | `GoodsReceiptCase.priorityFlags[]` (`PriorityFlag`) | enum[] | ✅ | ❓ ZU VERIFIZIEREN | **H.2/D.7-3:** konkretes Feld/Label/Pattern **nicht belegt** — echter Prio-Beleg nötig |
| CatMan-Datum/Fälligkeit | `GoodsReceiptCase.catManDate` | ISODate | ❓ | ❓ ZU VERIFIZIEREN | **H.4/D.7-4:** CatMan-*Summe* ≠ CatMan-*Datum*; technische Quelle offen |
| Verladetag | `GoodsReceiptCase.loadPlanDate` | ISODate | ✅ | ❓ ZU VERIFIZIEREN | abgeleitet aus Verladeplan → [05](05-verladeplan.md) |

### A.2 Anweisungs-Punkte (Header-Flags, [G.1]/[G.4])

| AW-Punkt | Systemfeld | Typ | Status | Beleg / Regel |
|----------|-----------|-----|--------|---------------|
| 1. Preisetikettendruck = Ja/Nein | `WorkInstructionHeader.priceLabelPrintRequired` | boolean | ✅ BELEGT | [G.1] Punkt 1; Schritt **vor** Bearbeitung |
| 5. Nach Artikel/Farbe/Größe sortieren = Ja/Nein | `WorkInstructionHeader.sortByArticleColorSizeRequired` | boolean | ✅ BELEGT | [G.1] Punkt 5 |
| 6. Prüfung Wareneingang = Ja/Nein/% | `WorkInstructionHeader.goodsReceiptCheckMode` (`CheckMode`) | enum | ✅ BELEGT | [G.1] Punkt 6: **„Nein" = `quantity_only`, nicht `none`** (Mindest-Stückzahlkontrolle) |
| (Prüfanteil %) | `WorkInstructionHeader.goodsReceiptCheckPercentage` | number? | ❓ ZU VERIFIZIEREN | „Prüfung %"-Variante nicht im Beispiel ([02]) |
| (immer Mindestmenge) | `WorkInstructionHeader.minimumQuantityCheckAlwaysRequired` | `true` (const) | ✅ BELEGT | [G.4]/H.1 „Prüfung Nein" |
| 9. Beschriftung Boxzettel = Ja | `WorkInstructionHeader.boxLabelRequired` | boolean | ✅ BELEGT | [G.1] Punkt 9; mehrere Shopbereiche → getrennte Boxen |
| 11. ZST stempeln = Ja | `WorkInstructionHeader.zstRequired` | boolean | ✅ BELEGT | [G.1] Punkt 11 |

### A.3 Positionsdaten (`WorkInstructionPosition`, [G.4])

| AW-Feld | Systemfeld | Typ | Status | Beleg / Regel |
|---------|-----------|-----|--------|---------------|
| 4. Position 1..n | `positionNo` | number | ✅ BELEGT | [G.1] Punkt 4 „Positionen 1–5"; **Join-Schlüssel zum WE-Beleg** |
| 4. NOS-Indikator | `nosIndicator` | boolean? | ✅ BELEGT | [G.4]: separat speichern — **nicht** mit Abschnitt gleichsetzen (H.4) |
| 4. Abschnitt-Text | `sectionText` | string/enum | ✅ BELEGT | [G.4] „Vororder"; maßgeblich für Verladeplan-Logik, nicht NOS |
| 4. Prospekt | `prospectText` | string? | ✅ BELEGT | [G.1] „Prospekt: Kommission" |
| 8. Preisetiketten anbringen (Pos-Liste) | `labelAttachRequired` | boolean | ✅ BELEGT | [G.1] Punkt 8: Pos 1–5 = true |
| 8. grafischer Platzierungshinweis | `labelPlacementAssetRef` | string? | ⚠️ ANNAHME | [G.1]: als Icon/Standardregel übernehmen; Asset-Format offen |
| 10. Sicherungsetikett (Pos-Liste) | `securityRequired` | boolean | ✅ BELEGT | [G.1] Punkt 10: Pos 1–5 = **false** ⇒ keine Sicherungsaufgabe |
| 10. Sicherungs-Hinweistext | `securityInstructionText` / `PositionInstruction.securityLocation` | string? | ❓ ZU VERIFIZIEREN | „Sicherung Ja"-Variante + Ort nicht im Beispiel ([02]) |
| (Online-Handling) | `PositionInstruction.onlineHandlingRequired` / `…Location` | boolean/string | ❓ ZU VERIFIZIEREN | Online-Variante nicht im Beispiel; ERP-Attribut-Quelle offen |
| (Rotpreis tackern) | `PositionInstruction.redPriceRequired` | boolean? | ❓ ZU VERIFIZIEREN | Rotpreis-Variante nicht im Beispiel; Quelle AW/ERP offen |

---

## B. WE-Beleg → System (Positions-/SKU-/Mengenbasis, [G.4]/D.5/6.3)

> Der WE-Beleg ist die **artikelbezogene** Grundlage. Die Arbeitsanweisung liefert Regeln, der WE-Beleg liefert SKU/Größe/Menge (H.1).

### B.1 Position (`ReceiptPosition`)

| WE-Feld | Systemfeld | Typ | Status | Beleg |
|---------|-----------|-----|--------|-------|
| POS-Nr. | `positionNo` | number | ✅ BELEGT | [G.4]; **Join zu AW-Position** |
| WGR | `wgr` | string | ✅ BELEGT | [Anhang A]; Aufwandsfaktor [8.2] |
| Lieferantenartikel-Nr. | `supplierArticleNo` | string | ✅ BELEGT | [Anhang A]/[G.4] |
| Lieferantenfarbe | `supplierColor` | string | ✅ BELEGT | [Anhang A]/[G.4] |
| Saison | `season` | string? | ✅ BELEGT | [Anhang A] |
| NOS-Flag | `nosFlag` | boolean? | ✅ BELEGT | [Anhang A] |
| Filiale | `branchNo` | string | ✅ BELEGT | [Anhang A] |
| Shop-Nr. | `shopNo` | string | ✅ BELEGT | [Anhang A]/[G.4] |
| HShop-Nr. | `hShopNo` | string? | ✅ BELEGT | [Anhang A]; relevant für Box-Split |
| Etage | `floor` | string? | ✅ BELEGT | [Anhang A] |
| Online-relevant | `onlineRelevant` | boolean? | ❓ ZU VERIFIZIEREN | ERP-Attribut; Lage/Quelle offen (D.5 „ERP-Attribut über Beleg") |
| Nachhaltigkeit | `sustainabilityFlag` | string? | ⚠️ ANNAHME | [Anhang A]; in Beispiel nicht belegt |
| Etikettentyp | `labelType` | string? | ❓ ZU VERIFIZIEREN | Mapping WGR→Etikettentyp offen (D.5 Drucker) |

### B.2 SKU-Zeile (`ReceiptSkuLine`, [6.3])

| WE-Feld | Systemfeld | Typ | Status | Beleg |
|---------|-----------|-----|--------|-------|
| EAN | `ean` | string | ✅ BELEGT | [6.3]/[G.4] |
| Größe | `size` | string | ✅ BELEGT | [6.3]/[G.4] |
| Sollmenge | `expectedQuantity` | number | ✅ BELEGT | [G.4] |
| Istmenge | `confirmedQuantity` | number? | ✅ BELEGT | Erfassung App |
| EK-Preis | `ekPrice` | Money(number) | ✅ BELEGT | [Anhang A] |
| VK-Preis | `vkPrice` | Money | ✅ BELEGT | [Anhang A] |
| VK-Etikettenpreis | `vkLabelPrice` | Money | ⚠️ ANNAHME | [Anhang A]; Rotpreis-/Etikettenpreis-Logik ❓ ([02]) |

### B.3 Summen

| WE-Feld | System | Status | Beleg / offener Punkt |
|---------|--------|--------|-----------------------|
| CatMan: Summe Teile | (Reporting, **nicht** als Fälligkeit) | ❓ | **H.4:** ersetzt **kein** CatMan-Fälligkeitsdatum; nur Summe belegt (D.5) |
| Normal: Summe Teile | (Reporting) | ✅ BELEGT | D.5 „CatMan/Normal-Summen" |

---

## C. Lieferschein → System (Dokumentensatz/Archiv, H.1)

> **H.1/H.4:** Der Lieferschein ist **nicht** die operative App-Grundlage. Er wird im DocumentSet mitgeführt und archiviert.

| LS-Feld | Systemfeld | Typ | Status | Beleg / offener Punkt |
|---------|-----------|-----|--------|-----------------------|
| Lieferschein-Nr. | `DocumentSet.deliveryNoteNo` / `GoodsReceiptCase.deliveryNoteNo` | string | ✅ BELEGT | [G.1]/[Anhang A]; Matching-Schlüssel |
| WE-Beleg-Nr. (Referenz) | `DocumentSet.weBelegNo` | string | ✅ BELEGT | [Anhang A]; Gruppierungsschlüssel |
| Buchungsdatum | `DocumentSet.bookingDate` | ISODate | ❓ ZU VERIFIZIEREN | Feldlage real prüfen |
| Datei/Dokumenttyp | `DocumentRef.kind` (`DocumentKind`) + `FileRef` | enum/obj | ✅ BELEGT | [Anhang A] |
| Docuware-Link | `DocumentSet` (Referenz) | string? | ❓ ZU VERIFIZIEREN | 13.3: führendes Archiv bleibt Docuware; Original-/Ableitungskennzeichnung klären |
| weitere LS-Positionsfelder | — | — | ⬜ TO BE COLLECTED | LS-Layout nicht im Konzept abgebildet; reale Lieferscheine nötig ([02]) |

---

## D. Verknüpfungs- und Gruppierungsregeln

| Regel | Beschreibung | Status | Beleg / offener Punkt |
|-------|--------------|--------|-----------------------|
| **DocumentSet-Gruppierung** | 3 Dokumente (LS, WE-Beleg, AW) → 1 Vorgang | ❓ ZU VERIFIZIEREN | **H.2/D.7-2:** Dateinamen/Ordnerstruktur/Matching-Feld/Batch-/Mehrseitenverhalten unbelegt → [02], [06] |
| **AW-POS ↔ WE-POS** | `WorkInstructionPosition.positionNo` = `ReceiptPosition.positionNo` | ✅ BELEGT (Beispiel) | [G.4]/[G.5]: zwingend testen; mehrere SKU-Zeilen je Position bleiben sichtbar |
| **Parser-Konfidenz** | < Schwelle ⇒ `needs_review` | ✅ BELEGT | [4.2]/D.5; Schwellenwerte ⚠️ noch zu kalibrieren |
| **Matching-Fallback** | über Belegnummern + Zeitfenster, falls Dateinamen nicht eindeutig | ⚠️ ANNAHME | D.5-Vorschlag; an Echtdaten zu bestätigen |

---

## Owner & Abnahme (H.5)

| Mapping-Block | Owner (Vorschlag) | Zielartefakt | Abnahme |
|---------------|-------------------|--------------|---------|
| A/B fachliche Felder & Regeln | FB-LOG | dieses Dokument, gegengezeichnet | P0-W2 |
| A.1 Prio/CatMan-Lokalisierung | FB-LOG + IT-AE | echter Prio-Beleg, CatMan-Quelle ([06] #3,#4) | P0-W2 |
| Online/Rotpreis/Etikettentyp (ERP) | IT-AE | Feldlage in Prohandel/Export ([06] #2) | P0-W4 |
| DocumentSet-Gruppierung | IT-AE | Schnittstellenprobe ([06] #1, [02]) | P0-W2 |
| C Lieferschein-Layout | FB-LOG | reale Lieferscheine ([02]) | P0-W2 |

**Definition of Done:** Mapping ist verbindlich, sobald jede ❓/⚠️-Zeile durch ≥1 Variante aus dem Golden-Master ([02]) belegt **oder** als bewusster MVP-Fallback (mit Owner) entschieden ist. Bis dahin gilt es als **Entwurf**, nicht als Fakt (H.4).
