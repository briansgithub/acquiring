import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { gunzipSync } from 'node:zlib';
import { openDatabase, hashFile } from './common.mjs';
import { buildCorpus } from './build.mjs';

test('end-to-end snapshots are immutable, reproducible and independent of the old index', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aural-build-test-'));
  try {
    const catalog = path.join(temp, 'catalog.db'), cacheRoot = path.join(temp, 'songs'), output = path.join(temp, 'output');
    fs.mkdirSync(cacheRoot);
    const db = openDatabase(catalog);
    db.exec('CREATE TABLE songs(slug TEXT PRIMARY KEY,artist TEXT,title TEXT,url TEXT)');
    for (const song of ['one', 'two', 'three']) {
      db.prepare('INSERT INTO songs VALUES (?,?,?,?)').run(song, 'Artist', song, `url-${song}`);
      const dir = path.join(cacheRoot, song); fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, '_metadata.json'), JSON.stringify({ url: `url-${song}` }));
      fs.writeFileSync(path.join(dir, 'verse.json'), JSON.stringify({ songId: song, sectionName: 'Verse',
        metadata: { keys: [{ tonic: 'C', scale: 'major', beat: 1 }] },
        chords: [1, 5, 1, 4, 1].map((root, i) => ({ root, beat: i + 1, duration: 1 })) }));
    }
    db.close();
    const first = await buildCorpus({ catalog, cacheRoot, output, structureMinSongs: 2 });
    assert.ok(first.runtime.occurrenceCount > 0);
    assert.equal(first.coverage.harmony.observedTargetReached, true);
    const checksum = hashFile(path.join(first.destination, 'runtime.db'));
    const reuse = await buildCorpus({ catalog, cacheRoot, output, structureMinSongs: 2 });
    assert.equal(reuse.reusedSnapshot, true); assert.equal(reuse.sourceStats.reused, 3);
    const frozen = await buildCorpus({ catalog, cacheRoot, output, structureMinSongs: 2, reuseSnapshotInputs: first.destination });
    assert.equal(frozen.snapshotId, first.snapshotId);
    const fresh = await buildCorpus({ catalog, cacheRoot, output: path.join(temp, 'clean'), structureMinSongs: 2 });
    assert.equal(first.snapshotId, fresh.snapshotId);
    assert.equal(hashFile(path.join(fresh.destination, 'runtime.db')), checksum);
    const analysis = openDatabase(path.join(first.destination, 'analysis.db'), true);
    assert.equal(JSON.parse(analysis.prepare("SELECT value FROM compact_index WHERE key='metadata'").get().value).normalizationVersion, 'aural-normalizer-1');
    assert.equal(analysis.prepare('SELECT count(*) n FROM progression_stats').get().n > 0, true);
    const raw = analysis.prepare('SELECT encoding,payload FROM section_source LIMIT 1').get();
    assert.equal(raw.encoding, 'gzip-json');
    assert.equal(JSON.parse(gunzipSync(raw.payload)).chords.length, 5);
    analysis.close();
    const changedCatalog = openDatabase(catalog);
    changedCatalog.exec("UPDATE songs SET title='Revised title' WHERE slug='one'");
    changedCatalog.close();
    const renamed = await buildCorpus({ catalog, cacheRoot, output, structureMinSongs: 2 });
    assert.notEqual(renamed.snapshotId, first.snapshotId);
    assert.equal(renamed.sourceStats.normalized, 0);
    const renamedDb = openDatabase(path.join(renamed.destination, 'runtime.db'), true);
    assert.equal(renamedDb.prepare("SELECT title FROM quiz_song WHERE song_id='one'").get().title, 'Revised title');
    renamedDb.close();
    fs.writeFileSync(path.join(cacheRoot, 'one', 'long.json'), JSON.stringify({ songId: 'one', sectionName: 'Long',
      metadata: { keys: [{ tonic: 'C', scale: 'major', beat: 1 }] },
      chords: [1, 5, 1, 4, 1].map((root, i) => ({ root, beat: i * 64 + 1, duration: 64 })) }));
    const long = await buildCorpus({ catalog, cacheRoot, output, structureMinSongs: 2 });
    const report = JSON.parse(fs.readFileSync(path.join(long.destination, 'report.json')));
    assert.ok(report.curriculumFamilies.some(g => g.discovered.occurrenceCount > g.runtimeEligible.occurrenceCount));
    const originalPointer = fs.readFileSync(path.join(output, 'latest.json'), 'utf8');
    await buildCorpus({ catalog, cacheRoot, output, limit: 2, structureMinSongs: 2 });
    assert.equal(fs.readFileSync(path.join(output, 'latest.json'), 'utf8'), originalPointer);
    fs.appendFileSync(path.join(long.destination, 'report.json'), 'tampered');
    await assert.rejects(buildCorpus({ catalog, cacheRoot, output, structureMinSongs: 2 }), /checksum/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
