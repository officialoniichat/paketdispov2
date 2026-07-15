/**
 * Pure Code-128 encoder (Kundenfeedback 2026-07-14, Punkt 3): die WE-Beleg-Nr wird
 * inline als Barcode angezeigt, damit Etiketten per Scanner angefordert werden
 * können — explizit Code 128, KEIN QR. Bewusst eine kleine eigene Implementierung
 * (Symbol-Tabelle + Prüfziffer) statt eines Canvas-/Barcode-Stacks; das SVG-Rendering
 * übernimmt `components/Code128Barcode.tsx`.
 *
 * Rein numerische Werte gerader Länge nutzen Code C (halbe Symbolzahl), alles
 * andere Code B (ASCII 32–127). Zeichen außerhalb von Code B werfen.
 */

/** Widths (bar/space runs, 11 modules each) for symbol values 0–105 + stop (106). */
const PATTERNS: readonly string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232', '2331112',
];

const START_B = 104;
const START_C = 105;
const STOP = 106;

export interface Code128Encoding {
  /** Symbol values: start code, data, checksum, stop — useful for tests. */
  codes: number[];
  /** Alternating bar/space run widths in modules, starting with a bar. */
  widths: number[];
  /** Total width in modules (sum of `widths`). */
  totalModules: number;
}

function dataCodesFor(value: string): { start: number; data: number[] } {
  if (/^\d+$/.test(value) && value.length % 2 === 0) {
    const data: number[] = [];
    for (let i = 0; i < value.length; i += 2) {
      data.push(Number(value.slice(i, i + 2)));
    }
    return { start: START_C, data };
  }
  const data = [...value].map((ch) => {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) {
      throw new Error(`Code 128 (Set B): unsupported character ${JSON.stringify(ch)}`);
    }
    return code - 32;
  });
  return { start: START_B, data };
}

/** Encode `value` as a Code-128 symbol sequence (start + data + checksum + stop). */
export function encodeCode128(value: string): Code128Encoding {
  if (value.length === 0) throw new Error('Code 128: empty value');
  const { start, data } = dataCodesFor(value);
  const checksum = data.reduce((sum, code, i) => sum + code * (i + 1), start) % 103;
  const codes = [start, ...data, checksum, STOP];
  const widths = codes.flatMap((code) => [...PATTERNS[code]!].map(Number));
  return { codes, widths, totalModules: widths.reduce((a, b) => a + b, 0) };
}
