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

const { openDb, reconcileSong, upsertSong } = require('../lib/db');
const { dataPath } = require('../lib/paths');
const { RunState, sleep } = require('../lib/runGuard');
const { verifyAll } = require('../lib/verifyPlayable');
const { buildCandidates, pullAllCdx } = require('../lib/waybackDiscover');
const { startDiscoveryRun, finishDiscoveryRun } = require('../lib/db');
const { parseTheoryTabUrl } = require('../lib/catalogUtils');
const { runLightCatalog } = require('../lib/lightCatalog');
const { discoverFromMeili } = require('../lib/discover');
const { detectArtistUrlPattern, sweepArtists } = require('../lib/artistPageDiscover');

const CATALOG_ROOT = path.join(__dirname, '..');
// android/ is a nested independent repo, absent from any git worktree of this
// repo — resolve it from the configured data root instead of __dirname.
const { getAndroidDir } = require('../../../lib/dataRoot');
const STATE_FILE = dataPath('overnight_run_state.json');
const STOP_FILE = dataPath('.overnight_stop');
const LOG_FILE = dataPath('overnight_run.log');
const WAYBACK_CACHE = path.join(dataPath('.'), 'wayback', 'cdx_urls.txt');
const ARTIST_FOUND_FILE = path.join(dataPath('.'), 'wayback', 'artist-sweep-found.json');
const UNKNOWN_ARTISTS_FILE = path.join(dataPath('.'), 'wayback', 'unknown-artists.json');
const DEAD_ARTISTS_FILE = path.join(dataPath('.'), 'wayback', 'artist-no-page.json');

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
    sync: false, cdxMaxAgeDays: 30, resume: false,
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
    else if (f === '--cdx-max-age-days') a.cdxMaxAgeDays = Number(argv[++i]);
    else if (f === '--safe') { a.publish = true; }
    else if (f === '--all') { a.artistSweep = true; a.publish = true; }
    // Routine "is there anything new?" pass: live discovery + harvest only.
    // Excludes the artist sweep (~12k requests for a measured ~47 songs).
    else if (f === '--sync') a.sync = true;
    else if (f === '--resume') a.resume = true;
  }
  if (!Number.isFinite(a.cdxMaxAgeDays) || a.cdxMaxAgeDays < 0) a.cdxMaxAgeDays = 30;

  // Built after the loop, not inside it: the phase list depends on --publish,
  // which may appear either side of --sync on the command line.
  if (a.sync && !a.only) {
    a.only = ['wayback-refresh', 'wayback-ingest'];
    // Opt-in only: ~12k requests for a measured ~47 songs. Without adding the
    // phases here the flag would set artistSweep but never run anything.
    if (a.artistSweep) {
      a.only.push('unknown-artists', 'artist-detect', 'artist-sweep');
    }
    a.only.push('meili-refresh', 'meili-harvest', 'verify-final');
    // Default is database-only. Publishing is opt-in so a routine check never
    // pushes a ~62MB release asset on its own; when asked for, ship the
    // dead-row-trimmed asset to match what is already live.
    if (a.publish) {
      a.only.push('export-final', 'publish-final');
      a.dropDeadRows = true;
    }
  }
  return a;
}

/**
 * Discovery phases whose runs get recorded in discovery_runs, so `cli/status.js`
 * can answer "when did we last actually look, and what did we find" — otherwise
 * a channel that has silently stopped finding anything is indistinguishable
 * from one that is simply up to date.
 */
const RECORDED_CHANNELS = new Set(['wayback-refresh', 'wayback-ingest', 'meili-refresh', 'artist-sweep', 'alt-lookup']);

/**
 * Pull a "how much was new" number out of a phase result.
 * `newUrls` covers wayback-refresh, whose unit is archived URLs rather than
 * songs — without it a refresh that genuinely found new URLs reports 0.
 */
function newCountOf(result) {
  if (!result || typeof result !== 'object') return 0;
  return result.inserted ?? result.added ?? result.found ?? result.newUrls ?? 0;
}

function unsuccessfulPhases(phases) {
  return Object.entries(phases || {})
    .filter(([, v]) => v.status === 'error' || v.status === 'interrupted')
    .map(([name, v]) => `${name}=${v.status}${v.error ? ` (${v.error})` : ''}`);
}

/** Run a phase with isolation: a thrown error is recorded, never fatal. */
async function phase(state, name, args, fn) {
  if (args.only && !args.only.includes(name)) { log(`--- skip ${name} (not in --only) ---`); return; }
  if (state.isDone(name)) { log(`--- skip ${name} (already done this run) ---`); return; }
  if (shouldStop()) { log(`--- skip ${name} (stop requested) ---`); return; }

  log(`=== ${name} ===`);
  state.setPhase(name, { status: 'running' });
  const t0 = Date.now();

  let runDb = null;
  let runId = null;
  if (RECORDED_CHANNELS.has(name) && !args.dryRun) {
    try {
      runDb = openDb();
      runId = startDiscoveryRun(runDb, name);
    } catch (_) { runDb = null; runId = null; } // bookkeeping must never break a run
  }
  const closeRun = (patch) => {
    if (!runDb) return;
    try { finishDiscoveryRun(runDb, runId, patch); } catch (_) {}
    try { runDb.close(); } catch (_) {}
    runDb = null;
  };

  try {
    const result = await fn();
    closeRun({ new_count: newCountOf(result), notes: result ?? null });
    // A phase that halted early (stop requested, circuit-breaker abort) returns
    // normally, so without this it would be banked as `done` and every
    // remaining item silently abandoned on the next run.
    if (result && result.incomplete) {
      state.setPhase(name, { status: 'interrupted', durationMs: Date.now() - t0, result });
      log(`=== ${name} INTERRUPTED after ${Math.round((Date.now() - t0) / 1000)}s — will resume ===`);
      return;
    }
    state.setPhase(name, { status: 'done', durationMs: Date.now() - t0, result: result ?? null });
    log(`=== ${name} done in ${Math.round((Date.now() - t0) / 1000)}s ===`);
  } catch (err) {
    closeRun({ error_count: 1, notes: String(err.message || err) });
    state.setPhase(name, { status: 'error', durationMs: Date.now() - t0, error: String(err.message || err) });
    log(`!!! ${name} FAILED (continuing to next phase): ${err.stack || err.message}`);
  }
}

// ---------------------------------------------------------------- phases

/**
 * Re-pull the Internet Archive CDX index when it has gone stale.
 *
 * Without this the Wayback channel is frozen: wayback-ingest reads a cache file
 * that nothing ever refreshes, so every future run re-diffs the same URL list,
 * reports `candidates=0`, and looks healthy while discovering nothing. Wayback
 * was the highest-yield channel by a wide margin, so a silent freeze here is
 * the difference between a working sync and a no-op.
 *
 * Costs zero hooktheory.com requests (archive.org only), and pullAllCdx caches
 * completed pages, so an interrupted pull resumes rather than restarting.
 */
async function phaseWaybackRefresh(args) {
  const maxAgeDays = args.cdxMaxAgeDays;
  const exists = fs.existsSync(WAYBACK_CACHE);
  const ageDays = exists
    ? (Date.now() - fs.statSync(WAYBACK_CACHE).mtimeMs) / 86400000
    : Infinity;

  if (exists && ageDays < maxAgeDays) {
    log(`  CDX cache is ${ageDays.toFixed(1)}d old (< ${maxAgeDays}d) — skipping re-pull`);
    return { skipped: true, ageDays: Number(ageDays.toFixed(2)) };
  }
  log(`  CDX cache ${exists ? `is ${ageDays.toFixed(1)}d old` : 'is missing'} — re-pulling from archive.org`);
  if (args.dryRun) { log('  (dry-run) would re-pull the CDX index'); return { dryRun: true, wouldPull: true }; }

  fs.mkdirSync(path.dirname(WAYBACK_CACHE), { recursive: true });

  // Clear the completed-pages marker before a refresh. That file exists so an
  // *interrupted* pull can resume, but it also makes every page look already
  // fetched — leaving it in place turns a periodic refresh into a permanent
  // 3-second no-op that reports success while fetching nothing.
  //
  // Dropping just the marker (rather than passing force:true) keeps the
  // previously-collected URLs as a base, so the refresh unions into them and
  // an interrupted refresh can still resume.
  const donePagesFile = `${WAYBACK_CACHE}.pages`;
  if (fs.existsSync(donePagesFile)) {
    fs.unlinkSync(donePagesFile);
    log('  cleared completed-pages marker so every page is re-fetched');
  }

  const before = fs.existsSync(WAYBACK_CACHE)
    ? fs.readFileSync(WAYBACK_CACHE, 'utf8').split('\n').filter(Boolean).length
    : 0;

  const urls = await pullAllCdx(WAYBACK_CACHE, {
    onProgress: (p) => {
      if (p.stage === 'pagecount') log(`  ${p.pageCount} CDX pages (cache has ${p.cachedUrls} urls)`);
      else if (p.page % 10 === 0) log(`  page ${p.page}/${p.pageCount} — ${p.totalUrls} urls`);
    },
  });
  log(`  CDX refreshed: ${urls.length} archived urls (+${urls.length - before} new since last pull)`);
  return {
    pulled: true,
    urls: urls.length,
    newUrls: urls.length - before,
    previousAgeDays: Number.isFinite(ageDays) ? Number(ageDays.toFixed(2)) : null,
  };
}

function phaseWaybackIngest(args) {
  if (!fs.existsSync(WAYBACK_CACHE)) throw new Error(`missing CDX cache at ${WAYBACK_CACHE}`);
  const rawUrls = fs.readFileSync(WAYBACK_CACHE, 'utf8').split('\n').filter(Boolean);
  const db = openDb();
  try {
    const knownSongs = new Map(db.prepare('SELECT * FROM songs').all().map((r) => [r.slug, r]));
    const { candidates, stats } = buildCandidates(rawUrls, knownSongs);
    log(`  candidates=${candidates.length} (${JSON.stringify(stats)})`);
    if (args.dryRun) return { dryRun: true, candidates: candidates.length };

    const slice = args.limit > 0 ? candidates.slice(0, args.limit) : candidates;
    const actions = { inserted: 0, updated: 0, revived: 0, unchanged: 0, conflict: 0 };
    const tx = db.transaction((rows) => {
      for (const c of rows) {
        const parsed = parseTheoryTabUrl(c.url);
        if (!parsed) continue;
        const result = reconcileSong(db, {
          ...parsed, discovery_source: 'wayback', url_source: 'observed',
        });
        actions[result.action] = (actions[result.action] || 0) + 1;
      }
    });
    tx(slice);
    log(`  reconciled ${slice.length} archived candidates: ${JSON.stringify(actions)}`);
    return { candidates: candidates.length, inserted: actions.inserted, actions };
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
    const dbPath = path.join(getAndroidDir(), 'catalog.db');
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
  const assetPath = path.join(getAndroidDir(), 'catalog.db.gz');
  if (!fs.existsSync(assetPath)) throw new Error(`missing asset ${assetPath}`);
  const sizeMb = (fs.statSync(assetPath).size / (1024 * 1024)).toFixed(1);
  log(`  uploading ${sizeMb} MB to ${GH_REPO}@${GH_TAG}`);
  execFileSync('gh', ['release', 'upload', GH_TAG, assetPath, '--repo', GH_REPO, '--clobber'], { encoding: 'utf8' });
  log('  publish ok');
  return { sizeMb };
}

/**
 * Meili lookup for every dead row we have never alt-checked, then promote the
 * harvestable hits into `songs` so the harvest phases pick them up. Without the
 * promotion step find-alternatives only fills `alt_candidates` and nothing is
 * ever fetched.
 */
function phaseAltLookup(args) {
  if (args.dryRun) { log('  (dry-run) would alt-lookup unchecked dead rows'); return { dryRun: true }; }

  const pending = openDb();
  const before = pending.prepare(
    "SELECT COUNT(*) c FROM songs WHERE status = 'dead' AND alt_checked_at IS NULL",
  ).get().c;
  pending.close();
  log(`  ${before} dead rows never alt-checked`);

  const out = execFileSync('node', ['cli/find-alternatives.js'], {
    cwd: CATALOG_ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  log(`  ${out.trim().split('\n').slice(-1)[0]}`);

  // Promote top-ranked candidates that we do not already hold a playable copy of.
  const db = openDb();
  const rows = db.prepare(`
    SELECT candidate_url FROM alt_candidates c
    WHERE c.candidate_rank = 1
      AND c.candidate_url IS NOT NULL
      AND c.candidate_slug NOT IN (SELECT slug FROM songs WHERE harvest_mode IS NOT NULL)
  `).all();
  let inserted = 0;
  const tx = db.transaction((list) => {
    for (const r of list) {
      const parsed = parseTheoryTabUrl(r.candidate_url);
      if (parsed && upsertSong(db, { ...parsed, discovery_source: 'alt-lookup' })) inserted += 1;
    }
  });
  tx(rows);
  db.close();
  log(`  promoted ${inserted} new songs from ${rows.length} alternative candidates`);
  return { deadUnchecked: before, candidates: rows.length, inserted };
}

/**
 * Artists that exist on hooktheory.com but that we have never held a single
 * song for. The artist sweep only walks artists already in `songs`, so without
 * this an undiscovered artist stays invisible forever. Costs hooktheory.com
 * zero requests (archive.org CDX only).
 */
function phaseUnknownArtists(args) {
  if (args.dryRun) { log('  (dry-run) would probe archive.org for unknown artists'); return { dryRun: true }; }
  const out = execFileSync('node', ['scripts/discover-unknown-artists.js'], {
    cwd: CATALOG_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  log(`  ${out.trim().split('\n').slice(-4).join(' | ')}`);
  const count = fs.existsSync(UNKNOWN_ARTISTS_FILE)
    ? JSON.parse(fs.readFileSync(UNKNOWN_ARTISTS_FILE, 'utf8')).length : 0;
  return { unknownArtists: count };
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

  // Append artists we hold no song for at all (from the unknown-artists probe).
  // These go last: the ordering above front-loads yield, and an artist we have
  // never seen is by definition not represented in that density ranking.
  if (fs.existsSync(UNKNOWN_ARTISTS_FILE)) {
    const seen = new Set(artists);
    const extra = JSON.parse(fs.readFileSync(UNKNOWN_ARTISTS_FILE, 'utf8'))
      .filter((a) => a && !seen.has(a));
    artists.push(...extra);
    log(`  + ${extra.length} never-seen artists from unknown-artists probe`);
  }

  const resumeAt = state.phase('artist-sweep').progressIndex || 0;
  log(`  sweeping ${artists.length} artists (resume at ${resumeAt}), pattern ${prefix}<artist>`);

  const foundAll = fs.existsSync(ARTIST_FOUND_FILE)
    ? JSON.parse(fs.readFileSync(ARTIST_FOUND_FILE, 'utf8')) : [];

  // Artists the site has no page for (HTTP 500 soft-404). Persisted so a
  // restart skips them without spending a request each.
  const deadArtists = new Set(
    fs.existsSync(DEAD_ARTISTS_FILE)
      ? JSON.parse(fs.readFileSync(DEAD_ARTISTS_FILE, 'utf8')) : [],
  );
  if (deadArtists.size) log(`  skipping ${deadArtists.size} artists already known to have no page`);
  let deadDirty = false;

  const { found, checked, failed, interrupted } = await sweepArtists(artists, buildUrl, {
    knownSlugs,
    startIndex: resumeAt,
    intervalMs: Number(process.env.ARTIST_INTERVAL_MS || 1200),
    deadArtists,
    onDeadArtist: () => { deadDirty = true; },
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
      // Flush the dead list on the same checkpoint cadence as progress, so a
      // kill mid-sweep never replays those requests.
      if (deadDirty) {
        fs.writeFileSync(DEAD_ARTISTS_FILE, JSON.stringify([...deadArtists], null, 2));
        deadDirty = false;
      }
      if (p.index % 250 === 0) log(`  artist ${p.index}/${artists.length} checked=${p.checked} failed=${p.failed} found=${p.found}`);
    },
  });

  fs.writeFileSync(DEAD_ARTISTS_FILE, JSON.stringify([...deadArtists], null, 2));

  fs.writeFileSync(ARTIST_FOUND_FILE, JSON.stringify(foundAll, null, 2));
  log(`  sweep ${interrupted ? 'INTERRUPTED' : 'finished'}: checked=${checked} failed=${failed} newSongs=${found.length}`);

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
    return { checked, failed, found: foundAll.length, inserted, incomplete: interrupted };
  }
  return { checked, failed, found: 0, inserted: 0, incomplete: interrupted };
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
    log(`  meili index=${result.uniqueSongs} newRows=${added} actions=${JSON.stringify(result.actions)} conflicts=${result.conflicts.length} errors=${result.errors.length}`);
    return {
      indexTotal: result.uniqueSongs,
      added,
      finalOffset: result.finalOffset,
      complete: result.complete,
      actions: result.actions,
      conflicts: result.conflicts,
      recordErrors: result.errors,
    };
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
    : (args.sync ? STATE_FILE.replace(/\.json$/, '.sync.json') : STATE_FILE);

  if (args.freshState && fs.existsSync(stateFile)) {
    fs.unlinkSync(stateFile);
    log('phase state reset via --fresh');
  }
  if (args.dryRun && fs.existsSync(stateFile)) {
    fs.unlinkSync(stateFile); // dry runs always start clean
  }
  // A sync is meant to be re-runnable on demand. Sharing the recovery ledger
  // would mark its phases `done` and make every subsequent sync a silent no-op,
  // so it gets its own ledger and starts clean unless explicitly resumed.
  if (args.sync && !args.resume && fs.existsSync(stateFile)) {
    fs.unlinkSync(stateFile);
  }

  const state = new RunState(stateFile);
  state.data.restarts = (state.data.restarts || 0) + 1;
  state.save();

  log(`########## overnight-run start (restart #${state.data.restarts}) args=${JSON.stringify(args)} ##########`);

  await phase(state, 'alt-lookup', args, () => phaseAltLookup(args));
  await phase(state, 'alt-harvest', args, () => phaseHarvest(args, 'alt-lookup'));
  await phase(state, 'wayback-refresh', args, () => phaseWaybackRefresh(args));
  await phase(state, 'wayback-ingest', args, () => phaseWaybackIngest(args));
  await phase(state, 'wayback-harvest', args, () => phaseHarvest(args, 'wayback'));
  await phase(state, 'verify-1', args, () => phaseVerify(args));
  await phase(state, 'export-1', args, () => phaseExport(args));
  await phase(state, 'publish-1', args, () => phasePublish(args));

  if (args.artistSweep) {
    await phase(state, 'unknown-artists', args, () => phaseUnknownArtists(args));
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

  // Phases are isolated so later cleanup/verification can still run, but the
  // orchestrator itself must fail if any selected phase failed or stopped
  // early. Otherwise Task Scheduler records a green run while discovery may
  // have been broken for days.
  const unsuccessful = unsuccessfulPhases(state.data.phases);
  if (unsuccessful.length) {
    throw new Error(`sync incomplete: ${unsuccessful.join(', ')}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    log(`FATAL(top-level): ${err.stack || err.message}`);
    process.exit(1);
  });
}

module.exports = { main, parseArgs, unsuccessfulPhases };
