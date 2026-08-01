const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const Database = require('better-sqlite3');

const sourceDbPath = path.join(__dirname, '../../../sacred_ring_data/catalog/hooktheory_catalog.db');
const outputDbPath = path.join(__dirname, '../../../android/catalog.db');
const outputGzPath = path.join(__dirname, '../../../android/catalog.db.gz');

if (fs.existsSync(outputDbPath)) fs.unlinkSync(outputDbPath);
if (fs.existsSync(outputGzPath)) fs.unlinkSync(outputGzPath);

console.log('Connecting to source catalog DB...');
const srcDb = new Database(sourceDbPath);

console.log('Creating Room-compatible SQLite DB at:', outputDbPath);
const outDb = new Database(outputDbPath);

outDb.exec(`
CREATE TABLE IF NOT EXISTS songs (
    slug TEXT NOT NULL PRIMARY KEY,
    artist TEXT,
    title TEXT,
    url TEXT NOT NULL,
    status TEXT NOT NULL,
    dataBlob BLOB
);
`);

const rows = srcDb.prepare(`
    SELECT slug, artist, title, url, status FROM songs
`).all();

console.log(`Inserting ${rows.length} catalog songs into Room database...`);

const insertStmt = outDb.prepare(`
    INSERT INTO songs (slug, artist, title, url, status, dataBlob)
    VALUES (?, ?, ?, ?, ?, NULL)
`);

const insertMany = outDb.transaction((songs) => {
    for (const song of songs) {
        insertStmt.run(
            song.slug,
            song.artist || null,
            song.title || null,
            song.url,
            song.status || 'pending'
        );
    }
});

insertMany(rows);
outDb.close();
srcDb.close();

console.log('Database populated successfully!');

// Compress using Gzip
console.log('Compressing catalog.db to catalog.db.gz...');
const fileBuffer = fs.readFileSync(outputDbPath);
const compressed = zlib.gzipSync(fileBuffer, { level: 9 });
fs.writeFileSync(outputGzPath, compressed);

const rawSize = (fs.statSync(outputDbPath).size / (1024 * 1024)).toFixed(2);
const gzSize = (fs.statSync(outputGzPath).size / (1024 * 1024)).toFixed(2);

console.log(`✅ Success! Raw DB: ${rawSize} MB | Gzipped DB: ${gzSize} MB`);
console.log('Output location:', outputGzPath);
