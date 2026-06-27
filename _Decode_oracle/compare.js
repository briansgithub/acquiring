/**
 * compare.js
 * Closes the decode-oracle loop for one scraped song: aligns the rendered ground truth
 * (svgTruth) with the engine's interpretation-under-test (engineRun) chord-by-chord and
 * reports agreement on three channels:
 *
 *   1. Roman numeral  - canonical engine Roman vs rendered Roman (exact + core/no-tags).
 *   2. Absolute notes - parsed letter name (root pitch-class + bass pitch-class) of the
 *                       engine vs the rendered letter name. This is the "symbols checked
 *                       against the absolute note names" requirement.
 *   3. Pitch sanity   - the rendered chord root pitch-class must appear in the engine's
 *                       decoded pitch-class set, and the bass pitch-classes must agree.
 *
 * Alignment: rendered chord-views and non-rest JSON chords are both in beat order and (per
 * the scraper's validation) equal in count, so we zip by index.
 */

const { sectionTruth, parseLetter } = require('./svgTruth');
const { runSection } = require('./engineRun');
const { canonRoman, canonCore } = require('./normalize');

function compareChord(truth, eng) {
  const tRoman = canonRoman(truth.roman);
  const eRoman = canonRoman(eng.roman);
  const tLetter = truth.letter;             // already parsed by svgTruth
  const eLetter = parseLetter(eng.letter || '');

  const romanExact = tRoman === eRoman;
  const romanCore = canonCore(truth.roman) === canonCore(eng.roman);
  const rootPcMatch = tLetter.rootPc != null && tLetter.rootPc === eLetter.rootPc;
  const bassPcMatch = tLetter.bassPc != null && tLetter.bassPc === eLetter.bassPc;
  const rootInPcs = tLetter.rootPc != null && Array.isArray(eng.pcs) && eng.pcs.includes(tLetter.rootPc);
  const bassInNotes = tLetter.bassPc != null && eng.bassPc != null && tLetter.bassPc === eng.bassPc;

  return {
    beat: eng.beat,
    chord: eng.chord,
    truthRoman: truth.roman,
    engRoman: eng.roman,
    truthLetter: tLetter.letter,
    engLetter: eng.letter,
    engNotes: eng.notes,
    engPcs: eng.pcs,
    flags: { romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, bassInNotes },
    ok: romanExact && rootPcMatch && bassPcMatch,
    engineError: eng.error || null,
  };
}

// Align rendered ground-truth chords to engine (JSON) chords when their counts differ.
// Two regimes:
//   - ratio >= 0.8  : a few JSON chords are simply unrendered mid-section -> match by
//                     normalized position (rendered x vs JSON beat), allowing JSON skips.
//   - ratio <  0.8  : the page condensed repeats (rendered is a time-prefix of the JSON
//                     loop) -> align by leading index.
function alignPairs(truth, eng) {
  const nR = truth.length, nJ = eng.length;
  if (!nR || !nJ) return [];
  const ratio = nR / nJ;
  // Repeat/truncation: rendered is a leading time-prefix of the JSON loop -> align by index.
  if (ratio < 0.8) {
    const n = Math.min(nR, nJ);
    const pairs = [];
    for (let i = 0; i < n; i++) pairs.push([truth[i], eng[i]]);
    return pairs;
  }
  // Mid-section gap: a few JSON chords went unrendered. Match each rendered chord to the
  // JSON chord nearest in normalized position (rendered x vs JSON beat), monotonically,
  // leaving room for the remaining rendered chords.
  const x0 = truth[0].stableX, x1 = truth[nR - 1].stableX;
  const b0 = eng[0].beat, b1 = eng[nJ - 1].beat;
  const rx = (t) => (x1 === x0 ? 0 : (t.stableX - x0) / (x1 - x0));
  const jb = (e) => (b1 === b0 ? 0 : (e.beat - b0) / (b1 - b0));
  const pairs = [];
  let j = 0;
  for (let i = 0; i < nR; i++) {
    const target = rx(truth[i]);
    while (j + 1 < nJ && Math.abs(jb(eng[j + 1]) - target) <= Math.abs(jb(eng[j]) - target) && (nJ - (j + 1)) >= (nR - i)) {
      j++;
    }
    pairs.push([truth[i], eng[j]]);
    if (j < nJ - 1) j++;
  }
  return pairs;
}

async function compareSection(section) {
  const truth = sectionTruth(section);
  const eng = await runSection(section);
  const countMatch = truth.length === eng.length;
  const pairs = countMatch ? truth.map((t, i) => [t, eng[i]]) : alignPairs(truth, eng);
  const rows = pairs.map(([t, e]) => compareChord(t, e));
  return {
    name: section.name,
    songId: section.songId,
    countMatch,
    truthCount: truth.length,
    engCount: eng.length,
    rows,
  };
}

async function compareSong(scrape) {
  const sections = [];
  for (const s of scrape.sections) sections.push(await compareSection(s));
  return { url: scrape.url, title: scrape.title, sections };
}

module.exports = { compareSong, compareSection, compareChord };

// CLI: node _Decode_oracle/compare.js <scrape.json>
if (require.main === module) {
  const path = require('path');
  const file = process.argv[2] || path.join(__dirname, 'out', '500miles', 'scrape.json');
  const scrape = require(path.resolve(file));
  (async () => {
    const res = await compareSong(scrape);
    let total = 0, okRoman = 0, okRoot = 0, okBass = 0, okAll = 0;
    for (const s of res.sections) {
      console.log(`\n== ${s.name} (${s.songId})  count ${s.truthCount}/${s.engCount} ${s.countMatch ? '' : '!! COUNT MISMATCH'} ==`);
      for (const r of s.rows) {
        total++;
        if (r.flags.romanExact) okRoman++;
        if (r.flags.rootPcMatch) okRoot++;
        if (r.flags.bassPcMatch) okBass++;
        if (r.ok) okAll++;
        const mark = r.ok ? 'OK ' : '  X';
        const detail = r.ok ? '' : `  [${Object.entries(r.flags).filter(([, v]) => !v).map(([k]) => k).join(',')}]`;
        console.log(`  ${mark} beat ${String(r.beat).padStart(3)}  truth: ${String(r.truthRoman).padEnd(14)} ${String(r.truthLetter).padEnd(12)} | eng: ${String(r.engRoman).padEnd(14)} ${String(r.engLetter).padEnd(12)}${detail}${r.engineError ? ' ERR:' + r.engineError : ''}`);
      }
    }
    console.log(`\n--- TOTALS: ${total} chords | romanExact ${okRoman}/${total} | root ${okRoot}/${total} | bass ${okBass}/${total} | allOK ${okAll}/${total} ---`);
  })();
}
