/**
 * Audit and repair unresolved catalog URLs from current discovery sources.
 *
 *   node cli/reconcile-catalog.js --audit-unresolved
 *   node cli/reconcile-catalog.js --apply --cleanup-test-rows
 *   node cli/reconcile-catalog.js --apply-report <audit.json> --cleanup-test-rows
 *   node cli/reconcile-catalog.js --rollback <journal.json>
 *
 * Remote audit/apply runs require HOOKTHEORY_CATALOG_AUTHORIZED=1. Rollback is
 * local and does not require remote authorization.
 */

const fs = require('fs');
const path = require('path');
const { openDb, reconcileSong } = require('../lib/db');
const { dataPath } = require('../lib/paths');
const { discoverFromMeili } = require('../lib/discover');
const { buildCandidates, pullAllCdx } = require('../lib/waybackDiscover');
const { parseTheoryTabUrl } = require('../lib/catalogUtils');
const { detectArtistUrlPattern, sweepArtists } = require('../lib/artistPageDiscover');

const WAYBACK_CACHE = path.join(dataPath('.'), 'wayback', 'cdx_urls.txt');
const BACKUP_DIR = path.join(dataPath('.'), 'backups');
const TEST_ROW_PREDICATE = `discovery_source = 'test' OR url LIKE 'http://x/%' OR url LIKE 'http://t/%'`;

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    apply: false,
    cleanupTestRows: false,
    refreshWayback: true,
    artistPages: true,
    applyReport: null,
    rollback: null,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply' || argv[i] === '--reconcile-unresolved') args.apply = true;
    else if (argv[i] === '--audit-unresolved') args.apply = false;
    else if (argv[i] === '--cleanup-test-rows') args.cleanupTestRows = true;
    else if (argv[i] === '--no-wayback-refresh') args.refreshWayback = false;
    else if (argv[i] === '--no-artist-pages') args.artistPages = false;
    else if (argv[i] === '--apply-report') {
      args.apply = true;
      args.applyReport = argv[++i] || null;
    }
    else if (argv[i] === '--rollback') args.rollback = argv[++i] || null;
  }
  return args;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function isUnresolved(row) {
  return row && (
    row.status === 'dead' || row.status === 'error' || row.status === 'pending'
    || row.harvest_mode === 'blocked'
  );
}

function evidenceRank(entry) {
  if (entry.discovery_source === 'artist-page' || entry.discovery_source === 'recent'
      || String(entry.discovery_source || '').startsWith('search:')) return 3;
  if (entry.discovery_source === 'wayback' || entry.url_source === 'observed') return 2;
  return 1;
}

function addCandidate(groups, entry) {
  if (!entry?.slug || !entry?.url) return;
  if (!groups.has(entry.slug)) groups.set(entry.slug, new Map());
  const urls = groups.get(entry.slug);
  const previous = urls.get(entry.url);
  if (!previous || evidenceRank(entry) > evidenceRank(previous)) urls.set(entry.url, entry);
}

function resolveCandidateGroups(db, groups) {
  const selected = [];
  const conflicts = [];
  for (const [slug, urls] of groups) {
    const entries = [...urls.values()];
    const maxRank = Math.max(...entries.map(evidenceRank));
    const strongest = entries.filter((e) => evidenceRank(e) === maxRank);
    if (strongest.length !== 1) {
      conflicts.push({
        action: 'conflict', slug, reason: 'ambiguous-equally-credible-urls',
        urls: strongest.map((e) => e.url),
      });
      continue;
    }
    selected.push(strongest[0]);
  }

  const byUrl = new Map();
  for (const entry of selected) {
    if (!byUrl.has(entry.url)) byUrl.set(entry.url, []);
    byUrl.get(entry.url).push(entry);
  }
  const ambiguousUrls = new Set();
  for (const [url, entries] of byUrl) {
    if (entries.length < 2) continue;
    ambiguousUrls.add(url);
    conflicts.push({
      action: 'conflict', reason: 'candidate-url-has-multiple-slugs', url,
      slugs: entries.map((e) => e.slug),
    });
  }

  const plans = [];
  for (const entry of selected) {
    if (ambiguousUrls.has(entry.url)) continue;
    const result = reconcileSong(db, entry, { apply: false });
    if (result.action === 'conflict') conflicts.push(result);
    else plans.push({ ...result, entry });
  }
  return { plans, conflicts };
}

function unresolvedReport(db, plans) {
  const planned = new Set(plans.filter((p) => p.action === 'revived' || p.action === 'updated')
    .map((p) => p.slug));
  const rows = db.prepare(`
    SELECT slug, url, status, error_message, discovery_source, url_source, harvest_mode
    FROM songs
    WHERE status IN ('dead', 'error', 'pending') OR harvest_mode = 'blocked'
    ORDER BY slug
  `).all();
  return rows.filter((r) => !planned.has(r.slug));
}

function loadApplyReport(db, reportFile) {
  if (!reportFile) throw new Error('--apply-report requires an audit report path');
  const resolved = path.resolve(reportFile);
  const source = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (!Array.isArray(source.actionable)) {
    throw new Error(`Invalid reconciliation audit report: ${resolved}`);
  }

  const plans = [];
  const stale = [];
  for (const expected of source.actionable) {
    const actual = reconcileSong(db, expected.entry, { apply: false });
    if (actual.action !== expected.action
        || actual.slug !== expected.slug
        || actual.url !== expected.url) {
      stale.push({ expected, actual });
    } else {
      plans.push({ ...actual, entry: expected.entry });
    }
  }
  if (stale.length) {
    throw new Error(`Audit report is stale for ${stale.length} action(s); run --audit-unresolved again`);
  }
  return {
    plans,
    conflicts: source.conflicts || [],
    meili: {
      uniqueSongs: source.summary?.meiliSongs || 0,
      finalOffset: source.summary?.meiliFinalOffset || 0,
    },
    waybackStats: source.summary?.wayback || {},
    sourceAuditReport: resolved,
  };
}

function tableRowsForSlugs(db, slugs) {
  if (!slugs.length) return {};
  const placeholders = slugs.map(() => '?').join(',');
  const tables = db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `).all().map((r) => r.name);
  const out = {};
  for (const table of tables) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name);
    if (!columns.includes('slug')) continue;
    const rows = db.prepare(`SELECT * FROM ${table} WHERE slug IN (${placeholders})`).all(...slugs);
    if (rows.length) out[table] = rows;
  }
  return out;
}

function deleteTestRows(db) {
  const rows = db.prepare(`SELECT * FROM songs WHERE ${TEST_ROW_PREDICATE} ORDER BY slug`).all();
  const slugs = rows.map((r) => r.slug);
  if (!slugs.length) return { slugs, tables: {} };
  const tables = tableRowsForSlugs(db, slugs);
  const placeholders = slugs.map(() => '?').join(',');
  const children = Object.keys(tables).filter((t) => t !== 'songs');
  const run = db.transaction(() => {
    for (const table of children) {
      db.prepare(`DELETE FROM ${table} WHERE slug IN (${placeholders})`).run(...slugs);
    }
    db.prepare(`DELETE FROM songs WHERE slug IN (${placeholders})`).run(...slugs);
  });
  run();
  return { slugs, tables };
}

function restoreRows(db, tables) {
  const names = Object.keys(tables || {});
  const ordered = names.includes('songs')
    ? ['songs', ...names.filter((n) => n !== 'songs')]
    : names;
  for (const table of ordered) {
    for (const row of tables[table]) {
      const columns = Object.keys(row);
      const sql = `INSERT OR REPLACE INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`;
      db.prepare(sql).run(...columns.map((c) => row[c]));
    }
  }
}

function deleteSlugEverywhere(db, slug) {
  const tables = db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `).all().map((r) => r.name);
  for (const table of tables) {
    if (table === 'songs') continue;
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name);
    if (columns.includes('slug')) db.prepare(`DELETE FROM ${table} WHERE slug = ?`).run(slug);
  }
  db.prepare('DELETE FROM songs WHERE slug = ?').run(slug);
}

function rollback(db, journalFile) {
  const journal = JSON.parse(fs.readFileSync(journalFile, 'utf8'));
  const run = db.transaction(() => {
    for (const change of [...(journal.changes || [])].reverse()) {
      if (change.before == null) {
        deleteSlugEverywhere(db, change.slug);
        continue;
      }
      const columns = Object.keys(change.before);
      db.prepare(`UPDATE songs SET ${columns.map((c) => `${c}=?`).join(',')} WHERE slug=?`)
        .run(...columns.map((c) => change.before[c]), change.slug);
    }
    restoreRows(db, journal.deletedRows?.tables || {});
  });
  run();
  return {
    restoredChanges: (journal.changes || []).length,
    restoredDeleted: journal.deletedRows?.slugs?.length || 0,
  };
}

async function collectCandidates(db, args, log = console.log) {
  const groups = new Map();
  const knownSongs = new Map(db.prepare('SELECT * FROM songs').all().map((r) => [r.slug, r]));

  log('[reconcile] walking complete Meilisearch index');
  const meili = await discoverFromMeili(0, 0, ({ page, offset }) => {
    if (page % 25 === 0) log(`[reconcile] meili page=${page} offset=${offset}`);
  });
  for (const entry of meili.entries) addCandidate(groups, {
    ...entry, discovery_source: 'meilisearch', url_source: 'synthesized',
  });

  fs.mkdirSync(path.dirname(WAYBACK_CACHE), { recursive: true });
  if (args.refreshWayback) {
    log('[reconcile] force-refreshing Wayback CDX cache');
    await pullAllCdx(WAYBACK_CACHE, {
      force: true,
      onProgress: (p) => {
        if (p.stage === 'pagecount' || p.page % 10 === 0) {
          log(`[reconcile] wayback page=${p.page || 0}/${p.pageCount || '?'} urls=${p.totalUrls || p.cachedUrls || 0}`);
        }
      },
    });
  }
  const rawUrls = fs.existsSync(WAYBACK_CACHE)
    ? fs.readFileSync(WAYBACK_CACHE, 'utf8').split('\n').filter(Boolean) : [];
  const wayback = buildCandidates(rawUrls, knownSongs);
  for (const candidate of wayback.candidates) {
    const parsed = parseTheoryTabUrl(candidate.url);
    if (parsed) addCandidate(groups, {
      ...parsed, discovery_source: 'wayback', url_source: 'observed',
    });
  }

  let initial = resolveCandidateGroups(db, groups);
  if (args.artistPages) {
    const repaired = new Set(initial.plans
      .filter((p) => p.action === 'revived' || p.action === 'updated')
      .map((p) => p.slug));
    const artists = [...new Set([...knownSongs.values()]
      .filter((r) => isUnresolved(r) && !repaired.has(r.slug)
        && r.artist_slug && r.url_source !== 'observed')
      .map((r) => r.artist_slug))];

    if (artists.length) {
      log(`[reconcile] checking ${artists.length} unresolved artists for observed paths`);
      const buildUrl = await detectArtistUrlPattern('nintendo', { log });
      if (buildUrl) {
        const targetSlugs = new Set([...knownSongs.values()]
          .filter((r) => isUnresolved(r) && artists.includes(r.artist_slug))
          .map((r) => r.slug));
        const sweep = await sweepArtists(artists, buildUrl, {
          // Existing healthy songs stay filtered, while unresolved identities
          // are allowed through so their page-observed href can repair them.
          knownSlugs: new Set([...knownSongs.keys()].filter((slug) => !targetSlugs.has(slug))),
          log,
          onProgress: (p) => {
            if (p.index % 25 === 0) log(`[reconcile] artist ${p.index}/${artists.length} found=${p.found}`);
          },
        });
        for (const found of sweep.found) {
          const parsed = parseTheoryTabUrl(found.url);
          if (parsed) addCandidate(groups, {
            ...parsed, discovery_source: 'artist-page', url_source: 'observed',
          });
        }
      }
    }
    initial = resolveCandidateGroups(db, groups);
  }

  return { ...initial, meili, waybackStats: wayback.stats };
}

async function main(argv = process.argv.slice(2), log = console.log) {
  const args = parseArgs(argv);
  const db = openDb();
  try {
    if (args.rollback) {
      const result = rollback(db, args.rollback);
      log(`[reconcile] rollback complete: ${JSON.stringify(result)}`);
      return result;
    }
    if (process.env.HOOKTHEORY_CATALOG_AUTHORIZED !== '1') {
      throw new Error('HOOKTHEORY_CATALOG_AUTHORIZED=1 is required for remote catalog reconciliation');
    }

    const collected = args.applyReport
      ? loadApplyReport(db, args.applyReport)
      : await collectCandidates(db, args, log);
    const actionable = collected.plans.filter((p) => ['inserted', 'updated', 'revived'].includes(p.action));
    const unresolved = unresolvedReport(db, collected.plans);
    const report = {
      generatedAt: new Date().toISOString(),
      apply: args.apply,
      sourceAuditReport: collected.sourceAuditReport || null,
      summary: {
        meiliSongs: collected.meili.uniqueSongs,
        meiliFinalOffset: collected.meili.finalOffset,
        wayback: collected.waybackStats,
        inserted: actionable.filter((p) => p.action === 'inserted').length,
        updated: actionable.filter((p) => p.action === 'updated').length,
        revived: actionable.filter((p) => p.action === 'revived').length,
        conflicts: collected.conflicts.length,
        unresolvedWithoutRepair: unresolved.length,
      },
      actionable,
      conflicts: collected.conflicts,
      unresolved,
    };
    const reportFile = dataPath(`catalog_reconciliation_${stamp()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    log(`[reconcile] report: ${reportFile}`);
    log(`[reconcile] summary: ${JSON.stringify(report.summary)}`);
    if (!args.apply) return { ...report.summary, reportFile };

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    db.pragma('wal_checkpoint(PASSIVE)');
    const backupFile = path.join(BACKUP_DIR, `hooktheory_catalog_before_reconciliation_${stamp()}.db`);
    await db.backup(backupFile);

    const changes = actionable.map((plan) => ({
      slug: plan.slug,
      action: plan.action,
      before: db.prepare('SELECT * FROM songs WHERE slug=?').get(plan.slug) || null,
      entry: plan.entry,
    }));
    const testRows = args.cleanupTestRows
      ? tableRowsForSlugs(db, db.prepare(`SELECT slug FROM songs WHERE ${TEST_ROW_PREDICATE}`).all().map((r) => r.slug))
      : {};
    const deletedSlugs = testRows.songs?.map((r) => r.slug) || [];
    const journal = {
      generatedAt: new Date().toISOString(),
      backupFile,
      changes,
      deletedRows: { slugs: deletedSlugs, tables: testRows },
    };
    const journalFile = dataPath(`catalog_reconciliation_${stamp()}.rollback.json`);
    fs.writeFileSync(journalFile, JSON.stringify(journal, null, 2));

    const actual = { inserted: 0, updated: 0, revived: 0, unchanged: 0, conflict: 0 };
    const applyTx = db.transaction(() => {
      for (const change of changes) {
        const result = reconcileSong(db, change.entry);
        actual[result.action] = (actual[result.action] || 0) + 1;
      }
      if (args.cleanupTestRows) deleteTestRows(db);
    });
    applyTx();
    log(`[reconcile] applied: ${JSON.stringify(actual)}; deleted test rows=${deletedSlugs.length}`);
    log(`[reconcile] backup: ${backupFile}`);
    log(`[reconcile] rollback journal: ${journalFile}`);
    return { ...actual, deletedTestRows: deletedSlugs.length, backupFile, journalFile, reportFile };
  } finally {
    db.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}

module.exports = {
  TEST_ROW_PREDICATE,
  addCandidate,
  resolveCandidateGroups,
  deleteTestRows,
  loadApplyReport,
  rollback,
  collectCandidates,
  main,
};
