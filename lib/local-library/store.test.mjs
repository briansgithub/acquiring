import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { GIB } = require('../midi-corpus/storage');
const { createLocalLibraryStore } = require('./store');

const UUIDS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
];

function playable(title = 'Fixture') {
  return {
    schemaVersion: 'diatonic-ring.playable-song.v1',
    title,
    artist: 'Test Artist',
    warnings: [],
    sections: [{
      sectionName: 'Full Song',
      sectionIndex: 0,
      inlineData: {
        sectionName: 'Full Song',
        chords: [{ beat: 1, duration: 4, root: 1, type: 5, inversion: 0 }],
        notes: [],
        metadata: {
          keys: [{ beat: 1, tonic: 'C', scale: 'major' }],
          tempos: [{ beat: 1, bpm: 120 }],
          meters: [{ beat: 1, numerator: 4, denominator: 4 }],
          endBeat: 5,
        },
      },
    }],
  };
}

async function fixtureStore(t, extra = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'local-library-store-test-'));
  let uuidIndex = 0;
  const store = createLocalLibraryStore({
    root,
    availableBytes: 30n * GIB,
    randomUUID: () => UUIDS[uuidIndex++],
    now: () => `2026-08-19T00:00:0${uuidIndex}.000Z`,
    ...extra,
  });
  t.after(async () => {
    store.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  return { root, store };
}

test('theory imports preserve exact bytes, persist playable data, and deduplicate', async (t) => {
  const { store } = await fixtureStore(t);
  const source = Buffer.from('{\n  "sections": []\n}\n', 'utf8');
  const first = await store.save({
    sourceType: 'theory',
    filename: 'fixture.json',
    sourceBuffer: source,
    theoryBuffer: source,
    playableSong: playable(),
  });

  assert.equal(first.deduplicated, false);
  assert.equal(first.item.key, `local:${first.item.id}`);
  assert.equal(first.song.key, first.item.key);
  assert.deepEqual(await fs.readFile(store.download(first.item.id, 'source').path), source);
  assert.deepEqual(await fs.readFile(store.download(first.item.id, 'theory').path), source);

  const duplicate = await store.save({
    sourceType: 'theory',
    filename: 'renamed.json',
    sourceBuffer: source,
    theoryBuffer: source,
    playableSong: playable('Changed but ignored'),
  });
  assert.equal(duplicate.deduplicated, true);
  assert.equal(duplicate.item.id, first.item.id);
  assert.equal(duplicate.song.title, 'Fixture');
  assert.equal(store.list().length, 1);
  assert.deepEqual(await store.get(first.item.id), { item: first.item, song: first.song });
});

test('same source filename with different content gets a stable display suffix', async (t) => {
  const { store } = await fixtureStore(t);
  const firstSource = Buffer.from('{"value":1}');
  const secondSource = Buffer.from('{"value":2}');
  const first = await store.save({
    sourceType: 'theory', filename: 'song.json', sourceBuffer: firstSource,
    theoryBuffer: firstSource, playableSong: playable('One'),
  });
  const second = await store.save({
    sourceType: 'theory', filename: 'song.json', sourceBuffer: secondSource,
    theoryBuffer: secondSource, playableSong: playable('Two'),
  });
  assert.equal(first.item.displayFilename, 'song.json');
  assert.equal(second.item.displayFilename, 'song (2).json');
  assert.deepEqual(store.list().map((item) => item.title), ['Two', 'One']);
});

test('MIDI deduplication is scoped to the analyzer version and reuses source objects', async (t) => {
  const { store } = await fixtureStore(t);
  const midi = Buffer.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6]);
  const one = await store.save({
    sourceType: 'midi', filename: 'song.mid', sourceBuffer: midi,
    theoryBuffer: Buffer.from('{"analyzer":{"version":"1"}}'),
    playableSong: playable(), analyzerVersion: '1',
  });
  const duplicate = await store.save({
    sourceType: 'midi', filename: 'song.mid', sourceBuffer: midi,
    theoryBuffer: Buffer.from('{"should":"not replace the preserved analysis"}'),
    playableSong: playable(), analyzerVersion: '1',
  });
  const two = await store.save({
    sourceType: 'midi', filename: 'song.mid', sourceBuffer: midi,
    theoryBuffer: Buffer.from('{"analyzer":{"version":"2"}}'),
    playableSong: playable(), analyzerVersion: '2',
  });

  assert.equal(duplicate.item.id, one.item.id);
  assert.notEqual(two.item.id, one.item.id);
  assert.equal(two.item.displayFilename, 'song (2).mid');
  assert.equal(store.download(one.item.id, 'source').path, store.download(two.item.id, 'source').path);
  assert.equal(store.download(one.item.id, 'theory').filename, 'song.analysis.json');
});

test('storage preflight reports exact capacity fields before object writes', async (t) => {
  const { root, store } = await fixtureStore(t, { availableBytes: 1n });
  const source = Buffer.from('{}');
  await assert.rejects(
    store.save({
      sourceType: 'theory', filename: 'small.json', sourceBuffer: source,
      theoryBuffer: source, playableSong: playable(),
    }),
    (error) => {
      assert.equal(error.code, 'INSUFFICIENT_STORAGE_RESERVE');
      assert.equal(error.statusCode, 507);
      assert.equal(error.details.available_bytes, '1');
      assert.equal(error.details.additional_bytes, error.details.shortfall_bytes);
      return true;
    },
  );
  await assert.rejects(fs.stat(path.join(root, 'objects')), { code: 'ENOENT' });
  assert.equal(store.list().length, 0);
});

test('a failed transaction exposes no item and cleans staging and new objects', async (t) => {
  const { root, store } = await fixtureStore(t, {
    beforeInsert: () => {
      const error = new Error('injected transaction failure');
      error.code = 'INJECTED_FAILURE';
      throw error;
    },
  });
  const source = Buffer.from('{"rollback":true}');
  await assert.rejects(store.save({
    sourceType: 'theory', filename: 'rollback.json', sourceBuffer: source,
    theoryBuffer: source, playableSong: playable(),
  }), { code: 'INJECTED_FAILURE' });
  assert.equal(store.list().length, 0);
  const staging = await fs.readdir(path.join(root, 'staging'));
  assert.deepEqual(staging, []);
  const objectFiles = [];
  async function walk(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(child);
      else objectFiles.push(child);
    }
  }
  await walk(path.join(root, 'objects'));
  assert.deepEqual(objectFiles, []);
});
