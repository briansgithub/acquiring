const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const zlib = require('zlib');

const DATA_ROOT = 'sacred_ring_data';
const CATALOG_DB_PATH = path.join(DATA_ROOT, 'catalog', 'hooktheory_catalog.db');
const OUTPUT_DB_PATH = path.join(DATA_ROOT, 'catalog', 'harvested_songs.db');

async function run() {
  console.log('Opening catalog...');
  const catalogDb = new Database(CATALOG_DB_PATH, { readonly: true });

  // Find all songs that have been harvested/tested
  const harvestedSongs = catalogDb.prepare("SELECT slug, artist, title, url, oracle_out_dir FROM songs WHERE status = 'enriched' OR oracle_tested_at IS NOT NULL").all();
  console.log(`Found ${harvestedSongs.length} harvested songs.`);

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
  let skipCount = 0;

  for (const song of harvestedSongs) {
    if (!song.oracle_out_dir) {
      if (skipCount < 5) console.log(`Skip ${song.slug}: oracle_out_dir is null`);
      skipCount++;
      continue;
    }

    const scrapePath = path.join(DATA_ROOT, song.oracle_out_dir, 'scrape.json');
    if (!fs.existsSync(scrapePath)) {
      // Try fallback to just harvest/<slug>/scrape.json
      const fallbackPath = path.join(DATA_ROOT, 'harvest', song.slug, 'scrape.json');
      if (!fs.existsSync(fallbackPath)) {
        if (skipCount < 5) console.log(`Skip ${song.slug}: scrape.json not found at ${scrapePath} or ${fallbackPath}`);
        skipCount++;
        continue;
      }
    }


    try {
      const rawData = fs.readFileSync(scrapePath);
      // We only need the 'sections' part to keep it compact, but let's just store the whole thing compressed for now
      // Or extract what the Android app needs
      const json = JSON.parse(rawData);

      // The Android app uses a Map<String, ExtractedSection>
      // Let's transform it to that format to save space if needed
      const sections = json.sections;
      const compactJson = JSON.stringify(sections);
      const compressed = zlib.gzipSync(compactJson);

      insert.run(song.slug, song.artist, song.title, song.url, compressed);
      successCount++;

      if (successCount % 100 === 0) {
        console.log(`Processed ${successCount} songs...`);
      }
    } catch (e) {
      console.error(`Error processing ${song.slug}: ${e.message}`);
      skipCount++;
    }
  }

  console.log(`Done! Exported ${successCount} songs to ${OUTPUT_DB_PATH}. Skipped ${skipCount}.`);

  catalogDb.close();
  outputDb.close();
}

run().catch(console.error);
