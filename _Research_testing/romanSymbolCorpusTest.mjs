/**
 * Re-run getChordSymbol across all chord_db corpora and compare to Hooktheory ground truth.
 * Usage: node _Research_testing/romanSymbolCorpusTest.mjs [--fix-report]
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

const { canonRoman, canonCore } = await import(pathToFileURL(path.join(REPO, '_Decode_oracle', 'normalize.js')).href);
const { getChordSymbol } = await import(pathToFileURL(path.join(REPO, 'web-player', 'lib', 'jsonToSymbol.js')).href);
const { tokenizeRomanNumeral } = await import(pathToFileURL(path.join(REPO, 'web-player', 'lib', 'romanNumeralCanvas.js')).href);

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

const entries = loadEntries();
let romanExact = 0;
let romanCore = 0;
const mismatches = [];

for (const entry of entries) {
  const engRoman = getChordSymbol(entry.chord, entry.key);
  const exact = canonRoman(entry.truthRoman) === canonRoman(engRoman);
  const core = canonCore(entry.truthRoman) === canonCore(engRoman);
  if (exact) romanExact += 1;
  if (core) romanCore += 1;
  if (!exact) {
    mismatches.push({
      id: entry.id,
      truthRoman: entry.truthRoman,
      engRoman,
      truthCanon: canonRoman(entry.truthRoman),
      engCanon: canonRoman(engRoman),
      tokens: tokenizeRomanNumeral(engRoman),
    });
  }
}

const summary = {
  total: entries.length,
  romanExact,
  romanExactPct: entries.length ? ((100 * romanExact) / entries.length).toFixed(1) : '0',
  romanCore,
  romanCorePct: entries.length ? ((100 * romanCore) / entries.length).toFixed(1) : '0',
  mismatchCount: mismatches.length,
};

const reportPath = path.join(REPO, '_Research_testing', 'romanSymbolCorpusReport.json');
fs.writeFileSync(reportPath, JSON.stringify({ summary, mismatches: mismatches.slice(0, 200) }, null, 2));

console.log('Corpus roman symbol test');
console.log(summary);
console.log(`Report: ${reportPath}`);
if (mismatches.length) {
  console.log('\nFirst 15 mismatches:');
  for (const m of mismatches.slice(0, 15)) {
    console.log(`  ${m.id}: truth=${m.truthRoman} eng=${m.engRoman}`);
  }
}

process.exit(mismatches.length > 0 ? 1 : 0);
