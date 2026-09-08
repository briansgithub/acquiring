/**
 * Regenerates the shared cross-platform chord-decoding contract at
 * contracts/fixtures/corpus_parity.json.
 *
 * This is a generated parity snapshot, NOT an accuracy oracle. Every expectation is whatever
 * web/lib produces for that chord object. web, Android and iOS all read this
 * one file (Android via the test.resources.srcDir in android/app/build.gradle,
 * iOS via ChordParityTests and the app test bundle), so a divergence on any
 * platform shows up as a failing assertion rather than as a wrong chord on
 * screen.
 *
 * Run with: npm run parity:export
 */
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Note names -> MIDI
// ---------------------------------------------------------------------------

const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function noteNameToMidi(name) {
  const match = String(name).match(/^([A-Ga-g])([#bx]*)(-?\d+)$/);
  if (!match) return null;
  let pc = LETTER_PC[match[1].toUpperCase()];
  for (const accidental of match[2]) {
    if (accidental === '#') pc += 1;
    else if (accidental === 'x') pc += 2;
    else if (accidental === 'b') pc -= 1;
  }
  return (parseInt(match[3], 10) + 1) * 12 + pc;
}

// ---------------------------------------------------------------------------
// Case space
// ---------------------------------------------------------------------------

// The original hand-written benchmark. Kept first, with its ids unchanged, so
// the named cases stay greppable in failure output after the sweeps below.
const CURATED_CASES = [
  { id: "contract/rest-flag", json: { root: 1, type: 7, isRest: true }, key: { tonic: "C", scale: "major" } },
  { id: "contract/rest-alias", json: { root: 1, rest: true }, key: { tonic: "C", scale: "major" } },
  { id: "contract/invalid-root", json: { root: 8, type: 7 }, key: { tonic: "C", scale: "major" } },
  { id: "contract/zero-root", json: { root: 0 }, key: { tonic: "C", scale: "major" } },
  { id: "contract/letter-anchored-slash", json: { root: 0, type: 5, _letterRootName: "C", _letterQuality: "minor", _letterBassName: "G" }, key: { tonic: "C", scale: "major" } },
  // 1. Basic Triads
  { id: "C Major I", json: { root: 1 }, key: { tonic: "C", scale: "major" } },
  { id: "C Major V", json: { root: 5 }, key: { tonic: "C", scale: "major" } },
  { id: "C Major vi", json: { root: 6 }, key: { tonic: "C", scale: "major" } },
  { id: "C Major IV", json: { root: 4 }, key: { tonic: "C", scale: "major" } },
  { id: "A Minor i", json: { root: 1 }, key: { tonic: "A", scale: "minor" } },
  { id: "A Minor v", json: { root: 5 }, key: { tonic: "A", scale: "minor" } },

  // 2. Sevenths
  { id: "C Major I7", json: { root: 1, type: 7 }, key: { tonic: "C", scale: "major" } },
  { id: "C Major V7", json: { root: 5, type: 7 }, key: { tonic: "C", scale: "major" } },
  { id: "C Major ii7", json: { root: 2, type: 7 }, key: { tonic: "C", scale: "major" } },
  { id: "C Major vii°7", json: { root: 7, type: 7 }, key: { tonic: "C", scale: "major" } },

  // 3. Inversions
  { id: "C Major I6 (inv 1)", json: { root: 1, inversion: 1 }, key: { tonic: "C", scale: "major" } },
  { id: "C Major I64 (inv 2)", json: { root: 1, inversion: 2 }, key: { tonic: "C", scale: "major" } },
  { id: "C Major V42 (inv 3)", json: { root: 5, type: 7, inversion: 3 }, key: { tonic: "C", scale: "major" } },

  // 4. Suspensions & Omits & Adds
  { id: "Isus4", json: { root: 1, suspensions: [4] }, key: { tonic: "C", scale: "major" } },
  { id: "Isus2", json: { root: 1, suspensions: [2] }, key: { tonic: "C", scale: "major" } },
  { id: "I5 (power chord)", json: { root: 1, omits: [3] }, key: { tonic: "C", scale: "major" } },
  { id: "I(add9)", json: { root: 1, adds: [9] }, key: { tonic: "C", scale: "major" } },

  // 5. Extensions (9, 11, 13)
  { id: "V9", json: { root: 5, type: 9 }, key: { tonic: "C", scale: "major" } },
  { id: "V11", json: { root: 5, type: 11 }, key: { tonic: "C", scale: "major" } },
  { id: "V13", json: { root: 5, type: 13 }, key: { tonic: "C", scale: "major" } },

  // 6. Alterations
  { id: "I+(#5)", json: { root: 1, alterations: ["#5"] }, key: { tonic: "C", scale: "major" } },
  { id: "ii7(b5)", json: { root: 2, type: 7, alterations: ["b5"] }, key: { tonic: "C", scale: "major" } },
  { id: "V7(b9)", json: { root: 5, type: 7, alterations: ["b9"] }, key: { tonic: "C", scale: "major" } },

  // 7. Applied / Secondary Dominants
  { id: "V/V", json: { root: 5, applied: 5 }, key: { tonic: "C", scale: "major" } },
  { id: "V7/vi", json: { root: 6, applied: 5, type: 7 }, key: { tonic: "C", scale: "major" } },
  { id: "vii°7/V", json: { root: 5, applied: 7, type: 7 }, key: { tonic: "C", scale: "major" } },
  { id: "V7/vi(maj)", json: { root: 6, applied: 5, type: 7 }, key: { tonic: "C", scale: "minor" } },

  // 8. Borrowed Chords / Modal Mixture
  { id: "iv(min) in C major", json: { root: 4, borrowed: "minor" }, key: { tonic: "C", scale: "major" } },
  { id: "bVI(min) in C major", json: { root: 6, borrowed: "minor" }, key: { tonic: "C", scale: "major" } },
  { id: "bVII(mix) in C major", json: { root: 7, borrowed: "mixolydian" }, key: { tonic: "C", scale: "major" } },
  { id: "V(hmin) in C minor", json: { root: 5, borrowed: "harmonicMinor" }, key: { tonic: "C", scale: "minor" } },
  { id: "bII(phdm) in C major", json: { root: 2, borrowed: "phrygianDominant" }, key: { tonic: "C", scale: "major" } },

  // 9. Figured Bass & Inversions
  { id: "I65", json: { root: 1, type: 7, inversion: 1 }, key: { tonic: "C", scale: "major" } },
  { id: "V43", json: { root: 5, type: 7, inversion: 2 }, key: { tonic: "C", scale: "major" } },
  { id: "ii42", json: { root: 2, type: 7, inversion: 3 }, key: { tonic: "C", scale: "major" } },
  { id: "Isus46", json: { root: 1, type: 5, suspensions: [4], inversion: 1 }, key: { tonic: "C", scale: "major" } },

  // 10. Advanced Composites
  { id: "iiø7(b5)", json: { root: 2, type: 7, alterations: ["b5"] }, key: { tonic: "C", scale: "major" } },
  { id: "V7(b9b13)", json: { root: 5, type: 7, alterations: ["b9", "b13"] }, key: { tonic: "C", scale: "major" } },
  { id: "V7(∆-sub)", json: { root: 5, applied: 5, type: 7, substitutions: ["tri"] }, key: { tonic: "C", scale: "major" } },

  // 11. Advanced Stress Tests (Fix Log 036+)
  { id: "I△9(no3no5)", json: { root: 1, type: 9, omits: [3, 5] }, key: { tonic: "C", scale: "major" } },
  { id: "iø6(b5)5", json: { root: 1, type: 7, inversion: 1, alterations: ["b5"] }, key: { tonic: "C", scale: "locrian" } },
  { id: "III+△7 (HM)", json: { root: 3, type: 7 }, key: { tonic: "C", scale: "harmonicMinor" } },
  { id: "v13 (Minor)", json: { root: 5, type: 13 }, key: { tonic: "C", scale: "minor" } },
  { id: "iiø65 (Minor)", json: { root: 2, type: 7, inversion: 1 }, key: { tonic: "C", scale: "minor" } },

  // 12. The Honesty (Billy Joel) regression. A borrowed tonic seventh in a
  //     major key: the seventh's quality must come from the BORROWED scale, not
  //     the song key, or the chord sounds a major seventh over a minor triad.
  { id: "Honesty i42(min) in Bb major", json: { root: 1, type: 7, inversion: 3, borrowed: "minor" }, key: { tonic: "Bb", scale: "major" } },
  { id: "Honesty bVI△7(min) in Bb major", json: { root: 6, type: 7, borrowed: "minor" }, key: { tonic: "Bb", scale: "major" } }
];

const SWEEP_KEYS = [
  { tonic: "C", scale: "major" },
  { tonic: "C", scale: "minor" },
  { tonic: "Bb", scale: "major" },
  { tonic: "F#", scale: "major" },
  { tonic: "Ab", scale: "minor" }
];

const NAMED_SCALES = [
  "minor", "dorian", "phrygian", "lydian",
  "mixolydian", "locrian", "major", "harmonicMinor", "phrygianDominant"
];

// A representative custom "borrowed" array (Hooktheory sends absolute semitone
// offsets rather than a mode name for user-defined scales).
const CUSTOM_INTERVALS = [0, 1, 4, 5, 7, 8, 11];

const MODIFIER_SETS = [
  { suspensions: [2] }, { suspensions: [4] },
  { alterations: ["b5"] }, { alterations: ["#5"] }, { alterations: ["b9"] },
  { alterations: ["#9"] }, { alterations: ["#11"] }, { alterations: ["b13"] },
  { adds: [9] }, { adds: [4] },
  { omits: [3] }, { omits: [5] }, { omits: [3, 5] }
];

function borrowedTag(borrowed) {
  if (!borrowed) return "none";
  return Array.isArray(borrowed) ? "custom" : borrowed;
}

function sweepCases() {
  const cases = [];

  // Borrowed sweep: every named mode and a custom array, across the whole
  // root/type/inversion space. This is the axis that had zero coverage and
  // that hid the iOS borrowed-seventh bug.
  for (const key of SWEEP_KEYS) {
    for (const borrowed of [null, ...NAMED_SCALES, CUSTOM_INTERVALS]) {
      for (let root = 1; root <= 7; root++) {
        for (const type of [5, 7, 9, 11, 13]) {
          // A triad has no third inversion; Hooktheory never emits one, and
          // feeding one in only exercises out-of-domain behaviour.
          const inversions = type >= 7 ? 4 : 3;
          for (let inversion = 0; inversion < inversions; inversion++) {
            const chord = { root, type, inversion };
            if (borrowed) chord.borrowed = borrowed;
            cases.push({
              id: `borrowed/${key.tonic}-${key.scale}/${borrowedTag(borrowed)}/r${root}t${type}i${inversion}`,
              json: chord,
              key
            });
          }
        }
      }
    }
  }

  // Applied sweep, including applied-over-borrowed, which routes through the
  // wider buildChordFromNoteName voicing on all three platforms.
  for (const key of SWEEP_KEYS) {
    for (const borrowed of [null, "minor", "locrian", CUSTOM_INTERVALS]) {
      for (let root = 1; root <= 7; root++) {
        for (let applied = 1; applied <= 7; applied++) {
          for (const type of [5, 7]) {
            for (let inversion = 0; inversion < 3; inversion++) {
              const chord = { root, applied, type, inversion };
              if (borrowed) chord.borrowed = borrowed;
              cases.push({
                id: `applied/${key.tonic}-${key.scale}/${borrowedTag(borrowed)}/r${root}a${applied}t${type}i${inversion}`,
                json: chord,
                key
              });
            }
          }
        }
      }
    }
  }

  // Modifier sweep: suspensions, alterations, adds and omits against each
  // triad/seventh/ninth frame.
  for (const key of SWEEP_KEYS.slice(0, 3)) {
    for (let root = 1; root <= 7; root++) {
      for (const type of [5, 7, 9]) {
        for (let modIndex = 0; modIndex < MODIFIER_SETS.length; modIndex++) {
          for (let inversion = 0; inversion < 3; inversion++) {
            cases.push({
              id: `modifier/${key.tonic}-${key.scale}/m${modIndex}/r${root}t${type}i${inversion}`,
              json: { root, type, inversion, ...MODIFIER_SETS[modIndex] },
              key
            });
          }
        }
      }
    }
  }

  // Tritone substitutions in every sweep key.
  for (const key of SWEEP_KEYS) {
    for (let root = 1; root <= 7; root++) {
      cases.push({
        id: `trisub/${key.tonic}-${key.scale}/r${root}`,
        json: { root, applied: 5, type: 7, substitutions: ["tri"] },
        key
      });
    }
  }

  return cases;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

async function exportCorpus() {
  const libUrl = (p) => require('url').pathToFileURL(path.join(repoRoot, 'web', 'lib', p)).href;
  const sym = await import(libUrl('jsonToSymbol.js'));
  const music = await import(libUrl('music.js'));

  const results = [];
  const seen = new Set();


  for (const testCase of [...CURATED_CASES, ...sweepCases()]) {
    const chord = { ...testCase.json };
    if (chord.type === undefined) chord.type = 5; // Default to 5 for parity

    const serialized = JSON.stringify(chord);
    const signature = `${serialized}|${testCase.key.tonic}|${testCase.key.scale}`;
    if (seen.has(signature)) continue; // curated cases win; sweep duplicates drop
    seen.add(signature);

    const interpreted = music.chordInterpreter(chord, testCase.key);
    const notes = (interpreted && interpreted.notes) || [];
    const midi = notes.map(noteNameToMidi);
    if (midi.some((value) => value == null)) {
      throw new Error(`Cannot voice parity case ${testCase.id}`);
    }

    const rootMidi = interpreted.rootMidi;

    results.push({
      id: testCase.id,
      json: serialized,
      key: testCase.key,
      expectedRoman: sym.getChordSymbol(chord, testCase.key),
      expectedLetter: sym.getChordLetterName(chord, testCase.key),
      expectedPcs: Array.from(new Set(midi.map((m) => ((m % 12) + 12) % 12))).sort((a, b) => a - b),
      expectedMidi: midi,
      // The label anchor, so a chord-tone failure separates "wrong voicing"
      // from "wrong root" instead of collapsing both into one bad label.
      expectedRootMidi: rootMidi,
      expectedToneLabels: interpreted.chordDegrees.map((role) => `${role.replace(/b/g, "♭").replace(/#/g, "♯")}̂`),
      webChordDegrees: interpreted.chordDegrees
    });
  }

  const targetPath = path.join(repoRoot, 'contracts', 'fixtures', 'corpus_parity.json');
  // One object per line: a regenerated corpus then produces a line-oriented
  // diff instead of a single unreadable blob.
  const body = results.map((entry) => `  ${JSON.stringify(entry)}`).join(',\n');
  fs.writeFileSync(targetPath, `[\n${body}\n]\n`, 'utf8');
  console.log(`Exported ${results.length} parity cases to ${path.relative(repoRoot, targetPath)}`);
}

async function refreshRealParitySnapshot() {
  const { interpretChordContract } = await import('../../web/lib/chordContract.js');
  const file = path.join(repoRoot, 'contracts/fixtures/hooktheory_parity.json');
  const cases = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const test of cases) {
    const actual = interpretChordContract(JSON.parse(test.json), test.key);
    Object.assign(test, {
      expectedRoman: actual.roman, expectedLetter: actual.letter,
      expectedPcs: actual.pcs, expectedMidi: actual.midi,
      expectedRootMidi: actual.rootMidi, expectedToneLabels: actual.toneLabels,
    });
  }
  // Preserve id, input, occurrence counts and all independent truth* fields.
  fs.writeFileSync(file, '[\n' + cases.map((test) => '  ' + JSON.stringify(test)).join(',\n') + '\n]\n');
  console.log('Refreshed real-song parity snapshot (' + cases.length + ' cases); source truth unchanged.');
}

exportCorpus().then(() => refreshRealParitySnapshot()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
