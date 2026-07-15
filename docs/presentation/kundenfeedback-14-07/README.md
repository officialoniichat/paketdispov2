# Kundenfeedback 14.07.2026 — Neue Mitarbeiterapp-Abläufe (Präsentation)

Kundenpräsentationstaugliche Dokumentation der vier neuen Abläufe aus dem Kundengespräch vom
**14.07.2026** (PDF „20260713 – Mitarbeiterapp ändern"). Zielgruppe: **L&T** in einer Präsentation —
deutsche On-Screen-Begriffe exakt wie in der App, Vorher/Nachher wo hilfreich.

## Inhalt

| Datei | Flow |
|---|---|
| [`index.html`](index.html) | **Präsentations-Viewer** (self-contained, Mermaid + App-Mockups) — hier starten |
| [`flow-1-positionen-tabelle.md`](flow-1-positionen-tabelle.md) | CatMan-Termin, HShop/Shop, fixierte Kopfzeile, „VK korrigiert" |
| [`flow-2-problem-workflow.md`](flow-2-problem-workflow.md) | Frei definierbare Problemarten, Problem je Position, automatische Probleme |
| [`flow-3-teilabschluss-loop.md`](flow-3-teilabschluss-loop.md) | Teilabschluss-Kreislauf Mitarbeiter ↔ Teamleitung (rot geparkt → grün geklärt) |
| [`flow-4-buendel-home-screen.md`](flow-4-buendel-home-screen.md) | Weiteres Bündel, Filiale/Shopbereich/Etikettenart, Code-128-Barcode, freie Reihenfolge |
| `assets/` | Echte „Vorher"-Screenshots der alten App |

## Ansehen

```bash
cd docs/presentation/kundenfeedback-14-07
python3 -m http.server 8080
# dann http://localhost:8080/index.html im Browser öffnen
```

> Direktes Öffnen per `file://` lädt die Mermaid-Diagramme (CDN-Modul) nicht — bitte über einen
> lokalen Webserver ansehen.

## Bezug zum Code

Alle Abläufe sind auf `main` umgesetzt (Commits `3e01780`, `064476b`, `976d2fe`). Die
Bildschirm-Bezeichnungen stammen 1:1 aus der Mitarbeiter-App (`apps/employee-pwa`) und dem
Teamlead-Cockpit (`apps/teamlead-web`). Das laufende Handbuch (`docs/handbook/`, Teil A) ist auf
dieselben Abläufe aktualisiert.
