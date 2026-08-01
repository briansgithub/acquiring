const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const {
  CANONICAL_SECTION_TYPES,
  canonicalSectionRank,
  orderUniqueSections,
} = require('../lib/sectionOrder');
const {
  buildOrderedAndroidSectionMap,
} = require('./hooktheory_catalog/lib/androidCatalogSections');
const { listSongSections } = require('./hooktheory_catalog/lib/queries');

{
  const sections = [
    { id: 'late-verse', sectionName: 'Verse', sectionIndex: 4 },
    { id: 'chorus', sectionName: 'Chorus', sectionIndex: 2 },
    { id: 'intro', sectionName: 'Intro', sectionIndex: 0 },
    { id: 'first-verse', sectionName: ' verse ', sectionIndex: 1 },
  ];
  const ordered = orderUniqueSections(sections);
  assert.deepEqual(ordered.map((section) => section.id), ['intro', 'first-verse', 'chorus']);
}

{
  const sections = [
    { id: 'custom-a', sectionName: 'Theme A' },
    { id: 'outro', sectionName: 'Outro' },
    { id: 'solo-2', sectionName: 'Solo 2' },
    { id: 'chorus', sectionName: 'Chorus' },
    { id: 'verse-pre', sectionName: 'Verse and Pre-Chorus' },
    { id: 'verse', sectionName: 'Verse' },
    { id: 'intro', sectionName: 'Intro' },
    { id: 'bridge', sectionName: 'Bridge' },
    { id: 'solo-1', sectionName: 'Solo 1' },
    { id: 'custom-b', sectionName: 'Theme B' },
  ];
  const ordered = orderUniqueSections(sections);
  assert.deepEqual(
    ordered.map((section) => section.id),
    [
      'intro',
      'verse',
      'verse-pre',
      'chorus',
      'bridge',
      'solo-1',
      'solo-2',
      'outro',
      'custom-a',
      'custom-b',
    ],
  );
}

{
  const ranks = CANONICAL_SECTION_TYPES.map(canonicalSectionRank);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  assert.equal(orderUniqueSections([
    { sectionName: 'Pre-Chorus' },
    { sectionName: ' pre chorus ' },
  ]).length, 1);
}

{
  const metadata = {
    sections: [
      { index: 0, songId: 'shared-id', sectionName: 'Verse' },
      { index: 1, songId: 'chorus-id', sectionName: 'Chorus' },
      { index: 2, songId: 'shared-id', sectionName: 'Outro' },
    ],
  };
  const recordsInFilesystemOrder = [
    { file: 'Outro.json', data: { songId: 'shared-id', sectionName: 'Outro' } },
    { file: 'Chorus.json', data: { songId: 'chorus-id', sectionName: 'Chorus' } },
    { file: 'Verse.json', data: { songId: 'shared-id', sectionName: 'Verse' } },
    { file: 'Verse-old.json', data: { songId: 'stale-id', sectionName: ' verse ' } },
  ];
  const sectionMap = buildOrderedAndroidSectionMap(metadata, recordsInFilesystemOrder);
  const exported = Object.values(sectionMap);

  assert.deepEqual(exported.map((section) => section.sectionName), ['Verse', 'Chorus', 'Outro']);
  assert.deepEqual(exported.map((section) => section.sectionIndex), [0, 1, 2]);
  assert.equal(Object.keys(sectionMap).length, 3);
}

{
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE song_sections (
      slug TEXT,
      section_name TEXT,
      song_id TEXT,
      chord_count INTEGER,
      note_count INTEGER,
      key_tonic TEXT,
      key_scale TEXT,
      bpm REAL,
      time_sig TEXT
    )
  `);
  const insert = db.prepare('INSERT INTO song_sections (slug, section_name, song_id) VALUES (?, ?, ?)');
  insert.run('song', 'Outro', 'outro');
  insert.run('song', 'Chorus', 'chorus');
  insert.run('song', 'Verse', 'verse');
  insert.run('song', 'Intro', 'intro');

  assert.deepEqual(
    listSongSections(db, 'song').map((section) => section.section_name),
    ['Intro', 'Verse', 'Chorus', 'Outro'],
  );
  db.close();
}

console.log('section order tests passed');
