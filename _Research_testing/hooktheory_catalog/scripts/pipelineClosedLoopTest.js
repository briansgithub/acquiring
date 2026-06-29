#!/usr/bin/env node
/**
 * Closed-loop tests for Song Selector pipeline run + clear operations.
 *
 * Usage:
 *   node scripts/pipelineClosedLoopTest.js [--tier quick|full] [--case id] [--http]
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { openDb, upsertSong } = require('../lib/db');
const { parseTheoryTabUrl } = require('../lib/catalogUtils');
const {
  flagsPayload,
  runPipelineAction,
  clearPipelineAction,
} = require('../lib/pipelineOps');
const { startJob, getJob } = require('../lib/pipelineJobs');
const { resetCacheSync } = require('../lib/library');
const { DATA_DIR, REPO_ROOT } = require('../lib/paths');
const {
  assertFlags,
  assertRow,
  getRow,
  assertFsExists,
  assertFsMissing,
  sleep,
  seedHarvestFromCache,
} = require('./pipelineTestAssertions');
const { isHarvested, clearHarvestArtifact } = require('../lib/harvestArtifact');
const { runLocalsParallel } = require('../lib/runLocalsParallel');

const REPORT_PATH = path.join(DATA_DIR, 'pipeline_closed_loop_report.json');

const FIXTURES = {
  cached_full: { slug: 'the-beatles__hey-jude' },
  fresh_url: {
    slug: 'oasis__wonderwall',
    url: 'https://www.hooktheory.com/theorytab/view/oasis/wonderwall',
  },
};

const results = [];

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { tier: 'quick', caseId: null, http: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tier') opts.tier = args[++i];
    else if (args[i] === '--case') opts.caseId = args[++i];
    else if (args[i] === '--http') opts.http = true;
  }
  return opts;
}

async function runJob(slug, action) {
  const jobId = startJob(slug, action);
  for (let n = 0; n < 900; n++) {
    await sleep(1000);
    const job = getJob(jobId);
    if (!job) return { status: 'error', error: 'job lost' };
    if (job.status !== 'running') return job;
  }
  return { status: 'error', error: 'job timeout' };
}

async function step(caseId, name, fn) {
  const entry = { caseId, step: name, pass: false, error: null, at: new Date().toISOString() };
  try {
    await fn();
    entry.pass = true;
    console.log(`  PASS  ${caseId} :: ${name}`);
  } catch (err) {
    entry.error = err.message;
    entry.context = err.context || null;
    console.log(`  FAIL  ${caseId} :: ${name} — ${err.message}`);
  }
  results.push(entry);
  return entry.pass;
}

function seedRow(db, url, status = 'pending') {
  const parsed = parseTheoryTabUrl(url);
  if (!parsed) throw new Error(`invalid url ${url}`);
  upsertSong(db, { ...parsed, status, discovery_source: 'pipeline_test' });
  db.prepare('UPDATE songs SET status = ? WHERE slug = ?').run(status, parsed.slug);
  return parsed.slug;
}

function findCatalogOnlySlug(db) {
  const row = db.prepare(`
    SELECT slug FROM songs WHERE status = 'enriched' AND (cache_dir IS NULL OR cache_dir = '') LIMIT 1
  `).get();
  return row?.slug || null;
}

function findPendingSlug(db) {
  const row = db.prepare(`
    SELECT slug FROM songs WHERE status = 'pending' LIMIT 1
  `).get();
  return row?.slug || null;
}

async function testButtonRunClear(db, caseId, slug, action, runFn, afterRunChecks, afterClearChecks) {
  await step(caseId, `${action} run`, async () => {
    const out = await runFn(slug, action);
    if (out.status === 'error') throw new Error(out.error || 'job failed');
    if (out.ok === false) throw new Error(out.error || 'run failed');
    await afterRunChecks(slug, out);
  });
  await step(caseId, `${action} clear`, async () => {
    const out = clearPipelineAction(db, slug, action);
    if (!out.ok && !out.deleted) throw new Error(out.error || 'clear failed');
    await afterClearChecks(slug, out);
  });
}

async function caseLocalHarvest(db, tier) {
  const caseId = 'local_harvest';
  const slug = FIXTURES.cached_full.slug;
  console.log(`\n=== ${caseId} (${slug}) ===`);

  if (!getRow(db, slug)?.cache_dir) {
    await step(caseId, 'skip — no hey-jude cache', async () => {
      throw new Error('hey-jude not in catalog with cache');
    });
    return;
  }

  clearHarvestArtifact(slug);
  seedHarvestFromCache(db, slug);

  await step(caseId, 'metadata blocked without harvest', async () => {
    clearHarvestArtifact(slug);
    const out = await runPipelineAction(db, slug, 'metadata');
    if (out.ok) throw new Error('expected metadata to fail without harvest');
    if (out.status !== 409) throw new Error(`expected 409 got ${out.status}`);
    seedHarvestFromCache(db, slug);
  });

  await step(caseId, 'parallel locals metadata+processed', async () => {
    clearPipelineAction(db, slug, 'metadata');
    clearPipelineAction(db, slug, 'processed');
    const t0 = Date.now();
    await runLocalsParallel(db, slug, { includeTested: false });
    const elapsed = Date.now() - t0;
    const fp = flagsPayload(db, slug);
    assertFlags(fp.flags, { harvested: true, metadata: true, processed: true }, 'after parallel locals');
    if (elapsed > 30000) throw new Error(`locals too slow: ${elapsed}ms`);
  });

  if (tier === 'full') {
    await step(caseId, 'tested local from harvest', async () => {
      clearPipelineAction(db, slug, 'tested');
      const job = await runJob(slug, 'tested');
      if (job.status === 'error') throw new Error(job.error);
      assertFlags(job.flags, { tested: true }, 'tested');
    });
  }
}

async function caseCachedFull(db, tier) {
  const caseId = 'cached_full';
  const slug = FIXTURES.cached_full.slug;
  console.log(`\n=== ${caseId} (${slug}) ===`);

  if (!getRow(db, slug)) {
    await step(caseId, 'setup skip', async () => {
      throw new Error('hey-jude not in catalog — run backfill-cache first');
    });
    return;
  }

  const row = getRow(db, slug);
  const cacheDir = row.cache_dir;
  const cacheRel = cacheDir ? path.join('.hooktheory_cache', cacheDir) : null;

  if (tier === 'full' && cacheRel) {
    if (!isHarvested(slug)) seedHarvestFromCache(db, slug);
    let savedOracleDir = null;
    await testButtonRunClear(
      db, caseId, slug, 'tested',
      runJob,
      async (s) => {
        const fp = flagsPayload(db, s);
        assertFlags(fp.flags, { tested: true }, 'tested after run');
        const r = getRow(db, s);
        if (!r.oracle_tested_at) throw new Error('oracle_tested_at not set');
        if (!r.oracle_out_dir) throw new Error('oracle_out_dir not set');
        savedOracleDir = r.oracle_out_dir;
        assertFsExists(r.oracle_out_dir, 'oracle out dir');
        JSON.parse(r.oracle_summary_json);
      },
      async (s) => {
        const fp = flagsPayload(db, s);
        assertFlags(fp.flags, { tested: false }, 'tested after clear');
        const r = getRow(db, s);
        if (r.oracle_tested_at || r.oracle_out_dir || r.oracle_summary_json) {
          throw new Error('oracle columns not cleared');
        }
        if (savedOracleDir) assertFsMissing(savedOracleDir, 'oracle dir');
      },
    );
  }

  if (cacheRel && fs.existsSync(path.join(REPO_ROOT, cacheRel))) {
    if (!isHarvested(slug)) seedHarvestFromCache(db, slug);
    const savedCache = cacheDir;
    await step(caseId, 'processed clear', async () => {
      const out = clearPipelineAction(db, slug, 'processed');
      if (!out.ok) throw new Error(out.error);
      assertFlags(out.flags, { processed: false }, 'processed clear');
      assertFsMissing(cacheRel, 'cache folder');
    });
    await step(caseId, 'processed run', async () => {
      const job = await runJob(slug, 'processed');
      if (job.status === 'error') throw new Error(job.error);
      const fp = flagsPayload(db, slug);
      assertFlags(fp.flags, { processed: true }, 'processed run');
      const r = getRow(db, slug);
      assertFsExists(path.join('.hooktheory_cache', r.cache_dir), 'cache after extract');
    });
    void savedCache;
  }
}

async function caseCatalogOnly(db) {
  const caseId = 'catalog_only';
  let slug = findCatalogOnlySlug(db);
  console.log(`\n=== ${caseId} ===`);

  if (!slug) {
    slug = FIXTURES.cached_full.slug;
    await step(caseId, 'setup processed clear for catalog_only sim', async () => {
      const row = getRow(db, slug);
      if (!row?.cache_dir) throw new Error('no catalog_only candidate and hey-jude has no cache');
      clearPipelineAction(db, slug, 'processed');
      const r = getRow(db, slug);
      if (r.status !== 'enriched') throw new Error('expected enriched after processed clear');
      if (r.cache_dir) throw new Error('cache_dir should be null');
    });
  }

  const cacheBefore = getRow(db, slug)?.cache_dir;
  if (!isHarvested(slug)) seedHarvestFromCache(db, slug);

  await step(caseId, 'processed run', async () => {
    const job = await runJob(slug, 'processed');
    if (job.status === 'error') throw new Error(job.error);
    const fp = flagsPayload(db, slug);
    assertFlags(fp.flags, { processed: true, metadata: true }, 'processed+metadata after extract');
  });

  await step(caseId, 'metadata clear keeps processed', async () => {
    const out = clearPipelineAction(db, slug, 'metadata');
    if (!out.ok) throw new Error(out.error);
    assertFlags(out.flags, { metadata: false, processed: true }, 'metadata clear');
    assertRow(db, slug, { status: 'pending', has_metrics: false }, 'metrics cleared');
    const r = getRow(db, slug);
    if (!r.cache_dir) throw new Error('processed should remain after metadata clear');
  });

  await step(caseId, 'metadata run restore', async () => {
    const job = await runJob(slug, 'metadata');
    if (job.status === 'error') throw new Error(job.error);
    assertFlags(flagsPayload(db, slug).flags, { metadata: true }, 'metadata re-run');
  });

  if (cacheBefore) {
    void cacheBefore;
  }
}

async function caseFreshUrl(db, tier) {
  const caseId = 'fresh_url';
  const { url, slug } = FIXTURES.fresh_url;
  console.log(`\n=== ${caseId} (${slug}) ===`);

  const orphanCache = db.prepare('SELECT cache_dir FROM songs WHERE slug = ?').get(slug)?.cache_dir;
  const oracleDir = db.prepare('SELECT oracle_out_dir FROM songs WHERE slug = ?').get(slug)?.oracle_out_dir;

  await step(caseId, 'setup delete row', async () => {
    clearHarvestArtifact(slug);
    db.prepare('DELETE FROM songs WHERE slug = ?').run(slug);
    assertRow(db, slug, null, 'deleted');
  });

  await step(caseId, 'seed row for pipeline', async () => {
    seedRow(db, url, 'pending');
    assertRow(db, slug, { url }, 'seeded');
  });

  await step(caseId, 'metadata requires harvest', async () => {
    const out = await runPipelineAction(db, slug, 'metadata');
    if (out.ok) throw new Error('expected 409 without harvest');
    if (out.status !== 409) throw new Error(`expected 409 got ${out.status}`);
  });

  await step(caseId, 'cleanup delete row', async () => {
    db.prepare('DELETE FROM songs WHERE slug = ?').run(slug);
    assertRow(db, slug, null, 'final cleanup');
    void orphanCache;
    void oracleDir;
  });
}

async function casePendingRow(db) {
  const caseId = 'pending_row';
  let slug = findPendingSlug(db);
  console.log(`\n=== ${caseId} ===`);
  if (!slug) {
    slug = seedRow(db, FIXTURES.fresh_url.url, 'pending');
  }
  if (!isHarvested(slug) && getRow(db, slug)?.cache_dir) {
    seedHarvestFromCache(db, slug);
  }

  await step(caseId, 'metadata run', async () => {
    if (!isHarvested(slug)) throw new Error('no harvest — seed cache or run Fetch first');
    const job = await runJob(slug, 'metadata');
    if (job.status === 'error') throw new Error(job.error);
    assertRow(db, slug, { status: 'enriched', has_metrics: true }, 'enriched');
  });

  await step(caseId, 'metadata clear', async () => {
    const out = clearPipelineAction(db, slug, 'metadata');
    assertFlags(out.flags, { metadata: false }, 'cleared');
    assertRow(db, slug, { status: 'pending' }, 'pending again');
  });
}

function httpRequest(method, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port: 3000, path: pathname, method },
      (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(body) });
          } catch (_) {
            resolve({ status: res.statusCode, body });
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function caseHttpSpotCheck(db) {
  const caseId = 'http_spot';
  const slug = findPendingSlug(db) || seedRow(db, FIXTURES.fresh_url.url, 'pending');
  console.log(`\n=== ${caseId} (${slug}) ===`);

  const hj = FIXTURES.cached_full.slug;
  if (getRow(db, hj)?.cache_dir) seedHarvestFromCache(db, hj);

  await step(caseId, 'POST metadata → jobId', async () => {
    const target = isHarvested(slug) ? slug : hj;
    const res = await httpRequest('POST', `/api/library/pipeline/metadata?slug=${encodeURIComponent(target)}`);
    if (res.status !== 202) throw new Error(`expected 202 got ${res.status}`);
    if (!res.body.jobId) throw new Error('no jobId');
    for (let i = 0; i < 300; i++) {
      await sleep(1000);
      const poll = await httpRequest('GET', `/api/library/pipeline/job?id=${res.body.jobId}`);
      if (poll.body.status === 'done') return;
      if (poll.body.status === 'error') throw new Error(poll.body.error);
    }
    throw new Error('http job timeout');
  });

  await step(caseId, 'POST metadata/clear', async () => {
    const target = isHarvested(slug) ? slug : hj;
    const res = await httpRequest('POST', `/api/library/pipeline/metadata/clear?slug=${encodeURIComponent(target)}`);
    if (res.status !== 200) throw new Error(`clear status ${res.status}`);
    if (!res.body.flags || res.body.flags.metadata !== false) throw new Error('metadata still true');
  });

  await step(caseId, 'duplicate job 409', async () => {
    const a = httpRequest('POST', `/api/library/pipeline/metadata?slug=${encodeURIComponent(slug)}`);
    await sleep(200);
    const b = await httpRequest('POST', `/api/library/pipeline/metadata?slug=${encodeURIComponent(slug)}`);
    if (b.status !== 409 && b.status !== 202) {
      // first may finish fast; try blocking with processed on cached song
      const hj = FIXTURES.cached_full.slug;
      const j1 = httpRequest('POST', `/api/library/pipeline/processed?slug=${encodeURIComponent(hj)}`);
      await sleep(300);
      const j2 = await httpRequest('POST', `/api/library/pipeline/processed?slug=${encodeURIComponent(hj)}`);
      if (j2.status !== 409) throw new Error(`expected 409 on duplicate, got ${j2.status}`);
    }
    await a;
  });
}

async function main() {
  const opts = parseArgs();
  console.log(`Pipeline closed-loop tests tier=${opts.tier} http=${opts.http}`);
  const db = openDb();
  resetCacheSync();

  const cases = {
    local_harvest: () => caseLocalHarvest(db, opts.tier),
    cached_full: () => caseCachedFull(db, opts.tier),
    catalog_only: () => caseCatalogOnly(db),
    fresh_url: () => caseFreshUrl(db, opts.tier),
    pending_row: () => casePendingRow(db),
    http_spot: () => caseHttpSpotCheck(db),
  };

  if (opts.caseId) {
    if (!cases[opts.caseId]) {
      console.error(`Unknown case: ${opts.caseId}`);
      process.exit(2);
    }
    await cases[opts.caseId]();
  } else {
    await caseLocalHarvest(db, opts.tier);
    await casePendingRow(db);
    await caseCatalogOnly(db);
    await caseFreshUrl(db, opts.tier);
    await caseCachedFull(db, opts.tier);
    if (opts.http) await caseHttpSpotCheck(db);
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  const report = {
    tier: opts.tier,
    http: opts.http,
    finishedAt: new Date().toISOString(),
    passed,
    failed,
    results,
  };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\n=== SUMMARY: ${passed} passed, ${failed} failed ===`);
  console.log(`Report: ${REPORT_PATH}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
