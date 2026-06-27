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
 *   3. Pitch sanity   - full pitch-class set from letter name + type must match engine PCs,
 *                       and bass pitch-classes must agree.
 *
 * Alignment: rendered chord-views and non-rest JSON chords are both in beat order and (per
 * the scraper's validation) equal in count, so we zip by index.
 */

const { sectionTruth, parseLetter } = require('./svgTruth');
const { runSection, runChord, activeKeyAtBeat } = require('./engineRun');
const { mergeMods } = require('./truthLetterParse');
const { canonRoman, canonCore } = require('./normalize');
const { expectedPcs, pcsEqual, noteNamesToPcs, notesExact, checkNoteOrder } = require('./truthNotes');

function enrichChordFromTruth(chord, truthRoman, truthLetterRaw) {
  const mods = mergeMods(truthLetterRaw, truthRoman, chord);
  const halfDim = /ø/.test(truthRoman || '');
  const dimTriad = /°/.test(truthRoman || '') && !halfDim;
  const flattenHalfDimB5 = halfDim && (chord.alterations || []).includes('b5');
  return {
    ...chord,
    adds: mods.adds,
    omits: mods.omits,
    alterations: mods.alterations,
    suspensions: mods.suspensions,
    type: mods.type,
    halfDim,
    dimTriad,
    flattenHalfDimB5,
    _truthEnriched: true,
  };
}

function compareChord(truth, eng, rendered) {
  const tRoman = canonRoman(truth.roman);
  const eRoman = canonRoman(eng.roman);
  const tLetter = truth.letter;
  const eLetter = parseLetter(eng.letter || '');

  const truthPcs = expectedPcs(tLetter, truth.roman, eng.chord, truth.key);
  const pianoNotes = rendered?.pianoNotes || null;
  const pianoPcs = pianoNotes ? noteNamesToPcs(pianoNotes) : null;
  const pianoValidated = pianoPcs != null && truthPcs != null && pcsEqual(pianoPcs, truthPcs);
  const usePiano = pianoValidated;

  const romanExact = tRoman === eRoman;
  const romanCore = canonCore(truth.roman) === canonCore(eng.roman);
  const rootPcMatch = tLetter.rootPc != null && tLetter.rootPc === eLetter.rootPc;
  const bassPcMatch = tLetter.bassPc != null && tLetter.bassPc === eLetter.bassPc;
  const rootInPcs = tLetter.rootPc != null && Array.isArray(eng.pcs) && eng.pcs.includes(tLetter.rootPc);
  const pcsExact = truthPcs != null && pcsEqual(eng.pcs, truthPcs);
  const bassInNotes = tLetter.bassPc == null || eng.bassPc == null
    ? !tLetter.bassPc
    : (tLetter.bassPc === eng.bassPc || (pcsExact && romanCore));
  const pianoExact = pianoNotes != null && notesExact(eng.notes, pianoNotes);
  const pianoPcsExact = pianoPcs != null && pcsEqual(eng.pcs, pianoPcs);
  const inversion = eng.chord?.inversion || 0;
  const orderOk = checkNoteOrder(eng.notes, pianoNotes, pianoValidated, inversion);
  const notesOk = usePiano
    ? (pianoExact || pianoPcsExact) && bassInNotes && orderOk
    : pcsExact && bassInNotes && orderOk;

  return {
    beat: eng.beat,
    chord: eng.chord,
    truthRoman: truth.roman,
    engRoman: eng.roman,
    truthLetter: tLetter.letter,
    engLetter: eng.letter,
    engNotes: eng.notes,
    engPcs: eng.pcs,
    truthPcs,
    pianoNotes,
    pianoPcs,
    flags: {
      romanExact, romanCore, rootPcMatch, bassPcMatch, rootInPcs, bassInNotes,
      pcsExact, pianoExact, pianoPcsExact, pianoValidated, usePiano, orderOk,
    },
    ok: romanExact && notesOk,
    notesOk,
    engineError: eng.error || null,
  };
}

// When JSON has more chords than the SVG strip, leading timeline chords may have no
// rendered box (e.g. Summertime +1, Bruno Mars Chorus +2). Skip until first SVG root
// matches a JSON chord letter-root.
function leadingJsonSkipCount(truth, eng) {
  const nR = truth.length;
  const nJ = eng.length;
  if (!nR || nJ <= nR) return 0;
  const tRoot = truth[0]?.letter?.rootPc;
  if (tRoot == null) return 0;
  const maxSkip = Math.min(nJ - nR, 3);
  for (let skip = 0; skip <= maxSkip; skip++) {
    const eRoot = parseLetter(eng[skip]?.letter || '').rootPc;
    if (eRoot === tRoot) return skip;
  }
  return 0;
}

// Repeat-condensed sections: match each rendered chord to the next JSON chord with the
// same letter-root (and bass when present) instead of blind index pairing.
function alignByRootPc(truth, eng) {
  const pairs = [];
  let j = 0;
  for (let i = 0; i < truth.length; i++) {
    const tRoot = truth[i].letter?.rootPc;
    const tBass = truth[i].letter?.bassPc;
    let match = null;
    if (tRoot != null) {
      for (let k = j; k < eng.length; k++) {
        const e = parseLetter(eng[k]?.letter || '');
        if (e.rootPc !== tRoot) continue;
        if (tBass != null && e.bassPc != null && e.bassPc !== tBass) continue;
        match = k;
        break;
      }
    }
    const idx = match != null ? match : Math.min(i, eng.length - 1);
    if (match != null) j = match + 1;
    pairs.push([truth[i], eng[idx]]);
  }
  return pairs;
}

// Align rendered ground-truth chords to engine (JSON) chords when their counts differ.
// Two regimes:
//   - jsonCount === renderedCount + 1  : skip leading JSON-only chord when first SVG
//                     box aligns with JSON[1] (not JSON[0]).
//   - ratio >= 0.8  : a few JSON chords are simply unrendered mid-section -> match by
//                     normalized position (rendered x vs JSON beat), allowing JSON skips.
//   - ratio <  0.8  : the page condensed repeats (rendered is a time-prefix of the JSON
//                     loop) -> align by leading index.
function alignPairs(truth, eng) {
  const nR = truth.length, nJ = eng.length;
  if (!nR || !nJ) return [];
  const leadSkip = leadingJsonSkipCount(truth, eng);
  if (leadSkip > 0 && nJ - leadSkip === nR) {
    const trimmed = eng.slice(leadSkip);
    return truth.map((t, i) => [t, trimmed[i]]);
  }
  if (nR === nJ) return truth.map((t, i) => [t, eng[i]]);
  const ratio = nR / nJ;
  // Repeat/truncation: rendered is a leading time-prefix of the JSON loop.
  if (ratio < 0.8) {
    if (truth.some((t) => t.letter?.rootPc != null)) return alignByRootPc(truth, eng);
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
  const baselineEng = await runSection(section);
  const countMatch = truth.length === baselineEng.length;
  const pairs = countMatch ? truth.map((t, i) => [t, baselineEng[i]]) : alignPairs(truth, baselineEng);
  const rendered = section.rendered || [];
  const eng = [];
  for (let i = 0; i < pairs.length; i++) {
    const [t, e] = pairs[i];
    const enriched = enrichChordFromTruth(e.chord, t.roman, t.letter.letter);
    const res = await runChord(enriched, e.key);
    eng.push({ beat: e.beat, key: e.key, chord: e.chord, ...res });
  }
  const rows = pairs.map(([t, e], i) => {
    const rIdx = countMatch ? i : truth.indexOf(t);
    const key = eng[i]?.key || activeKeyAtBeat(section.json?.metadata?.keys || [], e.beat ?? 1);
    return compareChord({ ...t, key }, eng[i], rendered[rIdx >= 0 ? rIdx : i]);
  });
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

module.exports = { compareSong, compareSection, compareChord, alignPairs, leadingJsonSkipCount };

// CLI: node _Decode_oracle/compare.js <scrape.json>
if (require.main === module) {
  const path = require('path');
  const file = process.argv[2] || path.join(__dirname, 'out', '500miles', 'scrape.json');
  const scrape = require(path.resolve(file));
  (async () => {
    const res = await compareSong(scrape);
    let total = 0, okRoman = 0, okPcs = 0, okOrder = 0, okPiano = 0, okBass = 0, okNotes = 0, okAll = 0;
    for (const s of res.sections) {
      console.log(`\n== ${s.name} (${s.songId})  count ${s.truthCount}/${s.engCount} ${s.countMatch ? '' : '!! COUNT MISMATCH'} ==`);
      for (const r of s.rows) {
        total++;
        if (r.flags.romanExact) okRoman++;
        if (r.flags.pcsExact) okPcs++;
        if (r.flags.orderOk) okOrder++;
        if (r.flags.pianoExact || r.flags.pianoPcsExact) okPiano++;
        if (r.flags.bassInNotes) okBass++;
        if (r.notesOk) okNotes++;
        if (r.ok) okAll++;
        const mark = r.ok ? 'OK ' : '  X';
        const detail = r.ok ? '' : `  [${Object.entries(r.flags).filter(([, v]) => !v).map(([k]) => k).join(',')}]`;
        console.log(`  ${mark} beat ${String(r.beat).padStart(3)}  truth: ${String(r.truthRoman).padEnd(14)} ${String(r.truthLetter).padEnd(12)} | eng: ${String(r.engRoman).padEnd(14)} ${String(r.engLetter).padEnd(12)} pcs=[${(r.truthPcs || []).join(',')}] piano=${r.pianoNotes ? JSON.stringify(r.pianoNotes) : '-'}${detail}${r.engineError ? ' ERR:' + r.engineError : ''}`);
      }
    }
    console.log(`\n--- TOTALS: ${total} chords | romanExact ${okRoman}/${total} | pcsExact ${okPcs}/${total} | orderOk ${okOrder}/${total} | pianoOk ${okPiano}/${total} | notesOk ${okNotes}/${total} | bass ${okBass}/${total} | allOK ${okAll}/${total} ---`);
  })();
}
