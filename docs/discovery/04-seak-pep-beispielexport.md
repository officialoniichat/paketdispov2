# 04 — SEAK/PEP Schnittstelle & Beispielexport

**Auftrag:** SEAK/PEP-Beispielexport.
**Anker:** 13.2 (SEAK/PEP-Schnittstelle, `ShiftImportRow`), 4.3 (Tagesplanung), D.5 (Datenklasse SEAK/PEP), H.2 (nicht verifiziert: Exportformat, Pausen, Abwesenheiten, ID-Mapping).

> **H.4-Hinweis:** Das **reale** SEAK/PEP-Exportformat ist **nicht belegt** (H.2). Dieses Dokument liefert die **Soll-Schnittstellenspezifikation** aus 13.2 und ein **synthetisch markiertes** Beispiel zur Abstimmung. Die unten gezeigten Zeilen sind **erfunden/illustrativ** und ausdrücklich **kein** echter Export. Ein echter Tages-/Wochenexport ist als Eingangsdatum zu liefern (H.3).

---

## 1. Soll-Schema (`ShiftImportRow`, [13.2])

```ts
interface ShiftImportRow {
  employeeNo: string;       // Mitarbeiter-ID — Mapping zur App ❓ (H.2)
  date: ISODate;            // YYYY-MM-DD
  plannedStart: ISODateTime;// ISO 8601
  plannedEnd: ISODateTime;
  breakMinutes: number;
  plannedHours: number;     // geplante IST-Stunden — Pflichtgröße für Kapazität (4.3)
  workstationCode?: string; // optional; sonst Teamlead im Dashboard (D.5)
  active: boolean;
}
```

Verwendung: `getPlannedEmployeesFromSEAK(date)` → Netto-Kapazität je MA + Teamkapazität ([8.3]/4.3).
MVP-Transport: **täglicher CSV-Import** ausreichend; Zielbild API/automatisierter Export ([13.2]).

---

## 2. CSV-Beispiel — SYNTHETISCH (⚠️ KEINE Echtdaten)

> Diese Datei dient nur dazu, **Spaltenreihenfolge, Trennzeichen, Datums-/Zeitformat** mit HR-PEP abzustimmen. Werte sind frei erfunden (H.4). Datei-Vorschlag: `docs/discovery/samples/seak_pep_YYYY-MM-DD.csv` (UTF-8, `;`-getrennt, Header-Zeile).

```csv
employeeNo;date;plannedStart;plannedEnd;breakMinutes;plannedHours;workstationCode;active
E-0001;2026-06-16;2026-06-16T06:00:00+02:00;2026-06-16T14:30:00+02:00;30;8.0;AP-1;true
E-0002;2026-06-16;2026-06-16T06:00:00+02:00;2026-06-16T14:30:00+02:00;30;8.0;;true
E-0003;2026-06-16;2026-06-16T09:00:00+02:00;2026-06-16T13:00:00+02:00;0;4.0;AP-2;true
E-0004;2026-06-16;;;;;;false
```

**Erläuterung der synthetischen Zeilen (zur Klärung der offenen Felder):**

| Zeile | Demonstriert | Klärungsbedarf (H.2) |
|-------|--------------|----------------------|
| E-0001 | Vollschicht mit Arbeitsplatz | ID-Format `employeeNo`? |
| E-0002 | Ohne `workstationCode` (Teamlead setzt) | Wird Arbeitsplatz je geliefert oder im Dashboard gesetzt? (D.5) |
| E-0003 | Teilzeit, keine Pause | Wie werden Pausen geliefert — Minuten oder Zeitfenster? |
| E-0004 | `active=false` (Abwesenheit) | Abwesenheitsdarstellung: eigene Zeile, Statuscode, oder Fehlen? |

---

## 3. Offene Punkte (→ [06] #6)

| Frage | Bezug | Status |
|-------|-------|--------|
| Reales Exportformat (CSV/API/Datei) | 13.2, §18.2 | ❓ ZU VERIFIZIEREN |
| Trennzeichen, Encoding, Header | Abschn. 2 | ⬜ aus Echtexport |
| `employeeNo` ↔ App-Login-Mapping | H.2 | ❓ |
| Pausenmodell (Minuten vs. Fenster) | H.2 | ❓ |
| Abwesenheiten / kurzfristige Planänderungen | H.2, D.5 | ❓ |
| Liefertakt (1×/Tag, mehrfach, on-demand) | 13.2 | ❓ |
| Geplante IST-Stunden vs. Brutto/Netto | 4.3/8.3 | ❓ Definition bestätigen |

---

## 4. Validierung beim Import (⚠️ Vorschlag, an Echtexport zu prüfen)

| Regel | Zweck |
|-------|-------|
| `plannedEnd > plannedStart` | Plausibilität |
| `breakMinutes ≥ 0` und `< Schichtdauer` | Kapazitätsberechnung |
| `plannedHours` konsistent zu (Ende−Start−Pause) | Datenqualität |
| unbekannte `employeeNo` → Importwarnung, kein harter Abbruch | Robustheit |

---

## Owner & Abnahme (H.5)

| Punkt | Owner (Vorschlag) | Zielartefakt | Abnahme |
|-------|-------------------|--------------|---------|
| Echter Tages-/Wochenexport | HR-PEP | reale `seak_pep_*.csv` (anonymisierbar) | P0-W2 |
| Schnittstellenentscheidung (CSV vs. API) | HR-PEP + IT-AE | Festlegung MVP-Transport | P0-W2 |
| `employeeNo`-Mapping zur App | HR-PEP + IT-AE | Mapping-Regel | P0-W4 |
| Pausen-/Abwesenheitsmodell | HR-PEP | dokumentierte Feldsemantik | P0-W2 |

**Abnahmekriterium (H.5):** Schema gilt erst als abgenommen, wenn **ein realer Export** vorliegt und gegen das Soll-Schema (Abschn. 1) abgeglichen ist. Bis dahin bleibt das CSV-Beispiel als synthetisch markiert.
