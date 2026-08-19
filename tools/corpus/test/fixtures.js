'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { DatabaseSync } = require('node:sqlite');

function musicalPayload(sectionId, options = {}) {
  return {
    [sectionId]: {
      songId: options.songId || sectionId,
      stringSongId: options.stringSongId || options.songId || sectionId,
      ...(options.fp ? { fp: options.fp } : {}),
      sectionName: options.sectionName || 'Verse',
      chords: options.chords || [
        { root: 1, beat: 1, duration: 4, type: 1, inversion: 0 },
        { root: 5, beat: 5, duration: 4, type: 1, inversion: 0 },
      ],
      notes: options.notes || [
        { sd: '1', octave: 0, beat: 1, duration: 1 },
        { sd: '3', octave: 0, beat: 2, duration: 1 },
      ],
      metadata: {
        ...(options.metadataFp ? { fp: options.metadataFp } : {}),
        keys: [{ tonic: options.tonic || 'C', scale: options.scale || 'major', beat: 1 }],
        tempos: [{ bpm: 120, beat: 1 }],
        meters: [{ numBeats: 4, beatUnit: 4, beat: 1 }],
        endBeat: options.endBeat || 9,
      },
    },
  };
}

function createGroupingCatalogFixture(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE songs (
      slug TEXT NOT NULL PRIMARY KEY,
      artist TEXT,
      title TEXT,
      url TEXT NOT NULL,
      status TEXT NOT NULL,
      dataBlob BLOB
    )
  `);
  const insert = db.prepare(`
    INSERT INTO songs (slug, artist, title, url, status, dataBlob)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const add = (slug, artist, title, payload) => insert.run(
    slug,
    artist,
    title,
    `https://www.hooktheory.com/theorytab/view/fixture/${slug}`,
    'enriched',
    gzipPayload(payload),
  );

  add('alias-section-a', 'Alpha Alias', 'First Label', musicalPayload('payload-a', {
    songId: 'shared-hooktheory-section',
    fp: 'fingerprint-alpha-only',
  }));
  add('alias-section-b', 'Chain Alias 29', 'Cross Name 29', musicalPayload('payload-b', {
    songId: 'shared-hooktheory-section',
    metadataFp: 'fingerprint-chain-shared',
  }));
  add('alias-fp-c', 'Chain Tail 35', 'Other Name 35', musicalPayload('payload-c', {
    songId: 'independent-hooktheory-section',
    fp: 'fingerprint-chain-shared',
  }));

  const harmonicPattern = [
    { root: 1, beat: 1, duration: 4, type: 1, inversion: 0 },
    { root: 5, beat: 5, duration: 4, type: 1, inversion: 0 },
    { root: 6, beat: 9, duration: 4, type: 1, inversion: 0 },
    { root: 4, beat: 13, duration: 4, type: 1, inversion: 0 },
  ];
  const melodyPattern = Array.from({ length: 20 }, (_, index) => ({
    sd: String((index % 7) + 1),
    octave: index < 10 ? 0 : 1,
    beat: index + 1,
    duration: 1,
  }));
  add('transposed-c', 'Source Name', 'C Version', musicalPayload('transposed-source', {
    tonic: 'C',
    chords: harmonicPattern,
    notes: melodyPattern,
    endBeat: 21,
  }));
  add('transposed-g', 'Transpose Alias 3', 'Shifted Work 3', musicalPayload('transposed-alias', {
    tonic: 'G',
    chords: harmonicPattern,
    notes: melodyPattern.map((note) => ({ ...note, octave: note.octave + 1 })),
    endBeat: 21,
  }));

  const longNotes = Array.from({ length: 72 }, (_, index) => ({
    sd: String((index % 7) + 1),
    octave: Math.floor(index / 28),
    beat: index + 1,
    duration: 1,
  }));
  const changedLongNotes = longNotes.map((note, index) => (
    index === 35 ? { ...note, sd: note.sd === '7' ? '6' : '7' } : { ...note }
  ));
  add('near-duplicate-a', 'Long Form Source', 'Original Sequence', musicalPayload('near-source', {
    chords: harmonicPattern,
    notes: longNotes,
    endBeat: 73,
  }));
  add('near-duplicate-b', 'Near Alias 25', 'Edited Work 25', musicalPayload('near-alias', {
    chords: harmonicPattern,
    notes: changedLongNotes,
    endBeat: 73,
  }));

  db.close();
  return dbPath;
}

function gzipPayload(payload) {
  return zlib.gzipSync(Buffer.from(JSON.stringify(payload)), { level: 9, mtime: 0 });
}

function createCatalogFixture(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE songs (
      slug TEXT NOT NULL PRIMARY KEY,
      artist TEXT,
      title TEXT,
      url TEXT NOT NULL,
      status TEXT NOT NULL,
      dataBlob BLOB
    )
  `);
  const insert = db.prepare(`
    INSERT INTO songs (slug, artist, title, url, status, dataBlob)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const sharedPayload = gzipPayload(musicalPayload('shared-section'));
  insert.run(
    'example-band__same-song-live',
    'Example Band feat. Guest',
    'Same Song (Live)',
    'https://www.hooktheory.com/theorytab/view/example-band/same-song-live',
    'enriched',
    sharedPayload,
  );
  insert.run(
    'example-band__same-song',
    'Example Band',
    'Same Song',
    'https://www.hooktheory.com/theorytab/view/example-band/same-song',
    'enriched',
    sharedPayload,
  );
  insert.run(
    'other__broken',
    'Other',
    'Broken',
    'not a url',
    'enriched',
    Buffer.from('not gzip'),
  );
  insert.run(
    'test-entry',
    null,
    'Hookpad Tutorial',
    'https://www.hooktheory.com/theorytab/view/test/entry',
    'pending',
    null,
  );
  db.close();
  return dbPath;
}

module.exports = {
  createCatalogFixture,
  createGroupingCatalogFixture,
  gzipPayload,
  musicalPayload,
};
