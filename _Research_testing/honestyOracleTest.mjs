/**
 * Scrape Billy Joel Honesty and compare inversion roman symbols vs engine.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const require = createRequire(import.meta.url);

const { getHarvestRoot } = require(path.join(REPO, 'lib', 'dataRoot.js'));
const { scrapeSong } = require(path.join(REPO, '_Decode_oracle', 'scrapeSong.js'));
const { compareSong } = require(path.join(REPO, '_Decode_oracle', 'compare.js'));
const { canonRoman } = require(path.join(REPO, '_Decode_oracle', 'normalize.js'));
const { getChordSymbol } = await import(pathToFileURL(path.join(REPO, 'web-player', 'lib', 'jsonToSymbol.js')).href);
const { tokenizeRomanNumeral } = await import(pathToFileURL(path.join(REPO, 'web-player', 'lib', 'romanNumeralCanvas.js')).href);
const { activeKeyAtBeat } = require(path.join(REPO, '_Decode_oracle', 'engineRun.js'));

const URL = 'https://www.hooktheory.com/theorytab/view/billy-joel/honesty';
const OUT_DIR = path.join(getHarvestRoot(), 'billy-joel__honesty');

fs.mkdirSync(OUT_DIR, { recursive: true });
console.log('Scraping', URL);
const scrape = await scrapeSong(URL, OUT_DIR, { verbose: true, skipScreenshots: true, scrapePiano: false });
fs.writeFileSync(path.join(OUT_DIR, 'scrape.json'), JSON.stringify(scrape, null, 2));

const cmp = await compareSong(scrape);
const reportPath = path.join(REPO, '_Research_testing', 'honestyOracleReport.json');

const inversionMismatches = [];
const inversionMatches = [];
let total = 0;
let romanExact = 0;

for (let si = 0; si < cmp.sections.length; si++) {
  const sec = cmp.sections[si];
  const json = scrape.sections[si]?.json || {};
  const keys = json.metadata?.keys || [];
  for (const row of sec.rows) {
    total += 1;
    const key = activeKeyAtBeat(keys, row.beat ?? 1);
    const engNow = getChordSymbol(row.chord, key);
    const exact = canonRoman(row.truthRoman) === canonRoman(engNow);
    if (exact) romanExact += 1;
    const inv = row.chord?.inversion || 0;
    const entry = {
      section: sec.name,
      beat: row.beat,
      inversion: inv,
      type: row.chord?.type,
      truthRoman: row.truthRoman,
      engRoman: engNow,
      engCompare: row.engRoman,
      tokens: tokenizeRomanNumeral(engNow),
      truthTokens: tokenizeRomanNumeral(row.truthRoman),
      flags: row.flags,
    };
    if (inv > 0 || /\d/.test(row.truthRoman)) {
      if (exact) inversionMatches.push(entry);
      else inversionMismatches.push(entry);
    }
  }
}

const report = {
  title: scrape.title,
  url: URL,
  total,
  romanExact,
  romanExactPct: total ? ((100 * romanExact) / total).toFixed(1) : '0',
  inversionMismatches,
  inversionMatches: inversionMatches.slice(0, 20),
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log('Report:', reportPath);
console.log(`Total ${total}, romanExact ${romanExact} (${report.romanExactPct}%)`);
console.log(`Inversion-related mismatches: ${inversionMismatches.length}`);
for (const m of inversionMismatches.slice(0, 25)) {
  console.log(`  ${m.section} b${m.beat} inv=${m.inversion}: truth=${m.truthRoman} eng=${m.engRoman}`);
}
