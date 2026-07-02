/**
 * Verify ø/° superscript tokenization against Hooktheory SVG fragments (Gladiolus Rag).
 * Usage: node _Research_testing/halfDimSuperscriptVerify.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');

const { tokenizeRomanNumeral, romanNumeralToHtml } = await import(
  pathToFileURL(path.join(REPO, 'web-player', 'lib', 'romanNumeralCanvas.js')).href
);
const { chordTruth } = await import(
  pathToFileURL(path.join(REPO, '_Decode_oracle', 'svgTruth.js')).href
);

const scrape = JSON.parse(fs.readFileSync(
  path.join(REPO, 'sacred_ring_data', 'harvest', 'scott-joplin__gladiolus-rag', 'scrape.json'),
  'utf8',
));

let failed = 0;
let checked = 0;

for (const sec of scrape.sections) {
  for (const r of sec.rendered) {
    if (!/[°ø]/.test(r.raw)) continue;
    checked += 1;
    const truth = chordTruth(r).roman;
    const tokens = tokenizeRomanNumeral(truth);
    const base = tokens.find((t) => t.kind === 'base')?.text || '';
    const html = romanNumeralToHtml(truth);
    const qFigured = /[°ø]\d{2}/.test(truth) && !/[°ø]\d{2}\//.test(truth.split('(')[0]);
    const hasQualityGrid = !qFigured || html.includes('roman-stack--quality');
    const dimUsesCircle = !truth.includes('°') || (html.includes('roman-quality--dim') && html.includes('○'));
    const equalFiguredDigits = !html.includes('roman-stack--quality')
      || (html.includes('roman-figured-digit') && !html.match(/roman-stack--quality[^>]*>[\s\S]*?<sup(?![^>]*roman-figured-digit)/));
    const ok = !base.includes('ø') && !base.includes('°') && hasQualityGrid && dimUsesCircle && equalFiguredDigits;
    if (!ok) {
      failed += 1;
      console.error('FAIL', sec.name, truth, tokens);
    }
  }
}

if (failed) {
  console.error(`${failed} failures`);
  process.exit(1);
}
console.log(`ALL_PASS (${checked} ø/° chords checked)`);
