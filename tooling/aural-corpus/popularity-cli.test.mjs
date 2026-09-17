import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { loadPopularityArtifact, readPopularityCatalog, runPopularityCli, validatePopularityArtifact } from './popularity-cli.mjs';

const asOf = '2026-09-17T00:00:00.000Z';
const cli = fileURLToPath(new URL('./popularity-cli.mjs', import.meta.url));
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const write = (file, object) => writeFileSync(file, JSON.stringify(object));
function setup(t, count = 3) {
  const directory = mkdtempSync(path.join(tmpdir(), 'aural-popularity-cli-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const files = { directory, catalog: path.join(directory, 'catalog.db'), provider: path.join(directory, 'provider.json'), pilot: path.join(directory, 'pilot.json'), snapshot: path.join(directory, 'snapshot.json'), weights: path.join(directory, 'weights.json'), report: path.join(directory, 'report.json'), audit: path.join(directory, 'audit.json') };
  const db = new DatabaseSync(files.catalog);
  db.exec('CREATE TABLE songs(slug TEXT PRIMARY KEY,artist TEXT,title TEXT,url TEXT,status TEXT,dataBlob BLOB)');
  const put = db.prepare('INSERT INTO songs(slug,artist,title,url,status) VALUES(?,?,?,?,?)');
  for (let index = 0; index < count; index++) put.run(`song-${index}`, `artist-${index % 7}`, `title-${index}`, `https://example.invalid/${index}`, 'ok');
  db.close();
  write(files.provider, {
    schemaVersion: 1, provider: 'synthetic', dataVersion: 'fixture-1', collectedAt: asOf,
    rights: { allowRawStorage: true, allowDerivedRedistribution: true, basis: 'synthetic fixtures' },
    observations: Array.from({ length: Math.min(count, 2) }, (_, index) => ({
      songId: `song-${index}`, providerTrackId: `track-${index}`, versionKind: 'studio',
      match: { status: 'confirmed', confidence: 0.9, reviewed: true, artistMatched: true, titleMatched: true, versionMatched: true },
      measurements: [{ metric: 'listeners', category: 'enduring', value: 100 + index, unit: 'count', territory: 'global', timeWindow: 'lifetime', observedAt: asOf }],
    })),
  });
  return files;
}
const pilotArgs = f => ['pilot', '--catalog', f.catalog, '--output', f.pilot];
const importArgs = f => ['import', '--catalog', f.catalog, '--input', f.provider, '--as-of', asOf, '--output', f.snapshot, '--weights-output', f.weights];
const reportArgs = f => ['report', '--pilot', f.pilot, '--snapshot', f.snapshot, '--output', f.report];

test('pilot reads the real SQLite contract without modifying it and creates deterministic 500-song manifest', t => {
  const f = setup(t, 620); const before = readFileSync(f.catalog);
  const result = runPopularityCli(pilotArgs(f));
  assert.equal(result.sampleSize, 500); assert.equal(result.corpusCount, 620);
  assert.deepEqual(readFileSync(f.catalog), before);
  const repeat = path.join(f.directory, 'repeat.json');
  runPopularityCli(['pilot', '--catalog', f.catalog, '--output', repeat]);
  assert.deepEqual(read(repeat), read(f.pilot));
  assert.ok(read(f.pilot).strata.some(stratum => stratum.stratum === '["unknown","unknown"]'));
  assert.deepEqual(readPopularityCatalog(f.catalog)[0], { id: 'song-0', artist: 'artist-0', title: 'title-0', genre: null, year: null });
});

test('optional genre and year columns contribute pilot metadata without scanning blobs', t => {
  const f = setup(t); const db = new DatabaseSync(f.catalog);
  db.exec("ALTER TABLE songs ADD COLUMN genre TEXT; ALTER TABLE songs ADD COLUMN release_year INTEGER; UPDATE songs SET genre='Jazz',release_year=1965 WHERE slug='song-0'");
  db.close();
  const songs = readPopularityCatalog(f.catalog);
  assert.equal(songs[0].genre, 'Jazz'); assert.equal(songs[0].year, 1965);
});

test('import exports auditable and compact app artifacts with equivalent null-aware weights', t => {
  const f = setup(t); const before = readFileSync(f.catalog);
  const result = runPopularityCli(importArgs(f));
  assert.equal(result.rankedSongs, 2); assert.equal(result.corpusCount, 3);
  assert.deepEqual(readFileSync(f.catalog), before);
  const full = loadPopularityArtifact(f.snapshot); const compact = loadPopularityArtifact(f.weights);
  assert.equal(full.version, 'aural-popularity-1'); assert.equal(full.snapshotId, compact.snapshotId);
  assert.equal(full.manifest.rights.allowDerivedRedistribution, true);
  assert.equal(compact.provenance.rights.allowDerivedRedistribution, true);
  assert.equal('rawMeasurements' in compact, false);
  assert.deepEqual(compact.songs, full.songs.map(({ songId, score, confidence }) => ({ songId, score, confidence })));
  assert.deepEqual(compact.songs[2], { songId: 'song-2', score: null, confidence: 0 });
  assert.equal(readdirSync(f.directory).some(file => file.endsWith('.tmp')), false);
});

test('both production artifact forms reject changed weights and unsupported versions', t => {
  const f = setup(t); runPopularityCli(importArgs(f));
  for (const file of [f.snapshot, f.weights]) {
    const changed = read(file); changed.songs[0].score = 0.4;
    assert.throws(() => validatePopularityArtifact(changed), /hash mismatch/);
    const incompatible = read(file); incompatible.version = 'future-version';
    assert.throws(() => validatePopularityArtifact(incompatible), /identity/);
  }
});

test('import without redistribution rights fails without writing an output', t => {
  const f = setup(t); const provider = read(f.provider); provider.rights.allowDerivedRedistribution = false; write(f.provider, provider);
  assert.throws(() => runPopularityCli(importArgs(f)), /redistribution/);
  assert.equal(existsSync(f.snapshot), false); assert.equal(existsSync(f.weights), false);
});

test('raw storage permission is separate from approved derived weights', t => {
  const f = setup(t); const provider = read(f.provider); provider.rights.allowRawStorage = false; write(f.provider, provider);
  runPopularityCli(importArgs(f));
  assert.equal('rawMeasurements' in loadPopularityArtifact(f.snapshot), false);
  assert.equal(loadPopularityArtifact(f.weights).songs.length, 3);
});

test('report distinguishes unaudited matching from supplied human verdicts and estimates', t => {
  const f = setup(t); runPopularityCli(pilotArgs(f)); runPopularityCli(importArgs(f)); runPopularityCli(reportArgs(f));
  assert.equal(read(f.report).auditedAccuracy, null); assert.equal(read(f.report).scoreCoverage, 2 / 3);
  write(f.audit, { audits: [{ songId: 'song-0', correct: true }, { songId: 'song-1', correct: false }], elapsedSeconds: 2, apiRequests: 5, costPerRequest: 0.01, currency: 'USD' });
  const audited = path.join(f.directory, 'audited.json');
  const result = runPopularityCli(['report', '--pilot', f.pilot, '--snapshot', f.snapshot, '--audit', f.audit, '--output', audited]);
  assert.equal(result.auditedAccuracy, 0.5); assert.equal(read(audited).projectedCost, 0.05);
});

test('report rejects compact-only weights and malformed audit rather than inventing audit detail', t => {
  const f = setup(t); runPopularityCli(pilotArgs(f)); runPopularityCli(importArgs(f));
  assert.throws(() => runPopularityCli(['report', '--pilot', f.pilot, '--snapshot', f.weights, '--output', f.report]), /full snapshot/);
  write(f.audit, { assumedAccuracy: 1 });
  assert.throws(() => runPopularityCli([...reportArgs(f), '--audit', f.audit]), /audit report fields/);
  const pilot = read(f.pilot); pilot.corpusIdentityHash = 'different-catalog'; write(f.pilot, pilot);
  assert.throws(() => runPopularityCli(reportArgs(f)), /same catalog population/);
});

test('all commands preserve existing artifacts and reject input/output aliases', t => {
  const f = setup(t); runPopularityCli(pilotArgs(f)); const before = readFileSync(f.pilot);
  assert.throws(() => runPopularityCli(pilotArgs(f)), /new artifact/);
  assert.deepEqual(readFileSync(f.pilot), before);
  assert.throws(() => runPopularityCli(['pilot', '--catalog', f.catalog, '--output', f.catalog]), /new artifact/);
  assert.throws(() => runPopularityCli([...importArgs(f).slice(0, -2), '--weights-output', f.snapshot]), /new artifact/);
});

test('CLI executable returns useful exit status and bounded summaries', t => {
  const f = setup(t);
  const success = spawnSync(process.execPath, [cli, ...pilotArgs(f)], { encoding: 'utf8' });
  assert.equal(success.status, 0, success.stderr); assert.equal(JSON.parse(success.stdout).sampleSize, 3);
  const failure = spawnSync(process.execPath, [cli, 'import', '--input', f.provider], { encoding: 'utf8' });
  assert.equal(failure.status, 1); assert.match(failure.stderr, /missing --catalog/);
  const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0); assert.match(help.stdout, /No network requests/);
});

test('invalid flags, absent databases, and noncatalog schema are rejected', t => {
  const f = setup(t);
  assert.throws(() => runPopularityCli(['download']), /expected pilot/);
  assert.throws(() => runPopularityCli([...pilotArgs(f), '--unknown', 'x']), /argument/);
  assert.throws(() => runPopularityCli([...pilotArgs(f), '--limit', '-1']), /positive integer/);
  const missing = path.join(f.directory, 'missing.db');
  assert.throws(() => readPopularityCatalog(missing)); assert.equal(existsSync(missing), false);
  const wrong = path.join(f.directory, 'wrong.db'); const db = new DatabaseSync(wrong); db.exec('CREATE TABLE other(id TEXT)'); db.close();
  assert.throws(() => readPopularityCatalog(wrong), /songs.slug/);
});
