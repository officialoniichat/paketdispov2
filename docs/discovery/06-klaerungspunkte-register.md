# 06 — Klärungspunkte-Register (Master)

**Auftrag:** Klärung aller offenen Punkte — jeder Punkt mit **Owner, Quelle, Zielartefakt, Abnahmedatum** (H.5).
**Anker:** §18.2 (offene Entscheidungen), Anhang D.7 (nächste Fachrunde), Anhang H.2 (nicht verifizierte Punkte), H.5 (Abnahmekriterium).
**Status-Legende & Owner-Rollen & Abnahme-Meilensteine:** siehe [README](README.md).

> **H.4/H.5:** Owner-Zuweisungen sind **Vorschläge** bis zum Kickoff. Abnahmedaten sind **relative Phase-0-Meilensteine** (P0-W1…W8), bis ein Kalender fixiert ist. Kein Punkt gilt als geschlossen, solange sein Zielartefakt nicht vorliegt **und** abgenommen ist.

---

## A. Datenanbindung & Dokumente

| ID | Offener Punkt | Quelle | Status | Owner (Vorschlag) | Zielartefakt | Abnahme |
|----|---------------|--------|--------|-------------------|--------------|---------|
| OP-01 | **Prohandel-Zugang:** API / Export / DB-View / Dateiablage / Druckjob — was ist verbindlich? | §18.2, D.7-1, 13.1, H.2 | ❓ | IT-AE | Schnittstellenentscheidung + Beispiel-Export/API-Doku | P0-W2 |
| OP-02 | **Dokumentensatz-Gruppierung:** Dateinamen, Ordnerstruktur, Matching-Feld, Batch-/Mehrseitenverhalten | §18.2, D.7-2, H.2 | ❓ | IT-AE | dok. Matching-Regel + 50–100 Sets ([02]) | P0-W2 |
| OP-03 | **Rechte/Taktung/Verantwortung** des Datenzugriffs | H.2 (Prohandel) | ❓ | IT-AE + PL | Betriebs-/Zugriffskonzept | P0-W4 |
| OP-04 | **Docuware-Abgrenzung:** Original/Archiv vs. parser-abgeleitete Daten | 13.3 | ❓ | IT-AE | Kennzeichnungsregel im DocumentSet | P0-W4 |

## B. Priorisierung & Felder

| ID | Offener Punkt | Quelle | Status | Owner (Vorschlag) | Zielartefakt | Abnahme |
|----|---------------|--------|--------|-------------------|--------------|---------|
| OP-05 | **Prio-Feldlokalisierung:** konkretes Feld/Label/Pattern auf dem Beleg; mögliche Varianten | D.7-3, H.2, H.4 | ❓ | FB-LOG + IT-AE | echter Prio-Beleg + Mapping-Regel ([01] A.1, [02] V02) | P0-W2 |
| OP-06 | **CatMan-Datum/Fälligkeit:** technische Quelle (Summe ≠ Datum!) | D.7-4, H.2, H.4 | ❓ | FB-LOG + IT-AE | belegte CatMan-Datumsquelle | P0-W2 |
| OP-07 | **Online-/Rotpreis-Attribut:** Feldlage (AW vs. ERP) | [01] A.3/B.1, D.5 | ❓ | IT-AE | Feldnachweis in Prohandel/Export ([02] V05/V06) | P0-W4 |
| OP-08 | **Abschnitt Text↔Code-Mapping** (1,2,3,4,7,8) je Variante | [8.1], [G.1] | ⚠️ | FB-LOG | bestätigte Mapping-Tabelle | P0-W2 |

## C. Lager, Abholreihenfolge & Box

| ID | Offener Punkt | Quelle | Status | Owner (Vorschlag) | Zielartefakt | Abnahme |
|----|---------------|--------|--------|-------------------|--------------|---------|
| OP-09 | **Lagerplatzliste vollständig** inkl. `active`, Palettenstellplätze, Hängebahn-Nummern | D.7-7, H.3 | ⬜ | FB-LOG | `locations.csv` ([03]) | P0-W2 |
| OP-10 | **Arbeitsplatzstandorte** als Startpunkte + tägliche MA-Zuordnung | D.7-5 | ❓ | FB-LOG | Workstation-Liste + Zuordnungsprozess | P0-W2 |
| OP-11 | **Manuelle Sortiermatrix** je Arbeitsplatz / reicht numerischer Fallback? | D.7-6, D.8, H.2 | ❓ | FB-LOG | `PickupSortProfile` ([03]) | P0-W3 |
| OP-12 | **Max. Paketgröße** (Minuten/Belege/Kartons/Gewicht/Sperrgut/Hängeware) | D.7-8 | ❓ | FB-LOG | Paketgrößen-Regel (Assignment) | P0-W3 |
| OP-13 | **Transportbox/Plombe-Identifikation** (kein Scan / Boxnr. / Barcode / Plombencode) + Split-Regeln | D.7-9, H.2 | ❓ | FB-LOG + IT-AE | Boxzettel-Template + Splitfälle | P0-W4 |

## D. Barcode & Scan

| ID | Offener Punkt | Quelle | Status | Owner (Vorschlag) | Zielartefakt | Abnahme |
|----|---------------|--------|--------|-------------------|--------------|---------|
| OP-14 | **Barcode-Mapping:** Inhalt der Barcodes auf AW, internem Buchungsbeleg, Lagerplatz, Box/Plombe | D.7-7, H.2 (Barcode/Scan) | ❓ | IT-AE + FB-LOG | Scanprobe + Barcode-Inhaltsmapping | P0-W2 |
| OP-15 | **Fallback bei nicht scannbaren Codes** | H.2 (Barcode/Scan) | ❓ | IT-AE | Fallback-Regel (manuelle Eingabe) | P0-W4 |

## E. SEAK/PEP & Aufwand

| ID | Offener Punkt | Quelle | Status | Owner (Vorschlag) | Zielartefakt | Abnahme |
|----|---------------|--------|--------|-------------------|--------------|---------|
| OP-16 | **SEAK/PEP-Bereitstellung:** API/Export/CSV/manuell + Format, Pausen, Abwesenheiten, ID-Mapping | §18.2, 13.2, H.2 | ❓ | HR-PEP + IT-AE | realer Export + Schema-Abgleich ([04]) | P0-W2 |
| OP-17 | **Aufwandspunkte-Kalibrierung:** Gewichte, Sollzeiten, saisonale Effekte | 8.2, H.2 | ❓ | FB-LOG | Zeitstudie/Shadow-Mode-Daten | P0-W6 |

## F. Druck & ZST

| ID | Offener Punkt | Quelle | Status | Owner (Vorschlag) | Zielartefakt | Abnahme |
|----|---------------|--------|--------|-------------------|--------------|---------|
| OP-18 | **Drucker/Etikettensprachen:** welche Drucker, welche Sprache (ZPL/EPL/…), Direktdruck aus App in Phase 1? | §18.2, D.7-12, 13.4, H.2 | ❓ | IT-INFRA | Drucker-/Labelsystem-Steckbrief | P0-W2 |
| OP-19 | **Etikettentyp-Mapping** je WGR + Vorlagen + Nachdruckrechte | D.5 (Drucker), 13.4 | ❓ | IT-INFRA + FB-LOG | Etiketten-Mapping + Templates | P0-W4 |
| OP-20 | **ZST-Zielsystem:** wo final schreiben, Format/Schnittstelle, Pflichtfelder, Storno/Korrektur, Teilabschluss | §18.2, D.7-11, 15.1, H.2 | ❓ | IT-AE + FB-LOG | ZST-Datensatzbeschreibung + Zielsystem | P0-W2 |

## G. Geräte, Betrieb & Recht

| ID | Offener Punkt | Quelle | Status | Owner (Vorschlag) | Zielartefakt | Abnahme |
|----|---------------|--------|--------|-------------------|--------------|---------|
| OP-21 | **Geräte/MDM:** Tablet/Handheld/Scanner, MDM, WLAN-Abdeckung, Akku, Handschuhbedienung, Offline-Bedarf | §18.2, H.2 (Offline/Geräte) | ❓ | IT-INFRA | Geräteentscheidung + Feldtest | P0-W4 |
| OP-22 | **Fallback bei Systemausfall:** Papierdruck / manueller Pool / Notmodus | §18.2 | ❓ | IT-AE + FB-LOG | Fallback-/Notbetriebskonzept | P0-W4 |
| OP-23 | **Problem-/Korrekturprozess:** ERP-Rückmeldung, Eskalation, Fotopflicht, Sperr-/Freigabeebene | D.7-10, H.2 | ❓ | FB-LOG | Problemfall-Workshop-Ergebnis | P0-W4 |
| OP-24 | **Teilabschluss:** systemische Führung von Teil-/Restmengen + ZST bei Teilabschluss | H.2 (Teilabschluss) | ❓ | FB-LOG + IT-AE | Zielprozess + Reportingregel | P0-W4 |
| OP-25 | **Datenschutz/Mitbestimmung:** Betriebsrat-/DSGVO-Freigabe, KPI auf Personenebene, Aufbewahrungsfristen | §18.2, D.7(implizit), H.2 | ❓ | DSB-BR | Datenschutz-/Mitbestimmungsfreigabe | P0-W6 |

---

## Abdeckungsnachweis (jeder Auftragspunkt 6 abgedeckt)

| Auftrag (Nutzer-Punkt 6) | Register-ID |
|--------------------------|-------------|
| Prohandel-Zugang | OP-01, OP-03 |
| Prio-/CatMan-Feldlokalisierung | OP-05, OP-06 |
| ZST-Zielsystem | OP-20 |
| Drucker/Etikettensprachen | OP-18, OP-19 |
| Barcode-Mapping | OP-14, OP-15 |
| Geräte/MDM | OP-21 |
| Datenschutz/Mitbestimmung | OP-25 |

---

## Abnahme dieses Registers (H.5)

- [ ] Jeder OP hat im Kickoff einen **bestätigten** Owner (Vorschlag → fix).
- [ ] Jedes Abnahmedatum ist auf Kalenderdatum gesetzt (P0-Meilenstein → Datum).
- [ ] Kein OP wird geschlossen ohne vorliegendes + abgenommenes Zielartefakt.
- [ ] Statusführung laufend aktualisiert (❓/⬜ → ✅), Annahmen (⚠️) bleiben bis zur Belegung als Annahme markiert (H.4).

> **Hinweis zur Vollständigkeit:** Dieses Register konsolidiert §18.2 (9 Entscheidungen), D.7 (12 Punkte) und H.2 (15 Bereiche). Sollten weitere Punkte in der Fachrunde auftauchen, werden sie als OP-26 ff. ergänzt — nicht stillschweigend weggelassen (H.4).
