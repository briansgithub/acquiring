/**
 * run.js
 * Decode-oracle orchestrator. For each song URL: scrape the rendered ground truth + JSON,
 * run the engine, compare, optionally verify browser display, and write reports under
 * _Decode_oracle/out/<slug>/.
 *
 * Usage:
 *   node _Decode_oracle/run.js <url> [<url> ...]
 *   node _Decode_oracle/run.js --corpus _Decode_oracle/corpus.json
 *   node _Decode_oracle/run.js --corpus _Decode_oracle/corpus.json --rescrape-truth
 *   node _Decode_oracle/run.js --no-browser <url>   # skip live player check
 *
 * Corpus entries may be {url, alternates:[...]}; if the primary URL fails to scrape, the
 * alternates are tried in order (auto-substitution). The resolved list is written to
 * corpus.resolved.json, and a cross-song GLOBAL_attribute_matrix.md / GLOBAL_summary.md /
 * GLOBAL_discrepancies.md are produced.
 *
 *   node _Decode_oracle/run.js --corpus _Decode_oracle/corpus.json --update-db
 */

const fs = require('fs');
const path = require('path');
const { scrapeSong } = require('./scrapeSong');
const { compareSong } = require('./compare');
const { buildReport } = require('./report');
const { verifyBrowser } = require('./browserVerify');

const OUT = path.join(__dirname, 'out');

function slugForUrl(url) {
  const m = url.match(/theorytab\/view\/([^/]+)\/([^/?#]+)/);
  return m ? `${m[1]}__${m[2]}` : url.replace(/[^a-z0-9]+/gi, '_').slice(0, 60);
}

function pct(n, d) { return d ? ((100 * n) / d).toFixed(0) + '%' : '-'; }

async function scrapeWithCache(url, { rescrape = false, rescrapeTruth = false } = {}) {
  const slug = slugForUrl(url);
  const dir = path.join(OUT, slug);
  fs.mkdirSync(dir, { recursive: true });
  const scrapeFile = path.join(dir, 'scrape.json');
  if (!rescrape && !rescrapeTruth && fs.existsSync(scrapeFile)) {
    return { slug, dir, scrape: JSON.parse(fs.readFileSync(scrapeFile, 'utf8')), cached: true };
  }
  if (rescrapeTruth && fs.existsSync(scrapeFile) && !rescrape) {
    try { fs.unlinkSync(scrapeFile); } catch (_) {}
  }
  const scrape = await scrapeSong(url, dir, { verbose: true, skipScreenshots: true, scrapePiano: true });
  fs.writeFileSync(scrapeFile, JSON.stringify(scrape, null, 2));
  return { slug, dir, scrape, cached: false };
}

function scrapeOk(scrape) {
  return scrape && scrape.sections && scrape.sections.length > 0 &&
    scrape.sections.some((s) => (s.rendered || []).length > 0);
}

// Resolve one corpus entry: try the primary URL, then alternates, return the first that scrapes.
async function resolveEntry(entry, opts) {
  const candidates = [entry.url, ...(entry.alternates || [])];
  for (let i = 0; i < candidates.length; i++) {
    const url = candidates[i];
    try {
      const r = await scrapeWithCache(url, opts);
      if (scrapeOk(r.scrape)) return { ...r, url, substituted: i > 0, triedFrom: entry.url };
      console.log(`  [resolve] no chords at ${url}${r.scrape.errors && r.scrape.errors.length ? ' (' + r.scrape.errors.join('; ') + ')' : ''}`);
    } catch (e) {
      console.log(`  [resolve] error at ${url}: ${e.message}`);
    }
  }
  return null;
}

function mergeMatrix(into, from) {
  for (const [k, e] of from) {
    if (!into.has(k)) into.set(k, { total: 0, romanExact: 0, romanCore: 0, notesOk: 0, browserOk: 0 });
    const t = into.get(k);
    t.total += e.total; t.romanExact += e.romanExact; t.romanCore += e.romanCore;
    t.notesOk += e.notesOk; t.browserOk += e.browserOk || 0;
  }
}

function applyBrowserResults(cmp, browserResult) {
  const failMap = new Map(browserResult.failures.map((f) => [`${f.section}:${f.beat}`, f]));
  for (const sec of cmp.sections) {
    for (const row of sec.rows) {
      if (browserResult.skipped) {
        row.browserOk = null;
        continue;
      }
      const fail = failMap.get(`${sec.name}:${row.beat}`);
      row.browserOk = !fail;
      if (fail) row.browserNotes = fail.domNotes;
    }
  }
}

function writeGlobal(results, globalMatrix, globalDiscrepancies, { browserRan = false } = {}) {
  const agg = results.reduce((a, r) => ({
    total: a.total + r.total, romanExact: a.romanExact + r.romanExact,
    romanCore: a.romanCore + r.romanCore, notesOk: a.notesOk + r.notesOk,
    browserOk: a.browserOk + (r.browserOk || 0),
  }), { total: 0, romanExact: 0, romanCore: 0, notesOk: 0, browserOk: 0 });

  const browserLine = browserRan
    ? `- Browser matches engine: **${pct(agg.browserOk, agg.total)}** (${agg.browserOk}/${agg.total})\n`
    : `- Browser matches engine: **skipped** (start web-player at :3000 and rerun without \`--no-browser\`)\n`;

  let sm = `# Decode oracle — global summary\n\n`;
  sm += `Songs: **${results.length}** | Chords: **${agg.total}**\n\n`;
  sm += `- Roman exact: **${pct(agg.romanExact, agg.total)}** (${agg.romanExact}/${agg.total})\n`;
  sm += `- Roman core: **${pct(agg.romanCore, agg.total)}** (${agg.romanCore}/${agg.total})\n`;
  sm += `- Notes exact: **${pct(agg.notesOk, agg.total)}** (${agg.notesOk}/${agg.total})\n`;
  sm += browserLine + `\n`;
  const browserCol = browserRan ? 'browserOk' : 'browser';
  sm += `| Song | chords | romanExact | romanCore | notesOk | ${browserCol} | disc |\n|---|---|---|---|---|---|---|\n`;
  results.forEach((r) => {
    const bo = browserRan ? pct(r.browserOk || 0, r.total) : '—';
    sm += `| ${r.slug} | ${r.total} | ${pct(r.romanExact, r.total)} | ${pct(r.romanCore, r.total)} | ${pct(r.notesOk, r.total)} | ${bo} | ${r.discrepancies} |\n`;
  });
  fs.writeFileSync(path.join(OUT, 'GLOBAL_summary.md'), sm);

  let am = `# Global attribute accuracy matrix (${results.length} songs, ${agg.total} chords)\n\n`;
  am += `| Attribute | total | romanExact | romanCore | notesOk | browserOk |\n|---|---|---|---|---|---|\n`;
  [...globalMatrix.entries()].sort().forEach(([k, e]) => {
    am += `| ${k} | ${e.total} | ${pct(e.romanExact, e.total)} | ${pct(e.romanCore, e.total)} | ${pct(e.notesOk, e.total)} | ${pct(e.browserOk || 0, e.total)} |\n`;
  });
  fs.writeFileSync(path.join(OUT, 'GLOBAL_attribute_matrix.md'), am);

  // group discrepancies by a signature for clustering
  const clusters = new Map();
  for (const d of globalDiscrepancies) {
    const c = d.chord;
    const sig = `applied=${c.applied ? 'y' : 'n'} type=${c.type} inv=${c.inversion} borrowed=${Array.isArray(c.borrowed) ? 'array' : (c.borrowed || 'none')}` +
      (c.suspensions && c.suspensions.length ? ' sus' : '') + (c.alterations && c.alterations.length ? ' alt' : '') +
      (c.adds && c.adds.length ? ' add' : '') + (c.omits && c.omits.length ? ' omit' : '');
    if (!clusters.has(sig)) clusters.set(sig, []);
    clusters.get(sig).push(d);
  }
  let dm = `# Global discrepancies (${globalDiscrepancies.length}), clustered\n\n`;
  [...clusters.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([sig, list]) => {
    dm += `## [${list.length}] ${sig}\n\n`;
    list.slice(0, 8).forEach((d) => {
      dm += `- **${d.song} / ${d.section} b${d.beat}**: truth \`${d.truthRoman}\` (${d.truthLetter}) vs eng \`${d.engRoman}\` (${d.engLetter}) — fail: ${Object.entries(d.flags).filter(([, v]) => !v).map(([k]) => k).join(',')}\n`;
    });
    if (list.length > 8) dm += `- … and ${list.length - 8} more\n`;
    dm += `\n`;
  });
  fs.writeFileSync(path.join(OUT, 'GLOBAL_discrepancies.md'), dm);

  return agg;
}

async function runResolvedSong(resolved, opts = {}) {
  const cmp = await compareSong(resolved.scrape);
  if (opts.browser !== false) {
    try {
      const br = await verifyBrowser(resolved.scrape, cmp);
      applyBrowserResults(cmp, br);
      if (br.skipped) console.log(`  [browser] skipped: ${br.skipped}`);
      else console.log(`  [browser] ${br.passed}/${br.checked} DOM notes match engine`);
    } catch (e) {
      console.log(`  [browser] skipped: ${e.message}`);
      for (const sec of cmp.sections) for (const row of sec.rows) row.browserOk = null;
    }
  } else {
    for (const sec of cmp.sections) for (const row of sec.rows) row.browserOk = null;
  }
  const rep = buildReport(cmp, resolved.scrape, resolved.dir);
  console.log(`[${resolved.slug}] chords=${rep.total} romanExact=${rep.romanExact} notesOk=${rep.notesOk} browserOk=${rep.browserOk} disc=${rep.discrepancies}`);
  return {
    result: {
      slug: resolved.slug, url: resolved.url, total: rep.total,
      romanExact: rep.romanExact, romanCore: rep.romanCore, notesOk: rep.notesOk,
      browserOk: rep.browserOk, discrepancies: rep.discrepancies,
    },
    rep,
  };
}

async function runCorpus(corpusFile, opts) {
  const entries = JSON.parse(fs.readFileSync(corpusFile, 'utf8'));
  const resolvedList = [];
  const results = [];
  const globalMatrix = new Map();
  const globalDiscrepancies = [];

  for (const entry of entries) {
    console.log(`\n[tier ${entry.tier ?? '?'}] ${entry.url}`);
    const resolved = await resolveEntry(entry, opts);
    if (!resolved) { console.log(`  [resolve] FAILED (no working URL)`); resolvedList.push({ tier: entry.tier, requested: entry.url, resolved: null }); continue; }
    if (resolved.substituted) console.log(`  [resolve] substituted -> ${resolved.url}`);
    resolvedList.push({ tier: entry.tier, requested: entry.url, resolved: resolved.url, substituted: resolved.substituted, title: resolved.scrape.title });

    const { result, rep } = await runResolvedSong(resolved, opts);
    results.push({ tier: entry.tier, ...result });
    mergeMatrix(globalMatrix, rep.matrix);
    for (const d of rep.discrepancyList) globalDiscrepancies.push({ song: resolved.slug, ...d });
  }

  fs.writeFileSync(path.join(OUT, 'corpus.resolved.json'), JSON.stringify(resolvedList, null, 2));
  const agg = writeGlobal(results, globalMatrix, globalDiscrepancies, { browserRan: opts.browser !== false });

  console.log('\n===== CORPUS AGGREGATE =====');
  results.forEach((r) => console.log(`  T${r.tier} ${r.slug.padEnd(42)} chords=${String(r.total).padStart(4)} romanExact=${pct(r.romanExact, r.total).padStart(4)} notesOk=${pct(r.notesOk, r.total).padStart(4)} browserOk=${pct(r.browserOk || 0, r.total).padStart(4)} disc=${r.discrepancies}`));
  console.log(`  TOTAL: ${results.length} songs, ${agg.total} chords | romanExact ${pct(agg.romanExact, agg.total)} | romanCore ${pct(agg.romanCore, agg.total)} | notesOk ${pct(agg.notesOk, agg.total)} | browserOk ${pct(agg.browserOk, agg.total)}`);
  const failed = resolvedList.filter((x) => !x.resolved);
  if (failed.length) console.log(`  UNRESOLVED: ${failed.map((x) => x.requested).join(', ')}`);

  if (opts.updateDb) {
    const { updateChordDatabase } = require('./updateChordDb');
    console.log('\n[run] incremental chord DB update…');
    await updateChordDatabase({ corpusFile, useReports: true });
  }
}

async function runOne(url, opts) {
  const r = await scrapeWithCache(url, opts);
  if (!scrapeOk(r.scrape)) { console.log(`[${r.slug}] no chords`); return null; }
  const { result } = await runResolvedSong(r, opts);
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  let rescrape = false;
  let rescrapeTruth = false;
  let corpusFile = null;
  let browser = true;
  let updateDb = false;
  const urls = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--rescrape') rescrape = true;
    else if (args[i] === '--rescrape-truth') rescrapeTruth = true;
    else if (args[i] === '--no-browser') browser = false;
    else if (args[i] === '--update-db') updateDb = true;
    else if (args[i] === '--corpus') corpusFile = args[++i];
    else urls.push(args[i]);
  }
  const opts = { rescrape, rescrapeTruth, browser, updateDb };

  if (corpusFile) { await runCorpus(corpusFile, opts); return; }
  if (!urls.length) { console.error('No URLs provided'); process.exit(1); }
  const results = [];
  for (const url of urls) { try { const r = await runOne(url, opts); if (r) results.push(r); } catch (e) { console.error(`[${slugForUrl(url)}] ERROR`, e.message); } }
  const agg = results.reduce((a, r) => ({
    total: a.total + r.total, romanExact: a.romanExact + r.romanExact,
    romanCore: a.romanCore + r.romanCore, notesOk: a.notesOk + r.notesOk,
    browserOk: a.browserOk + (r.browserOk || 0),
  }), { total: 0, romanExact: 0, romanCore: 0, notesOk: 0, browserOk: 0 });
  console.log('\n===== AGGREGATE =====');
  results.forEach((r) => console.log(`  ${r.slug.padEnd(40)} chords=${String(r.total).padStart(4)} romanExact=${String(r.romanExact).padStart(4)} notesOk=${String(r.notesOk).padStart(4)} browserOk=${String(r.browserOk || 0).padStart(4)} disc=${r.discrepancies}`));
  console.log(`  TOTAL chords=${agg.total} romanExact=${agg.romanExact} romanCore=${agg.romanCore} notesOk=${agg.notesOk} browserOk=${agg.browserOk}`);
}

if (require.main === module) main();

module.exports = {
  runOne,
  slugForUrl,
  scrapeWithCache,
  resolveEntry,
  runResolvedSong,
  scrapeOk,
};
