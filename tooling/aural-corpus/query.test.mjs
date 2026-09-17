import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { discoverPatterns, getPattern, MINER_VERSION, occurrences } from './miner.mjs';
import { exportAnalysis } from './export.mjs';
import { NORMALIZER_VERSION } from './common.mjs';
import { normalizeChord } from './normalize.mjs';
import { loadAnalysisIndex, lookupOccurrences, runQueryCli } from './query.mjs';

const cli = fileURLToPath(new URL('./query.mjs', import.meta.url));
const key = { tonic: 'C', scale: 'major' };
function createFixture(t, { empty = false, minSongs = 2 } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'aural-query-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'analysis.db');
  const runs = empty ? [] : ['harmony', 'harmony_bass'].flatMap(view => ['song-a', 'song-b'].map((songId, index) => {
    const degrees = index ? [1, 5, 1, 5] : [1, 5, 1, 5, 1];
    return {
      id: `${view}-${songId}`, view, songId, sectionId: `${songId}-section`, revision: `revision-${songId}`, key,
      tokens: degrees.map(root => normalizeChord({ root }, key).tokens[view]),
      positions: degrees.map((root, offset) => ({ startIndex: offset * 2, endIndex: offset * 2 + 1, startBeat: offset * 4 + 1, endBeat: offset * 4 + 5, notes: normalizeChord({ root }, key).notes })),
      transitionIds: degrees.slice(1).map((_, offset) => `${songId}-edge-${offset}`),
    };
  }));
  const index = discoverPatterns(runs, { minSongs, normalizationVersion: NORMALIZER_VERSION });
  const report = { snapshotId: 'query-test-snapshot', buildVersion: 'aural-build-1', normalizerVersion: NORMALIZER_VERSION, config: { minSongs } };
  const sections = ['song-a', 'song-b'].map(songId => ({ id: `${songId}-section`, songId, revision: `revision-${songId}`, sectionName: 'Verse' }));
  exportAnalysis({ file, index, runs, sections, selected: [], snapshotId: report.snapshotId, report, occurrences });
  return { file, index, runs };
}

test('loads the saved compact arrays without mining and retains exact implicit pattern IDs', t => {
  const f = createFixture(t); const before = readFileSync(f.file);
  const loaded = loadAnalysisIndex(f.file);
  assert.equal(loaded.version, MINER_VERSION); assert.equal(loaded.snapshotId, 'query-test-snapshot');
  for (const length of [2, 3, 4]) {
    const tokens = f.runs[0].tokens.slice(0, length);
    const expected = getPattern(f.index, { view: 'harmony', tokens });
    const result = lookupOccurrences({ index: loaded, view: 'harmony', tokens });
    assert.equal(result.pattern.id, expected.id);
    assert.equal(result.pattern.occurrenceCount, expected.occurrenceCount);
    assert.equal(result.pattern.songCount, expected.songCount);
  }
  assert.deepEqual(readFileSync(f.file), before);
});

test('arbitrary implicit lengths remain queryable when pattern rows are absent', t => {
  const f = createFixture(t); const db = new DatabaseSync(f.file);
  db.exec('DELETE FROM progression_pattern'); db.close();
  const result = lookupOccurrences({ file: f.file, view: 'harmony', tokens: f.runs[0].tokens.slice(0, 3) });
  assert.equal(result.pattern.length, 3); assert.equal(result.pattern.songCount, 2); assert.equal(result.pattern.occurrenceCount, 3);
});

test('pagination retains overlapping locations, original positions, and physical transition IDs', t => {
  const f = createFixture(t); const index = loadAnalysisIndex(f.file); const tokens = f.runs[0].tokens.slice(0, 3);
  const complete = lookupOccurrences({ index, view: 'harmony', tokens });
  const rows = []; let offset = 0;
  do {
    const page = lookupOccurrences({ index, view: 'harmony', tokens, offset, limit: 1 });
    rows.push(...page.occurrences); offset = page.nextOffset;
  } while (offset !== null);
  assert.deepEqual(rows, complete.occurrences);
  assert.equal(rows.length, 3);
  assert.equal(new Set(rows.map(row => row.occurrenceId)).size, 3);
  const withinSong = rows.filter(row => row.songId === 'song-a');
  assert.deepEqual(withinSong.map(row => row.start).sort(), [0, 2]);
  for (const row of rows) {
    assert.equal(row.startIndex, row.start * 2); assert.equal(row.endIndex, row.end * 2 + 1);
    assert.equal(row.endBeat - row.startBeat, 12); assert.equal(row.transitionIds.length, 2);
    assert.equal(row.sourceRevision, `revision-${row.songId}`);
    assert.equal(row.sourceId, `${row.songId}|${row.sectionId}|${row.startIndex}|${row.endIndex}`);
  }
  assert.deepEqual(lookupOccurrences({ index, view: 'harmony', tokens, offset: 999 }).occurrences, []);
});

test('views and distinct-song recurrence remain independent of physical repeats', t => {
  const f = createFixture(t);
  const ordinary = lookupOccurrences({ file: f.file, view: 'harmony', tokens: f.runs[0].tokens.slice(0, 2) });
  const bassTokens = f.runs.find(run => run.view === 'harmony_bass').tokens.slice(0, 2);
  const bass = lookupOccurrences({ file: f.file, view: 'harmony_bass', tokens: bassTokens });
  assert.equal(ordinary.pattern.songCount, 2); assert.equal(bass.pattern.songCount, 2);
  assert.notEqual(ordinary.pattern.id, bass.pattern.id);
  assert.equal(lookupOccurrences({ file: f.file, view: 'harmony', tokens: bassTokens }).pattern, null);
  // Five-chord passage occurs in only one song, despite shorter overlapping repetitions.
  assert.equal(lookupOccurrences({ file: f.file, view: 'harmony', tokens: f.runs[0].tokens }).pattern, null);
});

test('empty indexes and absent patterns return empty pages rather than errors', t => {
  const f = createFixture(t, { empty: true });
  const result = lookupOccurrences({ file: f.file, view: 'harmony', tokens: ['I', 'V'] });
  assert.equal(result.pattern, null); assert.equal(result.nextOffset, null); assert.deepEqual(result.occurrences, []);
});

test('CLI normalizes an explicit musical query and works across transpositions', t => {
  const f = createFixture(t);
  const args = ['--analysis', f.file, '--view', 'harmony', '--chords', '[{"root":1},{"root":5},{"root":1}]', '--key', '{"tonic":"D","scale":"major"}', '--limit', '1'];
  const direct = runQueryCli(args); assert.equal(direct.pattern.occurrenceCount, 3); assert.equal(direct.occurrences.length, 1);
  const invoked = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  assert.equal(invoked.status, 0, invoked.stderr); assert.deepEqual(JSON.parse(invoked.stdout), direct);
  assert.match(runQueryCli(['--help']).help, /does not mine/);
});

test('strict query inputs and page bounds fail before reading the analysis', () => {
  const base = { file: 'not-used.db', view: 'harmony', tokens: ['I', 'V'] };
  for (const bad of [{ view: 'other' }, { tokens: ['I'] }, { tokens: ['I', null] }, { offset: -1 }, { offset: 0.5 }, { limit: 0 }, { limit: 10001 }]) assert.throws(() => lookupOccurrences({ ...base, ...bad }));
  assert.throws(() => runQueryCli(['--analysis', 'no.db']), /Missing --view/);
  assert.throws(() => runQueryCli(['--unexpected', 'x']), /Invalid query option/);
});

test('unsupported and missing metadata fail explicitly instead of guessing old namespaces', t => {
  const f = createFixture(t); const db = new DatabaseSync(f.file);
  db.prepare('UPDATE compact_index SET value=? WHERE key=?').run(JSON.stringify({ version: 'future', normalizationVersion: NORMALIZER_VERSION, minSongs: 2 }), 'metadata');
  db.close(); assert.throws(() => loadAnalysisIndex(f.file), /metadata/);
  const db2 = new DatabaseSync(f.file); db2.prepare('DELETE FROM compact_index WHERE key=?').run('metadata'); db2.close();
  assert.throws(() => loadAnalysisIndex(f.file), /missing compact metadata/);
});

test('corrupt binary arrays and event positions fail bounds checks', t => {
  const f = createFixture(t); const db = new DatabaseSync(f.file);
  db.prepare('UPDATE compact_index SET value=? WHERE key=?').run(Buffer.from([1, 2, 3]), 'suffixArray'); db.close();
  assert.throws(() => loadAnalysisIndex(f.file), /little-endian/);
  const g = createFixture(t); const second = new DatabaseSync(g.file);
  const value = second.prepare('SELECT value FROM compact_index WHERE key=?').get('suffixArray').value;
  const bad = Buffer.from(value); bad.writeInt32LE(2147483647, 0);
  second.prepare('UPDATE compact_index SET value=? WHERE key=?').run(bad, 'suffixArray'); second.close();
  assert.throws(() => loadAnalysisIndex(g.file), /suffix position/);
  const h = createFixture(t); const third = new DatabaseSync(h.file);
  third.exec("UPDATE run SET positions='[]' WHERE run_index=0"); third.close();
  assert.throws(() => loadAnalysisIndex(h.file), /Malformed normalized/);
});
