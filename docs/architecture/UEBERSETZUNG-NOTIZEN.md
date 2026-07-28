# Übersetzungs-Notizen — C4-Doku auf Deutsch (28.07.2026)

Rahmen: reine Sprach-Umstellung der Architektur-Doku (`src/*.mmd`, `index.html`, `render.sh`,
`README.md`) auf Deutsch — **keine Um-Modellierung**. Beim Übersetzen aufgefallener inhaltlicher
Drift ist hier festgehalten statt „nebenbei“ umgebaut.

## Übersetzungs-Konventionen

- **Code-Identitäten unverändert:** App-/Paketnamen (employee-pwa, teamlead-web, backend-api,
  assignment-engine, domain-types, api-client), Technologie-Namen (React, Vite, NestJS, Fastify,
  Prisma, PostgreSQL, Zod, MUI), Datei-/Klassen-/Endpoint-Namen, Enum-/Statuswerte
  (z. B. `reason = delivery_unconfirmed`, `rank === 0`, `teile = totalQuantity`).
- **Etablierte Abkürzungen bleiben:** SSE, JWT, JWKS, REST, OIDC, OpenAPI, RBAC, FIFO, LPT, CSV,
  ER, PWA, SPA.
- **Glossar-Begriffe** gemäß `docs/handbook/grundlagen-glossar.md`: Beleg, Bündel, Position,
  Lagerplatz, Bereich, Warenart, Lieferung/Gruppe, Pool, Automatik, Parken, ZST/Tagesabschluss,
  Skill-Stufe, Override.
- Feste Wendungen: „system of record“ → „führendes System“; „single source of truth“ →
  „Single Source of Truth“ (im Deutschen etablierter Fachbegriff).

## Beim Übersetzen aufgefallener Drift (bewusst NICHT umgebaut)

1. **Viewer-Texte in `index.html` waren veraltet** und widersprachen den eigenen Diagrammen —
   sie wurden beim Übersetzen an den Stand der Diagramme angepasst (die Diagramme selbst blieben
   unangetastet):
   - Die Beschreibung von *employee-pwa* sprach noch von „Offline-first PWA … Dexie v4 DB with
     optimistic-lock repository and pull-based sync“. Das Diagramm (und laut dessen
     Verifikations-Header der Code, Tasks 10–13) zeigt eine Live-Backend-App **ohne**
     Offline-Cache.
   - Die Beschreibungen von *assignment-engine* und *Engine-Pipeline* nannten eine
     „reserve“-Stufe, die weder in den Diagrammen noch in der Pipeline aus CLAUDE.md
     (enrich → exclude → capacity → bundles → distribute → pickup) existiert; auch die
     Stufen-Reihenfolge entsprach nicht `c4-engine-pipeline.mmd`.
2. **CLAUDE.md beschreibt employee-pwa weiterhin als „React PWA, offline-first“** — die
   Architektur-Diagramme (c2, c3-employee-pwa) und deren Verifikationskommentare sagen
   „Live-Backend, kein Offline-Cache“. CLAUDE.md liegt außerhalb des Auftrags-Rahmens
   (nur `docs/architecture/`) und wurde nicht angefasst — sollte separat nachgezogen werden.
3. Im Rahmen der Übersetzung fand **kein neuer Tiefen-Abgleich Diagramm ↔ Code** statt; die
   „Verifiziert gegen …“-Header der Quellen wurden inhaltlich unverändert übernommen.

## Lesbarkeits-Umbau (gleicher Change-Set)

- `mermaid.config.json`: Grundschrift 16px (C4 15px, ER 14px), `useMaxWidth: false` für alle
  Diagrammtypen → die SVGs behalten ihre natürliche Breite.
- `index.html`: Standard-Ansicht 100 % (Lesegröße) statt „auf Fensterbreite einpassen“; Zoom
  ändert die Layout-Größe des SVGs (Vektor-Neurendering, bleibt gestochen scharf) statt per
  CSS-Transform zu skalieren; Ziehen = Pan, Scrollen/Pinch = Zoom, „Einpassen“, 100 %-Reset und
  Vollbild je Diagramm.
