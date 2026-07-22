/**
 * Corpus smoke test: every chord_db entry must produce valid pronunciation.
 * Usage: node _Research_testing/romanPronunciationCorpusTest.mjs
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

const { getChordPronunciation, UNKNOWN } = await import(
  pathToFileURL(path.join(REPO, 'web-player', 'lib', 'romanNumeralSpeak.js')).href
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
  return [...byId.values()];
}

const entries = loadEntries().filter((e) => e.chord?.root && !e.chord.isRest);
const unknowns = [];
const empty = [];

for (const entry of entries) {
  if (!entry.chord?.root || entry.chord.isRest) continue;
  const p = getChordPronunciation(entry.chord, entry.key);
  if (!p.analytic || !p.functional) empty.push(entry.id);
  if (p.analytic === UNKNOWN || p.functional === UNKNOWN || p.functionalLetter === UNKNOWN) {
    unknowns.push({
      id: entry.id,
      truthRoman: entry.truthRoman,
      analytic: p.analytic,
      functional: p.functional,
      buckets: entry.buckets,
    });
  }
}

const summary = {
  total: entries.length,
  unknownCount: unknowns.length,
  emptyCount: empty.length,
};

const reportPath = path.join(REPO, '_Research_testing', 'romanPronunciationCorpusReport.json');
fs.writeFileSync(reportPath, JSON.stringify({ summary, unknowns: unknowns.slice(0, 200) }, null, 2));

console.log('Corpus pronunciation smoke test');
console.log(summary);
console.log(`Report: ${reportPath}`);

if (unknowns.length) {
  console.log('\nFirst 10 unknowns:');
  for (const u of unknowns.slice(0, 10)) {
    console.log(`  ${u.id}: ${u.truthRoman}`);
  }
}

process.exit(unknowns.length > 0 || empty.length > 0 ? 1 : 0);
