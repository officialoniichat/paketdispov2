# 05 — Strukturierte Verladeplan-Tabelle

**Auftrag:** Strukturierte Verladeplan-Tabelle.
**Anker:** Anhang B.1 (`LoadPlanRule`-Beispiel), 8.1 (Prioritätsklasse 5 „Verladeplan-Ware heute"), H.2 (Verladeplan liegt als Bild/Beispiel vor, nicht als gepflegter Datenstamm), H.3 (Mindest-Datenpaket „Verladeplan").

> **H.4-Hinweis:** Die im Konzept erwähnte Verladetage-Tabelle (ab 12.08.2024) liegt laut H.2 **als Bild/Beispiel** vor, **nicht** als gepflegter Datenstamm. Ausnahmen, Feiertage, Gültigkeitsdatum und Pflegeverantwortung sind **nicht verifiziert**. Dieses Dokument liefert das **Zielschema** + Pflegeprozess; konkrete Regelzeilen sind ⬜, bis der strukturierte Datenstamm geliefert ist. Die einzige belegte Zeile ist das **B.1-Beispiel** und als solches markiert.

---

## 1. Zielschema (`LoadPlanRule`, [B.1])

```ts
interface LoadPlanRule {
  id: string;
  branchNo: string;
  shopAreaNo: string;       // Shopbereich
  floor: string;           // z. B. "EG"
  weekday: "monday"|"tuesday"|"wednesday"|"thursday"|"friday"|"saturday"|"sunday";
  validFrom: ISODate;       // YYYY-MM-DD
  validTo: ISODate | null;  // null = unbefristet
  active: boolean;
}
```

**Fachregel ([8.1] Rang 5):** Abschnitt 1 (Vororder), 2 (Nachorder), 3 (Sonderposten) werden am **Verladetag des Shopbereichs/der Etage** priorisiert. → `GoodsReceiptCase.loadPlanDate` wird aus der passenden `LoadPlanRule` abgeleitet ([01] A.1).

---

## 2. Belegte Beispielzeile (aus [B.1])

> Einzige durch das Konzept belegte Regel. ✅ BELEGT, dient als Formatreferenz — **nicht** als vollständiger Datenstamm.

| id | branchNo | shopAreaNo | floor | weekday | validFrom | validTo | active |
|----|----------|-----------|-------|---------|-----------|---------|--------|
| `loadplan-21-eg-thursday` | 1 | 21 | EG | thursday | 2024-08-12 | null | true |

---

## 3. Datenstamm-Vorlage (LEER — zu befüllen, H.4)

> Je Kombination Shopbereich × Etage × Wochentag eine Zeile. Werte ⬜, bis FB-LOG den realen Verladeplan strukturiert liefert (H.3).

| id | branchNo | shopAreaNo | floor | weekday | validFrom | validTo | active |
|----|----------|-----------|-------|---------|-----------|---------|--------|
| ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

**Datei-Vorschlag (⚠️):** `docs/discovery/samples/loadplan.csv`.

---

## 4. Ausnahmen / Feiertage (nicht im Konzept — ⬜)

> H.2 nennt Ausnahmen + Feiertage explizit als **nicht verifiziert**. Vorschlag für ein Ausnahmeschema, im Kickoff zu bestätigen (⚠️):

```ts
interface LoadPlanException {
  date: ISODate;            // betroffener Tag
  scope: "all" | { shopAreaNo: string; floor?: string };
  effect: "no_loading" | "shifted_to";
  shiftedToDate?: ISODate;  // bei effect=shifted_to
  reason: string;           // z. B. Feiertag
}
```

| date | scope | effect | shiftedToDate | reason |
|------|-------|--------|---------------|--------|
| ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

---

## 5. Pflegeprozess (offen → [06])

| Frage | Bezug | Status |
|-------|-------|--------|
| Wer pflegt den Verladeplan (Pflegeverantwortung)? | H.2/H.3 | ❓ |
| Gültigkeitsdatum/Versionierung (`validFrom`/`validTo`) | H.2 | ❓ |
| Behandlung Feiertage/Ausnahmen | H.2 | ❓ → Abschn. 4 |
| Quelle des realen Plans (Bild vs. Datenstamm) | H.2 | ⬜ strukturierte Tabelle liefern |
| Änderungstakt + Wer ändert in der App/Admin-UI | 11.1 Regelpflege | ❓ |

---

## Owner & Abnahme (H.5)

| Punkt | Owner (Vorschlag) | Zielartefakt | Abnahme |
|-------|-------------------|--------------|---------|
| Strukturierter Verladeplan-Datenstamm | FB-LOG | `loadplan.csv` (alle aktiven Regeln) | P0-W2 |
| Ausnahmen/Feiertagsliste | FB-LOG | `LoadPlanException`-Tabelle | P0-W3 |
| Pflegeverantwortung + Änderungsprozess | FB-LOG + PL | dokumentierter Pflegeprozess | P0-W2 |

**Abnahmekriterium (H.5):** Verladeplan gilt erst als abgenommen, wenn ein **gepflegter strukturierter Datenstamm** (nicht Bild) mit `validFrom`/Pflegeverantwortung vorliegt und die Ableitung `loadPlanDate` an ≥1 echtem Beleg ([02]) geprüft wurde.
