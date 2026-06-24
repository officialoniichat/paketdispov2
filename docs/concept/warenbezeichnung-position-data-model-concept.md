# Konzept: Beleg-Kopf vs. Position — Warenbezeichnung & Arbeitsanweisung (industriestandard-fundiert)

> Status: Konzept (kein Code). Entscheidet, **welche Felder Kopf- und welche Positions-Attribute
> sind**, wie „Warenbezeichnung" (AW-Punkt 4) korrekt modelliert/angezeigt wird und was die
> Mitarbeiter-App zeigt. Baut auf [`prohandel-integration-concept.md`](./prohandel-integration-concept.md)
> auf und präzisiert den dortigen Feld-Mapping-Abschnitt.

## 1. Auslöser

Die reale L&T-Arbeitsanweisung (Beleg 3.656.860) druckt in **Punkt 4 „Warenbezeichnung"** pro
Position einen Block:

```
Position: 1   Filiale 1   NOS   Abschnitt:        Etage: EG
              (Vororder / Prospekt: / Kommission — vorgedruckte Labels, hier leer)
```

Frage des Auftraggebers: Wird „Warenbezeichnung" richtig/voll abgebildet (inkl. Lieferschein,
Filiale, NOS vs. Abschnitt getrennt), **können diese Felder pro Position variieren**, und sind sie
sowohl im **Typ** als auch in der **Mitarbeiter-App** korrekt vorhanden? → Erst Recherche, dann
dieses Konzept.

## 2. Industriestandard (Recherche)

### 2.1 Eingangslogistik = Kopf/Position-Split (ASN / DESADV)

Wareneingang gegen einen elektronischen Lieferavis ist seit Jahrzehnten standardisiert
(EDIFACT **DESADV** / ANSI X12 **EDI 856 ASN**). Beide trennen strikt **Kopf** von **Position**:

| Ebene | Trägt (Standard) |
|---|---|
| **Kopf / Beginning** (BGM, NAD, DTM) | Liefer-/Avisnummer, **Ship-to-Partei** (Empfänger/Filiale), Lieferant, Liefer-/Versanddatum |
| **Packstück** (CPS/PAC, HL Tare/Pack) | Karton/SSCC-Hierarchie |
| **Position** (LIN, SN1/QTY, PID) | Artikel-Identifikator (EAN/GTIN), **Warenbezeichnung/Description**, Menge, Größe |

D. h.: **Empfänger/Filiale, Liefer­schein­nummer und Datum sind Kopf-Attribute; Artikel,
Warenbezeichnung und Menge sind Positions-Attribute.** Mehrere Ziel-Empfänger pro Avis sind im
Standard nur im **Cross-Docking/Pre-Distribution-Fall** vorgesehen („single dispatch point …
multiple destination points") und werden dann über die **Packstück-Ebene** (Karton je Filiale),
nicht über die LIN-Position, aufgelöst. Für einen Haus-Wareneingang (eine Filiale empfängt) ist
Ship-to **genau einmal** im Kopf.

**Direkt relevant:** ProHandels eigene Doku sagt, erfasste Wareneingänge werden in der
Warenwirtschaft **„wie eine DESADV-Meldung verarbeitet"** — unser Quellsystem folgt also exakt
diesem Kopf/Position-Modell. In der Wareneingangskontrolle wird „auf Mängel, Menge, Richtigkeit und
Qualität kontrolliert und mit dem **Lieferschein** verglichen" (Lieferschein = Kopf-Dokument).

### 2.2 Warenbezeichnung = Artikelstamm-Beschreibung (pro Position)

In ASN/DESADV ist **PID/Description** ein Positions-Feld; in der Warenwirtschaft ist die
„Warenbezeichnung" ein **Artikelstamm**-Attribut, das pro Position über den Artikel hereinkommt.
Es ist **kein** zusätzliches Freitextfeld pro Beleg, sondern die **Artikel-Identität**:
Warengruppe (WGR) + Lieferanten-Artikel-Nr + Farbe + Saison. → Bestätigt die Auftraggeber-Antwort
„article identity is the description": kein neues Feld nötig.

### 2.3 Warenart-Kategorien: NOS vs. Vororder/Nachorder

Standard-Beschaffungskategorien im Mode-Retail:

- **NOS (Never Out of Stock / NOOS):** zeitlose, saisonunabhängige Artikel — ein **Artikelstamm-Flag**.
  Da am Artikel hängend, ist NOS faktisch **positionsgenau** (eine Position = ein Artikel).
- **Vororder (Pre-Order):** Saison-Erstorder zur Kollektions-Vororder. **Auftrags-/Order-Typ** (Kopf).
- **Nachorder (Re-Order):** Nachbestellung zur laufenden Saison. **Auftrags-/Order-Typ** (Kopf).

Markt: Vororder ~71 % des Ordervolumens, fallend Richtung Nachorder. Wichtig fürs Modell:
**NOS ist Artikel-/Positions-Attribut; Vororder/Nachorder sind Auftrags-(Kopf-)Typen.** Unser
`goodsTypeText`-Enum (Vororder/Nachorder/NOS/…) ist daher korrekt **Kopf-nah**, NOS zusätzlich als
**positionsgenaues** `nosFlag`. „NOS" und „Abschnitt" sind — wie vom Auftraggeber vermutet —
**getrennte Dinge**: NOS = Warenart-Flag (Artikel), Abschnitt = Lager-/Verladesektion (1/2/3/4/7/8).

### 2.4 Arbeitsanweisung = Floor-Ready / Pre-Retailing VAS (Standard)

Die AW-Punkte sind die im Fashion-DC üblichen **Value-Added Services** für „floor-ready
merchandise": Preisauszeichnung/Ticketing (Punkt 1/8), **Quell-/Sicherungs-Etikett (EAS source
tagging)** (Punkt 10), Sortierung Artikel/Farbe/Größe (Punkt 5), Boxbeschriftung (Punkt 9),
Mengen-/Qualitätsprüfung (Punkt 6). Source-/DC-Tagging statt Filial-Tagging ist belegter Standard
(z. B. Sensormatic Source Tagging; ein Retailer senkte Schwund um ~50 % durch DC-Sicherung). →
Unsere Arbeitsanweisung-Projektion ist fachlich industrieüblich; **Punkt 4 ist kein To-do, sondern
ein Kopf-/Artikel-Beschrieb.**

## 3. Auflösung: Kopf vs. Position (autoritativ)

| Form-Feld | Ebene | Variiert pro Position? | Domänen-Feld heute |
|---|---|---|---|
| Beleg-Nr. | Kopf | nein | `GoodsReceiptCase.weBelegNo` |
| Lieferschein | Kopf | nein | `deliveryNoteNo` |
| Filiale | Kopf | nein (1 Lieferschein → 1 Empfänger) | `branchNo` (+ vestigial auf Position) |
| Abschnitt (1/2/3/4/7/8) | Kopf | nein | `section` |
| Warenart (NOS/Vororder/…) | Kopf (Order-Typ) | — | `goodsTypeText` |
| Beleg-Menge | Kopf (Σ) | — | `totalQuantity` |
| Lagerplatz | Kopf | nein | `storageLocation.code` |
| **Etage** | **Position** (+ Kopf-„primary") | **ja** | Position `floor` / Kopf `primaryFloor` |
| **Shopbereich** | **Position** (+ Kopf-„primary") | **ja** | Position `shopNo`/`hShopNo` / Kopf `primaryShopAreaNo` |
| **NOS** | **Position** (Artikel-Flag) | **ja** | `nosFlag` |
| Saison / Funktion(Nachhaltigkeit) / Dessin(Online) | Position | ja | `season` / `sustainabilityFlag` / `onlineRelevant` |
| Warenbezeichnung (= Artikel-Identität) | Position | ja | `wgr` + `supplierArticleNo` + `supplierColor` |

**Kernaussage:** Das Papier druckt Filiale/Abschnitt/Etage **pro Positionszeile**, weil das
Formular zeilenweise gestaltet ist — die *Quelle* ist aber Kopf (Filiale/Abschnitt) bzw.
positionsfähig mit Kopf-Roll-up (Etage/Shopbereich, daher die `primary*`-Benennung im bestehenden
Modell). Das `branchNo`/`floor` **auf der Position** ist Parser-Ära-Altlast für Filiale und sollte
auf Kopf reduziert werden; `floor`/`shopNo` bleiben positionsgenau (echte Etage/Shopbereich).

> Ehrlichkeits-Vorbehalt: „Filiale/Abschnitt = nur Kopf" ist eine **Schlussfolgerung** aus
> DESADV-Semantik + dem `primary*`-Design, **nicht** aus einem realen ProHandel-Payload verifiziert.
> Beim Anbinden der echten API gegen ein echtes Positions-Payload gegenprüfen (siehe §5).

## 4. Soll-Abbildung (Konzept, kein Code)

**Datenmodell**
- Kopf behält: Beleg-Nr, Lieferschein, Filiale, Abschnitt, Warenart, Beleg-Menge, Lagerplatz,
  `primaryFloor`/`primaryShopAreaNo`.
- Position behält/führt: WGR + Artikel + Farbe + Saison (= Warenbezeichnung), `nosFlag` (NOS),
  `floor`/`shopNo` (echte Etage/Shopbereich), Funktion/Dessin.
- **Entfernen:** vestigiales `branchNo`/`floor`-Duplikat auf der Position (Filiale ist Kopf) —
  erst nach Abhängigkeits-Check.
- **AW-Punkt 4:** Der hohle Roll-up („Positionen 1, 2, 3") in `deriveWorkInstructionPoints`
  entfällt. Punkt 4 ist **kein Listen-Item**, sondern materialisiert sich als (a) Beleg-Kopf-Zeile
  und (b) Artikel-Identität je Positionskarte.

**Mitarbeiter-App (Antwort Auftraggeber: „work-relevant subset")**
- Kompakte **Beleg-Kopf-Zeile** auf dem PROCESS-Screen: **Abschnitt · Warenart · Beleg-Menge**
  (Filiale/Lieferschein/Shopbereich bewusst nicht hier — relevant erst bei Boxing/ZST).
- Pro Position: **NOS-Badge** + **Saison**, Artikel-Identität als Positions-Titel (WGR · Artikel ·
  Farbe). Etage/Shopbereich erscheinen dort, wo geboxt/zugeordnet wird (Boxzettel), nicht auf PROCESS.

**Backend-Aggregat (heutige Lücken)**
- `ReceiptPositionDto`: `nosFlag`, `season` ergänzen (heute gedroppt).
- Employee-Aggregat: `totalQuantity`/Warenart/Abschnitt sicher durchreichen (Abschnitt/Warenart
  bereits in `CaseSummaryDto`).
- OpenAPI + api-client neu generieren.

## 5. Offene Punkte (gegen reales ProHandel-Payload verifizieren)

1. **Filiale/Abschnitt pro Position?** Annahme: Kopf. Falls reale Belege das pro Position führen →
   Felder auf Position verschieben. (Auftraggeber-Bestätigung noch offen.)
2. **Prospekt / Kommission:** auf dem Formular vorgedruckte Labels (hier leer). Bedeutung unklar
   (Order-Typ? Kommissions-Nr? Prospekt-Referenz?). **Vorerst nicht modellieren** (kein
   Spekulativ-Feld) — bei echtem Positions-Payload klären, dann ggf. als Warenart-Wert oder
   eigenes Feld nachziehen.
3. **Write-back / Mehr-Mandanten:** wie im ProHandel-Konzept — v1 read-only.

## 6. Quellen

- ProHandel – Wareneingang (promobile): „… wie eine DESADV-Meldung verarbeitet" — http://docs.prohandel.de/wareneingang.html
- REMIRA Glossar – Wareneingang / Lieferschein — https://remira.com/de/glossar/wareneingang
- SPS Commerce – Structure of EDI 856 ASNs (HL/LIN/PID/N1 ship-to) — https://www.spscommerce.com/community/articles/the-structure-of-edi-856-asns
- SEEBURGER – EDIFACT DESADV (BGM/NAD Kopf, LIN Position, CPS/PAC Packstück, „single dispatch point … multiple destinations") — https://www.seeburger.com/resources/good-to-know/edifact-desadv-message
- Fashion Cloud – Vororder & Nachorder — https://fashion.cloud/de/vororder-nachorder-trends/
- That Designer Wholesale – What is NOS/NOOS — https://thatdesignerwholesale.com/en-GB/news/what-is-nosnoos-the-essential-guide-for-retailers-en
- Supply Chain 24/7 – Materials Handling System for Fashion Retailing (floor-ready VAS) — https://www.supplychain247.com/article/a_materials_handling_system_for_fashion_retailing
- Sensormatic – Source Tagging — https://www.sensormatic.com/loss-prevention-liability/source-tagging
- SAP Help – Processing of Inbound Deliveries (header vs item) — https://help.sap.com/docs/SAP_SUPPLY_CHAIN_MANAGEMENT/f41048b9ca054326bb9774db1d46e866/04cdcb53ad377114e10000000a174cb4.html
