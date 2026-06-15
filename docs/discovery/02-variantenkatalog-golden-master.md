# 02 — Variantenkatalog & Golden-Master-Register (Parser)

**Auftrag:** Variantenkatalog + 50–100 echte, **anonymisierte** Belegsets als Parser-Golden-Master.
**Anker:** H.2 (Parser-Robustheit nicht verifiziert), H.3 (Mindest-Datenpaket „Echte Belegsets"), §17 (Golden-Master-Tests), H.5 (Parserfreigabe erst nach Test gegen echte Varianten).

> **H.4-Hinweis (kritisch):** Dieses Dokument enthält **keine erfundenen Belegsets.** Echte Belege existieren nur physisch/digital bei L+T und müssen gesammelt werden (⬜). Hier stehen ausschließlich: (a) der **Variantenkatalog** (welche Merkmale abgedeckt sein müssen), (b) das **Register-Schema** (eine Zeile je realem Set), (c) das **Anonymisierungsprotokoll**, (d) die **Abdeckungsmatrix** und (e) die **Abnahmekriterien**. Konkrete Feldwerte bleiben leer, bis reale Belege vorliegen.

---

## 1. Variantenkatalog — Pflichtmerkmale (aus H.2/H.3)

Jedes Merkmal muss durch echte Belege abgedeckt werden. „Soll-Min" = Mindestanzahl realer Sets pro Ausprägung im Golden-Master (Vorschlag, im Kickoff zu bestätigen — ⚠️).

| # | Dimension | Ausprägungen | Soll-Min (⚠️) | Mapping-Feld ([01]) | Beleg |
|---|-----------|--------------|--------------|---------------------|-------|
| V01 | Normalfall | Standard ohne Sonderflags | 10 | — | H.3 „Normalfall" |
| V02 | **Prio** | prio / kein prio | 5 prio | `priorityFlags` | H.2 Prio-Kennzeichen unbelegt → **Pflichtfund** |
| V03 | **Sicherung** | Ja / Nein | 5 Ja, 5 Nein | `PositionInstruction.securityRequired` | H.3 „Sicherung Ja/Nein" |
| V04 | **Etikettendruck** | Ja / Nein | 5 Ja, 5 Nein | `priceLabelPrintRequired` | H.3 „Etikett Ja/Nein" |
| V05 | **Online-Artikel** | online-relevant / nicht | 5 | `onlineRelevant` | H.3 „Online" |
| V06 | **Rotpreis** | tackern erforderlich / nicht | 5 | `redPriceRequired` | H.3 „Rotpreis" |
| V07 | **Prüfung** | Nein(=quantity_only) / % / Voll | 5 %, 3 voll | `goodsReceiptCheckMode`+`…Percentage` | H.3 „Prüfung %" |
| V08 | **Mehrere Shopbereiche** | 1 / ≥2 Shopbereiche | 5 ≥2 | `primaryShopAreaNo` + Box-Split | H.3 „mehrere Shopbereiche" |
| V09 | **Hängeware** | hanging_goods | 5 | `handlingClass`, Location `haengebahn` | H.3 „Hängeware" |
| V10 | **Palette** | Palettenware | 5 | Location `palette`, `handlingClass=bulky` | H.3 „Palette" |
| V11 | **Mehrseitig** | 1 Seite / mehrseitig je Dok | 5 | Parser/DocumentSet | H.3 „mehrseitig" |
| V12 | CatMan > 0 | CatMan-Summe / -Datum vorhanden | 3 | `catManDate` (❓ Quelle) | H.2/H.4 CatMan |
| V13 | Mehrere SKU-Zeilen je Position | 1 / mehrere Größen | 5 | `ReceiptSkuLine[]` | [G.5] |
| V14 | Abschnittsabdeckung | Abschnitte 1,2,3,4,7,8 | je ≥2 | `section` | [8.1] |
| V15 | Teilmenge/Mehr-/Mindermenge | Abweichung Soll≠Ist | 3 | Issue-Flow | [4.5]/H.2 |

> **Hinweis:** Ausprägungen kombinieren sich (z. B. Prio + Hängeware + mehrseitig). Ziel ist **Merkmalsabdeckung**, nicht das Kreuzprodukt. 50–100 Sets reichen laut H.3, wenn jede Zeile oben erfüllt ist.

---

## 2. Golden-Master-Register — Schema

**Speicherort (Vorschlag ⚠️):** `docs/discovery/golden-master/register.csv` + ein Unterordner je Set mit den 3 anonymisierten PDFs.
**Eine Zeile = ein realer Vorgang (Set aus LS + WE-Beleg + AW).**

### 2.1 CSV-Spalten (`register.csv`)

| Spalte | Typ | Pflicht | Beschreibung |
|--------|-----|---------|--------------|
| `set_id` | string | ✅ | Laufende Anonymkennung, z. B. `GM-001` (**kein** echtes WE-Beleg) |
| `collected_date` | ISODate `YYYY-MM-DD` | ✅ | Sammeldatum |
| `source_day` | ISODate | ✅ | Belegtag (mehrere Tage abdecken — H.2) |
| `source_channel` | enum `pdf_folder\|print_job\|erp_export\|api` | ✅ | Herkunft (→ [04]/[06] #1) |
| `pages_ls` / `pages_we` / `pages_aw` | int | ✅ | Seitenzahl je Dokument (V11) |
| `v_prio` | bool | ✅ | V02 |
| `v_security` | enum `ja\|nein\|gemischt` | ✅ | V03 |
| `v_label_print` | bool | ✅ | V04 |
| `v_online` | bool | ✅ | V05 |
| `v_redprice` | bool | ✅ | V06 |
| `v_check_mode` | enum `quantity_only\|percentage\|full` | ✅ | V07 |
| `v_check_pct` | int? | bei `percentage` | V07 |
| `shop_area_count` | int | ✅ | V08 |
| `handling_class` | enum `normal\|small_parts\|hanging_goods\|bulky\|unknown` | ✅ | V09/V10 |
| `v_catman` | enum `keine\|summe\|datum` | ✅ | V12 |
| `position_count` | int | ✅ | Anzahl Positionen |
| `sku_line_count` | int | ✅ | Anzahl SKU-Zeilen (V13) |
| `section_codes` | string (CSV `1;4;8`) | ✅ | V14 |
| `has_quantity_deviation` | bool | ✅ | V15 |
| `anonymized` | bool | ✅ | Anonymisierung abgenommen? |
| `parse_expected_json` | path | ✅ | Pfad zur erwarteten Parser-Ausgabe (Golden) |
| `notes` | string | – | Auffälligkeiten |

### 2.2 Tabellen-Vorlage (LEER — zu befüllen, H.4)

| set_id | source_day | v_prio | v_security | v_label_print | v_online | v_redprice | v_check_mode | shop_area_count | handling_class | v_catman | pages_aw | anonymized |
|--------|-----------|--------|-----------|---------------|----------|-----------|--------------|-----------------|----------------|----------|----------|-----------|
| `GM-001` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| `GM-002` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| … (bis ≥ GM-050, Ziel 100) | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

> Werte sind bewusst leer (⬜). Ein vorab eingetragener „Beispielwert" wäre eine Annahme als Fakt (H.4-Verstoß).

---

## 3. `parse_expected_json` — Struktur der Golden-Erwartung

Pro Set die erwartete normalisierte Parser-Ausgabe gemäß [01]/[Anhang A], z. B.:

```json
{
  "set_id": "GM-001",
  "documentSet": { "weBelegNo": "<ANON>", "deliveryNoteNo": "<ANON>", "pages": { "aw": 0, "we": 0, "ls": 0 } },
  "case": {
    "branchNo": "<ANON>", "storageLocationCode": "<ANON>", "primaryShopAreaNo": "<ANON>",
    "totalQuantity": 0, "section": null, "priorityFlags": [],
    "workInstruction": {
      "priceLabelPrintRequired": null, "sortByArticleColorSizeRequired": null,
      "goodsReceiptCheckMode": null, "boxLabelRequired": null, "zstRequired": null
    },
    "positions": [
      { "positionNo": 1, "labelAttachRequired": null, "securityRequired": null,
        "skuLines": [ { "ean": "<ANON>", "size": "<ANON>", "expectedQuantity": 0 } ] }
    ]
  }
}
```

> `<ANON>` / `0` / `null` = **Platzhalter**. Echte Werte kommen aus dem realen Beleg und werden vom Fachbereich validiert (nicht vom Parser, sonst zirkulär — H.5).

---

## 4. Anonymisierungsprotokoll (DSB-BR)

| Datenart | Maßnahme | Status |
|----------|----------|--------|
| Lieferantennamen / -nummern | pseudonymisieren (stabiler Hash je Lieferant) | ❓ DSB-BR-Freigabe |
| Preise (EK/VK) | Originalstruktur behalten, Werte ggf. skalieren falls schützenswert | ❓ klären |
| Mitarbeiter-/Personenbezug | entfernen (Belege enthalten i. d. R. keinen MA-Bezug — ⚠️ prüfen) | ❓ |
| Barcodes | für Scanprobe **separat** behandeln → [06] #5 | ❓ |
| Filiale/Shop/Lagerplatz | i. d. R. unkritisch, im Set behalten (für Parser nötig) | ⚠️ ANNAHME, DSB bestätigen |

**Regel:** Anonymisierung darf **Parser-relevante Struktur** (Feldlage, Format, Trennzeichen, Seitenumbrüche) **nicht** verändern — sonst ist der Golden-Master wertlos.

---

## 5. Abdeckungs-Dashboard (Soll/Ist)

Wird aus `register.csv` berechnet. Ist-Werte ⬜ bis Sammlung läuft.

| Dimension | Soll-Min (⚠️) | Ist | Lücke |
|-----------|--------------|-----|-------|
| Prio (V02) | 5 | ⬜ | ⬜ |
| Sicherung Ja (V03) | 5 | ⬜ | ⬜ |
| Online (V05) | 5 | ⬜ | ⬜ |
| Rotpreis (V06) | 5 | ⬜ | ⬜ |
| Prüfung % / Voll (V07) | 8 | ⬜ | ⬜ |
| Mehrere Shopbereiche (V08) | 5 | ⬜ | ⬜ |
| Hängeware (V09) | 5 | ⬜ | ⬜ |
| Palette (V10) | 5 | ⬜ | ⬜ |
| Mehrseitig (V11) | 5 | ⬜ | ⬜ |
| CatMan-Datum (V12) | 3 | ⬜ | ⬜ |
| **Gesamt** | **50–100** | ⬜ | ⬜ |

---

## Owner & Abnahme (H.5)

| Punkt | Owner (Vorschlag) | Zielartefakt | Abnahme |
|-------|-------------------|--------------|---------|
| Belegsammlung über mehrere Tage | FB-LOG | `register.csv` ≥ 50 Sets | P0-W2 |
| Anonymisierungsfreigabe | DSB-BR | freigegebenes Protokoll (Abschn. 4) | P0-W2 |
| `parse_expected_json` validieren | FB-LOG | Golden-Erwartung je Set | P0-W3 |
| Schnittstellenprobe (Kanal/Dateinamen) | IT-AE | 1 realer Export + Namens-/Ordnerregel | P0-W2 |
| Parserfreigabe gegen Varianten | IT-AE + FB-LOG | §17-Golden-Master-Testlauf grün | P0-W4 |

**Abnahmekriterium (H.5):** Parser wird **nicht** freigegeben, solange die Abdeckungsmatrix (Abschn. 5) Lücken in Pflichtdimensionen hat. Test gegen echte Varianten ist Pflicht, nicht gegen die 2 Beispiel-PDFs.
