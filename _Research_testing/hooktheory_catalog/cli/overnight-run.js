/**
 * Unattended multi-phase catalog run.
 *
 * Self-supervising: phases are isolated (one failing never kills the rest),
 * resumable (completed phases are skipped on restart), and self-throttling
 * (adaptive pacing + circuit breakers react to rate limits and blocks without
 * anyone watching). Drop a `.overnight_stop` file in the catalog data dir to
 * halt cleanly between items.
 *
 *   node cli/overnight-run.js --safe            # phases 1-3 + 8 (no artist sweep)
 *   node cli/overnight-run.js --all             # everything incl. artist sweep
 *   node cli/overnight-run.js --dry-run         # plan only, zero requests
 *   node cli/overnight-run.js --with-artist-sweep --publish --drop-dead-rows
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const Database = require('better-sqlite3');

const { openDb, upsertSong } = require('../lib/db');
const { dataPath } = require('../lib/paths');
const { RunState, sleep } = require('../lib/runGuard');
const { verifyAll } = require('../lib/verifyPlayable');
const { buildCandidates } = require('../lib/waybackDiscover');
const { parseTheoryTabUrl } = require('../lib/catalogUtils');
const { runLightCatalog } = require('../lib/lightCatalog');
const { discoverFromMeili } = require('../lib/discover');
const { detectArtistUrlPattern, sweepArtists } = require('../lib/artistPageDiscover');

const CATALOG_ROOT = path.join(__dirname, '..');
const REPO_ROOT = path.join(__dirname, '../../..');
const STATE_FILE = dataPath('overnight_run_state.json');
const STOP_FILE = dataPath('.overnight_stop');
const LOG_FILE = dataPath('overnight_run.log');
const WAYBACK_CACHE = path.join(dataPath('.'), 'wayback', 'cdx_urls.txt');
const ARTIST_FOUND_FILE = path.join(dataPath('.'), 'wayback', 'artist-sweep-found.json');

const GH_REPO = 'briansgithub/diatonic_ring';
const GH_TAG = 'v1.0.0-data';
const PROBE_ARTIST = 'nintendo'; // densest artist in our catalog (466 songs)

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (_) {}
}

function shouldStop() {
  return fs.existsSync(STOP_FILE);
}

function parseArgs(argv) {
  const a = {
    dryRun: false, artistSweep: false, publish: false, dropDeadRows: false,
    limit: 0, only: null, clearStop: false, freshState: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    if (f === '--clear-stop') a.clearStop = true;
    else if (f === '--fresh') a.freshState = true;
    else if (f === '--dry-run') a.dryRun = true;
    else if (f === '--with-artist-sweep') a.artistSweep = true;
    else if (f === '--publish') a.publish = true;
    else if (f === '--drop-dead-rows') a.dropDeadRows = true;
    else if (f === '--limit') a.limit = Number(argv[++i]) || 0;
    else if (f === '--only') a.only = (argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (f === '--safe') { a.publish = true; }
    else if (f === '--all') { a.artistSweep = true; a.publish = true; }
  }
  return a;
}

/** Run a phase with isolation: a thrown error is recorded, never fatal. */
async function phase(state, name, args, fn) {
  if (args.only && !args.only.includes(name)) { log(`--- skip ${name} (not in --only) ---`); return; }
  if (state.isDone(name)) { log(`--- skip ${name} (already done this run) ---`); return; }
  if (shouldStop()) { log(`--- skip ${name} (stop requested) ---`); return; }

  log(`=== ${name} ===`);
  state.setPhase(name, { status: 'running' });
  const t0 = Date.now();
  try {
    const result = await fn();
    state.setPhase(name, { status: 'done', durationMs: Date.now() - t0, result: result ?? null });
    log(`=== ${name} done in ${Math.round((Date.now() - t0) / 1000)}s ===`);
  } catch (err) {
    state.setPhase(name, { status: 'error', durationMs: Date.now() - t0, error: String(err.message || err) });
    log(`!!! ${name} FAILED (continuing to next phase): ${err.stack || err.message}`);
  }
}

// ---------------------------------------------------------------- phases

function phaseWaybackIngest(args) {
  if (!fs.existsSync(WAYBACK_CACHE)) throw new Error(`missing CDX cache at ${WAYBACK_CACHE}`);
  const rawUrls = fs.readFileSync(WAYBACK_CACHE, 'utf8').split('\n').filter(Boolean);
  const db = openDb();
  try {
    const knownSlugs = new Set(db.prepare('SELECT slug FROM songs').all().map((r) => r.slug));
    const { candidates, stats } = buildCandidates(rawUrls, knownSlugs);
    log(`  candidates=${candidates.length} (${JSON.stringify(stats)})`);
    if (args.dryRun) return { dryRun: true, candidates: candidates.length };

    const slice = args.limit > 0 ? candidates.slice(0, args.limit) : candidates;
    let inserted = 0;
    const tx = db.transaction((rows) => {
      for (const c of rows) {
        const parsed = parseTheoryTabUrl(c.url);
        if (parsed && upsertSong(db, { ...parsed, discovery_source: 'wayback' })) inserted += 1;
      }
    });
    tx(slice);
    log(`  ingested ${inserted} new rows`);
    return { candidates: candidates.length, inserted };
  } finally {
    db.close();
  }
}

async function phaseHarvest(args, label) {
  if (args.dryRun) { log('  (dry-run) would drain light-harvest queue'); return { dryRun: true }; }
  const db = openDb();
  const before = db.prepare("SELECT COUNT(*) c FROM songs WHERE harvest_mode IS NOT NULL").get().c;
  db.close();
  await runLightCatalog({ harvestOnly: true, limit: args.limit || 0, force: false });
  const db2 = openDb();
  const after = db2.prepare("SELECT COUNT(*) c FROM songs WHERE harvest_mode IS NOT NULL").get().c;
  db2.close();
  log(`  ${label}: harvested delta = ${after - before}`);
  return { before, after, delta: after - before };
}

function phaseVerify(args) {
  const db = openDb();
  const { counts, total, mismatchCount } = verifyAll(db);
  db.close();
  log(`  total=${total} ${JSON.stringify(counts)} mismatches=${mismatchCount}`);
  return { total, counts, mismatchCount };
}

function phaseExport(args) {
  if (args.dryRun) { log('  (dry-run) would regenerate catalog.db.gz'); return { dryRun: true }; }
  const out = execFileSync('node', ['scripts/exportFullHarvestedRoomDatabase.js'], {
    cwd: CATALOG_ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  log(`  ${out.trim().split('\n').slice(-2).join(' | ')}`);

  if (args.dropDeadRows) {
    const dbPath = path.join(REPO_ROOT, 'android', 'catalog.db');
    const gzPath = `${dbPath}.gz`;
    const d = new Database(dbPath);
    const before = d.prepare('SELECT COUNT(*) c FROM songs').get().c;
    d.prepare('DELETE FROM songs WHERE dataBlob IS NULL').run();
    const after = d.prepare('SELECT COUNT(*) c FROM songs').get().c;
    // Sanity-check the app's own download validation before shipping:
    // songs >= 34101, browseEntries >= 34101, browseEntriesWithChords == browseEntries.
    const browse = d.prepare('SELECT COUNT(*) c FROM song_browse_entries').get().c;
    const withChords = d.prepare(`
      SELECT COUNT(*) c FROM song_browse_entries e
      INNER JOIN songs s ON s.slug = e.slug WHERE s.dataBlob IS NOT NULL
    `).get().c;
    d.exec('VACUUM');
    d.close();
    if (after < 34101 || browse < 34101 || withChords !== browse) {
      throw new Error(`dead-row trim would fail app validation: songs=${after} browse=${browse} withChords=${withChords}`);
    }
    fs.writeFileSync(gzPath, zlib.gzipSync(fs.readFileSync(dbPath), { level: 9 }));
    log(`  dropped ${before - after} dead rows; re-gzipped (songs=${after}, browse=${browse})`);
  }
  return { ok: true };
}

function phasePublish(args) {
  if (!args.publish) { log('  publish not authorized for this run — skipping'); return { skipped: true }; }
  if (args.dryRun) { log('  (dry-run) would upload catalog.db.gz'); return { dryRun: true }; }
  const assetPath = path.join(REPO_ROOT, 'android', 'catalog.db.gz');
  if (!fs.existsSync(assetPath)) throw new Error(`missing asset ${assetPath}`);
  const sizeMb = (fs.statSync(assetPath).size / (1024 * 1024)).toFixed(1);
  log(`  uploading ${sizeMb} MB to ${GH_REPO}@${GH_TAG}`);
  execFileSync('gh', ['release', 'upload', GH_TAG, assetPath, '--repo', GH_REPO, '--clobber'], { encoding: 'utf8' });
  log('  publish ok');
  return { sizeMb };
}

async function phaseArtistDetect(args, state) {
  if (args.dryRun) { log('  (dry-run) would probe artist URL patterns'); return { dryRun: true }; }
  const build = await detectArtistUrlPattern(PROBE_ARTIST, { log });
  if (!build) {
    log('  no working artist-page URL pattern found — artist sweep will be skipped');
    return { detected: false };
  }
  const sample = build(PROBE_ARTIST);
  log(`  detected artist page pattern via ${sample}`);
  state.data.artistPatternSample = sample;
  state.save();
  return { detected: true, sample };
}

async function phaseArtistSweep(args, state) {
  const detect = state.phase('artist-detect');
  if (!detect.result?.detected) { log('  no artist pattern — skipping sweep'); return { skipped: true }; }
  if (args.dryRun) { log('  (dry-run) would sweep artist pages'); return { dryRun: true }; }

  // Rebuild the pattern fn from the detected sample so a restart doesn't re-probe.
  const sample = state.data.artistPatternSample;
  const prefix = sample.slice(0, sample.lastIndexOf(PROBE_ARTIST));
  const buildUrl = (a) => `${prefix}${a}`;

  const db = openDb();
  // Densest artists first. Sampling showed misses scale with an artist's
  // catalogue size (nintendo 18 missing, taylor-swift 4, one-song artists 0),
  // so this front-loads the yield — an interrupted sweep still captures most
  // of the value instead of spending hours on single-song artists.
  const artists = db.prepare(`
    SELECT artist_slug FROM songs
    WHERE artist_slug IS NOT NULL
    GROUP BY artist_slug
    ORDER BY COUNT(*) DESC, artist_slug
  `).all().map((r) => r.artist_slug);
  const knownSlugs = new Set(db.prepare('SELECT slug FROM songs').all().map((r) => r.slug));
  db.close();

  const resumeAt = state.phase('artist-sweep').progressIndex || 0;
  log(`  sweeping ${artists.length} artists (resume at ${resumeAt}), pattern ${prefix}<artist>`);

  const foundAll = fs.existsSync(ARTIST_FOUND_FILE)
    ? JSON.parse(fs.readFileSync(ARTIST_FOUND_FILE, 'utf8')) : [];

  const { found, checked, failed } = await sweepArtists(artists, buildUrl, {
    knownSlugs,
    startIndex: resumeAt,
    intervalMs: Number(process.env.ARTIST_INTERVAL_MS || 1200),
    log,
    shouldStop,
    onFound: (f) => {
      // Flush every find, not every 25th: finds are rare (~66 in 3k artists)
      // and the file is tiny, so batching only risks losing them to a crash.
      foundAll.push(f);
      fs.writeFileSync(ARTIST_FOUND_FILE, JSON.stringify(foundAll, null, 2));
    },
    onProgress: (p) => {
      state.setPhase('artist-sweep', { status: 'running', progressIndex: p.index, checked: p.checked, found: p.found });
      if (p.index % 250 === 0) log(`  artist ${p.index}/${artists.length} checked=${p.checked} failed=${p.failed} found=${p.found}`);
    },
  });

  fs.writeFileSync(ARTIST_FOUND_FILE, JSON.stringify(foundAll, null, 2));
  log(`  sweep finished: checked=${checked} failed=${failed} newSongs=${found.length}`);

  // Ingest the accumulated file, not just this session's finds: after a
  // restart `found` holds only what was discovered since resuming, so
  // ingesting it would silently drop everything found before the crash.
  // upsertSong is idempotent, so re-ingesting earlier finds is free.
  if (foundAll.length) {
    const db2 = openDb();
    let inserted = 0;
    const tx = db2.transaction((rows) => {
      for (const f of rows) {
        const parsed = parseTheoryTabUrl(f.url);
        if (parsed && upsertSong(db2, { ...parsed, discovery_source: 'artist-page' })) inserted += 1;
      }
    });
    tx(foundAll);
    db2.close();
    log(`  ingested ${inserted} new artist-page songs (${foundAll.length} total found across all attempts)`);
    return { checked, failed, found: foundAll.length, inserted };
  }
  return { checked, failed, found: 0, inserted: 0 };
}

async function phaseMeiliRefresh(args) {
  if (args.dryRun) { log('  (dry-run) would re-walk Meili index'); return { dryRun: true }; }
  const db = openDb();
  try {
    const before = new Set(db.prepare('SELECT slug FROM songs').all().map((r) => r.slug));
    const result = await discoverFromMeili(0, 0, ({ page, offset }) => {
      if (page % 25 === 0) log(`  meili page=${page} offset=${offset}`);
    }, db);
    const after = db.prepare('SELECT COUNT(*) c FROM songs').get().c;
    const added = after - before.size;
    log(`  meili index=${result.uniqueSongs} newRows=${added}`);
    return { indexTotal: result.uniqueSongs, added };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------- main

async function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });

  // The stop file is authoritative and is NOT auto-cleared: clearing it here
  // would silently defeat it as a pre-placed kill switch (and let the watchdog
  // restart into a run the operator meant to stop). Removing it is explicit.
  if (fs.existsSync(STOP_FILE)) {
    if (args.clearStop) {
      fs.unlinkSync(STOP_FILE);
      log('stop file cleared via --clear-stop');
    } else {
      log(`stop file present at ${STOP_FILE} — refusing to start. Re-run with --clear-stop to override.`);
      return;
    }
  }

  // A dry run must never write the real phase ledger: it "completes" every
  // phase, which would make the subsequent real run skip all of them.
  const stateFile = args.dryRun
    ? STATE_FILE.replace(/\.json$/, '.dryrun.json')
    : STATE_FILE;

  if (args.freshState && fs.existsSync(stateFile)) {
    fs.unlinkSync(stateFile);
    log('phase state reset via --fresh');
  }
  if (args.dryRun && fs.existsSync(stateFile)) {
    fs.unlinkSync(stateFile); // dry runs always start clean
  }

  const state = new RunState(stateFile);
  state.data.restarts = (state.data.restarts || 0) + 1;
  state.save();

  log(`########## overnight-run start (restart #${state.data.restarts}) args=${JSON.stringify(args)} ##########`);

  await phase(state, 'wayback-ingest', args, () => phaseWaybackIngest(args));
  await phase(state, 'wayback-harvest', args, () => phaseHarvest(args, 'wayback'));
  await phase(state, 'verify-1', args, () => phaseVerify(args));
  await phase(state, 'export-1', args, () => phaseExport(args));
  await phase(state, 'publish-1', args, () => phasePublish(args));

  if (args.artistSweep) {
    await phase(state, 'artist-detect', args, () => phaseArtistDetect(args, state));
    await phase(state, 'artist-sweep', args, () => phaseArtistSweep(args, state));
    await phase(state, 'artist-harvest', args, () => phaseHarvest(args, 'artist-page'));
    await phase(state, 'verify-2', args, () => phaseVerify(args));
    await phase(state, 'export-2', args, () => phaseExport(args));
    await phase(state, 'publish-2', args, () => phasePublish(args));
  }

  await phase(state, 'meili-refresh', args, () => phaseMeiliRefresh(args));
  await phase(state, 'meili-harvest', args, () => phaseHarvest(args, 'meili-refresh'));
  await phase(state, 'verify-final', args, () => phaseVerify(args));
  await phase(state, 'export-final', args, () => phaseExport(args));
  await phase(state, 'publish-final', args, () => phasePublish(args));

  const summary = Object.entries(state.data.phases)
    .map(([k, v]) => `${k}=${v.status}`).join(' ');
  log(`########## overnight-run complete: ${summary} ##########`);
}

if (require.main === module) {
  main().catch((err) => {
    log(`FATAL(top-level): ${err.stack || err.message}`);
    process.exit(1);
  });
}

module.exports = { main, parseArgs };
