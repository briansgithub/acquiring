#!/usr/bin/env node
/**
 * batchScrapeCorpus.js — scrape missing corpus songs (cached skip).
 *
 *   node _Decode_oracle/batchScrapeCorpus.js --corpus _Decode_oracle/corpus3.json
 *   node _Decode_oracle/batchScrapeCorpus.js --corpus corpus3.json --limit 20
 *   node _Decode_oracle/batchScrapeCorpus.js --corpus corpus3.json --compare
 */

const fs = require('fs');
const path = require('path');
const { resolveEntry, runResolvedSong, slugForUrl, scrapeOk } = require('./run');

const OUT = path.join(__dirname, 'out');

function parseArgs(argv) {
  const out = {
    corpusFile: null,
    limit: Infinity,
    compare: false,
    browser: false,
    rescrape: false,
    start: 0,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--corpus') out.corpusFile = path.resolve(argv[++i]);
    else if (a === '--limit') out.limit = Number(argv[++i]) || Infinity;
    else if (a === '--start') out.start = Number(argv[++i]) || 0;
    else if (a === '--compare') out.compare = true;
    else if (a === '--browser') out.browser = true;
    else if (a === '--rescrape') out.rescrape = true;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function hasScrape(slug) {
  const f = path.join(OUT, slug, 'scrape.json');
  if (!fs.existsSync(f)) return false;
  try {
    const s = JSON.parse(fs.readFileSync(f, 'utf8'));
    return scrapeOk(s);
  } catch (_) {
    return false;
  }
}

function pct(n, d) {
  return d ? `${((100 * n) / d).toFixed(0)}%` : '-';
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.corpusFile) {
    console.log(`Usage: node batchScrapeCorpus.js --corpus corpus.json [--limit N] [--start N] [--compare] [--rescrape]`);
    process.exit(opts.corpusFile ? 0 : 1);
  }

  const entries = JSON.parse(fs.readFileSync(opts.corpusFile, 'utf8'));
  const pending = entries.filter((e) => {
    const slug = slugForUrl(e.url);
    return opts.rescrape || !hasScrape(slug);
  });

  const slice = pending.slice(opts.start, opts.start + opts.limit);
  console.log(`[batchScrape] corpus=${path.basename(opts.corpusFile)} total=${entries.length} pending=${pending.length} run=${slice.length}`);

  const stats = { ok: 0, fail: 0, cached: 0 };
  const runOpts = { browser: opts.browser, rescrape: opts.rescrape };

  for (let i = 0; i < slice.length; i++) {
    const entry = slice[i];
    const slug = slugForUrl(entry.url);
    console.log(`\n[${i + 1}/${slice.length}] rank=${entry.complexityRank ?? '?'} tier=${entry.tier} ${slug}`);
    try {
      const resolved = await resolveEntry(entry, runOpts);
      if (!resolved || !scrapeOk(resolved.scrape)) {
        console.log('  FAILED');
        stats.fail++;
        continue;
      }
      if (resolved.cached) stats.cached++;
      if (opts.compare) {
        const { result } = await runResolvedSong(resolved, runOpts);
        console.log(`  notesOk=${pct(result.notesOk, result.total)} chords=${result.total}`);
      }
      stats.ok++;
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
      stats.fail++;
    }
  }

  const withScrape = entries.filter((e) => hasScrape(slugForUrl(e.url))).length;
  console.log(`\n[batchScrape] done ok=${stats.ok} fail=${stats.fail} cached=${stats.cached}`);
  console.log(`[batchScrape] corpus scrape coverage: ${withScrape}/${entries.length} (${pct(withScrape, entries.length)})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
