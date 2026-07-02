/**
 * Verify pronunciation fixes for known audit issues.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const { getChordPronunciation } = await import(
  pathToFileURL(path.join(REPO, 'web-player', 'lib', 'romanNumeralSpeak.js')).href
);
const { getChordSymbol } = await import(
  pathToFileURL(path.join(REPO, 'web-player', 'lib', 'jsonToSymbol.js')).href
);

const cases = [
  {
    id: 'H1-iv-min',
    chord: { root: 4, type: 5, inversion: 0, applied: 0, borrowed: 'minor' },
    key: { tonic: 'A', scale: 'major' },
    expectAnalytic: 'four minor',
    expectNo: ['minor minor'],
  },
  {
    id: 'H2-applied-dim-denom',
    chord: { root: 2, type: 7, inversion: 0, applied: 5, omits: [5], suspensions: [2, 4], borrowed: '' },
    key: { tonic: 'C', scale: 'minor' },
    expectAnalytic: 'of two diminished',
  },
  {
    id: 'H3-alt-hash2-three',
    chord: { root: 5, type: 5, inversion: 1, applied: 0, alterations: ['#2', '3'], suspensions: [2], borrowed: 'locrian' },
    key: { tonic: 'Eb', scale: 'major' },
    expectAnalytic: 'sharp two',
    expectNo: ['#2', ' #2', '(3)'],
  },
  {
    id: 'H4-bor-custom',
    chord: { root: 7, borrowed: [1, 3, 4, 6, 8, 10, 11] },
    key: { tonic: 'Ab', scale: 'major' },
    expectFunctional: 'custom scale',
    expectNo: ['borrowed from borrowed'],
  },
  {
    id: 'H5-half-dim',
    chord: { root: 2, type: 11, inversion: 0, applied: 0, omits: [3, 5], alterations: ['b5', 'b9'], borrowed: null },
    key: { tonic: 'A', scale: 'minor' },
    expectAnalytic: 'two minor half-diminished',
    expectNo: ['diminished half-diminished'],
  },
];

let failed = 0;
for (const c of cases) {
  const symbol = getChordSymbol(c.chord, c.key);
  const p = getChordPronunciation(c.chord, c.key);
  const issues = [];
  if (c.expectAnalytic && !p.analytic.includes(c.expectAnalytic)) issues.push(`missing analytic: ${c.expectAnalytic}`);
  if (c.expectFunctional && !p.functional.includes(c.expectFunctional)) issues.push(`missing functional: ${c.expectFunctional}`);
  for (const bad of c.expectNo || []) {
    if (p.analytic.includes(bad) || p.functional.includes(bad)) issues.push(`contains bad: ${bad}`);
  }
  for (const bad of c.expectNoExact || []) {
    if (p.analytic.includes(bad) || p.functional.includes(bad)) issues.push(`contains bad exact: ${bad}`);
  }
  const pass = issues.length === 0;
  if (!pass) failed += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${c.id} ${symbol} — analytic: ${p.analytic} | functional: ${p.functional}`);
  if (issues.length) console.log('  ', issues.join('; '));
}

console.log(failed ? `FAILURES: ${failed}/${cases.length}` : `ALL_PASS: ${cases.length}/${cases.length}`);
process.exit(failed > 0 ? 1 : 0);
