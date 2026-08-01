const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const Database = require('better-sqlite3');
const { buildOrderedAndroidSectionMap } = require('../lib/androidCatalogSections');

const cacheDir = path.join(__dirname, '../../../sacred_ring_data/playback/.hooktheory_cache');
const catalogDbPath = path.join(__dirname, '../../../sacred_ring_data/catalog/hooktheory_catalog.db');
const outputDbPath = path.join(__dirname, '../../../android/catalog.db');
const outputGzPath = path.join(__dirname, '../../../android/catalog.db.gz');

if (fs.existsSync(outputDbPath)) fs.unlinkSync(outputDbPath);
if (fs.existsSync(outputGzPath)) fs.unlinkSync(outputGzPath);

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

const insertStmt = outDb.prepare(`
    INSERT OR REPLACE INTO songs (slug, artist, title, url, status, dataBlob)
    VALUES (?, ?, ?, ?, ?, ?)
`);

// 1. Process all 34,101 harvested folders from playback cache
console.log('Processing harvested folders from:', cacheDir);
const folders = fs.readdirSync(cacheDir);
let harvestedCount = 0;

const insertMany = outDb.transaction((items) => {
    for (const item of items) {
        insertStmt.run(
            item.slug,
            item.artist || null,
            item.title || null,
            item.url,
            item.status,
            item.dataBlob
        );
    }
});

let batch = [];
const startTime = Date.now();

for (let i = 0; i < folders.length; i++) {
    const folderName = folders[i];
    const folderPath = path.join(cacheDir, folderName);

    if (!fs.statSync(folderPath).isDirectory()) continue;

    const metaPath = path.join(folderPath, '_metadata.json');
    if (!fs.existsSync(metaPath)) continue;

    try {
        const metaStr = fs.readFileSync(metaPath, 'utf8');
        const meta = JSON.parse(metaStr);

        if (!meta.url) continue;

        const cleanUrl = meta.url.trim().replace(/\/+$/, '');
        const slug = cleanUrl.substringAfter ? cleanUrl.substringAfter("theorytab/view/").replace("/", "__") : cleanUrl.split('theorytab/view/')[1].replace(/\//g, '__');

        const files = fs.readdirSync(folderPath).filter(f => f !== '_metadata.json' && f.endsWith('.json'));
        if (files.length === 0) continue;

        const sectionRecords = [];
        for (const file of files) {
            const secContent = fs.readFileSync(path.join(folderPath, file), 'utf8');
            const secData = JSON.parse(secContent);
            sectionRecords.push({ file, data: secData });
        }

        const sectionMap = buildOrderedAndroidSectionMap(meta, sectionRecords);

        const jsonStr = JSON.stringify(sectionMap);
        // Gzip compress the section payload blob for maximum efficiency
        const compressedBlob = zlib.gzipSync(Buffer.from(jsonStr, 'utf8'), { level: 9 });

        batch.push({
            slug: slug,
            artist: meta.artist || null,
            title: meta.songTitle || null,
            url: cleanUrl,
            status: 'enriched',
            dataBlob: compressedBlob
        });

        harvestedCount++;

        if (batch.length >= 1000) {
            insertMany(batch);
            batch = [];
            console.log(`Processed ${harvestedCount} harvested songs...`);
        }
    } catch (e) {
        // Skip malformed entries
    }
}

if (batch.length > 0) {
    insertMany(batch);
    batch = [];
}

console.log(`Successfully processed ${harvestedCount} harvested songs in ${((Date.now() - startTime) / 1000).toFixed(2)}s!`);

// 2. Also populate remaining catalog index songs from hooktheory_catalog.db (if any missing)
if (fs.existsSync(catalogDbPath)) {
    console.log('Merging catalog index from:', catalogDbPath);
    const catalogDb = new Database(catalogDbPath);
    const catalogRows = catalogDb.prepare('SELECT slug, artist, title, url, status FROM songs').all();

    const insertMissingStmt = outDb.prepare(`
        INSERT OR IGNORE INTO songs (slug, artist, title, url, status, dataBlob)
        VALUES (?, ?, ?, ?, ?, NULL)
    `);

    const insertMissingBatch = outDb.transaction((rows) => {
        for (const r of rows) {
            insertMissingStmt.run(r.slug, r.artist || null, r.title || null, r.url, r.status || 'pending');
        }
    });

    insertMissingBatch(catalogRows);
    catalogDb.close();
}

outDb.close();

console.log('Compressing complete database to catalog.db.gz...');
const dbBuffer = fs.readFileSync(outputDbPath);
const finalGz = zlib.gzipSync(dbBuffer, { level: 9 });
fs.writeFileSync(outputGzPath, finalGz);

const rawMb = (fs.statSync(outputDbPath).size / (1024 * 1024)).toFixed(2);
const gzMb = (fs.statSync(outputGzPath).size / (1024 * 1024)).toFixed(2);

console.log(`🎉 SUCCESS!`);
console.log(`Raw Database (with ${harvestedCount} pre-harvested songs + full catalog): ${rawMb} MB`);
console.log(`Compressed Gzip Package (catalog.db.gz): ${gzMb} MB`);
