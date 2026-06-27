/**
 * normalize.js
 * Canonicalizes chord symbol strings so the engine's output and the rendered ground truth
 * can be compared apples-to-apples. The engine emits Unicode figured-bass superscripts
 * (⁶⁵, ⁴³, ⁶₄, ⁷) and ♭/♯ glyphs; the SVG ground truth uses plain ASCII digits and b/#.
 */

const SUPERSUB = {
  '\u2070': '0', '\u00b9': '1', '\u00b2': '2', '\u00b3': '3', '\u2074': '4',
  '\u2075': '5', '\u2076': '6', '\u2077': '7', '\u2078': '8', '\u2079': '9',
  '\u2080': '0', '\u2081': '1', '\u2082': '2', '\u2083': '3', '\u2084': '4',
  '\u2085': '5', '\u2086': '6', '\u2087': '7', '\u2088': '8', '\u2089': '9',
};

// Canonical Roman numeral: ASCII digits, ASCII accidentals, no whitespace.
function canonRoman(s) {
  if (s == null) return '';
  let out = String(s).replace(/[\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079\u2080-\u2089]/g, (c) => SUPERSUB[c] || c);
  out = out.replace(/\u266d/g, 'b').replace(/\u266f/g, '#').replace(/\u266e/g, '');
  out = out.replace(/\s+/g, '');
  return out;
}

// Strip parenthetical borrowed/alteration tags, e.g. "bVI(min)" -> "bVI", "iiø7(min)" -> "iiø7".
function stripTags(s) {
  return String(s).replace(/\([^)]*\)/g, '');
}

// Core symbol = canonical with parenthetical tags removed (lets us tell "core numeral matches
// but the borrowed/alteration annotation differs" apart from a wholesale mismatch).
function canonCore(s) {
  return stripTags(canonRoman(s));
}

module.exports = { canonRoman, canonCore, stripTags };
