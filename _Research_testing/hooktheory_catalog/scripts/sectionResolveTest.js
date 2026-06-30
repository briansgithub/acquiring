/**
 * Unit tests for section ID validation and light-harvest queue (no network).
 */

const { openDb, upsertSong, upsertMeiliSectionStub, setHarvestMode } = require('../lib/db');
const { isPublicSongId, stubsAreValid } = require('../lib/sectionResolve');
const {
  countSongsNeedingLightHarvest,
  listSongsNeedingLightHarvest,
} = require('../lib/lightHarvest');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testPublicSongId() {
  assert(isPublicSongId('RPxek_wemb_'), 'valid public id');
  assert(isPublicSongId('nvgy-kVrgkA'), 'valid public id 2');
  assert(!isPublicSongId('251'), 'meili numeric id invalid');
  assert(!isPublicSongId('10427'), 'meili numeric id invalid 2');
  assert(!isPublicSongId(''), 'empty invalid');
}

function testQueueBlocked() {
  const db = openDb();
  const slug = 'queue-test__song';
  db.prepare('DELETE FROM song_sections WHERE slug = ?').run(slug);
  db.prepare('DELETE FROM songs WHERE slug = ?').run(slug);

  upsertSong(db, {
    slug,
    url: 'https://www.hooktheory.com/theorytab/view/queue-test/song',
    artist: 'queue test',
    title: 'song',
    discovery_source: 'test',
  });

  const before = countSongsNeedingLightHarvest(db);
  assert(listSongsNeedingLightHarvest(db, 100).some((r) => r.slug === slug), 'in queue');

  setHarvestMode(db, slug, 'blocked');
  assert(!listSongsNeedingLightHarvest(db, 100).some((r) => r.slug === slug), 'blocked excluded');

  setHarvestMode(db, slug, 'light');
  assert(!listSongsNeedingLightHarvest(db, 100, { force: false }).some((r) => r.slug === slug), 'light excluded');

  db.prepare('DELETE FROM songs WHERE slug = ?').run(slug);
}

function testMeiliStubsInvalid() {
  assert(!stubsAreValid([{ section_name: 'Intro', song_id: '251' }]), 'numeric stub invalid');
  assert(stubsAreValid([{ section_name: 'Intro', song_id: 'RPxek_wemb_' }]), 'public stub valid');
}

function main() {
  testPublicSongId();
  testMeiliStubsInvalid();
  testQueueBlocked();
  console.log('sectionResolveTest: PASS');
}

main();
