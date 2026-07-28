const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const zlib = require('zlib');

const DATA_ROOT = 'sacred_ring_data';
const CACHE_ROOT = path.join(DATA_ROOT, 'playback', '.hooktheory_cache');
const OUTPUT_DB_PATH = path.join(DATA_ROOT, 'catalog', 'harvested_songs.db');

async function run() {
  console.log('Scanning cache...');
  if (!fs.existsSync(CACHE_ROOT)) {
    console.error(`Cache root not found: ${CACHE_ROOT}`);
    return;
  }

  const songDirs = fs.readdirSync(CACHE_ROOT).filter(f => fs.statSync(path.join(CACHE_ROOT, f)).isDirectory());
  console.log(`Found ${songDirs.length} songs in cache.`);

  console.log('Creating output database...');
  if (fs.existsSync(OUTPUT_DB_PATH)) fs.unlinkSync(OUTPUT_DB_PATH);
  const outputDb = new Database(OUTPUT_DB_PATH);

  outputDb.exec(`
    CREATE TABLE harvested_songs (
      slug TEXT PRIMARY KEY,
      artist TEXT,
      title TEXT,
      url TEXT,
      data_blob BLOB
    )
  `);

  const insert = outputDb.prepare('INSERT INTO harvested_songs (slug, artist, title, url, data_blob) VALUES (?, ?, ?, ?, ?)');

  let successCount = 0;
  let errorCount = 0;

  for (const songDir of songDirs) {
    const dirPath = path.join(CACHE_ROOT, songDir);
    const metadataPath = path.join(dirPath, '_metadata.json');
    if (!fs.existsSync(metadataPath)) continue;

    try {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      const url = metadata.url;
      const slug = url.trim().replace(/\/$/, '').split('theorytab/view/')[1].replace(/\//g, '__');

      const sectionsMap = {};
      for (const sectionInfo of metadata.sections) {
        // Find the file: <sectionName> - <numericId> - <songId>.json
        const filename = `${sectionInfo.sectionName} - ${sectionInfo.numericId} - ${sectionInfo.songId}.json`;
        const filePath = path.join(dirPath, filename);
        if (!fs.existsSync(filePath)) {
           // Try to find by songId only if filename changed?
           continue;
        }

        const sectionData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        sectionsMap[sectionInfo.songId] = {
          songId: sectionInfo.songId,
          numericId: sectionInfo.numericId.toString(),
          sectionName: sectionInfo.sectionName,
          songInfo: metadata.songTitle,
          chords: sectionData.chords || [],
          notes: sectionData.notes || null,
          metadata: sectionData.metadata || {}
        };
      }

      const compressed = zlib.gzipSync(JSON.stringify(sectionsMap));
      insert.run(slug, metadata.artist, metadata.songTitle, url, compressed);
      successCount++;

      if (successCount % 100 === 0) {
        process.stdout.write(`Processed ${successCount} songs...\r`);
      }
    } catch (e) {
      console.error(`Error processing ${songDir}: ${e.message}`);
      errorCount++;
    }
  }

  console.log(`\nDone! Exported ${successCount} songs to ${OUTPUT_DB_PATH}. Errors: ${errorCount}`);
  outputDb.close();
}

run().catch(console.error);
