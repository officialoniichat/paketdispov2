import { describe, expect, it } from 'vitest';
import { encodeCode128 } from './code128.js';

describe('encodeCode128', () => {
  it('encodes even-length digits in Code C (Start C, pairs, checksum, stop)', () => {
    // checksum: (105 + 12·1 + 34·2) mod 103 = 185 mod 103 = 82
    expect(encodeCode128('1234').codes).toEqual([105, 12, 34, 82, 106]);
  });

  it('encodes text (and odd-length digits) in Code B', () => {
    // 'A'→33, 'B'→34; checksum: (104 + 33·1 + 34·2) mod 103 = 205 mod 103 = 102
    expect(encodeCode128('AB').codes).toEqual([104, 33, 34, 102, 106]);
    // odd digit count cannot pair up in Code C
    expect(encodeCode128('12345').codes[0]).toBe(104);
  });

  it('emits 11 modules per symbol plus the 13-module stop', () => {
    const { codes, totalModules, widths } = encodeCode128('WE-4711');
    expect(totalModules).toBe((codes.length - 1) * 11 + 13);
    // bars/spaces alternate starting AND ending with a bar (odd count)
    expect(widths.length % 2).toBe(1);
  });

  it('rejects empty and non-ASCII input', () => {
    expect(() => encodeCode128('')).toThrow();
    expect(() => encodeCode128('WE-Ä1')).toThrow();
  });
});
