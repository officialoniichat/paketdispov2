/**
 * `transitionErrorMessage` übersetzt abgelehnte Übergangs-POSTs in verständliche
 * deutsche Meldungen — insbesondere den Railway-Fall „Illegal case transition:
 * completed → in_progress" (fertiger Beleg erneut gestartet), der vorher als
 * roher JSON-Dump in der UI landete.
 */
import { describe, expect, it } from 'vitest';
import { transitionErrorMessage } from './persist.js';

describe('transitionErrorMessage', () => {
  it('übersetzt den Illegal-Transition-Fehler eines fertigen Belegs (completed)', () => {
    const msg = transitionErrorMessage('Start', {
      message: 'Illegal case transition: completed → in_progress',
      error: 'Bad Request',
      statusCode: 400,
    });
    expect(msg).toBe('Start nicht möglich – der Beleg ist bereits abgeschlossen.');
  });

  it('übersetzt den Illegal-Transition-Fehler eines exportierten Belegs (zst_done)', () => {
    const msg = transitionErrorMessage('Abschluss', {
      message: 'Illegal case transition: zst_done → completed',
      error: 'Bad Request',
      statusCode: 400,
    });
    expect(msg).toBe('Abschluss nicht möglich – der Beleg ist bereits abgeschlossen.');
  });

  it('nennt bei anderen illegalen Übergängen den zwischenzeitlich geänderten Status', () => {
    const msg = transitionErrorMessage('Start', {
      message: 'Illegal case transition: parked → in_progress',
      error: 'Bad Request',
      statusCode: 400,
    });
    expect(msg).toBe(
      'Start nicht möglich – der Beleg wurde zwischenzeitlich geändert (Status „parked").',
    );
  });

  it('reicht deutsche Backend-Meldungen (BadRequest) unverändert durch', () => {
    const msg = transitionErrorMessage('Abschluss', {
      message: 'Beleg hat Mengen-/Preisabweichungen – Teilabschluss verwenden',
      error: 'Bad Request',
      statusCode: 400,
    });
    expect(msg).toBe(
      'Abschluss fehlgeschlagen: Beleg hat Mengen-/Preisabweichungen – Teilabschluss verwenden',
    );
  });

  it('verbindet class-validator-Meldungslisten zu einer Zeile', () => {
    const msg = transitionErrorMessage('Teilabschluss', {
      message: ['skuQuantities must be an array', 'problems must be an array'],
      error: 'Bad Request',
      statusCode: 400,
    });
    expect(msg).toBe(
      'Teilabschluss fehlgeschlagen: skuQuantities must be an array · problems must be an array',
    );
  });

  it('fällt ohne lesbaren Fehler-Body auf den generischen Retry-Hinweis zurück', () => {
    expect(transitionErrorMessage('Start', undefined)).toBe(
      'Start fehlgeschlagen – bitte erneut versuchen.',
    );
    expect(transitionErrorMessage('Start', {})).toBe(
      'Start fehlgeschlagen – bitte erneut versuchen.',
    );
  });
});
