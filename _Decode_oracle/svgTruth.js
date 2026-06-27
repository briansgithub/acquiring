/**
 * svgTruth.js
 * Reconstructs the human-readable ground-truth symbol for each rendered chord from the
 * positioned SVG text fragments captured by scrapeSong.js.
 *
 * Each chord-view renders two stacked rows of <text> fragments:
 *   - Upper band  (y ~1006-1030): the Roman-numeral analysis, with figured-bass inversion
 *                  digits stacked vertically (e.g. "6" over "4"), applied "/x", borrowed
 *                  tags like "(min)/(mix)/(dor)/(bor)", and alteration tags "(b9)/(#5)".
 *   - Lower band  (y ~1044):      the absolute letter name (root + quality + "/bass"),
 *                  where a lowercase root letter denotes a minor/diminished quality and a
 *                  lowercase "o" glyph denotes the diminished circle.
 *
 * We split the two rows by clustering on y, then read each row left-to-right (relX), using
 * top-to-bottom (y) ordering to flatten the stacked figured-bass digits.
 */

const NOTE_BASE_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function noteToPc(name) {
  if (!name) return null;
  const m = name.match(/^([A-Ga-g])([b#x]*)/);
  if (!m) return null;
  let pc = NOTE_BASE_PC[m[1].toUpperCase()];
  for (const ch of m[2]) {
    if (ch === '#') pc += 1;
    else if (ch === 'x') pc += 2;
    else if (ch === 'b') pc -= 1;
  }
  return ((pc % 12) + 12) % 12;
}

// Split a chord's text fragments into the upper (Roman) and lower (letter-name) rows.
function splitRows(texts) {
  if (!texts.length) return { upper: [], lower: [] };
  const maxY = Math.max(...texts.map((t) => t.y));
  const minY = Math.min(...texts.map((t) => t.y));
  // If everything is on one line there is no letter row.
  if (maxY - minY < 12) return { upper: texts.slice(), lower: [] };
  const lower = texts.filter((t) => t.y >= maxY - 8);
  const upper = texts.filter((t) => t.y < maxY - 8);
  return { upper, lower };
}

// Order fragments left-to-right, then top-to-bottom (so stacked figured-bass digits flatten
// to e.g. "64"), and concatenate their text.
function joinRow(frags) {
  return frags
    .slice()
    .sort((a, b) => (a.relX - b.relX) || (a.y - b.y))
    .map((f) => f.s)
    .join('');
}

// Reconstruct the Roman numeral. Parenthetical borrowed/alteration tags ("(min)", "(b9)",
// ...) render on a lower sub-line, sometimes with a smaller relX than the numeral itself,
// so we force them to the end (after the numeral + figured-bass digits).
function joinRoman(frags) {
  const isTag = (f) => /^\(/.test(f.s);
  const core = frags.filter((f) => !isTag(f));
  const tags = frags.filter(isTag);
  const coreStr = core.slice().sort((a, b) => (a.relX - b.relX) || (a.y - b.y)).map((f) => f.s).join('');
  const tagStr = tags.slice().sort((a, b) => a.relX - b.relX).map((f) => f.s).join('');
  return coreStr + tagStr;
}

// The diminished circle is captured as one or more lowercase "o" glyphs; normalise to "°"
// and drop the duplicate-circle render artifact (a stray extra "o").
function cleanLetter(raw) {
  let s = raw.replace(/o+/g, '\u00b0');
  const first = s.indexOf('\u00b0');
  if (first >= 0) s = s.slice(0, first + 1) + s.slice(first + 1).replace(/\u00b0/g, '');
  return s;
}

function parseLetter(letterRaw) {
  const cleaned = cleanLetter(letterRaw);
  // Bass note is whatever follows the final "/".
  let rootPart = cleaned;
  let bassName = null;
  const slash = cleaned.lastIndexOf('/');
  if (slash >= 0) {
    bassName = cleaned.slice(slash + 1);
    rootPart = cleaned.slice(0, slash);
  }
  const rootMatch = rootPart.match(/^([A-Ga-g][b#x]*)/);
  const bassMatch = bassName ? bassName.match(/^([A-Ga-g][b#x]*)/) : null;
  const rootName = rootMatch ? rootMatch[1] : null;
  const bassClean = bassMatch ? bassMatch[1] : null;
  return {
    letter: cleaned,
    rootName,
    rootPc: noteToPc(rootName),
    isMinorish: rootName ? /^[a-g]/.test(rootName) : null, // lowercase root => minor/dim per HT
    bassName: bassClean,
    bassPc: bassClean ? noteToPc(bassClean) : (rootName ? noteToPc(rootName) : null),
  };
}

// Build the ground-truth descriptor for one rendered chord-view.
function chordTruth(rendered) {
  const { upper, lower } = splitRows(rendered.texts || []);
  const roman = joinRoman(upper);
  const letterRaw = joinRow(lower);
  const letter = parseLetter(letterRaw);
  return {
    order: rendered.order,
    stableX: rendered.stableX,
    roman,
    letter,
    rawConcat: rendered.raw,
  };
}

function sectionTruth(section) {
  return (section.rendered || []).map(chordTruth);
}

module.exports = { chordTruth, sectionTruth, parseLetter, noteToPc, splitRows, joinRow, joinRoman, cleanLetter };

// CLI: node _Decode_oracle/svgTruth.js <scrape.json>
if (require.main === module) {
  const path = require('path');
  const file = process.argv[2] || path.join(__dirname, 'out', 'maple', 'scrape.json');
  const data = require(path.resolve(file));
  for (const s of data.sections) {
    console.log(`\n== ${s.name} (${s.songId}) ==`);
    for (const t of sectionTruth(s)) {
      const L = t.letter;
      console.log(
        `  ${String(t.order).padStart(2)}  roman=${t.roman.padEnd(16)} letter=${(L.letter || '').padEnd(12)} root=${L.rootName || '-'}(${L.rootPc}) bass=${L.bassName || '-'}(${L.bassPc}) ${L.isMinorish ? 'min' : 'MAJ'}`
      );
    }
  }
}
