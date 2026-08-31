# Paketlagerdispo — C4-Architekturmodell

Ein [C4-Modell](https://c4model.com/) (Simon Brown) des Systems *Digitale Belegverteilung*, plus
Typ-/Domänenmodell. **Jedes Diagramm ist aus dem echten Code auf Branch `main` abgeleitet und
dagegen verifiziert** (`apps/*`, `packages/*`, `apps/backend-api/prisma/schema.prisma`) — nicht
erfunden.

- **Quellen** (Diagramm als Code): [`src/*.mmd`](src/)
- **Gerenderte Ausgabe** (anschaubar, eingecheckt): [`rendered/*.svg`](rendered/)
- **Viewer**: [`index.html`](index.html) im Browser öffnen (L&T-Dark-Theme, Zoom + Pan + Vollbild)

Alle beschreibenden Texte (Titel, Beschreibungen, Beziehungs-Labels) sind auf Deutsch;
Code-Identitäten (Paket-/Klassen-/Datei-/Endpoint-Namen, Enum-Werte) und etablierte
Technik-Abkürzungen (SSE, JWT, REST, OIDC, OpenAPI, JWKS) bleiben unverändert. Fachbegriffe folgen
dem Glossar in `docs/handbook/grundlagen-glossar.md`. Beobachtungen aus der Übersetzung:
[`UEBERSETZUNG-NOTIZEN.md`](UEBERSETZUNG-NOTIZEN.md).

---

## Bibliothekswahl: Mermaid — und warum

| Option | C4-Treue | Render-Toolchain | Offline anschaubar | Urteil |
| --- | --- | --- | --- | --- |
| **Structurizr DSL** | ★★★ kanonisches C4-Modell | braucht Java + Structurizr CLI/Lite (oder Cloud) | nur via Structurizr Lite/Cloud | verworfen — schwerste Toolchain, schwächste „einfach öffnen“-Story |
| **C4-PlantUML** | ★★★ | braucht Java + PlantUML | statische Bilder | verworfen — JVM-Abhängigkeit |
| **D2** | ★★ (kein natives C4) | braucht das `d2`-Binary | statisches SVG | starker Zweiter — schön, aber Extra-Binary + kein natives C4 |
| **Mermaid** ✅ | ★★ natives `C4Context`/`C4Container` + flowchart/ER/class | keine (rendert in Markdown/GitHub/HTML); optional `mmdc` für SVG | ja — pures SVG / jeder Browser | **gewählt** |

**Warum Mermaid für dieses Repo:**

1. **Ohne Toolchain anschaubar.** Mermaid rendert nativ in Markdown, auf GitHub und in purem HTML.
   Keine proprietäre Cloud, kein JVM. Die eingecheckten SVGs öffnen in jedem Browser.
2. **Passt zum bestehenden Doku-Muster.** `docs/concept/*.html` sind eigenständige statische
   HTML-Mockups im L&T-Dark-Theme; [`index.html`](index.html) folgt derselben Konvention.
3. **Eine Bibliothek deckt jede Ebene ab.** `C4Context` / `C4Container` liefern kanonische
   C4-Semantik für die Ebenen 1–2; `flowchart` liefert saubere Komponenten- (Ebene 3) und
   Code-Diagramme (Ebene 4); `erDiagram` das Domänenmodell — alles in einem diff-baren Textformat.
4. **Reproduzierbar.** Die Quellen sind reiner Text; [`render.sh`](render.sh) regeneriert jedes SVG.

**Ehrlicher Trade-off:** Mermaids Auto-Layout für die nativen C4-Diagrammtypen ist weniger poliert
als das von Structurizr. Wir nutzen daher die **nativen C4-Typen für die Ebenen 1–2** (wo die
C4-Semantik am meisten zählt) und für den Rest den **Diagrammtyp mit dem saubersten Layout**
(flowchart für Komponenten/Code, ER für das Domänenmodell). Das ist der übliche pragmatische
Mermaid-C4-Ansatz.

---

## Neu rendern

Voraussetzung: Node.js (das Repo nutzt ohnehin pnpm). Der Renderer
([mermaid-cli](https://github.com/mermaid-js/mermaid-cli)) wird bei Bedarf via `npx` geholt und
nutzt ein Headless-Chromium — keine globale Installation, kein Cloud-Konto.

```bash
cd docs/architecture

# Alle Diagramme rendern (src/*.mmd -> rendered/*.svg)
./render.sh

# Ein einzelnes Diagramm per Basisname rendern
./render.sh c2-container
```

`render.sh` wendet [`mermaid.config.json`](mermaid.config.json) an: Dark-Theme, L&T-nahe Palette,
transparenter Hintergrund (damit die SVGs auf dem dunklen `index.html` sitzen) — und für die
Lesbarkeit **16px-Grundschrift (C4 15px, ER 14px)** sowie **`useMaxWidth: false`**, damit jedes SVG
seine natürliche Breite behält, statt auf Fensterbreite heruntergestaucht zu werden. Zoom + Pan
übernimmt der Viewer. Zum Vorschauen ohne Rendern: eine beliebige `src/*.mmd` in
<https://mermaid.live> oder eine Markdown-Datei auf GitHub einfügen.

Nach dem Bearbeiten einer `.mmd`-Quelle `./render.sh` neu ausführen und die geänderte Quelle
**gemeinsam mit** ihrem regenerierten SVG committen.

---

## Die Diagramme

| Datei | Ebene | Was sie zeigt |
| --- | --- | --- |
| `c1-system-context.mmd` | **C4 E1 — Kontext** | Das System, seine drei menschlichen Rollen und die externen Systeme (ProHandel ERP, OIDC-Provider). |
| `c2-container.mmd` | **C4 E2 — Container** | Deploy-/Laufzeit-Einheiten: employee-pwa, teamlead-web, backend-api, PostgreSQL und die geteilten Bibliotheks-Pakete; Protokolle (REST + SSE, SQL, prozessintern). |
| `c3-backend-components.mmd` | **C4 E3 — Komponenten** | NestJS-Module in backend-api: Cases (Me/Cases/Teamlead — inkl. Server-Haken „Position geprüft“ und Ist-Menge/Preis je Größe), Assignment (inkl. Pull-Gate `shared_case_open`), Employees, Admin, Problemarten, Prohandel, Messages (Teamlead-Nachrichten), Collaboration (geteilter Beleg: Kolleg:innen einladen · Posteingang · „Teilbeleg erledigt“ · Helfer entfernen), Dev sowie die Querschnitts-Globals Auth/Prisma/Events/Workflow/Live (typisierte SSE-Ereignisse an mehrere Empfänger)/Clock. |
| `c3-engine-components.mmd` | **C4 E3 — Komponenten** | Die pure `@paket/assignment-engine`: `assignWork()`-Orchestrator + Module priority/effort (inkl. effort-factors)/capacity (inkl. shift-import, shift-end)/assignment (bundling, distribute)/grouping/pickup. |
| `c3-employee-pwa-components.mmd` | **C4 E3 — Komponenten** | employee-pwa: Login, Bündel-Home („Ware holen“/„Bearbeiten“, Teilen-Icon je Beleg, Abschnitt „Geteilt mit dir“), Beleg-Bearbeitung mit Problem-Dialogen und „Team-Ansicht“, Beleg teilen (TeilenDialog · EinladungOverlay · Nachrichten-Verlauf · Profilkreis-Badge); React-Query-Datenschicht + typisierte SSE-Live-Updates je Ereignistyp (kein Offline-Cache). |
| `c3-teamlead-components.mmd` | **C4 E3 — Komponenten** | teamlead-web: Features cockpit/ablagen/board (goldene Karten geteilter Belege + „Aus geteiltem Beleg entfernen“)/belege/split (Modus „Gemeinsam bearbeiten“ vorausgewählt)/admin, der `useCockpitData()`-Store samt `useCockpitLive` (SSE-Consumer), der geteilte `GeteiltChip`, die Datenschicht und die `caseActions`-Registry. |
| `c4-engine-pipeline.mmd` | **C4 E4 — Code** | Der Datenfluss in `assignWork()`: Skill-Tier-Gate → Schichtende-Cutoff → Anreichern → Ausschluss → Liefergruppen → Monster-Beleg-Prüfung → Kapazität → Starter-Packs → Verteilen → Abholfolge. |
| `domain-model.mmd` | **Domäne / ER** | Prisma-Entitäten, Relationen und Kardinalitäten; die Trennung Beleg-Kopf vs. Position (Warenbezeichnung/ASN-DESADV); Beteiligte je Beleg (`CaseParticipant`) als Overlay des geteilten Belegs, serverseitiger Prüf-Haken je Position; Konfig-Tabellen und das unveränderliche WorkflowEvent-Log. |
| `type-pipeline.mmd` | **Typen** | Die Typ-Generierungskette: domain-types (Zod) ↔ Prisma ↔ OpenAPI → api-client (generiert) — plus der von Backend und beiden Apps geteilte `liveEventSchema` für den SSE-Kanal. |

### Notizen je Ebene

- **E1 Kontext.** ProHandel ERP ist das *vorgesehene* führende System (Belege tragen
  `source=prohandel_api` + `externalRef`), aber der per Einstellungen konfigurierbare Delta-Pull ist
  **Konzept-Stadium** — es gibt noch keinen laufenden Ingestion-Dienst (nur das
  `prohandel_api`-Enum + eine Teamlead-Einstellungsfläche „Integrationen“). Das Diagramm markiert
  diese Beziehung entsprechend. Die OIDC-Authentifizierung ist implementiert (`OidcTokenVerifier`,
  JWKS, mit statischem RS256-Dev-Fallback).
- **E2 Container.** Caddy/Redis/MinIO stehen als Infrastruktur-Grundlinie in `docker-compose.yml`,
  sind aber **vom aktuellen Backend-Code nicht angebunden** (keine bullmq-/redis-/minio-/s3-
  Abhängigkeiten); das Backend spricht nur via Prisma mit PostgreSQL — sie fehlen daher bewusst im
  Container-Diagramm und werden stattdessen hier vermerkt.
- **E3 Komponenten.** Vier Komponenten-Sichten — eine je „interessantem“ Container. Die
  Backend-Sicht zeigt den auditierten Schreibpfad (Controller → Service → WorkflowService →
  EventLogService → Prisma) und den SSE-Lesepfad (seit 31.08.2026 typisierte Ereignisse mit
  Empfängerliste; das Cockpit hört über `useCockpitLive` mit).
- **Geteilter Beleg (31.08.2026).** Zusammenarbeit mehrerer Mitarbeitender an EINEM Beleg ist ein
  Overlay (`CaseParticipant`), kein zweites Bündel und kein neuer Status; Fachregeln (Zugriff,
  Fertig-Gate, ZST-Anteile, Pull-Gate) liegen ausschließlich im Backend. Die betroffenen
  Diagramm-Knoten sind mit „(31.08.2026)“ markiert und wurden parallel zur Implementierung aus
  dem Konzept `docs/concept/beleg-zusammenarbeit-concept.md` beschrieben — bei Abweichungen gilt
  der Code, die Diagramme sind nachzuziehen.
- **E4 Code.** Die Engine ist pur und deterministisch (kein IO); die Pipeline-Reihenfolge spiegelt
  `packages/assignment-engine/src/assignment/plan.ts`.
- **Domäne / ER.** Die Kardinalitäten folgen exakt den Prisma-Relationen. Beachte den
  denormalisierten Link `AssignmentBundle → GoodsReceiptCase` (`assignedBundleId`) neben dem
  geordneten `AssignmentItem`-Join.

---

*Dies ist reine Dokumentation — es wurde kein Produktionscode und keine Logik verändert.*
