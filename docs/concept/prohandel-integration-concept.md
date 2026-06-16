# ProHandel API Integration — Concept

> **ProHandel is the system of record — including the Lagerplatz.** The software pulls
> booked goods receipts from ProHandel over its API and turns them into cases. The
> PDF/OCR document-ingestion apparatus is dead weight and gets deleted. One read-mostly
> sync, one anti-corruption mapper, one lean settings panel.
>
> **Supersedes** the ingestion direction in `ingestion-fields-ux-concept.md` — specifically
> it **kills** the WE-Einlagerung station, the `awaiting_storage` state, and the
> "PDF parser as fallback" idea. ProHandel already knows where the goods are.
> Status: concept, no code yet.

---

## 1. Position — what changes and why

Three corrections to the current direction:

1. **ProHandel owns the Lagerplatz.** The case arrives from ProHandel already carrying its
   storage location (and section, CatMan, branch, prices, Soll-quantities). The data model
   already reflects this: `GoodsReceiptCase.storageLocationId` is a **required** FK
   (`schema.prisma:379`). → **No Einlagerung station. No `awaiting_storage` state.** A pulled
   case goes straight to `ready`.

2. **The document-ingestion pipeline is dead and overengineered.** A Python parser worker,
   `DocumentSet`/`Document` models, confidence scoring, golden masters, document grouping —
   all built to reverse-engineer data out of printed belege. With a structured API that data
   comes clean. → **Delete it** (see §7). Per the project's clean-code rule: replace the
   concept, remove the old code, no fallback shim.

3. **One integration, SOTA-style, lean.** A single ProHandel adapter behind a port, a delta
   pull on a cursor, an anti-corruption mapper, idempotent upserts, a quarantine for the bad
   rows, and a small settings/monitor surface. Nothing more.

---

## 2. How modern ERP integrations work (the pattern we copy)

This is how SAP / Dynamics / NetSuite integrations are built today. We take the parts that fit
and skip the enterprise bulk.

| Principle | What it means here |
|-----------|--------------------|
| **API-led, delta pull** | Poll a "booked goods receipts since X" endpoint with a persisted watermark/cursor (SAP's delta-token / change-pointer idea). Pull only what changed. |
| **Anti-Corruption Layer (ACL)** | One mapper is the *only* place that knows ProHandel's field names/quirks. Our domain stays clean; ProHandel changes are absorbed in one file. |
| **Idempotency on a natural key** | Upsert on `weBelegNo`. Re-pulling the same booking is a no-op. At-least-once delivery is safe. |
| **Quarantine, not drop** | A record that fails mapping (missing required field, unknown supplier) goes to a dead-letter with a reason + retry — never silently lost. |
| **Read-only by default** | ProHandel is the source of truth. We don't write back unless a concrete need exists (v1: none). |
| **Secrets out of the app config** | Credentials live in the environment / secret store, never in the settings UI. |
| **Poll first, events later** | Start with interval polling (simple, robust, resumable). Add webhooks/event push only if ProHandel offers them and latency demands it. |
| **Observable** | Cursor position, last-pull time, new/quarantined counts are visible to admin/teamlead. |

---

## 3. Target architecture (minimal)

```
ProHandel  ──API──▶  ProHandelClient ──▶ ProHandelSyncService ──▶ caseMapper (ACL) ──▶ upsert  ──▶ case.created ──▶ ready ──▶ Automatik
  (booked WE)         (http+auth+retry)     (cursor loop)            (PH → domain)      (idempotent tx)                          (§8 engine)
                                                  │                                          │
                                                  └── persist cursor                         └── unmappable → quarantine → retry
```

Pieces — that's the whole list:

- **`ProHandelClient`** — thin HTTP client: base URL, auth header, timeout, retry/backoff. Knows
  nothing about our domain.
- **`prohandelCaseMapper`** (the ACL) — pure function `PHGoodsReceipt → GoodsReceiptCaseDraft`.
  Resolves the ProHandel storage code against the `Location` master. The single mapping boundary.
- **`ProHandelSyncService`** — the loop: read cursor → pull page → map each → idempotent upsert
  (`Case` + `ReceiptPosition` + `ReceiptSkuLine` + `WorkInstructionHeader`) in one transaction →
  emit `case.created` → advance cursor. Mapping failure → quarantine row, continue.
- **`SyncCursor`** — a persisted watermark (last booking timestamp or ProHandel change pointer).
- **`IngestionQuarantine`** — the dead-letter table (external ref + raw payload + reason + retry count).
- **Settings doc + monitor screen** — §5.

No `DocumentSet`. No parser. The case is created directly from the structured pull and lands in
`ready` (Lagerplatz resolved), immediately visible to the Automatik.

> Keep the existing `CaseIngestionPort` seam if it already exists as an interface, with ProHandel
> as the one real adapter. Do **not** build a multi-ERP abstraction — YAGNI.

---

## 4. Field mapping (the ACL)

Every field has one owner. **PH** = from ProHandel, **RULE** = derived by our engines (unchanged),
**SYS** = generated. The mapper fills PH; RULE/SYS stay where they are.

| Domain field | Owner | From ProHandel / note |
|--------------|-------|------------------------|
| `weBelegNo` (natural key) | PH | idempotent upsert key |
| `bookingDate`, `weDate` | PH | |
| `branchNo` (Filiale) | PH | |
| `section` (Abschnitt 1–8) | PH | drives priority — map to the numeric code |
| `catManDate` | PH | drives priority |
| `loadPlanDate` (Verladetag) | PH → else RULE | from ProHandel if present; else derived from shop-area + Verladekonzept |
| `primaryShopAreaNo`, `primaryFloor` | PH | |
| **`storageLocationCode` → `storageLocationId`** | PH | **the correction — comes from ProHandel; resolved against `Location` master; unknown code → quarantine** |
| positions: `positionNo`, `wgr`, `supplierArticleNo`, `supplierColor`, label/brand, sustainability, online | PH | wire straight through |
| SKU: `ean`, `size`, `expectedQuantity`, `ekPrice`, `vkPrice`, `vkLabelPrice` | PH | the clean Größenverteilung — no OCR |
| work-instruction flags (price-label, secure, check-mode) | PH → else RULE | ProHandel Prüf-/Druckkennzeichen if present, else rule default |
| `labelType` (Etikettentyp) | RULE | WGR → Hänger/Karton lookup (unchanged) |
| `effortPoints`, `estimatedMinutes`, `priorityFlags`, `status`, `version` | RULE / SYS | unchanged |

Mapping lives in code, not in settings. There is **no field-mapping UI** — that would be
overengineering.

---

## 5. Settings — the ProHandel connection (lean)

Same pattern as the rule config: a single Zod-validated JSON document in `AppConfig` under a new
key (e.g. `PROHANDEL_CONFIG_KEY`), served/edited through the admin module. **Non-secret operational
parameters only.**

```ts
// domain-types — the whole settings surface
const prohandelConfigSchema = z.object({
  enabled: z.boolean().default(false),          // master on/off
  baseUrl: z.string().url(),                     // API endpoint
  pollIntervalSeconds: z.number().int().min(30).default(180),
  branchScope: z.array(z.string()).default([]),  // optional: only these Filialen (empty = all)
})
```

**Admin "ProHandel"-Tab — fields:**
- `Aktiv` (toggle) · `API-URL` · `Abruf-Intervall (Sek.)` · `Filialen-Filter` (optional)

**Actions:** `Verbindung testen` · `Jetzt abrufen` · `Cursor zurücksetzen` (re-sync from scratch).

**Secrets are NOT in this panel.** API key / OAuth client-secret come from the environment
(`PROHANDEL_API_KEY` / `PROHANDEL_CLIENT_SECRET`). The UI shows only `● verbunden` / `● kein
Secret konfiguriert`. (Security rule + SOTA: never store credentials in app config.)

**Explicitly NOT settings** (this is where overengineering creeps in — we refuse it):
parser confidence thresholds, document-grouping rules, field-mapping toggles, retry tuning,
per-field source overrides. Mapping and retry policy are code with sane defaults, not knobs.

---

## 6. Sync monitor (admin/teamlead — small)

Reuses existing list/card patterns. One screen:

```
┌──────────────────────────────────────────────┐
│  ProHandel-Sync            [ Jetzt abrufen ]   │
│  ● aktiv · Intervall 3 min · letzter Abruf 12:48│
│  Cursor: 2026-06-16 12:47 · 7 neu, 0 Fehler    │
├──────────────────────────────────────────────┤
│  ⚠ Quarantäne (2)                              │
│   WE-…139  Lagerplatz „R99" unbekannt  [Retry] │
│   WE-…140  Lieferant unbekannt         [Retry] │
└──────────────────────────────────────────────┘
```

Cursor / last-pull / new+error counts; quarantined rows with reason + retry. That's the whole
observability surface — no dashboards, no metrics zoo.

---

## 7. What to delete (clean code, no legacy)

Replacing the ingestion concept means removing the apparatus that served the old one. Delete
outright — no compat shim:

- **`apps/parser-worker/`** — the entire Python parser worker + its golden-master fixtures.
- **`packages/domain-types/src/documents.ts`** — the parser/ingestion contract types.
- **Prisma:** `model DocumentSet`, `model Document`; enums `DocumentSource`, `ParseStatus`,
  `DocumentKind`; `parseConfidence`. Migrate them out.
- **`GoodsReceiptCase.documentSetId`** (required FK) → replace with a light traceability pair:
  `source` (`prohandel | manual`) + `externalRef` (ProHandel booking id). One migration.
- Any "Document Service" (§4.2) build tasks and the **Einlagerung station / `awaiting_storage`**
  design from `ingestion-fields-ux-concept.md` — both obsolete.

**Keep:** if ProHandel exposes archived document URLs, store the *link* on the case for the
"Originaldokumente" preview. That's a URL field, not a parser.

---

## 8. What we need from ProHandel (integration contract to confirm)

The concept assumes a structured API. Confirm with the ProHandel vendor before build — this is the
checklist that unblocks §3:

1. **Endpoint** for booked goods receipts incl. positions + SKU lines (one call or position sub-call).
2. **Delta mechanism** — "changed since" timestamp or change-pointer for the cursor.
3. **Auth** — OAuth2 client-credentials vs. API key; token endpoint; rotation.
4. **Field coverage** — confirm it exposes **Lagerplatz**, Abschnitt, CatMan, prices,
   sustainability/online flags, label brand. (User states Lagerplatz is present — confirm the field name.)
5. **Rate limits / paging** — page size, throttle, max frequency.
6. **Webhook / event push** availability (optional, phase 2).
7. **Write-back** — does ProHandel need ZST/Lagerplatz back? (Assume no for v1.)

---

## 9. Non-goals (no overengineering)

Stated so they don't creep back in:

- ❌ No PDF/OCR parser, no confidence scoring, no golden-master gate.
- ❌ No WE-Einlagerung station, no `awaiting_storage` state.
- ❌ No generic multi-ERP integration framework / mapping DSL.
- ❌ No field-mapping UI, no per-field source overrides, no retry-tuning knobs.
- ❌ No write-back to ProHandel in v1.
- ❌ No event-sourcing/replication of ProHandel data — we hold only what the Automatik needs.

---

## 10. Build order (lean increments)

1. **Clean first.** Delete the dead ingestion (§7) + run the schema migration. Repo gets smaller.
2. **Core sync.** `ProHandelClient` + `prohandelCaseMapper` + `ProHandelSyncService` with cursor
   and idempotent upsert; secrets from env. Cases land in `ready`.
3. **Settings.** `prohandelConfigSchema` in `AppConfig` + admin "ProHandel" tab
   (`Aktiv`/URL/Intervall/Filter; Test/Abruf/Reset).
4. **Resilience.** Quarantine table + retry + the sync monitor screen.
5. **Later, only if needed.** Webhook push; write-back; archived-document links.

Result: real ProHandel data drives the (already-built) Automatik and Mitarbeiter-App; the parser
and its settings are gone; the connection is configured in one small, secret-free admin panel.
