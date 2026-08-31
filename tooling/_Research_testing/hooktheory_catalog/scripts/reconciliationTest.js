/**
 * Recovery lifecycle tests. Uses a temporary database and no network.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sacred-ring-reconcile-'));
process.env.ACQUIRING_DATA = tempRoot;

const { openDb, reconcileSong } = require('../lib/db');
const { discoverFromMeili } = require('../lib/discover');
const { buildCandidates } = require('../lib/waybackDiscover');
const { listSongsNeedingLightHarvest } = require('../lib/lightHarvest');
const { resolveCandidateGroups, deleteTestRows, rollback } = require('../cli/reconcile-catalog');

const dbPath = path.join(tempRoot, 'catalog', 'catalog-test.db');
const db = openDb(dbPath);

function seed(entry) {
  const result = reconcileSong(db, entry);
  assert.strictEqual(result.action, 'inserted');
  return db.prepare('SELECT * FROM songs WHERE slug = ?').get(entry.slug);
}

async function main() {
  const targetSlug = 'yasushi-ishii__the-world-without-logos-hellsing-opening';
  const wrongUrl = 'https://www.hooktheory.com/theorytab/view/yasushi-ishii/the-world-without-logos-hellsing-opening';
  const realUrl = 'https://www.hooktheory.com/theorytab/view/yasushi-ishii/the-world-without-logos-(hellsing-opening)';

  seed({
    slug: targetSlug,
    url: wrongUrl,
    status: 'dead',
    error_message: 'HTTP 404',
    discovery_source: 'meilisearch',
    url_source: 'synthesized',
  });
  db.prepare("UPDATE songs SET error_message='HTTP 404', harvest_mode='blocked' WHERE slug=?").run(targetSlug);

  const revived = reconcileSong(db, {
    slug: targetSlug,
    url: realUrl,
    artist: 'yasushi ishii',
    title: 'the world without logos (hellsing opening)',
    discovery_source: 'meilisearch',
    url_source: 'synthesized',
  });
  assert.strictEqual(revived.action, 'revived');
  const recovered = db.prepare('SELECT * FROM songs WHERE slug = ?').get(targetSlug);
  assert.strictEqual(recovered.url, realUrl);
  assert.strictEqual(recovered.status, 'pending');
  assert.strictEqual(recovered.error_message, null);
  assert.strictEqual(recovered.harvest_mode, null);
  assert(listSongsNeedingLightHarvest(db, 10, { slugs: [targetSlug] }).some((r) => r.slug === targetSlug));

  const deadSame = 'same__dead';
  seed({ slug: deadSame, url: 'https://www.hooktheory.com/theorytab/view/same/dead', status: 'dead' });
  assert.strictEqual(reconcileSong(db, {
    slug: deadSame,
    url: 'https://www.hooktheory.com/theorytab/view/same/dead',
    discovery_source: 'meilisearch',
  }).action, 'unchanged');
  assert.strictEqual(db.prepare('SELECT status FROM songs WHERE slug=?').get(deadSame).status, 'dead');

  const archiveSlug = 'archive__repair';
  seed({
    slug: archiveSlug,
    url: 'https://www.hooktheory.com/theorytab/view/archive/repair-(old)',
    status: 'dead',
    discovery_source: 'wayback',
    url_source: 'observed',
  });
  assert.strictEqual(reconcileSong(db, {
    slug: archiveSlug,
    url: 'https://www.hooktheory.com/theorytab/view/archive/repair-old',
    discovery_source: 'meilisearch',
    url_source: 'synthesized',
  }).reason, 'weaker-url-evidence');
  assert.strictEqual(reconcileSong(db, {
    slug: archiveSlug,
    url: 'https://www.hooktheory.com/theorytab/view/archive/repair-(live)',
    discovery_source: 'artist-page',
    url_source: 'observed',
  }).action, 'revived');

  const enriched = 'known__working';
  seed({
    slug: enriched,
    url: 'https://www.hooktheory.com/theorytab/view/known/working-(live)',
    status: 'enriched',
    discovery_source: 'artist-page',
    url_source: 'observed',
  });
  assert.strictEqual(reconcileSong(db, {
    slug: enriched,
    url: 'https://www.hooktheory.com/theorytab/view/known/working-live',
    discovery_source: 'meilisearch',
    url_source: 'synthesized',
  }).reason, 'enriched-url-preserved');

  seed({ slug: 'legacy-owner__song', url: 'https://www.hooktheory.com/theorytab/view/owner/song' });
  const collision = reconcileSong(db, {
    slug: 'other__song',
    url: 'https://www.hooktheory.com/theorytab/view/owner/song',
    discovery_source: 'meilisearch',
  });
  assert.strictEqual(collision.action, 'conflict');
  assert.strictEqual(collision.ownerSlug, 'legacy-owner__song');

  async function* fakePages() {
    yield {
      page: 1,
      offset: 0,
      hits: [
        { artist: 'Owner', song: 'Song' },
        { artist: 'Later', song: 'Recovered' },
      ],
    };
  }
  const traversal = await discoverFromMeili(0, 0, null, db, { pageIterator: fakePages });
  assert.strictEqual(traversal.complete, true);
  assert.strictEqual(traversal.actions.conflict, 1);
  assert.strictEqual(traversal.actions.inserted, 1);
  assert(db.prepare('SELECT 1 FROM songs WHERE slug=?').get('later__recovered'));

  const archivedTarget = 'https://www.hooktheory.com/theorytab/view/yasushi-ishii/the-world-without-logos-%28hellsing-opening%29';
  const knownRows = new Map([[targetSlug, {
    slug: targetSlug,
    url: wrongUrl,
    status: 'dead',
    url_source: 'synthesized',
  }]]);
  const archivedRecovery = buildCandidates([archivedTarget], knownRows);
  assert.strictEqual(archivedRecovery.candidates.length, 1);
  assert.strictEqual(archivedRecovery.stats.recoverable, 1);
  const archivedAmbiguous = buildCandidates([
    archivedTarget,
    'https://www.hooktheory.com/theorytab/view/yasushi-ishii/the-world-without-logos-hellsing-opening',
  ], knownRows);
  assert.strictEqual(archivedAmbiguous.candidates.length, 0);
  assert.strictEqual(archivedAmbiguous.stats.ambiguousObserved, 1);

  const ambiguousGroups = new Map();
  ambiguousGroups.set('ambiguous__song', new Map([
    ['https://www.hooktheory.com/theorytab/view/ambiguous/song-(a)', {
      slug: 'ambiguous__song',
      url: 'https://www.hooktheory.com/theorytab/view/ambiguous/song-(a)',
      discovery_source: 'wayback',
      url_source: 'observed',
    }],
    ['https://www.hooktheory.com/theorytab/view/ambiguous/song-(b)', {
      slug: 'ambiguous__song',
      url: 'https://www.hooktheory.com/theorytab/view/ambiguous/song-(b)',
      discovery_source: 'wayback',
      url_source: 'observed',
    }],
  ]));
  assert.strictEqual(resolveCandidateGroups(db, ambiguousGroups).conflicts[0].reason,
    'ambiguous-equally-credible-urls');

  seed({ slug: 'queue-test__song', url: 'https://www.hooktheory.com/theorytab/view/queue-test/song', discovery_source: 'test' });
  seed({ slug: 'real-test__song', url: 'https://www.hooktheory.com/theorytab/view/real-test/song', discovery_source: 'wayback' });
  const deleted = deleteTestRows(db);
  assert.deepStrictEqual(deleted.slugs, ['queue-test__song']);
  assert.strictEqual(db.prepare('SELECT 1 FROM songs WHERE slug=?').get('queue-test__song'), undefined);
  const journalFile = path.join(tempRoot, 'cleanup.rollback.json');
  fs.writeFileSync(journalFile, JSON.stringify({ changes: [], deletedRows: deleted }));
  rollback(db, journalFile);
  assert(db.prepare('SELECT 1 FROM songs WHERE slug=?').get('queue-test__song'));
  assert(db.prepare('SELECT 1 FROM songs WHERE slug=?').get('real-test__song'));

  console.log('reconciliationTest: PASS');
}

main().finally(() => {
  try { db.close(); } catch (_) {}
  fs.rmSync(tempRoot, { recursive: true, force: true });
}).catch((err) => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
