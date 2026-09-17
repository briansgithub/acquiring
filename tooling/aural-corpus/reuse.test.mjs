import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { hash, hashFile, moduleFingerprint, NORMALIZER_VERSION, openDatabase, stableJson } from './common.mjs';
import { catalogSongs } from './source.mjs';
import { reuseSnapshotInputs } from './reuse.mjs';

function fixture(t, limit = 0) {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'aural-reuse-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const options = { snapshotDirectory: path.join(root, 'snapshot'), catalog: path.join(root, 'catalog.db'), normalizedFile: path.join(root, 'normalized.db'), cacheRoot: path.join(root, 'raw-source-deliberately-absent'), limit };
  fs.mkdirSync(options.snapshotDirectory);
  const catalog = openDatabase(options.catalog);
  catalog.exec('CREATE TABLE songs(slug TEXT PRIMARY KEY,artist TEXT,title TEXT,url TEXT)');
  catalog.prepare('INSERT INTO songs VALUES (?,?,?,?)').run('song-a', 'Artist', 'Title', 'https://example.invalid/song-a');
  catalog.close();
  const normalizationFingerprint = `${NORMALIZER_VERSION}:${moduleFingerprint(new URL('./normalize.mjs', import.meta.url))}`;
  const db = openDatabase(options.normalizedFile);
  db.exec('CREATE TABLE cache_metadata(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE sections(id TEXT PRIMARY KEY,revision TEXT,version TEXT)');
  db.prepare('INSERT INTO cache_metadata VALUES (?,?)').run('scope', stableJson({ cacheRoot: path.resolve(options.cacheRoot), catalog: path.resolve(options.catalog), limit }));
  db.prepare('INSERT INTO sections VALUES (?,?,?)').run('section-a', 'revision-a', normalizationFingerprint);
  db.close();
  const diagnostics = [{ sourceName: 'unavailable/section.json', reason: 'invalid-section' }];
  const report = {
    snapshotId: hash('reuse-test-snapshot'), buildVersion: 'aural-build-1', normalizerVersion: NORMALIZER_VERSION,
    normalizationFingerprint, sourceHash: hash([['section-a', 'revision-a']]), catalogHash: hash(catalogSongs(options.catalog)),
    rejectedSourceHash: hash(diagnostics), scope: limit ? { limitFolders: limit } : { full: true },
    availability: { catalogSongs: 1, scannedSongs: 1, sections: 1, rejectedSources: diagnostics },
  };
  const writeReport = value => {
    fs.writeFileSync(path.join(options.snapshotDirectory, 'report.json'), stableJson(value));
    fs.writeFileSync(path.join(options.snapshotDirectory, 'manifest.json'), stableJson({ schemaVersion: 1, snapshotId: value.snapshotId, buildVersion: value.buildVersion, sourceHash: value.sourceHash, files: { 'report.json': hashFile(path.join(options.snapshotDirectory, 'report.json')) } }));
  };
  writeReport(report);
  return { options, report, writeReport };
}

test('reuses frozen inputs without opening absent raw source folders or changing inputs', t => {
  const f = fixture(t); const beforeCatalog = hashFile(f.options.catalog), beforeCache = hashFile(f.options.normalizedFile);
  const source = reuseSnapshotInputs(f.options);
  assert.equal(fs.existsSync(f.options.cacheRoot), false);
  assert.equal(source.sourceHash, f.report.sourceHash); assert.equal(source.normalizationFingerprint, f.report.normalizationFingerprint);
  assert.deepEqual(source.diagnostics, f.report.availability.rejectedSources);
  assert.deepEqual(source.stats, { scannedSongs: 1, files: 0, normalized: 0, reused: 1, deleted: 0, aliases: 0, conflicts: 0 });
  assert.deepEqual(source.songs, catalogSongs(f.options.catalog)); assert.deepEqual(source.scope, { full: true });
  assert.equal(hashFile(f.options.catalog), beforeCatalog); assert.equal(hashFile(f.options.normalizedFile), beforeCache);
});

test('report checksum, snapshot identity, and old build versions are rejected', t => {
  const f = fixture(t); fs.appendFileSync(path.join(f.options.snapshotDirectory, 'report.json'), ' ');
  assert.throws(() => reuseSnapshotInputs(f.options), /checksum/);
  f.writeReport({ ...f.report, buildVersion: 'unknown-build' });
  assert.throws(() => reuseSnapshotInputs(f.options), /manifest/);
  f.writeReport(f.report);
  const file = path.join(f.options.snapshotDirectory, 'manifest.json'), manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.snapshotId = hash('different-snapshot'); fs.writeFileSync(file, stableJson(manifest));
  assert.throws(() => reuseSnapshotInputs(f.options), /identity/);
});

test('normalizer and transitive dependency fingerprint changes require a source rescan', t => {
  const f = fixture(t); f.writeReport({ ...f.report, normalizationFingerprint: `${NORMALIZER_VERSION}:${hash('old-dependencies')}` });
  assert.throws(() => reuseSnapshotInputs(f.options), /Normalizer dependencies changed/);
});

test('catalog song or metadata changes prevent frozen input reuse', t => {
  const f = fixture(t); const db = openDatabase(f.options.catalog);
  db.exec("UPDATE songs SET title='Edited title'"); db.close();
  assert.throws(() => reuseSnapshotInputs(f.options), /Catalog changed/);
});

test('cache additions, deletions, revised sections, and row version changes are rejected', t => {
  for (const sql of [
    "UPDATE sections SET revision='edited-revision'",
    "DELETE FROM sections",
    "INSERT INTO sections SELECT 'section-b',revision,version FROM sections",
    "UPDATE sections SET version='other-version'",
  ]) {
    const f = fixture(t); const db = openDatabase(f.options.normalizedFile); db.exec(sql); db.close();
    assert.throws(() => reuseSnapshotInputs(f.options), /cache.*(manifest|fingerprint)/i, sql);
  }
});

test('full/partial snapshot scope and source path scope must agree', t => {
  const f = fixture(t, 10);
  assert.deepEqual(reuseSnapshotInputs(f.options).scope, { limitFolders: 10 });
  assert.throws(() => reuseSnapshotInputs({ ...f.options, limit: 0 }), /full\/partial scope/);
  assert.throws(() => reuseSnapshotInputs({ ...f.options, cacheRoot: path.join(f.options.cacheRoot, 'different') }), /cache scope/);
  const db = openDatabase(f.options.normalizedFile); db.exec('DELETE FROM cache_metadata'); db.close();
  assert.throws(() => reuseSnapshotInputs(f.options), /cache scope/);
});

test('rejected-source provenance and availability must remain internally consistent', t => {
  const f = fixture(t);
  f.writeReport({ ...f.report, rejectedSourceHash: hash([]) });
  assert.throws(() => reuseSnapshotInputs(f.options), /rejected-source/);
  f.writeReport({ ...f.report, availability: { ...f.report.availability, sections: 2 } });
  assert.throws(() => reuseSnapshotInputs(f.options), /section manifest changed/);
  assert.throws(() => reuseSnapshotInputs({ ...f.options, limit: -1 }), /nonnegative integer/);
});
