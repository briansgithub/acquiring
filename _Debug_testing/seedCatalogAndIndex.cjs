const fs = require('fs');
const path = require('path');
const { getPlaybackCacheDir, getCatalogDir } = require('../lib/dataRoot');
const { openDb, upsertSong, saveSections } = require('../_Research_testing/hooktheory_catalog/lib/db');
const { addSong } = require('../_Research_testing/hooktheory_catalog/lib/progression/indexManager');

const cacheRoot = getPlaybackCacheDir();
fs.mkdirSync(cacheRoot, { recursive: true });

const files = fs.readdirSync('./_Decode_oracle/chord_db/byModification').filter(f => f.endsWith('.json'));
const songs = new Map(); // slug -> Map(sectionName -> { chords: Map(beat -> chord), key })

for (const file of files) {
  const list = JSON.parse(fs.readFileSync(path.join('./_Decode_oracle/chord_db/byModification', file), 'utf8'));
  for (const item of list) {
    if (!item.song || !item.section || !item.chord) continue;
    if (!songs.has(item.song)) songs.set(item.song, new Map());
    const secMap = songs.get(item.song);
    if (!secMap.has(item.section)) secMap.set(item.section, { chords: new Map(), key: item.key });
    const secObj = secMap.get(item.section);
    if (!secObj.chords.has(item.beat)) {
      secObj.chords.set(item.beat, item.chord);
    }
  }
}

async function main() {
const catalogDb = openDb();
let totalSectionsCreated = 0;

for (const [slug, secMap] of songs.entries()) {
  const parts = slug.split('__');
  const artistSlug = parts[0] || 'artist';
  const titleSlug = parts[1] || 'title';
  const artist = artistSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const title = titleSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const cacheDirName = `${artistSlug} - ${titleSlug}`;
  const dirPath = path.join(cacheRoot, cacheDirName);
  fs.mkdirSync(dirPath, { recursive: true });

  const url = `https://www.hooktheory.com/theorytab/view/${artistSlug}/${titleSlug}`;
  const now = new Date().toISOString();

  upsertSong(catalogDb, {
    slug,
    artist_slug: artistSlug,
    title_slug: titleSlug,
    artist,
    title,
    url,
    status: 'enriched',
    discovery_source: 'seeded_catalog',
  });

  catalogDb.prepare(`
    UPDATE songs
    SET cache_dir = ?, processed_at = ?, status = 'enriched'
    WHERE slug = ?
  `).run(cacheDirName, now, slug);

  const sectionMapping = {};
  const dbSections = [];

  let secIdx = 1;
  for (const [secName, secObj] of secMap.entries()) {
    const chordList = Array.from(secObj.chords.values()).sort((a, b) => (a.beat || 0) - (b.beat || 0));
    let endBeat = 16;
    for (const c of chordList) {
      const b = (c.beat === 0 ? 1 : c.beat) + (c.duration || 4);
      if (b > endBeat) endBeat = b;
    }

    const songId = `section_${secIdx}`;
    secIdx++;
    sectionMapping[songId] = secName;

    const key = secObj.key || { tonic: 'C', scale: 'major' };

    const sectionJson = {
      songId,
      sectionName: secName,
      songInfo: { title, artist, url },
      metadata: {
        keys: [{ beat: 1, tonic: key.tonic || 'C', scale: key.scale || 'major' }],
        endBeat,
      },
      chords: chordList,
      mainData: chordList,
    };

    const fileName = `${secName} - ${songId}.json`;
    fs.writeFileSync(path.join(dirPath, fileName), JSON.stringify(sectionJson, null, 2));

    dbSections.push({
      section_name: secName,
      song_id: songId,
      hooktheory_id: songId,
      end_beat: endBeat,
      chord_count: chordList.length,
      note_count: 0,
      key_tonic: key.tonic || 'C',
      key_scale: key.scale || 'major',
      bpm: 120,
      time_sig: '4/4',
      swing_factor: 0,
      melody_line_count: 0,
      has_melody: 0,
      pickup: 0,
      content_fp: null,
      borrowed_chord_count: 0,
      applied_chord_count: 0,
      modified_chord_count: 0,
      section_data_json: JSON.stringify(sectionJson),
    });

    totalSectionsCreated++;
  }

  const metaJson = {
    songTitle: title,
    artistName: artist,
    sectionMapping,
  };
  fs.writeFileSync(path.join(dirPath, '_metadata.json'), JSON.stringify(metaJson, null, 2));

  saveSections(catalogDb, slug, dbSections);

  // Index into progression_index.db
  const indexRes = await addSong(slug);
  console.log(`Indexed ${slug}:`, indexRes);
}

console.log(`Seeding complete: ${songs.size} songs, ${totalSectionsCreated} sections created and indexed.`);
}

main().catch(console.error);
