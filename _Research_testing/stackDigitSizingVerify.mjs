/**
 * Verify figured-bass stack superscript/subscript sizing parity in HTML output.
 * Usage: node _Research_testing/stackDigitSizingVerify.mjs
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');

const { romanNumeralToHtml } = await import(
  pathToFileURL(path.join(REPO, 'web-player', 'lib', 'romanNumeralCanvas.js')).href
);

const CASES = ['I64', 'V65', 'ii43', 'viiø42', 'vii°42', 'vii°7/V'];

function stackUsesEqualFiguredDigits(html) {
  if (!html.includes('roman-stack')) return true;
  const stacks = html.match(/<span class="roman-stack[^"]*">[\s\S]*?<\/span>/g) || [];
  return stacks.every((stack) => {
    const sups = [...stack.matchAll(/<sup([^>]*)>/g)];
    const subs = [...stack.matchAll(/<sub([^>]*)>/g)];
    if (!sups.length || !subs.length) return true;
    const supOk = sups.every((m) => m[1].includes('roman-figured-digit'));
    const subOk = subs.every((m) => m[1].includes('roman-figured-digit'));
    return supOk && subOk;
  });
}

function noBareStackDigits(html) {
  return !html.match(/roman-stack[^>]*>[\s\S]*?<sup(?![^>]*roman-figured-digit)/);
}

let failed = 0;

for (const symbol of CASES) {
  const html = romanNumeralToHtml(symbol);
  const equalHtml = stackUsesEqualFiguredDigits(html);
  const noBare = noBareStackDigits(html);
  const dimChar = symbol.includes('°') ? html.includes('○') : true;
  const ok = equalHtml && noBare && dimChar;
  if (!ok) {
    failed += 1;
    console.error('FAIL', symbol, { html, equalHtml, noBare, dimChar });
  }
}

if (failed) {
  console.error(`${failed} failures`);
  process.exit(1);
}
console.log(`ALL_PASS (${CASES.length} stack sizing checks)`);
