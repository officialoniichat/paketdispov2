/**
 * Lieferungs-Zeilen der Belege-Verwaltung (D2).
 *
 * Eine Lieferung ist erst vollständig, wenn alle N Belege aus „Lieferschein X von N"
 * gebucht sind. Bis dahin zeigt die Liste die Lieferung VOLLSTÄNDIG: die bereits
 * gebuchten Belege als echte Zeilen und die noch fehlenden als Platzhalter. Sonst
 * müsste man aus „2 von 4" im Kopf ableiten, dass zwei Belege gar nicht dastehen.
 *
 * Die Platzhalter sind reine Anzeige — es gibt zu ihnen keinen Datensatz, nur die
 * vom Server gemeldete Lücke (`missingCount`). Sie tragen deshalb keine Id und sind
 * weder anklickbar noch zuweisbar.
 */
import type { BelegRow } from '../../data/belege.js';
import type { DeliveryGroupRef } from '../../data/types.js';

/**
 * Eine Zeile der Belege-Tabelle: entweder ein echter Beleg (`ausstehend: false`)
 * oder der Platzhalter für einen noch nicht gebuchten Beleg seiner Lieferung.
 */
export type BelegListRow = BelegRow & { readonly ausstehend: boolean };

/** Neutrale Werte für alles, was ein noch nicht gebuchter Beleg naturgemäß nicht hat. */
function platzhalter(group: DeliveryGroupRef, laufNr: number): BelegListRow {
  return {
    ausstehend: true,
    // Synthetische, stabile Id: die Tabelle braucht einen Zeilen-Schlüssel, und
    // `ausstehend` verhindert überall, dass sie je als Beleg-Id benutzt wird.
    id: `ausstehend:${group.id}:${laufNr}`,
    weBelegNo: '—',
    // Der Status kommt in der Spalte aus `ausstehend`; dieser Wert wird nie gezeigt.
    status: 'ready',
    section: null,
    goodsType: '—',
    quantity: 0,
    effortPoints: 0,
    minutes: 0,
    storageCode: '—',
    assignedTo: '–',
    priorityFlags: [],
    branchNo: '—',
    shopNos: [],
    labelsRequired: false,
    isMonster: false,
    parentCaseId: null,
    partNo: null,
    partCount: 0,
    bookingDate: '',
    completedAt: null,
    docuWareUrl: null,
    attentionFlag: false,
    attentionNote: null,
    missingFields: [],
    bereich: null,
    deliveryGroup: group,
    deliveryPoolHold: false,
    bundleQueue: null,
    forwardedTo: null,
    issues: [],
  };
}

/**
 * Ergänzt die Server-Seite um die Platzhalter der noch ausstehenden Belege. Sie
 * hängen direkt hinter dem LETZTEN sichtbaren Mitglied ihrer Lieferung, damit die
 * Lieferung als geschlossener Block dasteht — Kennfarbe, Kante und Reihenfolge
 * bleiben so, wie der Server sie geliefert hat.
 *
 * Eine Lieferung, von der auf dieser Seite kein Mitglied sichtbar ist (Filter,
 * Paginierung), bekommt auch keine Platzhalter: die Lücke gehört zum Block, nicht
 * an eine beliebige Stelle der Tabelle.
 */
export function mitAusstehendenBelegen(rows: readonly BelegRow[]): BelegListRow[] {
  const letzteZeileJeGruppe = new Map<string, number>();
  rows.forEach((r, i) => {
    if (r.deliveryGroup && r.deliveryGroup.missingCount > 0) {
      letzteZeileJeGruppe.set(r.deliveryGroup.id, i);
    }
  });

  const out: BelegListRow[] = [];
  rows.forEach((r, i) => {
    out.push({ ...r, ausstehend: false });
    const group = r.deliveryGroup;
    if (!group || group.missingCount <= 0) return;
    if (letzteZeileJeGruppe.get(group.id) !== i) return;
    for (let n = 1; n <= group.missingCount; n++) out.push(platzhalter(group, n));
  });
  return out;
}
