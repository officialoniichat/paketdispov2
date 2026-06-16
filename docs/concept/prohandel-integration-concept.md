# ProHandel-Integration — Konzept (ersetzt die Parser-/PDF-Ingestion)

> **Status:** Konzept, noch kein Code. **Datum:** 2026-06-16.
> **Richtung:** ProHandel (ERP) ist **System of Record**. Die komplette Parser-/PDF-/
> Dokument-Ingestion wird **hart verworfen** (kein Parallelbetrieb, keine Kompatibilitäts-Shims).
> **Supersedes:** Dieses Dokument **ersetzt** den Ingestion-Teil von
> `ingestion-fields-ux-concept.md` und **kassiert dessen WE-Einlagerungs-Station und den
> `awaiting_storage`-Status** — ProHandel liefert den Lagerplatz, der Beleg landet direkt in `ready`.
> Companion: `automatik-dispo-konzept.md` (Verteil-Flow), `dispo-engine-ux-concept.md`.

> **Mental-Model in einem Satz:** *Ein Beleg entsteht künftig allein aus einem in ProHandel
> bestandswirksam gebuchten Lieferschein — strukturiert per API gezogen (Auftrag, Position,
> Größenverteilung, Arbeitsanweisung **und Lagerplatz**) — und landet ohne Zwischenstation
> direkt im Pool-Status `ready`; es wird nie wieder ein PDF geparst.*

---

## 1. TRASH — was verworfen wird (und was bleibt)

Das bisherige Konzept nahm an, dass drei PDFs (Lieferschein, Wareneingangsbeleg,
Arbeitsanweisung) per OCR/Text-Extraktion geparst, validiert und zu einem Beleg zusammengefügt
werden. Mit ProHandel als SoR ist **diese gesamte Pipeline obsolet**. Nichts davon bleibt als
Fallback — die `DOC`-Quelle aus `ingestion-fields-ux-concept.md §1` entfällt ersatzlos.

### 1.1 Komplett löschen (DELETE)

| Komponente | Fundstelle | Warum obsolet |
|---|---|---|
| **Parser-Worker (gesamtes Python-Projekt)** | `apps/parser-worker/` (pipeline.py, models.py, queue.py, guardrails.py, confidence.py, mapping/, extraction/pdf_text.py) | PDF-Text-Extraktion + Mapping; durch strukturierte API ersetzt |
| **Golden-Master-Parser-Tests + PDF-Fixtures** | `apps/parser-worker/tests/` (test_golden_master.py, test_golden_gate.py, test_guardrails.py, test_normalize.py, test_confidence.py, `tests/fixtures/golden/**.pdf`, `generate_pdfs.py`) | Testen nur die Extraktionsgenauigkeit aus PDFs |
| **Parser-Guardrails (Anhang F.2/H als Extraktions-Korrektur)** | `apps/parser-worker/src/parser_worker/guardrails.py` | Korrigierten OCR-Ableitungen; die *fachlichen* Regeln (Prüfung=Nein→min. Stückzahl) wandern als reine Domain-Invariante in die Engine/State-Machine, **nicht** als Parser-Guardrail |
| **`DocumentSet`-Modell** | `apps/backend-api/prisma/schema.prisma:326-342` | Drei-Dokument-Bündel + `parseConfidence` + `importKey` |
| **`Document`-Modell** | `apps/backend-api/prisma/schema.prisma:344-363` | Datei-Metadaten (storageKey, sha256, parserVersion, parseStatus, parseWarnings) |
| **`ParseStatus`-Enum** | `schema.prisma:41-46` · `packages/domain-types/src/enums.ts:53-54` | Parser-Lebenszyklus (pending/parsed/needs_review/failed) |
| **`DocumentKind`-Enum** | `schema.prisma:48-53` · `enums.ts:45-51` | delivery_note/goods_receipt/work_instruction/unknown — PDF-Klassifikation |
| **`parseConfidence`-Feld** | `schema.prisma:334` | OCR-Konfidenz; bei strukturierter API bedeutungslos |
| **Domain-Type `documents.ts`** | `packages/domain-types/src/documents.ts` (DocumentRef, DocumentSet) | Spiegel der gelöschten Modelle |
| **Parser-Templates in RuleConfig** | `packages/domain-types/src/admin-config.ts:136-151` (requiredFields/detectionThreshold/fallbackToManual) | Template-Auswahl für PDF-Parsing; ungenutzt |
| **Dokument-Events** | `enums.ts:155-156` (`document.imported`, `document.parsed`) | Ingestion-Events der Parser-Pipeline |
| **Parser-Vorstati im Case-Lifecycle** | `schema.prisma:19-21` / `enums.ts:58-60` (`imported`, `parsed`, `needs_review`) | reine Parser-Staging-Zustände; der Beleg startet künftig in `ready` (deckt sich mit der laufenden 10-Status-Konsolidierung) |

### 1.2 Anpassen (ADAPT)

| Komponente | Fundstelle | Änderung |
|---|---|---|
| **`GoodsReceiptCase.documentSetId`** | `schema.prisma:371,394` (FK + Relation) | FK auf `DocumentSet` löschen → ersetzen durch `source: DocumentSource` + `externalRef: String` (ProHandel-Buchungs-/Beleg-ID). `weBelegNo @unique` bleibt der natürliche Schlüssel. |
| **`GoodsReceiptCase.status @default(imported)`** | `schema.prisma:386` | Default → `ready` (Beleg ist mit dem Pull vollständig). |
| **`DocumentSource`-Enum** | `schema.prisma:55-61` · `enums.ts:36-43` | Reduzieren auf `prohandel_api` (+ ggf. `manual` für Pilot-Seeds); `pdf_folder`/`erp_export`/`print_job`/`manual_upload` entfallen. |
| **`RuleConfig`** | `admin-config.ts:74-83` | `parserTemplates` entfernen; ProHandel-Settings als **eigener** AppConfig-Key (siehe §4), nicht in RuleConfig. |

### 1.3 Bleibt unverändert (KEEP — quellenagnostisch)

Diese Teile konsumieren bereits strukturierte Domain-Daten und sind **nicht** parser-gekoppelt —
sie funktionieren mit ProHandel-Daten genauso:

- **Kern-Datenmodell:** `GoodsReceiptCase` (Header), `WorkInstructionHeader`
  (`schema.prisma:410-423`), `ReceiptPosition` (`425-450`), `PositionInstruction` (`452-467`),
  `ReceiptSkuLine`, `TransportBox`, `ZstRecord`, `Location`-Master.
- **State-Machine:** `apps/backend-api/src/workflow/case-status.ts`, `case-state-machine.ts`
  (§7.1) — enthält keinerlei Parser-Bezug; nur die Vorstati aus §1.1 fallen weg.
- **Assignment-Engine:** `packages/assignment-engine/src/priority/priority-engine.ts` (§8.1),
  `effort/effort-score.ts` (§8.2) — lesen Case-Felder, egal woher sie stammen.
- **Admin/Settings-Infrastruktur:** `AppConfig`-Singleton + `admin.service.ts`/`admin.controller.ts`
  (das Muster, in das die neuen ProHandel-Settings eingehängt werden).
- **Employee-PWA-Screens:** PositionScreen, BoxabschlussScreen, VorbereitungScreen,
  LagerplatzScanScreen, ProblemMeldenScreen (`apps/employee-pwa/src/screens/`) — zeigen
  WorkInstruction-/Position-Daten an, quellenagnostisch.

> **Bezug Analyse:** `docs/analysis/parser-analysis.md` wird zum historischen Dokument
> (beschreibt das verworfene Verfahren) und sollte als „superseded" markiert werden.

---

## 2. Ziel-Mental-Model

Daten kommen künftig aus **genau einer** strukturierten Quelle — der ProHandel-API — weil der
physische Wareneingang dort ohnehin bestandswirksam gebucht wird und ProHandel danach alle Felder
besitzt, die wir heute aus drei PDFs zusammenklauben (inkl. **Lagerplatz**). Statt „Papier
erzeugen → scannen/parsen → hoffen" gilt: „in ProHandel gebucht → wir ziehen die Buchung
strukturiert → Beleg ist fertig". Kein OCR, keine Konfidenz, kein Review-Schritt, keine
Einlagerungs-Station.

---

## 3. ProHandel-API-Integration

### 3.1 Was wir ziehen

Aus der bestandswirksamen Lieferschein-Buchung erzeugt ProHandel die zwei fachlichen Belege
(Wareneingangsbeleg = Kontrollübersicht, Arbeitsanweisung = Auszeichnungssteuerung). Genau deren
Inhalte ziehen wir strukturiert:

| Datengruppe | ProHandel liefert | Ziel-Entität |
|---|---|---|
| **Auftrag/Kopf** | weBelegNo, Lieferschein-Nr, Lieferant, Filiale, Buchungsdatum, Abschnitt (1/2/3/4/7/8), Catman-Datum, Verladetag, Shop-Bereich/Etage | `GoodsReceiptCase` |
| **Lagerplatz** | Lagerplatz-Code + (abgeleitete) Lagerklasse | `GoodsReceiptCase.storageLocationId` → `Location` |
| **Position** | Positions-Nr, WGR, Lieferanten-Artikel/Farbe, Label/Marke, Funktion (Nachhaltigkeit), Dessin (Online), Saison | `ReceiptPosition` |
| **Arbeitsanweisung** | Etikett-Druck ja/nein, Sichern ja/nein (+Ort), Prüfmodus (Pkt 6: %/voll/min. Stückzahl), Sortierung Artikel/Farbe/Größe (Pkt 5), Online-Handling, rote Preise | `WorkInstructionHeader` + `PositionInstruction` |
| **Größenverteilung** | EAN, Größe, Soll-Menge, EK/VK/VK-Etikettenpreis | `ReceiptSkuLine` |

### 3.2 Pull-Modell (lean, poll-first)

Kein Push, kein Parser, kein Datei-Upload, kein „Storagerobot"/Ordner-Watcher. Stattdessen ein
schlanker, settings-konfigurierter **Delta-Pull** hinter einem schmalen Integrations-Modul
(`apps/backend-api/src/integration/prohandel/`):

```
                       ┌──────────────────────────────────────────────┐
   ProHandel ERP       │            backend-api (NestJS)              │
  ┌──────────────┐     │  ┌────────────┐   ┌──────────────────────┐   │
  │ gebuchte     │     │  │ Poller     │   │ Anti-Corruption-     │   │
  │ Lieferschein-│◀────┼──│ (Intervall │──▶│ Mapper (1 Datei:     │   │
  │ Buchungen    │ HTTP│  │  + Cursor) │   │ ProHandel → Domain)  │   │
  └──────────────┘ GET │  └────────────┘   └──────────┬───────────┘   │
        ▲              │        │                      │ idempotenter  │
        │ Delta seit   │        │                      ▼ upsert        │
        │ Cursor       │        │            ┌──────────────────────┐  │
        └──────────────┼────────┘            │ Case + Positionen +  │  │
                       │                     │ SKU + WorkInstruction │ │
                       │   Quarantäne ◀──────│ in 1 Transaktion     │  │
                       │   (dead-letter)     └──────────┬───────────┘  │
                       │   + Retry                      │ emit          │
                       │                                ▼ case.created  │
                       │                     status = ready (Pool)      │
                       └──────────────────────────────────────────────┘
```

**Ablauf eines Pulls:**
1. **Poll** der gebuchten Wareneingänge seit persistiertem **Cursor** (z. B. `lastBookingTimestamp`/
   `lastBookingId`); Paging bis erschöpft.
2. **Anti-Corruption-Mapper** (genau eine Datei) übersetzt das ProHandel-Schema → Domain-Objekte.
   Keine Fachlogik im Mapper außer Feld-Mapping/Normalisierung (siehe §5).
3. **Idempotenter Upsert** auf `weBelegNo` (natürlicher Schlüssel) — Re-Pull derselben Buchung ist
   ein No-Op/Update, kein Duplikat. Case + Positionen + SKU-Lines + WorkInstruction in **einer**
   Transaktion.
4. **Status:** Der Beleg entsteht direkt in **`ready`** und ist sofort poolfähig. **Keine**
   Einlagerungs-Station, **kein** `awaiting_storage` — der Lagerplatz kommt aus der API.
5. **`case.created`-Event** → die Automatik (`automatik-dispo-konzept.md`, Auslöser ②) verteilt.
6. **Cursor** wird nach erfolgreichem Batch fortgeschrieben.

**Fehlerfälle (lean, aber robust):**
- Eine Buchung, die das Mapping verletzt (z. B. Pflichtfeld fehlt), wird **quarantäniert**
  (dead-letter), nicht stillschweigend verworfen, und im Sync-Monitor mit Grund + **Retry**
  angezeigt.
- Fehlt ein **optionales** Feld, wird der Case erstellt und das Feld als „offen" markiert.
- v1 ist **read-only** (kein Write-back ZST/Lagerplatz nach ProHandel — siehe §7).

---

## 4. Integration-Settings

Settings sind bewusst **minimal**. Es gibt **keine** Feld-Mapping-UI, **keine** Konfidenz-/Retry-
Regler, **keine** Parser-Templates. Das Mapping lebt im Code (Anti-Corruption-Mapper), weil es sich
mit der ProHandel-API-Version ändert, nicht pro Mandant.

### 4.1 Wo es lebt

Ein eigener **`AppConfig`-Singleton-Key** `prohandel_config` (analog zu `RULE_CONFIG_KEY` in
`apps/backend-api/src/admin/admin.service.ts`), Zod-validiertes JSON. Read/Write über die bestehende
Admin-API (`GET/PUT /api/admin/integrations/prohandel`). UI als neuer Tab **„Integrationen"** in der
Admin-/Teamlead-Settings-Oberfläche (`apps/teamlead-web`), neben „Regeln", „Bereiche",
„Mitarbeiter".

### 4.2 Felder (das ganze Settings-Objekt)

| Feld | Typ | Bedeutung | Quelle |
|---|---|---|---|
| `enabled` | boolean | Integration an/aus (aus = Poller pausiert) | UI |
| `baseUrl` | string (URL) | ProHandel-API-Basis-URL/Endpoint | UI |
| `pollIntervalSeconds` | int | Pull-Intervall (z. B. 180) | UI |
| `branchScope` | string[] | Mandant/Filiale(n), die gezogen werden | UI |
| `apiKey` / `clientSecret` | — | **NICHT in der UI** — ausschließlich via ENV (`PROHANDEL_API_KEY`) | ENV |

> **Sicherheit:** Credentials liegen **nie** in `AppConfig`/DB/UI, sondern in Umgebungsvariablen
> (vgl. globale Security-Regel: keine Secrets in git-getrackten Dateien). Die UI zeigt nur, ob ein
> Secret konfiguriert **ist** (●/○), nie den Wert.

### 4.3 Anzeige (Health/Last-Sync)

Read-only-Statuszeile aus dem Poller-Zustand: letzter erfolgreicher Pull, Cursor-Stand, Anzahl
neuer Belege, Quarantäne-Zähler, aktiv/inaktiv.

### 4.4 ASCII-Wireframe — Settings-Seite „Integrationen → ProHandel"

> Visuelles Mockup (gerendert): `docs/concept/prohandel-integration-ux-mockup.html`.

```
┌──────────────────────────────────────────────────────────────┐
│  Admin · Einstellungen                                        │
│  [ Regeln ] [ Bereiche ] [ Mitarbeiter ] [ Integrationen ◀ ]  │
├──────────────────────────────────────────────────────────────┤
│  ProHandel-Anbindung                          ● aktiv  [An|Aus]│
│  ────────────────────────────────────────────────────────────│
│  Basis-URL    [ https://erp.example.de/prohandel/api/v2   ]   │
│  Mandant/Fil. [ 01 ▾ ] [ + Filiale ]   gewählt: 01, 04        │
│  Pull-Intervall [ 180 ] Sek.   (≈ alle 3 Min)                 │
│                                                                │
│  Zugangsdaten   ● per ENV gesetzt (PROHANDEL_API_KEY)          │
│                 ⓘ Secrets werden nicht hier gepflegt           │
│  ────────────────────────────────────────────────────────────│
│  Status                                                        │
│   Letzter Pull:   12:48:07   ✓ erfolgreich                    │
│   Cursor:         Buchung #88421 · 7 neue Belege              │
│   Quarantäne:     2  ▸ ansehen                                 │
│                                                                │
│        [ Verbindung testen ]   [ Jetzt pullen ]   [ Speichern ]│
└──────────────────────────────────────────────────────────────┘

  Quarantäne (2)                                    [ alle retry ]
  ┌────────────────────────────────────────────────────────────┐
  │ WE-2026-000139  Mapping-Fehler: WGR fehlt        [ Retry ]  │
  │ WE-2026-000140  Lieferant unbekannt              [ Retry ]  │
  └────────────────────────────────────────────────────────────┘
```

---

## 5. Wiring — Arbeitsanweisung End-to-End

Wie ProHandel-Felder die interne Arbeitsanweisung und damit Engine + Mitarbeiter-App steuern.
Spalte „wirkt auf" zeigt den fachlichen Effekt, „UI employee-pwa" die Anzeige.

### 5.1 Mapping-Tabelle ProHandel → intern

| ProHandel-Feld | Interne Bedeutung | wirkt auf | UI employee-pwa |
|---|---|---|---|
| Etikett-Druck-Kennzeichen | `WorkInstructionHeader.priceLabelPrintRequired` / `PositionInstruction.priceLabelRequired` | **Etikett drucken** (vor Auspacken, Guardrail) | PositionScreen: „Preisetikett drucken" |
| Warengruppe (WGR) | → **RULE**: `ReceiptPosition.labelType` (Hänger-Etikett vs Karton-Kleber, Lookup nach WGR-Klasse) | **Etikettentyp** | PositionScreen: Etikettentyp-Badge |
| Sicherungs-Kennzeichen (Pkt 10) | `PositionInstruction.priceLabelAttachRequired`/`securityRequired` (+ `…Location`) | **Sichern ja/nein** (+ Ort) | PositionScreen: „Sichern: Etikett/Naht …" |
| Prüf-Kennzeichen (Pkt 6) | `WorkInstructionHeader.goodsReceiptCheckMode` (`quantity_only`/`percentage`/`full`) + `goodsReceiptCheckPercentage` | **Prüfung Ja/Nein + Tiefe**; `minimumQuantityCheckAlwaysRequired=true` als harte Invariante (auch bei „Prüfung=Nein" min. Stückzahlkontrolle) | PositionScreen: Prüfmodus + Mengeneingabe |
| Sortier-Kennzeichen (Pkt 5) | `WorkInstructionHeader.sortByArticleColorSizeRequired` | **Sortierung** Artikel/Farbe/Größe | VorbereitungScreen: Sortier-Schritt |
| Abschnitt (1/2/3/4/7/8) | `GoodsReceiptCase.section` + `goodsTypeText` | **Abschnitt-Prio** (1/2/3 Verladeplan, 4/7/8 every-day) | BelegListe: Abschnitts-Chip |
| Catman-Datum / Verladetag | `catManDate` / `loadPlanDate` | **Priorität** (Termin-Dringlichkeit) | BelegListe: Fälligkeit |
| Lagerplatz-Code (+ Klasse) | `storageLocationId` → `Location` | **Lagerplatz** (Beleg sofort poolfähig) | LagerplatzScanScreen: Soll-Lagerplatz + Scan-Validierung |
| Funktion / Dessin | `sustainabilityFlag` / `onlineRelevant` | Online-/Nachhaltigkeits-Handling | PositionScreen: Hinweise-Badges |
| Größenverteilung (EAN/Größe/Soll) | `ReceiptSkuLine.expectedQuantity` | Mengenkontrolle | PositionScreen: SKU-Zeilen |

### 5.2 Anbindung Engine + State-Machine

- **Priorität (§8.1, `priority-engine.ts`):** konsumiert `priorityFlags`, `catManDate`,
  `loadPlanDate`, `section` — alle ab Pull gesetzt. Reihenfolge unverändert: manual_teamlead →
  prio → catman_due → every-day → load-plan-today → fifo.
- **Aufwand (§8.2, `effort-score.ts`):** konsumiert `totalQuantity`, WGR-Codes, `checkMode`/`%`,
  Label-/Sicher-/Online-/Rotpreis-Zähler aus den Positionen — alle aus der Arbeitsanweisung.
- **State-Machine (§7.1):** Eintritt direkt in `ready` (kein `imported`/`parsed`/`needs_review`,
  kein `awaiting_storage`). Ab da unveränderter Lebenszyklus
  `ready → assigned → picking → … → completed/zst_done`. Die fachliche Invariante
  „Prüfung=Nein ⇒ min. Stückzahlkontrolle" lebt als Domain-Regel der Auszeichnung, nicht mehr als
  Parser-Guardrail.

---

## 6. Datenmodell-Mapping ProHandel → bestehende Entitäten

Konzeptuell (keine Migration hier). Linke Spalte = ProHandel-Konzept, rechte = bestehendes Modell.

| ProHandel | Bestehende Entität / Feld | Hinweis |
|---|---|---|
| Lieferschein-Buchung (Kopf) | `GoodsReceiptCase` (`schema.prisma:369-408`) | `weBelegNo @unique` = natürlicher Schlüssel; `documentSetId` → **`source` + `externalRef`** |
| Buchungs-ID / Belegnummer | `GoodsReceiptCase.externalRef` (**neu**) | Rück-Referenz auf ProHandel |
| Filiale / Buchungsdatum / Abschnitt / Catman / Verladetag | `branchNo` / `bookingDate` / `section` / `catManDate` / `loadPlanDate` | direkt |
| Lagerplatz | `storageLocationId` → `Location` (`schema.prisma:379,395`) | **Pflicht-FK** — Beleg ohne Lagerplatz wird quarantäniert (siehe Open §8) |
| Arbeitsanweisung (Kopf) | `WorkInstructionHeader` (`410-423`) | Etikett-Druck/Sortier/Prüfmodus/Box-Label/ZST |
| Position | `ReceiptPosition` (`425-450`) | WGR, Artikel, Farbe, Label/Marke, Funktion, Dessin |
| Positions-Anweisung | `PositionInstruction` (`452-467`) | Preisetikett/Sichern (+Ort)/Online/Rotpreis |
| Größenverteilung | `ReceiptSkuLine` | EAN/Größe/Soll/EK/VK/VK-Etikettenpreis |
| — (entfällt) | `DocumentSet`/`Document` | **gelöscht** (§1.1) |

---

## 7. Bewusst weggelassen (lean, Pilot-tauglich)

| Weggelassen | Begründung |
|---|---|
| **PDF-Fallback / Parser-Parallelbetrieb** | Clean-Code-Prinzip: keine zwei Ingestion-Wege; ProHandel ist alleinige Quelle. |
| **WE-Einlagerungs-Station + `awaiting_storage`** | ProHandel liefert den Lagerplatz; die manuelle Lagerplatz-Erfassung entfällt komplett. |
| **Feld-Mapping-UI / Konfidenz-/Retry-Regler** | Mapping ist Code (versionsgebunden), nicht pro Mandant; keine OCR-Konfidenz mehr. |
| **Write-back nach ProHandel (ZST/Lagerplatz/Ist-Mengen)** | v1 read-only; Rückschreiben ist ein späteres, separat zu entscheidendes Inkrement. |
| **Webhook/Push** | Poll-first reicht für den Pilot; Webhook später ohne Konzeptbruch nachrüstbar (gleicher Mapper/Upsert). |
| **Originaldokumente-Preview** | Solange ProHandel keine Beleg-PDF-Referenz liefert, bleiben die Links inaktiv; kein eigener Objektspeicher im Pilot. |
| **Mehr-Mandanten-Mapping-Profile** | Pilot = eine ProHandel-Instanz; `branchScope` genügt. |

---

## 8. Offene Punkte (vor Implementierung zu klären)

1. **ProHandel-API-Oberfläche:** Endpoint(s) für gebuchte Wareneingänge + Positionen, Delta-
   Mechanismus (Timestamp-/ID-Cursor vs Webhook), Auth-Verfahren, Paging.
2. **Lagerplatz-Feld:** Exakter Feldname/Quelle in ProHandel und ob er pro Buchung verlässlich
   gesetzt ist. **Risiko:** Ist der Lagerplatz in ProHandel doch nicht durchgängig gepflegt, muss
   die Quarantäne-Regel (Pflicht-FK) ihn abfangen — dann ist eine minimale manuelle Lagerplatz-
   Nachpflege im Teamlead-Cockpit nötig (nicht die alte Station).
3. **Standard- vs Custom-Felder:** Welche L&T-Attribute (Label/Marke, Funktion, Dessin,
   Prüf-/Sicher-Kennzeichen) sind ProHandel-Standard, welche Custom-Felder?
4. **Verladekonzept-Kalender:** Liefert ProHandel den Verladetag, oder bleibt die Shop-Bereich→
   Verladetag-Ableitung als RULE bei uns?
5. **Etikettentyp-Lookup:** WGR-Klasse → Etikettentyp-Tabelle pflegen (Admin-Regel).
