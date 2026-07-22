/**
 * engineRun.js
 * Runs the project's music-theory engine (web-player/lib) over the extracted JSON chords
 * and emits, for each non-rest chord, the engine's interpretation-under-test:
 *   - roman:  getChordSymbol(chord, key)
 *   - letter: getChordLetterName(chord, key)
 *   - notes:  chordInterpreter(chord, key).notes  (Tone.js note names, with octaves)
 *   - pcs:    the pitch-class set of those notes
 *   - bassPc: pitch class of the lowest (first) note after inversion
 *
 * Honors mid-section key changes by selecting the active key entry for each chord's beat.
 * The engine is intentionally run AS-IS (no fixes) so compare.js can quantify discrepancies.
 */

const NOTE_BASE_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function noteNameToPc(name) {
  const m = String(name).match(/^([A-Ga-g])([#bx]*)/);
  if (!m) return null;
  let pc = NOTE_BASE_PC[m[1].toUpperCase()];
  for (const ch of m[2]) {
    if (ch === '#') pc += 1;
    else if (ch === 'x') pc += 2;
    else if (ch === 'b') pc -= 1;
  }
  return ((pc % 12) + 12) % 12;
}

// Strip octave digits from a Tone.js note name → bare pitch name.
function bareNote(n) { return String(n).replace(/-?\d+$/, ''); }

// Select the key entry active at a given beat (supports mid-section modulations).
function activeKeyAtBeat(keys, beat) {
  if (!keys || !keys.length) return { tonic: 'C', scale: 'major' };
  let chosen = keys[0];
  for (const k of keys) {
    if ((k.beat ?? 1) <= beat) chosen = k; else break;
  }
  const tonic = String(chosen.tonic || 'C').replace(/♭/g, 'b').replace(/♯/g, '#').replace(/♮/g, '');
  return { tonic, scale: chosen.scale || 'major' };
}

const { mergeMods } = require('./truthLetterParse');

function appliedDenomMajFromRoman(roman) {
  const denom = String(roman || '').split('/')[1] || '';
  return /\(maj\)/.test(denom);
}

function enrichChordFromSymbol(chord, roman, letter) {
  const halfDim = chord.halfDim || /ø/.test(roman || "") || /\(b5b9\)|b5b9/i.test(letter || "");
  const dimTriad = chord.dimTriad || (/°/.test(roman || "") && !halfDim);
  if (chord._truthEnriched) {
    return { ...chord, halfDim, dimTriad: chord.dimTriad, flattenHalfDimB5: chord.flattenHalfDimB5 };
  }
  const mods = mergeMods(letter, roman, chord);
  const alterations = [...new Set([...(chord.alterations || []), ...mods.alterations])];
  const appliedDenomMaj = chord.appliedDenomMaj || appliedDenomMajFromRoman(roman);
  const flattenHalfDimB5 = chord.flattenHalfDimB5
    || (halfDim && alterations.includes('b5'));
  if (halfDim && (mods.type ?? 5) >= 9) {
    for (const a of ["b5", "b9"]) {
      if (!alterations.includes(a)) alterations.push(a);
    }
  }
  return {
    ...chord,
    adds: mods.adds,
    omits: mods.omits,
    alterations,
    suspensions: mods.suspensions,
    type: mods.type,
    halfDim,
    dimTriad,
    flattenHalfDimB5,
    appliedDenomMaj,
  };
}
const libUrl = (p) => require('url').pathToFileURL(require('path').join(__dirname, '..', 'web-player', 'lib', p)).href;

let engine = null;
async function loadEngine() {
  if (engine) return engine;
  const sym = await import(libUrl('jsonToSymbol.js'));
  const music = await import(libUrl('music.js'));
  engine = { sym, music };
  return engine;
}

// Run an arbitrary fn with console output suppressed (the engine is very chatty).
function quiet(fn) {
  const log = console.log, warn = console.warn, err = console.error;
  console.log = console.warn = console.error = () => {};
  try { return fn(); } finally { console.log = log; console.warn = warn; console.error = err; }
}

async function runChord(chord, key) {
  const { sym, music } = await loadEngine();
  const { verifyScaleDegrees } = await import(libUrl('scaleDegreeVerifier.js'));
  const out = {
    roman: null, letter: null, notes: null, pcs: null, bassPc: null,
    chordDegrees: null, degreesOk: null, degreesWarnings: null, error: null,
  };
  try {
    quiet(() => {
      out.roman = sym.getChordSymbol(chord, key);
      out.letter = sym.getChordLetterName(chord, key);
      const enriched = enrichChordFromSymbol(chord, out.roman, out.letter);
      const interp = music.chordInterpreter(enriched, key);
      out.notes = interp.notes;
      out.chordDegrees = interp.chordDegrees;
      const bare = (interp.notes || []).map(bareNote);
      out.pcs = Array.from(new Set(bare.map(noteNameToPc).filter((x) => x !== null))).sort((a, b) => a - b);
      out.bassPc = interp.notes && interp.notes.length ? noteNameToPc(bareNote(interp.notes[0])) : null;
      const degCheck = verifyScaleDegrees({
        key,
        notes: interp.notes,
        chordDegrees: interp.chordDegrees,
      });
      out.degreesOk = degCheck.ok;
      out.degreesWarnings = degCheck.warnings;
    });
  } catch (e) {
    out.error = e.message;
    out.degreesOk = false;
  }
  return out;
}

// Run the engine over one section; returns one entry per NON-REST chord, in order.
async function runSection(section) {
  const json = section.json || {};
  const keys = (json.metadata && json.metadata.keys) || [];
  const chords = (json.chords || []).filter((c) => !c.isRest);
  const results = [];
  for (const chord of chords) {
    const key = activeKeyAtBeat(keys, chord.beat ?? 1);
    const res = await runChord(chord, key);
    results.push({ beat: chord.beat, key, chord, ...res });
  }
  return results;
}

module.exports = { runSection, runChord, activeKeyAtBeat, noteNameToPc, loadEngine };

// CLI: node _Decode_oracle/engineRun.js <scrape.json>
if (require.main === module) {
  const path = require('path');
  const file = process.argv[2] || path.join(__dirname, 'out', 'maple', 'scrape.json');
  const data = require(path.resolve(file));
  (async () => {
    for (const s of data.sections) {
      console.log(`\n== ${s.name} (${s.songId}) key=${JSON.stringify(activeKeyAtBeat((s.json.metadata||{}).keys, 1))} ==`);
      const res = await runSection(s);
      for (const r of res) {
        console.log(`  beat ${String(r.beat).padStart(3)}  roman=${String(r.roman).padEnd(12)} letter=${String(r.letter).padEnd(12)} notes=${JSON.stringify(r.notes)} pcs=[${r.pcs}]${r.error ? '  ERR:' + r.error : ''}`);
      }
    }
  })();
}
