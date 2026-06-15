# Ingestion, Field Provenance & Missing UX — Concept

> How every field (incl. Lagerplatz) is obtained reliably, and the UX still missing to
> close the IST process. Companion to the ProHandel-ingestion direction (ProHandel = system
> of record; PDFs become archival-only). Status: concept, no code yet.

## 1. The six sources of truth

Every field in the model comes from exactly one authoritative source. The whole point of
this design is that **no field is "guessed" by OCR** — each has a named owner.

| Code | Source | Owns | Reliability |
|------|--------|------|-------------|
| **PH** | ProHandel API (booked goods receipt) | order/article/booking/attribute data | high — structured ERP data |
| **WE** | Wareneingang-Einlagerung capture (human scan/entry) | physical receipt facts ProHandel can't know: **Lagerplatz**, storage class, package count, damage | high — scanned/confirmed by a person at receipt |
| **RULE** | L&T derivation (our config/engines) | computed values: Etikettentyp, check-mode, priority, effort, Verladetag | deterministic |
| **EMP** | Employee during Auszeichnung | confirmed quantities, boxing, seal, ZST, problems | live |
| **TL** | Teamlead | overrides, manual priority, issue resolution | live |
| **SYS** | System | ids, status, version, audit hash-chain, assignment plan | generated |

`DOC` (parsed PDF) is **fallback-only** — used behind the ingestion port for genuine paper /
non-ProHandel edge cases, never the primary path.

## 2. Field provenance matrix (every field, where it comes from)

### Case header (`GoodsReceiptCase`)
| Field | Source | How obtained / note |
|-------|--------|---------------------|
| weBelegNo (+ booking barcode) | **PH** | the natural key; idempotent upsert on it |
| supplierOrderNo | **PH** | NEW field |
| ltOrderNo (Jobrouter) | **PH** | NEW — distinct from weBelegNo |
| supplier (+ EDI flag) | **PH** | NEW supplier master ref |
| branchNo (Filiale) | **PH** | |
| bookingDate | **PH** | |
| deliveryDateFrom / deliveryDateTo | **PH** | NEW — range, currently lost |
| section (Abschnitt 1/2/3/4/7/8) | **PH** | drives priority |
| catManDate | **PH** | drives priority |
| loadPlanDate (Verladetag) | **PH** → else **RULE** | from ProHandel if set; else derived (bookingDate + Verladekonzept calendar by shop area) |
| primaryShopAreaNo / shopNo | **PH** | |
| primaryFloor (Etage) | **PH** → else **RULE** | from shop-area master |
| goodsTypeText | **PH** / **RULE** | from section |
| **storageLocationCode + kind (Lagerplatz)** | **WE** | **the crux — NOT in ProHandel; captured at Einlagerung (see §3.2)** |
| status | **SYS** | §7.1 state machine |
| estimatedMinutes / effortPoints | **RULE** | effort engine over positions/qty/instructions |
| priorityFlags | **RULE** + **TL** | priority engine + manual prio |
| version | **SYS** | optimistic lock |

### Position (`ReceiptPosition`)
| Field | Source | Note |
|-------|--------|------|
| positionNo, wgr, supplierArticleNo, supplierColor | **PH** | |
| **labelBrand (Label/Marke)** | **PH** | NEW — customer-facing brand ≠ supplier |
| **sustainabilityFlag (Funktion)** | **PH** | field exists; wire it from PH |
| **onlineRelevant (Dessin)** | **PH** | field exists; wire it from PH |
| **labelType (Etikettentyp)** | **RULE** | NEW derivation: WGR → Hänger-Etikett vs Karton-Kleber (lookup table by WGR class) |
| instruction flags (priceLabel / secure / sort / check-mode) | **PH** → else **RULE** | ProHandel Prüf-/Druckkennzeichen if present; else L&T rule |

### SKU line (`ReceiptSkuLine`)
| Field | Source | Note |
|-------|--------|------|
| ean, size, expectedQuantity (Soll) | **PH** | the Größenverteilung — clean, not OCR'd |
| ekPrice, vkPrice, **vkLabelPrice** | **PH** | vkLabelPrice exists; wire from PH |
| confirmedQuantity (Ist) | **EMP** | entered during Auszeichnung |
| status (open/confirmed/deviation) | **EMP** / **SYS** | |

### Storage (`Location` master + case `storageLocation`)
| Field | Source | Note |
|-------|--------|------|
| Location master (code, displayName, kind, zone, sequenceIndex, active) | **Admin (TL/admin)** | warehouse topology — static config (HB 1-7, Palette A/B/C/E, Regal 1-40, D 1-9) |
| case.storageLocationCode | **WE** | which master location this case physically went to |
| case.storageLocation.kind | **WE** (prefill from code prefix, confirmed) | HB-→haengebahn, A/B/C/E-→palette, R→regal, D-→under-conveyor |

### Transport box (`TransportBox`) / ZST / Bundle
| Field | Source |
|-------|--------|
| target shopArea/shop/floor/goodsType (the Zettel) | **PH** (target) |
| boxNo, labelStatus, sealed, putOnConveyor | **EMP** |
| plannedQuantity | **RULE** / **PH** |
| ZST completedQuantity/effortPoints/completedAt | **EMP/SYS** |
| bundle / route / load | **SYS** (assignment engine) |

## 3. How each external source is acquired

### 3.1 ProHandel pull (PH)
Behind a `CaseIngestionPort`; ProHandel is the primary adapter (parser = fallback). Incremental
poll (or webhook) of booked goods receipts since a persisted cursor → anti-corruption mapper →
idempotent upsert (DocumentSet + Case + positions + SKU + work-instruction) in one transaction →
emit `case.created`. A booking that fails mapping is **quarantined** (not dropped) and surfaced in
the sync monitor. **Required-field policy:** a case missing a *required* PH field is quarantined;
missing an *optional* field is created with that field null + flagged.

### 3.2 Wareneingang-Einlagerung capture (WE) — the Lagerplatz
ProHandel does **not** know the physical Lagerplatz (handwritten in the IST). So a case created
from ProHandel lands in status **`awaiting_storage`** and is **not yet in the pool**. A WE worker
runs the Einlagerung step (see UX §5.1): scan Buchungsbeleg barcode → pick class → scan/enter
Lagerplatz (class-validated) → case transitions `awaiting_storage → ready`. Only then can the
Automatik assign it. This is the single bridge that makes the software authoritative about
"where is what."

Validation: the scanned code is checked against the **Location master** (must exist + active);
the class is prefilled from the code prefix and confirmed; an unknown code is rejected at the
station (so a typo can't create an unpickable case).

### 3.3 RULE derivations
- **labelType** ← WGR via a maintained lookup (Admin rules): WGR-class → {Hänger-Etikett, Karton-Kleber, …}.
- **check-mode / min-Stückzahlkontrolle** ← ProHandel Prüfkennzeichen if present, else default; the `minimumQuantityCheckAlwaysRequired` guardrail is always true.
- **priority / effort / loadPlanDate** ← existing engines + Verladekonzept calendar.

## 4. Status lifecycle change

```
(ProHandel pull)        (WE-Einlagerung)         (Automatik)
   created  ──▶  awaiting_storage  ──▶  ready  ──▶  assigned  ──▶  picking … boxing … completed
                      │  scan + Lagerplatz                                   └─ partially_completed
                      └─ (damage? → blocked/issue)
```
`awaiting_storage` is the new state between ingestion and pool. Cases without a Lagerplatz never
reach the Automatik — guaranteeing every assignable case is locatable.

## 5. Missing UX plan

Roles: **WE-worker** (Einlagerung), **Employee** (Auszeichnung — built), **Teamlead** (cockpit —
built; + dispatch/sync — new), **Admin** (master data/rules — built).

### 5.1 Wareneingang-Einlagerung station (NEW — highest value)
Touch/handheld screen; the digital replacement for handwriting the Lagerplatz.
```
┌───────────────────────────────────────────────┐
│  Wareneingang · Einlagerung      12 offen ▸    │
├───────────────────────────────────────────────┤
│  [ Buchungsbeleg scannen … ]   ⌨ manuell       │
│                                                 │
│  ▸ WE-2026-000142 · Lieferant BESTSELLER        │
│    Abschnitt 4 (NOS) · 56 Teile · 2 Pakete      │
│                                                 │
│  Lagerklasse:                                   │
│   [ Hängebahn ]  [ Palette ]  [ Regal ]         │
│                                                 │
│  Lagerplatz:  [ scannen / eingeben ]            │
│    z.B. 5/234 · A-4 · R27 · D-3                 │
│    ✓ erkannt: Regalplatz R27                    │
│                                                 │
│  ▢ äußerlich beschädigt   Pakete: [ 2 ]         │
│                                                 │
│            [  Einlagern & weiter  ]             │
└───────────────────────────────────────────────┘
```
- Scan resolves an `awaiting_storage` case; unknown/already-stored barcode → clear error.
- Class buttons prefill from the scanned Lagerplatz prefix; mismatch warns.
- Lagerplatz validated against the active Location master.
- Damage → opens an issue + holds the case out of the pool.
- Confirm → `ready`, audit event, drops from the "offen" queue. Queue counter top-right.

### 5.2 ProHandel sync / ingestion monitor (NEW — teamlead/admin)
```
┌──────────────────────────────────────────────┐
│  ProHandel-Sync                  [ Jetzt pullen ]│
│  Letzter Pull: 12:48 · seit Cursor: 7 neu      │
│  Status: ● aktiv   Intervall: 3 min            │
├──────────────────────────────────────────────┤
│  ⚠ Quarantäne (2)                              │
│   WE-…139  Mapping-Fehler: WGR fehlt   [Retry] │
│   WE-…140  Lieferant unbekannt         [Retry] │
└──────────────────────────────────────────────┘
```
Shows cursor/last-pull/new-count, quarantined bookings with reason + retry, manual pull.

### 5.3 Originaldokumente preview (FIX existing dead links)
Once ingestion stores PDF references (ProHandel/Docuware/object store), wire the currently-
disabled "Originaldokumente" links in BelegDetail to the real archived Lieferschein /
Arbeitsanweisung / Wareneingangsbeleg.

### 5.4 New fields in existing screens
- **BelegDetailPage:** add Label/Marke + Etikettentyp to the Position/Aufwand tabs; sustainability/
  online badges; Lieferdatum von–bis in the Kopf tab; storage origin (where + when einlagert).
- **Employee PositionScreen:** show Etikettentyp (so the worker prints the right label) +
  sustainability/online handling hints.

### 5.5 Verladung / Auslieferungszone (NEW — closes the back of the flow)
Teamlead dispatch board: boxes staged in the Auslieferungszone grouped by Verladetag/branch;
mark transporter loaded/departed → closes the loop the IST ends on (evening transporter to branch).

### 5.6 Schütte self-pull (PRODUCT DECISION — optional)
The IST lets workers self-pull X belege "from the top of the Schütte." Our model auto-pushes
bundles. If desired, an employee "Nächste Belege holen" screen could pull N ready/unassigned
cases on demand, coexisting with the Automatik. Needs an explicit decision — it changes the
operating model.

## 6. Priority

1. **WE-Einlagerung station + `awaiting_storage` state** — without it the software cannot know
   where goods are; it's the linchpin and a brand-new screen/role.
2. **ProHandel ingestion port + field mapping** (Label, Etikettentyp-RULE, sustainability/online/
   vkLabelPrice) — replaces the seed/parser with real structured data.
3. Sync monitor; Originaldokumente wiring.
4. Verladung dispatch; Schütte self-pull (decision-gated).

## 7. Open questions
- ProHandel API: auth, goods-receipt/positions endpoints, webhook vs poll, which L&T attributes
  are standard vs custom fields, write-back need (ZST/Lagerplatz back to ProHandel?).
- Lagerplatz: capture in our system only, or also write back to ProHandel?
- Einlagerung device: fixed station vs handheld scanner (affects layout/scan UX).
- Verladekonzept calendar: where does the shop-area → Verladetag mapping live (ProHandel vs our rules)?
