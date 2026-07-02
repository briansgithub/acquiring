/**
 * Unit tests for chord pronunciation engine.
 * Usage: node _Research_testing/romanPronunciationTest.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');

const { getChordPronunciation, UNKNOWN } = await import(
  pathToFileURL(path.join(REPO, 'web-player', 'lib', 'romanNumeralSpeak.js')).href
);

const fixturesPath = path.join(REPO, '_Research_testing', 'pronunciationFixtures.json');
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

let failed = 0;

for (const fx of fixtures) {
  const got = getChordPronunciation(fx.chord, fx.key);
  for (const field of ['analytic', 'functional', 'letter']) {
    if (got[field] !== fx[field]) {
      console.error(`FAIL [${fx.id}] ${field}`);
      console.error(`  expected: ${fx[field]}`);
      console.error(`  got:      ${got[field]}`);
      failed += 1;
    }
  }
}

const key = { tonic: 'G', scale: 'major' };
const susA = { root: 5, type: 7, suspensions: [2, 4], applied: 0, borrowed: null };
const susB = { root: 5, type: 7, suspensions: [4, 2], applied: 0, borrowed: null };
const readA = getChordPronunciation(susA, key);
const readB = getChordPronunciation(susB, key);
if (readA.analytic !== readB.analytic) {
  console.error('FAIL sus order invariance');
  console.error(`  [2,4]: ${readA.analytic}`);
  console.error(`  [4,2]: ${readB.analytic}`);
  failed += 1;
}

const rest = getChordPronunciation({ isRest: true }, key);
if (rest.analytic !== '' || rest.functional !== '') {
  console.error('FAIL rest chord should be empty');
  failed += 1;
}

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}

console.log(`OK — ${fixtures.length} fixtures, sus invariance, rest chord`);
