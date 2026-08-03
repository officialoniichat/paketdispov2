import { describe, expect, it } from 'vitest';
import {
  LABEL_PRINT_VARIANT_ORDER,
  labelPrintRequired,
  labelPrintVariantText,
  printedPriceCheckRequired,
  summarizeLabelPrintVariants,
} from './label-print.js';

describe('Etikett-Druckvariante (Kundenfeedback L&T 03.08.2026)', () => {
  it('zählt Digi-Tag-Ware als „Etikett wird gedruckt" — sie läuft ebenfalls über den Drucker', () => {
    expect(labelPrintRequired('etikett_mit_preis')).toBe(true);
    expect(labelPrintRequired('digitag_etikett_ohne_preis')).toBe(true);
    expect(labelPrintRequired('kein_etikett')).toBe(false);
  });

  it('verlangt eine Preisprüfung NUR beim klassischen Etikett — sonst steht kein Preis drauf', () => {
    expect(printedPriceCheckRequired('etikett_mit_preis')).toBe(true);
    expect(printedPriceCheckRequired('digitag_etikett_ohne_preis')).toBe(false);
    expect(printedPriceCheckRequired('kein_etikett')).toBe(false);
  });

  it('fasst nur die tatsächlich vorkommenden Varianten zusammen, in fester Reihenfolge', () => {
    expect(summarizeLabelPrintVariants(['digitag_etikett_ohne_preis'])).toEqual([
      'digitag_etikett_ohne_preis',
    ]);
    expect(
      summarizeLabelPrintVariants([
        'kein_etikett',
        'digitag_etikett_ohne_preis',
        'etikett_mit_preis',
        'digitag_etikett_ohne_preis',
      ]),
    ).toEqual(LABEL_PRINT_VARIANT_ORDER);
    expect(summarizeLabelPrintVariants([])).toEqual([]);
  });

  it('beschriftet jede Variante mit Piktogramm', () => {
    expect(labelPrintVariantText('digitag_etikett_ohne_preis')).toBe(
      '📟 DigiTag · Etikett ohne Preis',
    );
    expect(labelPrintVariantText('etikett_mit_preis')).toBe('🏷️ Etikett mit Preis');
  });
});
