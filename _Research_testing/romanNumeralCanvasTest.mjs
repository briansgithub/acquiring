import { getChordSymbol } from '../web-player/lib/jsonToSymbol.js';
import { tokenizeRomanNumeral } from '../web-player/lib/romanNumeralCanvas.js';

const key = { tonic: 'F', scale: 'major' };
const chord = { root: 1, type: 7, inversion: 0, borrowed: null };
const symbol = getChordSymbol(chord, key);
const tokens = tokenizeRomanNumeral(symbol);

console.log('symbol:', symbol);
console.log('tokens:', JSON.stringify(tokens, null, 2));

const hasAsciiOnlyDigits = !/[⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]/.test(symbol);
const maj7Tokens = tokens.find((t) => t.kind === 'super' && t.text.includes('△'));

if (!hasAsciiOnlyDigits) throw new Error('symbol still contains unicode super/sub digits');
if (symbol !== 'I△7') throw new Error(`expected I△7 got ${symbol}`);
if (!maj7Tokens || maj7Tokens.text !== '△7') throw new Error('expected super segment △7');

const invCases = [
  { symbol: 'i42', expect: [{ kind: 'base', text: 'i' }, { kind: 'super', text: '4' }, { kind: 'sub', text: '2' }] },
  { symbol: 'V64', expect: [{ kind: 'base', text: 'V' }, { kind: 'super', text: '6' }, { kind: 'sub', text: '4' }] },
  { symbol: 'V65', expect: [{ kind: 'base', text: 'V' }, { kind: 'super', text: '6' }, { kind: 'sub', text: '5' }] },
  { symbol: 'ii43', expect: [{ kind: 'base', text: 'ii' }, { kind: 'super', text: '4' }, { kind: 'sub', text: '3' }] },
  { symbol: 'V46', expect: [{ kind: 'base', text: 'V' }, { kind: 'super', text: '6' }, { kind: 'sub', text: '4' }] },
  { symbol: 'I△42', expect: [{ kind: 'base', text: 'I' }, { kind: 'super', text: '△' }, { kind: 'super', text: '4' }, { kind: 'sub', text: '2' }] },
  { symbol: 'Vsus2sus47/V', expect: [{ kind: 'base', text: 'V' }, { kind: 'super', text: '7' }, { kind: 'sub', text: 'sus2sus4' }, { kind: 'base', text: '/' }, { kind: 'base', text: 'V' }] },
  { symbol: 'V7sus4sus2', expect: [{ kind: 'base', text: 'V' }, { kind: 'super', text: '7' }, { kind: 'sub', text: 'sus4sus2' }] },
  { symbol: 'Vsus4', expect: [{ kind: 'base', text: 'V' }, { kind: 'sub', text: 'sus4' }] },
  { symbol: 'IV6sus2', expect: [{ kind: 'base', text: 'IV' }, { kind: 'super', text: '6' }, { kind: 'sub', text: 'sus2' }] },
  { symbol: 'viiø42', expect: [{ kind: 'base', text: 'vii' }, { kind: 'super', text: 'ø4' }, { kind: 'sub', text: '2' }] },
  { symbol: 'viiø43', expect: [{ kind: 'base', text: 'vii' }, { kind: 'super', text: 'ø4' }, { kind: 'sub', text: '3' }] },
  { symbol: 'viiø65', expect: [{ kind: 'base', text: 'vii' }, { kind: 'super', text: 'ø6' }, { kind: 'sub', text: '5' }] },
  { symbol: 'vii°7', expect: [{ kind: 'base', text: 'vii' }, { kind: 'super', text: '°7' }] },
  { symbol: 'vii°42', expect: [{ kind: 'base', text: 'vii' }, { kind: 'super', text: '°4' }, { kind: 'sub', text: '2' }] },
  { symbol: 'iiø43(min)', expect: [{ kind: 'base', text: 'ii' }, { kind: 'super', text: 'ø4' }, { kind: 'sub', text: '3' }, { kind: 'suffix', text: '(min)' }] },
];

for (const { symbol: sym, expect } of invCases) {
  const got = tokenizeRomanNumeral(sym);
  if (JSON.stringify(got) !== JSON.stringify(expect)) {
    throw new Error(`tokenize ${sym}: expected ${JSON.stringify(expect)} got ${JSON.stringify(got)}`);
  }
}

console.log('OK');
