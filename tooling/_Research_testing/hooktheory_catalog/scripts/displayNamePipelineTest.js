/** Isolated discovery, cache, and both export paths; never reads live catalog data. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'acquiring-display-pipeline-'));
process.env.ACQUIRING_DATA = tempRoot;
const Database = require('better-sqlite3');
const { openDb, reconcileSong } = require('../lib/db');
const { entryFromArtistSong, entryFromUrl, discoverFromMeili } = require('../lib/discover');
const { writeProcessedCacheFromHarvest } = require('../lib/processedFromHarvest');
const { catalogExportOptions } = require('../lib/catalogExportOptions');
const { resolveDisplayNames } = require('../lib/catalogDisplayNames');

const sourceDbPath = path.join(tempRoot, 'catalog', 'hooktheory_catalog.db');
let db;

function runExport(script, outputDir, extra = []) {
  const args = [path.join(__dirname, script), '--source-db', sourceDbPath, '--output-dir', outputDir, ...extra];
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', env: process.env });
  assert.equal(result.status, 0, `${script}: ${result.stderr || result.stdout}`);
  return path.join(outputDir, 'catalog.db');
}

async function main() {
  db = openDb(sourceDbPath);
  const entry = entryFromArtistSong('eBay &amp; Friends', "Don't Stop (Live)!", 'meilisearch');
  assert.equal(entry.artist, 'eBay & Friends');
  assert.equal(entry.title, "Don't Stop (Live)!");
  assert.match(entry.url, /ebay--and-amp-friends\/dont-stop-\(live\)$/);
  reconcileSong(db, entry);
  reconcileSong(db, entryFromUrl(entry.url, 'recent'));
  let saved = db.prepare('SELECT * FROM songs WHERE slug = ?').get(entry.slug);
  assert.equal(saved.artist, 'eBay & Friends');
  assert.equal(saved.title, "Don't Stop (Live)!");
  assert.equal(saved.url, entry.url);

  for (const artist of ['boygenius', 'girl in red', 'blink-182']) {
    const lowercase = entryFromArtistSong(artist, 'an intentionally lowercase title', 'meilisearch');
    reconcileSong(db, { ...lowercase, artist: artist.toUpperCase(), title: lowercase.title.toUpperCase() });
    reconcileSong(db, lowercase);
    reconcileSong(db, entryFromUrl(lowercase.url, 'recent'));
    const stored = db.prepare('SELECT * FROM songs WHERE slug = ?').get(lowercase.slug);
    assert.equal(stored.artist, artist);
    assert.equal(stored.title, 'an intentionally lowercase title');
    assert.deepEqual(resolveDisplayNames(stored, { fallback: { artist: artist.toUpperCase() } }),
      { artist, title: 'an intentionally lowercase title' });
  }
  assert.deepEqual(resolveDisplayNames({ slug: 'the-proclaimers__500-miles', artist: 'the-proclaimers', title: '500-miles' }),
    { artist: 'The Proclaimers', title: '500 Miles' });

  // Source display metadata improves an existing row while its verified URL stays.
  const observed = entryFromUrl('https://www.hooktheory.com/theorytab/view/a-band/a-song-(live)', 'artist-page');
  reconcileSong(db, { ...observed, status: 'enriched' });
  async function* pages() {
    yield { hits: [{ artist: 'A Band', song: 'A Song (Live)' }], offset: 0, page: 1 };
  }
  await discoverFromMeili(1, 0, null, db, { pageIterator: pages });
  saved = db.prepare('SELECT * FROM songs WHERE slug = ?').get(observed.slug);
  assert.equal(saved.artist, 'A Band');
  assert.equal(saved.title, 'A Song (Live)');
  assert.equal(saved.url, observed.url);
  assert.equal(saved.status, 'enriched');

  // Separate the export fixture from discovery rows; this database is temporary.
  db.prepare('DELETE FROM songs').run();
  const modes = ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian'];
  const cacheDir = path.join(tempRoot, 'fixture-cache');
  const fixtureSongs = modes.map((mode, index) => ({
    slug: `artist-${index}__song-${index}`,
    artist: [null, 'AC/DC', null, 'boygenius', 'girl in red', 'blink-182'][index] || `artist ${index}`,
    title: index === 6 ? 'an intentionally lowercase title' : `song ${index}`,
    url: `https://www.hooktheory.com/theorytab/view/artist-${index}/song-${index}`,
    mode,
  }));
  for (const [index, song] of fixtureSongs.entries()) {
    reconcileSong(db, song);
    db.prepare('INSERT INTO song_metrics (slug, complexity_rating) VALUES (?, ?)').run(song.slug, 15 + index);
    db.prepare('INSERT INTO song_details (slug, hooktheory_song_name) VALUES (?, ?)')
      .run(song.slug, index === 2 ? "Don't Stop, Now!" : index === 6 ? song.title : `Song ${index}`);
    const section = { songId: `section${index}`, sectionName: 'Verse', chords: [], notes: [], metadata: { keys: [{ scale: song.mode }] } };
    db.prepare('INSERT INTO song_sections (slug, section_name, song_id, key_scale, section_data_json) VALUES (?, ?, ?, ?, ?)')
      .run(song.slug, 'Verse', section.songId, song.mode, JSON.stringify(section));
    const folder = path.join(cacheDir, song.slug);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, '_metadata.json'), JSON.stringify({ url: song.url, artist: index >= 3 && index <= 5 ? song.artist.toUpperCase() : `artist-${index}`, songTitle: `song-${index}` }));
    fs.writeFileSync(path.join(folder, 'Verse.json'), JSON.stringify(section));
  }
  const missingSong = { slug: 'index-only__no-payload', artist: 'index only', title: 'no payload', url: 'https://www.hooktheory.com/theorytab/view/index-only/no-payload' };
  reconcileSong(db, missingSong);
  db.close();
  db = null;
  const originalSourceBytes = fs.readFileSync(sourceDbPath);
  const namesPath = path.join(tempRoot, 'names.json');
  fs.writeFileSync(namesPath, JSON.stringify({ version: 1, songs: {
    [fixtureSongs[0].slug]: { artist: 'The Proclaimers', title: '500 Miles' },
    [missingSong.slug]: { artist: 'Index Only', title: 'No Payload!' },
  } }));
  const common = ['--cache-dir', cacheDir];
  const fullPath = runExport('exportFullHarvestedRoomDatabase.js', path.join(tempRoot, 'full'), common);
  const namedPath = runExport('exportFullHarvestedRoomDatabase.js', path.join(tempRoot, 'named'), [...common, '--names-file', namesPath]);
  const lightPath = runExport('exportRoomDatabase.js', path.join(tempRoot, 'light'), ['--names-file', namesPath]);
  assert.deepEqual(fs.readFileSync(sourceDbPath), originalSourceBytes, 'export does not mutate source');

  const baseline = new Database(fullPath, { readonly: true });
  const named = new Database(namedPath, { readonly: true });
  const light = new Database(lightPath, { readonly: true });
  try {
    for (const output of [named, light]) {
      assert.equal(output.pragma('user_version', { simple: true }), 3);
      assert.equal(output.prepare('SELECT count(*) AS n FROM songs').get().n, fixtureSongs.length + 1);
      assert.deepEqual(output.prepare('SELECT title, artist FROM songs WHERE slug = ?').get(fixtureSongs[0].slug),
        { title: '500 Miles', artist: 'The Proclaimers' });
      assert.deepEqual(output.prepare('SELECT title, artist, alphaGroup FROM song_browse_entries WHERE slug = ?').get(fixtureSongs[0].slug),
        { title: '500 Miles', artist: 'The Proclaimers', alphaGroup: '5' });
      assert.equal(output.prepare('SELECT artist FROM songs WHERE slug = ?').get(fixtureSongs[1].slug).artist, 'AC/DC');
      assert.equal(output.prepare('SELECT title FROM songs WHERE slug = ?').get(fixtureSongs[2].slug).title, "Don't Stop, Now!");
      for (const index of [3, 4, 5]) {
        assert.equal(output.prepare('SELECT artist FROM songs WHERE slug = ?').get(fixtureSongs[index].slug).artist, fixtureSongs[index].artist);
      }
      assert.equal(output.prepare('SELECT title FROM songs WHERE slug = ?').get(fixtureSongs[6].slug).title, 'an intentionally lowercase title');
      assert.equal(output.prepare('SELECT title FROM songs WHERE slug = ?').get(missingSong.slug).title, 'No Payload!');
    }
    for (const before of baseline.prepare('SELECT * FROM songs ORDER BY slug').all()) {
      const after = named.prepare('SELECT * FROM songs WHERE slug = ?').get(before.slug);
      for (const key of ['slug', 'url', 'status']) assert.equal(after[key], before[key]);
      assert.deepEqual(after.dataBlob, before.dataBlob);
    }
    assert.deepEqual(named.prepare('SELECT * FROM song_browse_modes ORDER BY slug, mode').all(), baseline.prepare('SELECT * FROM song_browse_modes ORDER BY slug, mode').all());
    assert.deepEqual(named.prepare('SELECT slug, complexityRating, complexityBucket FROM song_browse_entries ORDER BY slug').all(), baseline.prepare('SELECT slug, complexityRating, complexityBucket FROM song_browse_entries ORDER BY slug').all());
    assert.deepEqual(zlib.gunzipSync(fs.readFileSync(`${namedPath}.gz`)), fs.readFileSync(namedPath));
  } finally {
    baseline.close(); named.close(); light.close();
  }
  assert.throws(() => catalogExportOptions(['--output-dir', path.dirname(namedPath)], {
    sourceDbPath, outputDir: tempRoot, databaseFilename: 'catalog.db', archiveFilename: 'catalog.db.gz',
  }), /already exists/);
  assert.throws(() => catalogExportOptions([], {
    sourceDbPath, outputDir: path.dirname(sourceDbPath), databaseFilename: path.basename(sourceDbPath), archiveFilename: 'catalog.db.gz',
  }), /must not replace an input/);

  const scrape = {
    url: 'https://www.hooktheory.com/theorytab/view/the-proclaimers/500-miles',
    artist: 'The Proclaimers',
    sections: [{ name: 'Verse', songId: 'sectionExample', json: { songInfo: '500 Miles', songId: 500, metadata: {}, chords: [], notes: [] } }],
  };
  const firstCache = await writeProcessedCacheFromHarvest({ scrape });
  const secondCache = await writeProcessedCacheFromHarvest({ scrape: { ...scrape, artist: null } });
  assert.equal(firstCache.songDir, secondCache.songDir, 'display names must not alter cache identity');
  assert.equal(JSON.parse(fs.readFileSync(path.join(secondCache.songDir, '_metadata.json'), 'utf8')).artist, 'The Proclaimers');
  console.log('displayNamePipelineTest: PASS (discovery, metadata preservation, both staged exports, schema and payload invariants)');
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(() => {
  if (db?.open) db.close();
  const resolved = path.resolve(tempRoot);
  if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('acquiring-display-pipeline-')) {
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
