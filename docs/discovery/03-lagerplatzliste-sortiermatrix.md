# 03 — Lagerplatzliste & manuelle Sortiermatrix

**Auftrag:** Lagerplatzliste (Regal 1–40, Palette A/B/C/E, D 1–9, Hängebahn 1–7/Nr.) + manuelle Sortiermatrix.
**Anker:** 11.2 (Lagerplatzmodell), D.8 (MVP-Entscheidung Abholreihenfolge), H.3 (Mindest-Datenpaket „Lagerplatzliste"), H.1/H.4 (keine Routeoptimierung — nur Abholreihenfolge).

> **Belegrahmen (H.1/H.4):** MVP nutzt **keinen** Routing-Graph und **keine** Meterpläne. Nur ein einfacher `LocationMaster` (Codes + optionale manuelle Sortierreihenfolge je Arbeitsplatz). Die Code-**Bereiche** unten sind aus H.3 belegt; die Attribute `active`, `barcode`, `sequenceIndex`, `zone` sind ⬜ und müssen gegen die reale Lagerrealität gepflegt werden.

---

## 1. Code-Format (`StorageLocation`, [11.2])

```ts
interface StorageLocation {
  id: string;
  type: "regal" | "palette" | "haengebahn" | "lagerplatz_d" | "workstation" | "printer" | "conveyor";
  code: string;          // z. B. "Regal 27", "Palette B/4", "Hängebahn 5/234"
  zone?: string;
  sequenceIndex?: number; // Näherung für Abholreihenfolge
  barcode?: string;
  active: boolean;
}
```

Code-Beispiele aus [11.2]: `Regal 27`, `Palette B/4`, `Hängebahn 5/234`. ✅ BELEGT (Format), Werte je Platz ⬜.

---

## 2. Lagerplatzliste — Skelett (Bereiche aus H.3 ✅, Attribute ⬜)

> Die folgenden Zeilen bilden die **bekannten Code-Bereiche** ab. `active`/`barcode`/`zone`/`sequenceIndex` sind **nicht** belegt und dürfen nicht geraten werden (H.4) — sie sind durch FB-LOG zu befüllen.

### 2.1 Regallager (`type=regal`, Codes 1–40)

| code | type | zone | sequenceIndex | barcode | active |
|------|------|------|---------------|---------|--------|
| Regal 1 | regal | ⬜ | ⬜ | ⬜ | ⬜ |
| Regal 2 | regal | ⬜ | ⬜ | ⬜ | ⬜ |
| … | regal | ⬜ | ⬜ | ⬜ | ⬜ |
| Regal 27 | regal | ⬜ | ⬜ | ⬜ | ⬜ |
| … | regal | ⬜ | ⬜ | ⬜ | ⬜ |
| Regal 40 | regal | ⬜ | ⬜ | ⬜ | ⬜ |

*(Vollständig Regal 1…40 anzulegen; hier zur Lesbarkeit gekürzt. „Regal 27" als Beispiel aus [G.1].)*

### 2.2 Paletten (`type=palette`, Bereiche A / B / C / E)

> H.3 nennt „Paletten A/B/C/E". **Hinweis (⚠️):** Buchstabe **D** ist als eigener Bereich „D 1–9" gelistet (Abschn. 2.3), daher in der Palettenreihe **nicht** enthalten. Die Anzahl Stellplätze je Buchstabe (z. B. `Palette B/4`) ist **nicht** belegt → ⬜.

| code-Muster | type | Anzahl Stellplätze | active |
|-------------|------|--------------------|--------|
| Palette A/{n} | palette | ⬜ (n=?) | ⬜ |
| Palette B/{n} | palette | ⬜ | ⬜ |
| Palette C/{n} | palette | ⬜ | ⬜ |
| Palette E/{n} | palette | ⬜ | ⬜ |

### 2.3 Lagerplatz D (`type=lagerplatz_d`, Codes D 1–9)

| code | type | active |
|------|------|--------|
| D 1 … D 9 | lagerplatz_d | ⬜ |

### 2.4 Hängebahn (`type=haengebahn`, Format `1–7 / Nummer`)

> Format aus H.3: „Hängebahnformat 1–7/Nummer" (Bahn 1–7, dann laufende Nummer, vgl. `Hängebahn 5/234` in [11.2]). Der Nummernbereich je Bahn ist ⬜.

| code-Muster | type | Bahn | Nummernbereich | active |
|-------------|------|------|----------------|--------|
| Hängebahn {1–7}/{nr} | haengebahn | 1–7 | ⬜ | ⬜ |

### 2.5 Funktionsorte (für Abholreihenfolge/Flow nötig, ⬜)

| code | type | Beleg |
|------|------|-------|
| Arbeitsplatz {…} | workstation | D.7-5: Arbeitsplatzstandorte als Startpunkte ⬜ |
| Druckstation {…} | printer | [G.2]/13.4: Druckschritt vor Bearbeitung ⬜ |
| Förderband {…} | conveyor | [4.x]/Boxabschluss ⬜ |

---

## 3. Manuelle Sortiermatrix (Abholreihenfolge, [D.8] MVP-1)

> MVP-1 laut D.8: **manuelle Sortierreihenfolge je Arbeitsplatz/Zone** — keine Distanzmatrix. Die Reihenfolge ist für Mitarbeitende verbindlich, beeinflusst aber **nicht** die (faire) Belegzuteilung (H.1/8.4).

### 3.1 Schema

```ts
interface PickupSortProfile {
  workstationCode: string;        // Startpunkt
  orderedLocationCodes: string[]; // verbindliche Reihenfolge der Lagerplätze
  // alternativ grobe Zonenreihenfolge:
  zoneOrder?: string[];
  validFrom: string;              // ISODate YYYY-MM-DD
  maintainedBy: string;           // FB-LOG
}
```

### 3.2 Matrix-Vorlage (LEER, ⬜)

| workstationCode | zoneOrder (grob) | orderedLocationCodes (fein, optional) | validFrom | maintainedBy |
|-----------------|------------------|---------------------------------------|-----------|--------------|
| ⬜ AP-1 | ⬜ z. B. [Regal, Palette, D, Hängebahn] | ⬜ | ⬜ | FB-LOG |
| ⬜ AP-2 | ⬜ | ⬜ | ⬜ | FB-LOG |

> **Fallback-Regel (⚠️ ANNAHME, D.8/H.2):** Solange keine Sortiermatrix gepflegt ist, gilt eine **numerische/typbasierte** Reihenfolge (z. B. „1, 30, 40" wie in H.2 angedeutet). Ob der numerische Fallback im Pilot ausreicht, ist **nicht** verifiziert (D.7-6) → im Pilot messen.

---

## 4. Offene Punkte (→ [06])

| Punkt | Bezug | Status |
|-------|-------|--------|
| Stellplatzanzahl je Palettenbereich A/B/C/E | Abschn. 2.2 | ⬜ |
| Nummernbereiche Hängebahn 1–7 | Abschn. 2.4 | ⬜ |
| `active`-Pflege aller Codes | Abschn. 2 | ⬜ |
| Arbeitsplatzstandorte als Startpunkte | D.7-5 | ❓ |
| Lagerplätze mit Scancodes / vorhandene Barcodes | D.7-7, H.2 Barcode | ❓ → [06] #5 |
| Reicht numerischer Fallback? | D.7-6 | ❓ Pilotmessung |

---

## Owner & Abnahme (H.5)

| Punkt | Owner (Vorschlag) | Zielartefakt | Abnahme |
|-------|-------------------|--------------|---------|
| Vollständige Lagerplatzliste inkl. `active` | FB-LOG | `locations.csv` (alle gültigen Codes) | P0-W2 |
| Arbeitsplatz-/Zonenliste | FB-LOG | Liste Workstations | P0-W2 |
| Manuelle Sortiermatrix je Arbeitsplatz | FB-LOG | `PickupSortProfile`-Tabelle | P0-W3 |
| Barcode-Verfügbarkeit je Lagerplatz | FB-LOG + IT-AE | Scanprobe ([06] #5) | P0-W2 |

**Abnahmekriterium (H.5):** Liste gilt erst als abgenommen, wenn jeder Code ein gepflegtes `active`-Flag hat und mindestens eine Sortiermatrix (oder die bewusste Entscheidung „numerischer Fallback im Pilot") mit Owner vorliegt.
