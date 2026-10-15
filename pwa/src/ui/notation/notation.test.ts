import { describe, expect, it } from 'vitest';
import { normalizeRomanNumeralDigits, romanNumeralDisplayFromChord, romanNumeralStackSpanAt, tokenizeRomanNumeral } from './roman-numeral';
import { parseScaleDegreeLabel } from './scale-degree-label';

const b = (text: string) => ({ kind: 'BASE' as const, text });
const sup = (text: string) => ({ kind: 'SUPER' as const, text });
const sub = (text: string) => ({ kind: 'SUB' as const, text });
const suffix = (text: string) => ({ kind: 'SUFFIX' as const, text });

describe('native Roman numeral semantic helpers', () => {
  it('keeps applied slashes horizontal and preserves suffix placement', () => {
    expect(tokenizeRomanNumeral('V7/vi(maj)')).toEqual([b('V'), sup('7'), b('/'), b('vi'), suffix('(maj)')]);
    expect(tokenizeRomanNumeral('V7(maj)/ii')).toEqual([b('V'), sup('7'), suffix('(maj)'), b('/'), b('ii')]);
    expect(tokenizeRomanNumeral('vii°7/V')).toEqual([b('vii'), sup('°7'), b('/'), b('V')]);
    expect(tokenizeRomanNumeral('♭II7(∆-sub)/vi')).toEqual([b('♭II'), sup('7'), suffix('(∆-sub)'), b('/'), b('vi')]);
  });
  it('maps inversion digit pairs into super/subscript rows', () => {
    expect(tokenizeRomanNumeral('I64')).toEqual([b('I'), sup('6'), sub('4')]);
    expect(tokenizeRomanNumeral('I46')).toEqual([b('I'), sup('6'), sub('4')]);
    expect(tokenizeRomanNumeral('ii65')).toEqual([b('ii'), sup('6'), sub('5')]);
    expect(tokenizeRomanNumeral('V43')).toEqual([b('V'), sup('4'), sub('3')]);
    expect(tokenizeRomanNumeral('V42')).toEqual([b('V'), sup('4'), sub('2')]);
    expect(tokenizeRomanNumeral('V43/ii')).toEqual([b('V'), sup('4'), sub('3'), b('/'), b('ii')]);
    expect(tokenizeRomanNumeral('I6/IV')).toEqual([b('I'), sup('6'), b('/'), b('IV')]);
    expect(tokenizeRomanNumeral('viiø65')).toEqual([b('vii'), sup('ø6'), sub('5')]);
    expect(tokenizeRomanNumeral('i°65')).toEqual([b('i'), sup('°6'), sub('5')]);
    expect(tokenizeRomanNumeral('I△42')).toEqual([b('I'), sup('△'), sup('4'), sub('2')]);
  });
  it('normalizes unicode digits and clusters suspensions and omissions', () => {
    expect(normalizeRomanNumeralDigits('I⁶₄')).toBe('I64');
    expect(tokenizeRomanNumeral('I⁶₄')).toEqual([b('I'), sup('6'), sub('4')]);
    expect(tokenizeRomanNumeral('I△9(no3)sus4')).toEqual([b('I'), sup('△9'), suffix('(no3)'), sub('sus4')]);
    expect(tokenizeRomanNumeral('Isus4')).toEqual([b('I'), sub('sus4')]);
    expect(tokenizeRomanNumeral('V7(b9)')).toEqual([b('V'), sup('7'), suffix('(b9)')]);
    expect(tokenizeRomanNumeral('I△9(no3)(no5)')).toEqual([b('I'), sup('△9'), suffix('(no3)'), suffix('(no5)')]);
    expect(tokenizeRomanNumeral('sus2sus47')).toEqual([sup('7'), sub('sus2sus4')]);
  });
  it('reports renderer stack spans without layout', () => {
    const parts = [sup('7'), suffix('(no3)'), sub('sus4')];
    expect(romanNumeralStackSpanAt(parts, 0)).toBe(3);
    expect(romanNumeralStackSpanAt(parts, 1)).toBe(0);
  });
  it('separates only the final borrowed mode tag', () => {
    expect(romanNumeralDisplayFromChord('V7(maj)/♯iii(maj)', 'major')).toEqual({ symbol: 'V7(maj)/♯iii', borrowedLabel: '(maj)' });
    expect(romanNumeralDisplayFromChord('♭VI(bor)', [])).toEqual({ symbol: '♭VI', borrowedLabel: '(bor)' });
    expect(romanNumeralDisplayFromChord('V7/vi', null)).toEqual({ symbol: 'V7/vi', borrowedLabel: null });
    expect(romanNumeralDisplayFromChord('I(bor)', { mode: 'minor' })).toEqual({ symbol: 'I(bor)', borrowedLabel: null });
  });
});

describe('native scale degree semantic labels', () => {
  it('parses combining hats and accidental prefixes independently', () => {
    expect(parseScaleDegreeLabel('♭7\u0302')).toMatchObject({ prefix: '♭', degree: '7', suffix: '', spokenText: 'flat 7' });
    expect(parseScaleDegreeLabel('♯♯4^')).toMatchObject({ prefix: '♯♯', degree: '4', spokenText: 'sharp sharp 4' });
    expect(parseScaleDegreeLabel('1\u0302')).toMatchObject({ prefix: '', degree: '1', spokenText: '1' });
  });
  it('retains suffix and labels that contain no digits', () => {
    expect(parseScaleDegreeLabel('♭7alt')).toMatchObject({ prefix: '♭', degree: '7', suffix: 'alt', spokenText: 'flat 7 alt' });
    expect(parseScaleDegreeLabel('N.C.')).toMatchObject({ prefix: '', degree: 'N.C.', suffix: '', spokenText: 'N.C.' });
  });
});
