/**
 * Note-order verification: engine voicing contract + bass-first for inversions.
 * Usage: node _Research_testing/verifyNoteOrder.mjs [--strict]
 *
 * Core gate (always): inv=0 notes are MIDI-ascending (matches finalizeVoicing).
 * Informational: inv>0 bass PC vs truthLetter slash and vs engine letter slash.
 * --strict: exit 1 on any inv>0 truth-bass mismatch.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STRICT = process.argv.includes('--strict');

const CORPUS_DIRS = [
  'chord_db',
  'chord_db_corpus2',
  'chord_db_corpus3',
  'chord_db_corpus4',
].map((d) => path.join(REPO, '_Decode_oracle', d, 'byModification'));

const { chordInterpreter } = await import(
  pathToFileURL(path.join(REPO, 'web-player', 'lib', 'music.js')).href
);
const { getChordLetterName } = await import(
  pathToFileURL(path.join(REPO, 'web-player', 'lib', 'jsonToSymbol.js')).href
);
const { noteToMidi } = await import(
  pathToFileURL(path.join(REPO, 'web-player', 'lib', 'chordVoicing.js')).href
);
const { noteNameToPc } = await import(
  pathToFileURL(path.join(REPO, 'web-player', 'lib', 'chordNoteUtils.js')).href
);

function loadEntries() {
  const byId = new Map();
  for (const dir of CORPUS_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      const rows = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        if (row?.id && row.chord && row.key) byId.set(row.id, row);
      }
    }
  }
  return [...byId.values()].filter((e) => e.chord?.root && !e.chord.isRest);
}

function isAscendingMidi(notes) {
  for (let i = 1; i < notes.length; i++) {
    if (noteToMidi(notes[i]) < noteToMidi(notes[i - 1])) return false;
  }
  return true;
}

function bassPcFromLetter(letter) {
  const slash = String(letter || '').lastIndexOf('/');
  if (slash < 0) return null;
  return noteNameToPc(letter.slice(slash + 1));
}

function checkEntry(entry) {
  const { chord, key } = entry;
  const inv = chord.inversion || 0;
  const { notes } = chordInterpreter(chord, key);
  if (!notes?.length) return { hard: [], info: [] };

  const hard = [];
  const info = [];
  if (inv === 0) {
    if (!isAscendingMidi(notes)) hard.push({ rule: 'inv0-ascending', notes });
    return { hard, info };
  }

  const actualBassPc = noteNameToPc(notes[0]);
  const truthBassPc = bassPcFromLetter(entry.truthLetter);
  const engLetter = getChordLetterName(chord, key);
  const engBassPc = bassPcFromLetter(engLetter);

  if (truthBassPc != null && actualBassPc !== truthBassPc) {
    info.push({ rule: 'bass-vs-truth', truthLetter: entry.truthLetter, engLetter, actualBassPc, truthBassPc, notes });
  }
  if (engBassPc != null && actualBassPc !== engBassPc) {
    info.push({ rule: 'bass-vs-letter', engLetter, actualBassPc, engBassPc, notes });
  }
  return { hard, info };
}

const FIXTURES = [
  { id: 'c-major-I', chord: { root: 1, type: 5, inversion: 0 }, key: { tonic: 'C', scale: 'major' } },
  { id: 'dsharp-minor-III7-inv1', chord: { root: 3, type: 7, inversion: 1 }, key: { tonic: 'D#', scale: 'minor' } },
  { id: 'c-major-I-inv2', chord: { root: 1, type: 5, inversion: 2 }, key: { tonic: 'C', scale: 'major' } },
  { id: 'hm-ii-halfdim-inv1', chord: { root: 2, type: 7, inversion: 1, halfDim: true }, key: { tonic: 'C#', scale: 'harmonicMinor' } },
];

let fixtureFails = 0;
for (const fx of FIXTURES) {
  const { hard } = checkEntry(fx);
  if (hard.length) {
    console.error(`FAIL fixture ${fx.id}:`, hard[0]);
    fixtureFails += 1;
  }
}

const entries = loadEntries();
const hardFailures = [];
const infoFailures = [];
const byInv = { 0: { pass: 0, fail: 0 }, 1: { pass: 0, info: 0 }, 2: { pass: 0, info: 0 }, 3: { pass: 0, info: 0 } };

for (const entry of entries) {
  const inv = entry.chord.inversion || 0;
  const { hard, info } = checkEntry(entry);
  const bucket = byInv[inv] ?? byInv[0];

  if (hard.length) {
    if (inv === 0) bucket.fail += 1;
    hardFailures.push({ id: entry.id, inv, issues: hard.map((i) => i.rule), notes: hard[0].notes });
  } else if (inv === 0) {
    bucket.pass += 1;
  }

  if (info.length) {
    if (inv > 0) bucket.info += 1;
    infoFailures.push({ id: entry.id, inv, issues: info.map((i) => i.rule), detail: info[0] });
  } else if (inv > 0) {
    bucket.pass += 1;
  }
}

const summary = {
  total: entries.length,
  inv0AscendingPass: byInv[0].pass,
  inv0AscendingFail: byInv[0].fail,
  invGt0TruthBassInfo: infoFailures.filter((f) => f.issues.includes('bass-vs-truth')).length,
  invGt0LetterBassInfo: infoFailures.filter((f) => f.issues.includes('bass-vs-letter')).length,
  byInversion: byInv,
  fixtureFails,
  strict: STRICT,
};

const reportPath = path.join(REPO, '_Research_testing', 'verifyNoteOrderReport.json');
fs.writeFileSync(reportPath, JSON.stringify({ summary, hardFailures: hardFailures.slice(0, 50), infoFailures: infoFailures.slice(0, 80) }, null, 2));

console.log('Note order verification');
console.log(summary);
console.log(`Report: ${reportPath}`);

if (infoFailures.length) {
  console.log(`\nInfo: ${infoFailures.length} inv>0 bass PC mismatches (letter/truth vs notes[0])`);
  for (const f of infoFailures.slice(0, 5)) {
    console.log(`  inv=${f.inv} ${f.id}: ${f.issues.join(', ')}`);
  }
}

const exitCode = fixtureFails > 0 || byInv[0].fail > 0
  || (STRICT && infoFailures.some((f) => f.issues.includes('bass-vs-truth')))
    ? 1
    : 0;
process.exit(exitCode);
