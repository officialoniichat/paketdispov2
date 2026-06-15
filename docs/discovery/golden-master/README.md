# Golden-Master — Sammlung (LEER bis Echtdaten vorliegen)

Dieser Ordner ist das **physische Sammelziel** für Deliverable [02](../02-variantenkatalog-golden-master.md).
Er enthält **keine** erfundenen Belege (H.4).

## Struktur

```
golden-master/
├── register.csv          # eine Zeile je realem Set (Header vorhanden, Daten leer)
├── GM-001/
│   ├── ls.pdf            # anonymisierter Lieferschein
│   ├── we.pdf            # anonymisierter WE-Beleg
│   ├── aw.pdf            # anonymisierte Arbeitsanweisung
│   └── expected.json     # erwartete Parser-Ausgabe (Golden), vom Fachbereich validiert
├── GM-002/ …
```

## Regeln

- `set_id` = Anonymkennung (`GM-001` …), **kein** echtes WE-Beleg-/Lieferschein-Kennzeichen.
- Anonymisierung darf **parser-relevante Struktur** (Feldlage, Format, Trennzeichen, Seitenumbrüche) nicht verändern (siehe [02] §4).
- `register.csv` ist `;`-getrennt, UTF-8, Header-Zeile fix.
- Ziel: ≥ 50 Sets (H.3), Abdeckung aller Pflichtmerkmale V01–V15 ([02] §1).
- **Owner:** FB-LOG (Sammlung) + DSB-BR (Anonymisierungsfreigabe). Abnahme: P0-W2.

> Solange `register.csv` nur den Header enthält, ist die Sammlung **offen** — das ist der korrekte H.4-Zustand, kein Fehler.
