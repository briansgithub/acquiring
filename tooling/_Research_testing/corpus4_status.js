#!/usr/bin/env node
/**
 * corpus4_status.js — scrape coverage for corpus4 manifest.
 *   node _Research_testing/corpus4_status.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '_Decode_oracle');
const CORPUS = path.join(ROOT, 'corpus4.json');
const OUT = path.join(ROOT, 'out');

function scrapeOk(scrape) {
  return scrape
    && scrape.sections
    && scrape.sections.some((s) => (s.rendered || []).length > 0);
}

function main() {
  const entries = JSON.parse(fs.readFileSync(CORPUS, 'utf8'));
  let ok = 0;
  let fail = 0;
  let pending = 0;
  for (const e of entries) {
    const f = path.join(OUT, e.slug, 'scrape.json');
    if (!fs.existsSync(f)) { pending++; continue; }
    try {
      if (scrapeOk(JSON.parse(fs.readFileSync(f, 'utf8')))) ok++;
      else fail++;
    } catch { fail++; }
  }
  console.log(`corpus4: ${entries.length} manifest | scraped=${ok} failed=${fail} pending=${pending}`);
  console.log(`coverage: ${((100 * ok) / entries.length).toFixed(1)}%`);
}

main();
