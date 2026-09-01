import { describe, expect, it } from 'vitest';
import {
  exampleAggregate,
  participant,
  withCollaboration,
  withConfirmedPositions,
  withSkuCount,
} from '../test/exampleAggregate.js';
import type { CaseAggregate } from '../domain/types.js';
import {
  activeParticipants,
  addProblem,
  allQuantitiesChecked,
  canCompleteCase,
  checkedPositionNos,
  hasAnyProblem,
  initialProgress,
  isSharedCase,
  istMenge,
  myParticipation,
  otherActiveParticipants,
  requiresQuantityCheck,
  scanMatches,
  skuQuantitiesBody,
  totalConfirmedQuantity,
  teileFortschritt,
} from './workflowModel.js';

const agg = exampleAggregate;
const p0 = initialProgress(agg);
const ICH = { employeeNo: 'ma-9', displayName: 'Hakan Yilmaz' };

/** Fixture-Variante, in der JEDE Position geprüft ist. */
function checkAll(aggregate: CaseAggregate = agg): CaseAggregate {
  return withConfirmedPositions(
    aggregate,
    ICH,
    aggregate.positions.map((pos) => pos.id),
  );
}

describe('initialProgress', () => {
  it('starts with nothing collected locally', () => {
    expect(p0).toEqual({ caseId: agg.caseId, problems: [] });
  });
});

describe('allQuantitiesChecked (Wahrheit ist das Aggregat, nicht der Client)', () => {
  it('ist falsch, solange eine Position keinen Prüfer trägt', () => {
    expect(allQuantitiesChecked(agg)).toBe(false);
    const teilweise = withConfirmedPositions(agg, ICH, ['pos-3656860-1']);
    expect(allQuantitiesChecked(teilweise)).toBe(false);
  });

  it('ist wahr, sobald jede Position einen Prüfer trägt — egal welchen', () => {
    expect(allQuantitiesChecked(checkAll())).toBe(true);
  });
});

describe('istMenge / totalConfirmedQuantity (was als ZST gebucht wird)', () => {
  it('sums every Größe at Soll when nothing was counted', () => {
    // 5 skuLines across the fixture's 3 positions, each expectedQuantity 1.
    expect(totalConfirmedQuantity(agg)).toBe(5);
  });

  it('reflects a recorded Mindermenge instead of silently booking the Soll total', () => {
    expect(totalConfirmedQuantity(withSkuCount(agg, 'sku-3656860-1-1', 0))).toBe(4);
  });

  it('reflects a recorded Mehrmenge (can exceed the Soll total)', () => {
    expect(totalConfirmedQuantity(withSkuCount(agg, 'sku-3656860-1-1', 3))).toBe(7);
    expect(istMenge(withSkuCount(agg, 'sku-3656860-1-1', 3).positions[0]!.skuLines[0]!)).toBe(3);
  });
});

describe('minimum-quantity guardrail', () => {
  it('always requires the position check, even for quantity_only ("Prüfung = Nein")', () => {
    expect(agg.workInstruction.goodsReceiptCheckMode).toBe('quantity_only');
    expect(requiresQuantityCheck(agg.workInstruction)).toBe(true);
  });
});

describe('hasAnyProblem', () => {
  it('erkennt eine Mengenabweichung des Aggregats', () => {
    expect(hasAnyProblem(p0, agg)).toBe(false);
    expect(hasAnyProblem(p0, withSkuCount(agg, 'sku-3656860-2-1', 2))).toBe(true);
  });

  it('erkennt eine Preiskorrektur des Aggregats', () => {
    expect(hasAnyProblem(p0, withSkuCount(agg, 'sku-3656860-2-1', undefined, 19.99))).toBe(true);
  });

  it('erkennt ein lokal gesammeltes manuelles Problem', () => {
    const withManual = addProblem(p0, {
      id: 'local-1',
      positionId: 'pos-3656860-1',
      reasonId: 'reason-1',
      reasonLabel: 'Ware beschädigt',
    });
    expect(hasAnyProblem(withManual, agg)).toBe(true);
  });
});

describe('canCompleteCase', () => {
  it('blocks while a position check is open', () => {
    const gate = canCompleteCase(p0, agg);
    expect(gate.ok).toBe(false);
    expect(gate.reasons.some((r) => r.includes('Positionen'))).toBe(true);
  });

  it('blocks while a deviation/problem is recorded (Teilabschluss statt Beleg erledigt)', () => {
    const gate = canCompleteCase(p0, withSkuCount(checkAll(), 'sku-3656860-1-1', 2));
    expect(gate.ok).toBe(false);
    expect(gate.reasons.some((r) => r.includes('Teilabschluss'))).toBe(true);
  });

  it('passes once every position is checked and no problem exists (printing/boxing never gate — C4)', () => {
    expect(canCompleteCase(p0, checkAll()).ok).toBe(true);
  });
});

describe('skuQuantitiesBody (nur SELBST berührte Zeilen, Konzept §7)', () => {
  it('sendet nichts, solange ich keine Zeile angefasst habe — auch bei fremder Abweichung', () => {
    expect(skuQuantitiesBody(agg, new Map())).toEqual([]);
    expect(skuQuantitiesBody(withSkuCount(agg, 'sku-3656860-3-2', 0), new Map())).toEqual([]);
  });

  it('sendet meine Zeile mit MEINEM zuletzt getippten Wert — nicht mit dem Cache-Stand', () => {
    // Das Aggregat zeigt (nach einem Refetch) noch die alte 2 — gesendet wird
    // trotzdem meine Sitzungs-Eingabe 0.
    const veraltet = withSkuCount(agg, 'sku-3656860-3-2', 2);
    expect(
      skuQuantitiesBody(veraltet, new Map([['sku-3656860-3-2', { confirmedQuantity: 0 }]])),
    ).toEqual([{ skuLineId: 'sku-3656860-3-2', confirmedQuantity: 0 }]);
  });

  it('sendet eine Preiskorrektur mit — auch ohne Mengenabweichung', () => {
    expect(
      skuQuantitiesBody(agg, new Map([['sku-3656860-2-1', { correctedVkPrice: 19.99 }]])),
    ).toEqual([{ skuLineId: 'sku-3656860-2-1', confirmedQuantity: 1, correctedVkPrice: 19.99 }]);
  });

  it('ergänzt meine Mengen-Eingabe um die am Aggregat stehende Preiskorrektur der Zeile', () => {
    const mitPreis = withSkuCount(agg, 'sku-3656860-2-1', undefined, 19.99);
    expect(
      skuQuantitiesBody(mitPreis, new Map([['sku-3656860-2-1', { confirmedQuantity: 3 }]])),
    ).toEqual([{ skuLineId: 'sku-3656860-2-1', confirmedQuantity: 3, correctedVkPrice: 19.99 }]);
  });

  it('lässt FREMDE Abweichungen weg — der Abschluss darf den frischeren Zähl-Stand anderer Beteiligter nicht überschreiben', () => {
    // Zeile 3-2 trägt die Zählung eines ANDEREN (steht nur im geteilten
    // Aggregat, nicht in meinen Eingaben): sie bleibt draußen, der Server behält
    // den persistierten Stand. Nur meine eigene Zeile 1-1 geht in den Body.
    const fremd = withSkuCount(agg, 'sku-3656860-3-2', 0);
    expect(
      skuQuantitiesBody(fremd, new Map([['sku-3656860-1-1', { confirmedQuantity: 3 }]])),
    ).toEqual([{ skuLineId: 'sku-3656860-1-1', confirmedQuantity: 3 }]);
  });

  it('lässt eine selbst zurückgesetzte Zeile weg — auch wenn der veraltete Cache noch die alte Zählung zeigt', () => {
    // Zurückgesetzt (null) heißt unangetastet senden: der per Zähl-Endpunkt
    // persistierte Reset bleibt die Wahrheit, die alte 2 im Cache zählt nicht.
    const veraltet = withSkuCount(agg, 'sku-3656860-1-1', 2);
    expect(
      skuQuantitiesBody(veraltet, new Map([['sku-3656860-1-1', { confirmedQuantity: null }]])),
    ).toEqual([]);
  });
});

describe('geteilter Beleg (Beteiligte)', () => {
  const inhaber = participant({
    employeeNo: 'ma-9',
    displayName: 'Hakan Yilmaz',
    role: 'inhaber',
    confirmedPositionCount: 2,
  });
  const helferin = participant({ employeeNo: 'ma-1', displayName: 'Anna Berger' });
  const abgelehnt = participant({
    employeeNo: 'ma-4',
    displayName: 'Lena Sommer',
    status: 'abgelehnt',
  });
  const geteilt = withCollaboration(agg, [inhaber, helferin, abgelehnt], 2);

  it('zählt nur angenommen/teil_erledigt als aktiv', () => {
    expect(activeParticipants(geteilt).map((p) => p.employeeNo)).toEqual(['ma-9', 'ma-1']);
  });

  it('lässt mich selbst aus der Team-Ansicht heraus', () => {
    expect(otherActiveParticipants(geteilt, 'ma-9').map((p) => p.employeeNo)).toEqual(['ma-1']);
  });

  it('ist erst geteilt, wenn ein ANDERER aktiv beteiligt ist', () => {
    expect(isSharedCase(agg, 'ma-9')).toBe(false);
    expect(isSharedCase(withCollaboration(agg, [inhaber, abgelehnt]), 'ma-9')).toBe(false);
    expect(isSharedCase(geteilt, 'ma-9')).toBe(true);
  });

  it('findet die eigene Beteiligungs-Zeile (auch als Helfer)', () => {
    expect(myParticipation(geteilt, 'ma-1')?.role).toBe('helfer');
    expect(myParticipation(geteilt, 'ma-99')).toBeUndefined();
    expect(myParticipation(geteilt, undefined)).toBeUndefined();
  });

  it('listet die geprüften Positionsnummern je Beteiligtem aufsteigend', () => {
    const gearbeitet = withConfirmedPositions(
      geteilt,
      { employeeNo: 'ma-1', displayName: 'Anna Berger' },
      ['pos-3656860-3', 'pos-3656860-1'],
    );
    expect(checkedPositionNos(gearbeitet, 'ma-1')).toEqual([1, 3]);
    expect(checkedPositionNos(gearbeitet, 'ma-9')).toEqual([]);
  });

  it('misst den Gesamtfortschritt in TEILEN, nicht in Positionen', () => {
    // Beispiel-Beleg: Pos 1 = 1 Teil, Pos 2 = 1 Teil, Pos 3 = 3 Teile (Σ 5).
    expect(teileFortschritt(agg)).toEqual({ erledigt: 0, gesamt: 5 });
    // Eine geprüfte Position mit 3 Teilen wiegt schwerer als 2 von 3 Positionen.
    const grosse = withConfirmedPositions(agg, ICH, ['pos-3656860-3']);
    expect(teileFortschritt(grosse)).toEqual({ erledigt: 3, gesamt: 5 });
    // Gezählt wird der BELEG, nicht die Person: fremde Haken zählen mit.
    const gemischt = withConfirmedPositions(
      withConfirmedPositions(agg, ICH, ['pos-3656860-1']),
      { employeeNo: 'ma-1', displayName: 'Anna Berger' },
      ['pos-3656860-3'],
    );
    expect(teileFortschritt(gemischt)).toEqual({ erledigt: 4, gesamt: 5 });
  });
});

describe('scanMatches (optional collect scan)', () => {
  it('matches ignoring case/whitespace', () => {
    expect(scanMatches(' r27 ', 'R27')).toBe(true);
  });
  it('rejects a different code', () => {
    expect(scanMatches('R28', 'R27')).toBe(false);
  });
});
