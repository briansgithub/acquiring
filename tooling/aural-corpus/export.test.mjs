import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizeSection } from './normalize.mjs';
import { curriculumOccurrences, exportRuntime } from './export.mjs';
import { hash, openDatabase } from './common.mjs';

const fixture = roots => normalizeSection({ songId: 'artist-song', section: { songId: 'verse-source', sectionName: 'Verse',
  metadata: { keys: [{ tonic: 'C', scale: 'major', beat: 1 }] },
  chords: roots.map((c, i) => ({ root: c.root ?? c, ...typeof c === 'object' ? c : {}, beat: 1 + i * 2, duration: 2 })) } });
const getPattern = (_, request) => ({ id: hash(request) });
test('reviewed family export preserves source bass and timing, with stable provenance', () => {
  const normalized = fixture([{ root: 5, inversion: 1 }, 1]);
  const examples = [...curriculumOccurrences(normalized.runs, {}, getPattern)];
  assert.equal(examples.length, 2);
  assert.equal(examples[0].familyId, 'dominant-return');
  assert.deepEqual(examples[0].events.map(e => e.beats), [2, 2]);
  assert.notEqual(examples[0].events[0].bassMidi, examples[0].events[0].rootMidi);
  assert.equal(examples[0].sourceId, examples[1].sourceId);
  assert.notEqual(examples[0].occurrenceId, examples[1].occurrenceId);
  assert.equal(examples[0].context[0].degree, 'I');
});
test('modified chords and collapsed varying bass never forced into simple curriculum', () => {
  assert.equal([...curriculumOccurrences(fixture([{ root: 5, type: 7 }, 1]).runs, {}, getPattern)].length, 0);
  const varied = fixture([{ root: 5 }, { root: 5, inversion: 1 }, 1]);
  assert.equal([...curriculumOccurrences(varied.runs.filter(r => r.view === 'harmony'), {}, getPattern)].length, 0);
});
test('runtime database has exact target indexes and preserves neutral missing popularity', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aural-runtime-test-'));
  try {
    const data = fixture([5, 1]), file = path.join(dir, 'runtime.db');
    const result = exportRuntime({ file, runs: data.runs, sections: [{ id: data.sectionId, sectionName: 'Verse' }],
      songs: [{ slug: 'artist-song', title: 'Title', artist: 'Artist' }], index: {}, getPattern, snapshotId: 'snapshot' });
    assert.equal(result.occurrenceCount, 2);
    const db = openDatabase(file, true);
    const song = db.prepare('SELECT * FROM quiz_song').get();
    assert.equal(song.popularity, null); assert.equal(song.confidence, 0);
    const row = db.prepare('SELECT * FROM quiz_occurrence LIMIT 1').get();
    assert.equal(JSON.parse(row.payload).sourceId, row.source_id);
    assert.match(db.prepare("EXPLAIN QUERY PLAN SELECT * FROM quiz_occurrence WHERE family_id='dominant-return' AND variant_id='direct' AND view='harmony'").get().detail, /quiz_target/);
    assert.match(db.prepare("EXPLAIN QUERY PLAN SELECT occurrence_id,source_id,song_id,section_id FROM quiz_occurrence WHERE family_id='dominant-return' AND variant_id='direct' AND view='harmony'").get().detail, /COVERING INDEX quiz_target/);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 1);
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
