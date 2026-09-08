/**
 * Verify ø/° superscript tokenization against the committed captured source corpus.
 * Usage: node _Research_testing/halfDimSuperscriptVerify.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');

const { tokenizeRomanNumeral, romanNumeralToHtml } = await import(
  pathToFileURL(path.join(REPO, '..', 'web', 'lib', 'romanNumeralCanvas.js')).href
);
const cases = JSON.parse(fs.readFileSync(
  path.join(REPO, '..', 'contracts', 'fixtures', 'hooktheory_parity.json'),
  'utf8',
));

let failed = 0;
let checked = 0;

for (const row of cases) {
  for (const truth of new Set([row.truthRoman, row.expectedRoman])) {
    if (!/[°ø]/.test(truth)) continue;
    checked += 1;
    const tokens = tokenizeRomanNumeral(truth);
    const base = tokens.filter((t) => t.kind === 'base').map((t) => t.text).join('');
    const html = romanNumeralToHtml(truth);
    const qFigured = /[°ø](?:42|43|65|64|46)/.test(truth);
    const hasQualityGrid = !qFigured || html.includes('roman-stack--quality');
    const dimUsesCircle = !truth.includes('°') || (html.includes('roman-quality--dim') && html.includes('○'));
    const equalFiguredDigits = !html.includes('roman-stack--quality')
      || (html.includes('roman-figured-digit') && !html.match(/roman-stack--quality[^>]*>[\s\S]*?<sup(?![^>]*roman-figured-digit)/));
    const ok = !base.includes('ø') && !base.includes('°') && hasQualityGrid && dimUsesCircle && equalFiguredDigits;
    if (!ok) {
      failed += 1;
      console.error('FAIL', row.id, truth, tokens);
    }
  }
}

if (failed || !checked) {
  console.error(`${failed} failures`);
  process.exit(1);
}
console.log(`ALL_PASS (${checked} ø/° chords checked)`);
