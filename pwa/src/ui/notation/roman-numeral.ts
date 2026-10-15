/** Pure semantic port of Android RomanNumeralLayout.kt at 801cf798. */
export type RomanNumeralPartKind = 'BASE' | 'SUPER' | 'SUB' | 'SUFFIX';
export interface RomanNumeralPart { kind: RomanNumeralPartKind; text: string }

const figuredBass: Readonly<Record<string, readonly [string, string]>> = {
  '64': ['6', '4'], '46': ['6', '4'], '65': ['6', '5'], '43': ['4', '3'], '42': ['4', '2'],
};
const digitMap: Readonly<Record<string, string>> = {
  '⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9',
  '₀':'0','₁':'1','₂':'2','₃':'3','₄':'4','₅':'5','₆':'6','₇':'7','₈':'8','₉':'9',
};
const part = (kind: RomanNumeralPartKind, text: string): RomanNumeralPart => ({ kind, text });
const isRoman = (c: string) => 'ivxIVX'.includes(c);
const isAccidental = (c: string) => '♭♯#b'.includes(c);
const readDigits = (s: string, start: number) => {
  let end = start;
  while (end < s.length && /\d/.test(s[end])) end++;
  return { text: s.slice(start, end), next: end };
};
const readBase = (s: string, start: number) => {
  let end = start;
  while (end < s.length && isAccidental(s[end])) end++;
  while (end < s.length && isRoman(s[end])) end++;
  while (end < s.length && s[end] === '+') end++;
  return { text: s.slice(start, end), next: end };
};
const readParenthetical = (s: string, start: number) => {
  let end = start, depth = 0;
  while (end < s.length) {
    const c = s[end++];
    if (c === '(') depth++;
    if (c === ')' && --depth === 0) break;
  }
  return { text: s.slice(start, end), next: end };
};
const pushFigured = (parts: RomanNumeralPart[], pair: readonly [string, string]) => {
  parts.push(part('SUPER', pair[0]), part('SUB', pair[1]));
};
const pushQuality = (parts: RomanNumeralPart[], glyph: string, digits: string) => {
  const pair = figuredBass[digits];
  if (pair) parts.push(part('SUPER', glyph + pair[0]), part('SUB', pair[1]));
  else parts.push(part('SUPER', glyph + digits));
};
function trySusCluster(s: string, start: number): { parts: RomanNumeralPart[]; next: number } | null {
  const rest = s.slice(start);
  const ext = /^(9|7|1[13])/.exec(rest);
  if (ext) {
    let pos = ext[0].length;
    const parts = [part('SUPER', ext[0])];
    const omission = /^\(no\d+\)/.exec(rest.slice(pos));
    if (omission) { parts.push(part('SUFFIX', omission[0])); pos += omission[0].length; }
    const suspension = /^sus\d+sus\d/.exec(rest.slice(pos)) ?? /^sus\d+/.exec(rest.slice(pos));
    if (suspension) {
      parts.push(part('SUB', suspension[0]));
      return { parts, next: start + pos + suspension[0].length };
    }
  }
  const trailing = /^sus(\d)sus(\d)(9|7|1[13])(?!\d)/.exec(rest);
  if (!trailing) return null;
  return {
    parts: [part('SUPER', trailing[3]), part('SUB', `sus${trailing[1]}sus${trailing[2]}`)],
    next: start + trailing[0].length,
  };
}

export function normalizeRomanNumeralDigits(symbol: string): string {
  return Array.from(symbol, (c) => digitMap[c] ?? c).join('');
}

export function tokenizeRomanNumeral(symbol: string): RomanNumeralPart[] {
  const s = normalizeRomanNumeralDigits(symbol);
  if (!s) return [];
  const parts: RomanNumeralPart[] = [];
  let i = 0;
  const initial = readBase(s, i);
  if (initial.text) { parts.push(part('BASE', initial.text)); i = initial.next; }
  while (i < s.length) {
    const c = s[i];
    const cluster = trySusCluster(s, i);
    if (cluster) { parts.push(...cluster.parts); i = cluster.next; continue; }
    if (c === '°' || c === 'ø') {
      const digits = readDigits(s, i + 1); pushQuality(parts, c, digits.text); i = digits.next; continue;
    }
    if (c === '△') {
      const digits = readDigits(s, i + 1), pair = figuredBass[digits.text];
      if (pair) { parts.push(part('SUPER', '△')); pushFigured(parts, pair); }
      else parts.push(part('SUPER', digits.text ? `△${digits.text}` : '△'));
      i = digits.next; continue;
    }
    if (/\d/.test(c)) {
      const digits = readDigits(s, i), pair = figuredBass[digits.text];
      if (pair) pushFigured(parts, pair); else parts.push(part('SUPER', digits.text));
      i = digits.next; continue;
    }
    if (c === '/') {
      parts.push(part('BASE', '/')); i++;
      const denominator = readBase(s, i);
      if (denominator.text) { parts.push(part('BASE', denominator.text)); i = denominator.next; }
      continue;
    }
    if (c === '(') { const suffix = readParenthetical(s, i); parts.push(part('SUFFIX', suffix.text)); i = suffix.next; continue; }
    const suspension = /^sus\d+/.exec(s.slice(i));
    if (suspension) { parts.push(part('SUB', suspension[0])); i += suspension[0].length; continue; }
    let end = i;
    while (end < s.length && !['(', '/', '△', '°', 'ø'].includes(s[end]) && !/\d/.test(s[end])) end++;
    if (end > i) { parts.push(part('BASE', s.slice(i, end))); i = end; }
    else { parts.push(part('BASE', c)); i++; }
  }
  return parts;
}

export function romanNumeralStackSpanAt(parts: readonly RomanNumeralPart[], index: number): 0 | 2 | 3 {
  if (parts[index]?.kind !== 'SUPER') return 0;
  if (parts[index + 1]?.kind === 'SUB') return 2;
  if (parts[index + 1]?.kind === 'SUFFIX' && parts[index + 2]?.kind === 'SUB') return 3;
  return 0;
}

const borrowedTags: Readonly<Record<string, string>> = {
  minor:'min', dorian:'dor', phrygian:'phr', lydian:'lyd', mixolydian:'mix',
  locrian:'loc', major:'maj', harmonicMinor:'hmin', phrygianDominant:'phdm',
};
export interface RomanNumeralDisplay { symbol: string; borrowedLabel: string | null }
export function romanNumeralDisplayFromChord(symbol: string, borrowed: unknown): RomanNumeralDisplay {
  let label: string | null = null;
  if (Array.isArray(borrowed)) label = '(bor)';
  else if (borrowed !== null && borrowed !== undefined) {
    const value = String(borrowed);
    label = borrowedTags[value] ? `(${borrowedTags[value]})` : value.startsWith('[') ? '(bor)' : null;
  }
  const index = label === null ? -1 : symbol.lastIndexOf(label);
  return { symbol: index < 0 ? symbol : symbol.slice(0, index) + symbol.slice(index + label!.length), borrowedLabel: label };
}
