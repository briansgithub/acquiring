/**
 * Cross-check letter pronunciation against corpus truthLetter samples.
 * Usage: node _Research_testing/romanPronunciationLetterTest.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');

const CORPUS_DIRS = [
  'chord_db',
  'chord_db_corpus2',
  'chord_db_corpus3',
  'chord_db_corpus4',
].map((d) => path.join(REPO, '_Decode_oracle', d, 'byModification'));

const { getChordPronunciation } = await import(
  pathToFileURL(path.join(REPO, 'web-player', 'lib', 'romanNumeralSpeak.js')).href
);
const { getChordLetterName } = await import(
  pathToFileURL(path.join(REPO, 'web-player', 'lib', 'jsonToSymbol.js')).href
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
  return [...byId.values()].filter((e) => e.chord?.root && !e.chord.isRest && e.truthLetter);
}

/** Minimal normalization: root note name must appear in spoken letter. */
function letterRootMatches(spoken, truthLetter) {
  if (!spoken || !truthLetter) return false;
  const rootMatch = truthLetter.match(/^([A-Ga-g][#bx]*)/);
  if (!rootMatch) return spoken.length > 0;
  const root = rootMatch[1];
  const letter = root[0].toUpperCase();
  const acc = root.slice(1);
  if (!spoken.includes(letter)) return false;
  if (acc.includes('#') && !spoken.includes('sharp')) return false;
  if (acc.includes('b') && !spoken.includes('flat')) return false;
  return true;
}

const entries = loadEntries();
let pass = 0;
const failures = [];

for (const entry of entries) {
  const engLetter = getChordLetterName(entry.chord, entry.key);
  const spoken = getChordPronunciation(entry.chord, entry.key).letter;
  const ok = engLetter ? letterRootMatches(spoken, engLetter) : spoken === '';
  if (ok) pass += 1;
  else failures.push({ id: entry.id, truthLetter: entry.truthLetter, engLetter, spoken });
}

const summary = {
  total: entries.length,
  pass,
  passPct: entries.length ? ((100 * pass) / entries.length).toFixed(1) : '0',
  failCount: failures.length,
};

const reportPath = path.join(REPO, '_Research_testing', 'romanPronunciationLetterReport.json');
fs.writeFileSync(reportPath, JSON.stringify({ summary, failures: failures.slice(0, 100) }, null, 2));

console.log('Letter pronunciation cross-check');
console.log(summary);
console.log(`Report: ${reportPath}`);

if (failures.length) {
  console.log('\nFirst 10 failures:');
  for (const f of failures.slice(0, 10)) {
    console.log(`  ${f.id}: truth=${f.truthLetter} eng=${f.engLetter} spoken=${f.spoken}`);
  }
}

process.exit(failures.length > 0 ? 1 : 0);
