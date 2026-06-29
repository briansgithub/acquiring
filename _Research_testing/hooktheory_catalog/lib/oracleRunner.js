/**
 * Run decode-oracle for a single TheoryTab URL (no browser verify).
 */

const path = require('path');
const { REPO_ROOT } = require('./paths');
const { scrapeWithCache, runResolvedSong, scrapeOk } = require('../../../_Decode_oracle/run');

async function runOracleForUrl(url) {
  const resolved = await scrapeWithCache(url, { rescrape: false });
  if (!scrapeOk(resolved.scrape)) {
    throw new Error('Oracle scrape found no chord data');
  }
  const { result, rep } = await runResolvedSong(resolved, { browser: false });
  const relOut = path.relative(REPO_ROOT, resolved.dir).split(path.sep).join('/');
  const summary = {
    total: rep.total,
    notesOk: rep.notesOk,
    romanExact: rep.romanExact,
    romanCore: rep.romanCore,
    discrepancies: rep.discrepancies,
    testedAt: new Date().toISOString(),
    slug: result.slug,
    sections: rep.sectionStats || [],
    attributes: rep.attributeStats || [],
  };
  return { outDir: relOut, absDir: resolved.dir, summary, result };
}

module.exports = { runOracleForUrl };
