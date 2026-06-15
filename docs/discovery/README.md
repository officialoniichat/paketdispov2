# Phase 0 Discovery — Digitale Belegverteilung & Mitarbeiter-App

**Zweck:** Alle offenen Punkte aus Konzept v1.5 (§18, Anhang D, F, H) in **verifizierbare Eingangsdaten** überführen — parallel zum MVP-Build (Phase 1).

**Quelle:** `LT_Digitale_Belegverteilung_MitarbeiterApp_Konzept_v1_5_Verifikation_Offene_Punkte.docx`
**Discovery-Auftrag laut Konzept:** §18.1 (Phase 0), Anhang F.4 (Pilotplan), Anhang H.3 (Mindest-Datenpaket), Anhang H.5 (Abnahmekriterium).

---

## Grundregel dieses Ordners (Anhang H.4 / H.5)

> Annahmen werden **niemals als Fakten ausgewiesen.** Jede Aussage ist mit einem Status gekennzeichnet. Jeder offene Punkt erhält **Owner, Quelle, Zielartefakt und Abnahmedatum** (H.5).

Dieser Ordner enthält **keine erfundenen Echtdaten.** Wo das Konzept einen Sachverhalt belegt, wird die Quelle zitiert. Wo Echtdaten, Systemzugänge oder Fachentscheidungen fehlen, steht ein **Platzhalter** mit Owner und Abnahmedatum — nicht ein geratener Wert.

### Status-Legende (verbindlich für alle Dokumente)

| Symbol | Bedeutung | Belegpflicht |
|--------|-----------|--------------|
| ✅ **BELEGT** | Im Konzept v1.5 dokumentiert/ableitbar | Abschnitt zitieren (z. B. „[G.1]", „[Anhang A]") |
| ⚠️ **ANNAHME** | Plausible Annahme, **noch nicht belegt** | Muss als Annahme markiert bleiben (H.4) |
| ❓ **ZU VERIFIZIEREN** | Richtung belegt, Umsetzung/Format/Recht offen | Benötigter Input + Owner (H.2) |
| ⬜ **TO BE COLLECTED** | Echtdatenfeld, das physisch gesammelt werden muss | Owner + Abnahmedatum |

### Owner-Rollen (Vorschlag — in Phase-0-Kickoff zu bestätigen)

| Kürzel | Rolle | Verantwortungsbereich |
|--------|-------|-----------------------|
| **FB-LOG** | Fachbereich Logistik / Teamlead | Belege, Lagerplätze, Sortierung, Boxzettel, Verladeplan, Aufwandskalibrierung |
| **IT-AE** | IT / Anwendungsentwicklung (Prohandel/ERP) | Prohandel-Zugang, Dokumentengruppierung, Barcode-Inhalte, ZST-Zielsystem |
| **IT-INFRA** | IT-Infrastruktur | Drucker/Druckersprachen, Geräte, MDM, WLAN |
| **HR-PEP** | Personaleinsatzplanung (SEAK/PEP) | Schicht-/Anwesenheitsexport, Mitarbeiter-ID-Mapping |
| **DSB-BR** | Datenschutz / Betriebsrat | Mitbestimmung, KPI auf Personenebene, Aufbewahrungsfristen |
| **PL** | Projektleitung | Owner-/Termin-Bestätigung, Eskalation, Abnahme |

> Owner-Zuweisungen in den Dokumenten sind **Vorschläge** und mit „(Vorschlag)" markiert, bis sie im Kickoff bestätigt sind. (H.4: keine Behauptung, dass Owner feststehen.)

### Abnahmedaten — Konvention

Das Konzept liefert **keinen kalibrierten Kalender** (F.4 nennt relative Wochen, die 2024er-Tabellen sind Beispiele, H.2). Abnahmedaten werden daher als **relative Phase-0-Meilensteine** geführt:

| Meilenstein | Inhalt (aus F.4) |
|-------------|------------------|
| **P0-W1–2** | Dateninventur: Belegvarianten, Lagerplatzliste, Arbeitsplatzliste, SEAK-Beispiel, Drucker/ZST klären |
| **P0-W3–4** | Parser/Pool im Shadow Mode (Vergleich mit Papierablage) |
| **P0-W5–6** | App für 2–3 Freiwillige, ZST parallel manuell+digital |
| **P0-W7–8** | Teamlead-Zuteilung aktiv, Papier-Fallback bleibt |

> Kalenderdaten werden im Phase-0-Kickoff fixiert und hier ersetzt. Bis dahin gilt das relative Schema; ein konkretes Datum hier wäre eine unbelegte Annahme.

---

## Liefergegenstände

| # | Datei | Inhalt | Konzept-Anker |
|---|-------|--------|---------------|
| 1 | [`01-datenfeld-mapping.md`](01-datenfeld-mapping.md) | Verbindliches Datenfeld-Mapping: Arbeitsanweisung + WE-Beleg + Lieferschein → Systemfelder | Anhang A, G.1, D.5 |
| 2 | [`02-variantenkatalog-golden-master.md`](02-variantenkatalog-golden-master.md) | Variantenkatalog + Register für 50–100 anonymisierte Belegsets als Parser-Golden-Master | H.2, H.3, §17 |
| 3 | [`03-lagerplatzliste-sortiermatrix.md`](03-lagerplatzliste-sortiermatrix.md) | Lagerplatzliste (Regal 1–40, Palette A/B/C/E, D 1–9, Hängebahn 1–7/Nr.) + manuelle Sortiermatrix | 11.2, D.8, H.3 |
| 4 | [`04-seak-pep-beispielexport.md`](04-seak-pep-beispielexport.md) | SEAK/PEP-Schnittstellenspez + Beispielexport-Schema (CSV) | 13.2, H.2, D.5 |
| 5 | [`05-verladeplan.md`](05-verladeplan.md) | Strukturierte Verladeplan-Tabelle (LoadPlanRule) + Pflegeprozess | B.1, 8.1, H.2/H.3 |
| 6 | [`06-klaerungspunkte-register.md`](06-klaerungspunkte-register.md) | Master-Register aller offenen Punkte: Owner, Quelle, Zielartefakt, Abnahmedatum | §18.2, D.7, F.4, H.2, H.5 |

**Lesereihenfolge im Kickoff:** 6 (Register, setzt Owner/Termine) → 1 (Mapping) → 2/3/4/5 (Datensammlung).

### Sammeldateien (Templates — Header/bekanntes Skelett, Werte ⬜)

Leere, sofort befüllbare Erfassungsbögen. Sie enthalten **keine** erfundenen Werte (H.4): nur Spaltenköpfe bzw. die aus H.3 belegten Code-Bereiche; jedes unverifizierte Feld bleibt leer.

| Datei | Befüllt durch | Deliverable | Inhalt |
|-------|---------------|-------------|--------|
| [`golden-master/register.csv`](golden-master/register.csv) | FB-LOG + DSB-BR | 2 | Header der 24 Set-Spalten; eine Zeile je realem Belegset |
| [`golden-master/README.md`](golden-master/README.md) | — | 2 | Ordnerstruktur + Sammelregeln |
| [`locations.csv`](locations.csv) | FB-LOG | 3 | Regal 1–40 + D 1–9 vor-enumeriert (belegt); Palette/Hängebahn als Expand-Template; `active`/`barcode`/`zone`/`sequenceIndex` leer |
| [`samples/seak_pep_template.csv`](samples/seak_pep_template.csv) | HR-PEP | 4 | Header `ShiftImportRow`; reale Schicht-/Anwesenheitszeilen ergänzen |
| [`samples/loadplan.csv`](samples/loadplan.csv) | FB-LOG | 5 | Header `LoadPlanRule`; belegte B.1-Beispielzeile siehe `05 §2` |

> Solange diese Dateien nur Header/Skelett enthalten, ist die jeweilige Sammlung **offen** — der korrekte H.4-Zustand, kein Fehler.

---

## Abnahme dieses Discovery-Pakets (H.5)

- [ ] Jeder offene Punkt in `06-klaerungspunkte-register.md` hat **bestätigten** Owner + Abnahmedatum.
- [ ] Mapping (`01`) ist von FB-LOG **und** IT-AE gegengezeichnet.
- [ ] Mindestens 50 echte Belegsets im Golden-Master-Register (`02`), Anonymisierung abgenommen von DSB-BR.
- [ ] Lagerplatzliste (`03`) gegen reale Codes abgeglichen, `active`-Flag gepflegt.
- [ ] Je ein realer SEAK/PEP- und Verladeplan-Export liegt vor (`04`, `05`).
- [ ] Parserfreigabe **erst** nach Test gegen echte Varianten, nicht nur die 2 Beispiel-PDFs (H.5).
