const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const Database = require('better-sqlite3');
const {
    buildOrderedAndroidSectionMap,
    alphabeticalGroup,
    complexityBucket,
    collectAndroidBrowseModes,
} = require('../lib/androidCatalogSections');

const cacheDir = path.join(__dirname, '../../../sacred_ring_data/playback/.hooktheory_cache');
const catalogDbPath = path.join(__dirname, '../../../sacred_ring_data/catalog/hooktheory_catalog.db');
const outputDbPath = path.join(__dirname, '../../../android/catalog.db');
const outputGzPath = path.join(__dirname, '../../../android/catalog.db.gz');

if (!fs.existsSync(catalogDbPath)) {
    throw new Error(`Complexity source database is required: ${catalogDbPath}`);
}

const catalogDb = new Database(catalogDbPath, { readonly: true });
const hasMetricsTable = catalogDb.prepare(`
    SELECT 1 AS present
    FROM sqlite_master
    WHERE type = 'table' AND name = 'song_metrics'
`).get();
if (!hasMetricsTable) {
    catalogDb.close();
    throw new Error(`song_metrics is missing from complexity source: ${catalogDbPath}`);
}

if (fs.existsSync(outputDbPath)) fs.unlinkSync(outputDbPath);
if (fs.existsSync(outputGzPath)) fs.unlinkSync(outputGzPath);

console.log('Creating Room-compatible SQLite DB at:', outputDbPath);
const outDb = new Database(outputDbPath);
const complexityBySlug = new Map(
    catalogDb.prepare(`
        SELECT s.slug, m.complexity_rating
        FROM songs s
        LEFT JOIN song_metrics m ON m.slug = s.slug
    `).all().map(row => [row.slug, row.complexity_rating])
);

outDb.exec(`
CREATE TABLE IF NOT EXISTS songs (
    slug TEXT NOT NULL PRIMARY KEY,
    artist TEXT,
    title TEXT,
    url TEXT NOT NULL,
    status TEXT NOT NULL,
    dataBlob BLOB
);
CREATE TABLE IF NOT EXISTS song_browse_entries (
    slug TEXT NOT NULL PRIMARY KEY,
    artist TEXT,
    title TEXT,
    alphaGroup TEXT NOT NULL,
    complexityRating REAL,
    complexityBucket INTEGER
);
CREATE TABLE IF NOT EXISTS song_browse_modes (
    slug TEXT NOT NULL,
    mode TEXT NOT NULL,
    PRIMARY KEY (slug, mode)
);
CREATE INDEX IF NOT EXISTS index_song_browse_entries_alphaGroup
    ON song_browse_entries (alphaGroup);
CREATE INDEX IF NOT EXISTS index_song_browse_entries_complexityBucket
    ON song_browse_entries (complexityBucket);
CREATE INDEX IF NOT EXISTS index_song_browse_modes_mode
    ON song_browse_modes (mode);
`);
outDb.pragma('user_version = 3');

const insertStmt = outDb.prepare(`
    INSERT OR REPLACE INTO songs (slug, artist, title, url, status, dataBlob)
    VALUES (?, ?, ?, ?, ?, ?)
`);
const insertBrowseStmt = outDb.prepare(`
    INSERT OR REPLACE INTO song_browse_entries
        (slug, artist, title, alphaGroup, complexityRating, complexityBucket)
    VALUES (?, ?, ?, ?, ?, ?)
`);
const insertModeStmt = outDb.prepare(`
    INSERT OR IGNORE INTO song_browse_modes (slug, mode)
    VALUES (?, ?)
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
        insertBrowseStmt.run(
            item.slug,
            item.artist || null,
            item.title || null,
            alphabeticalGroup(item.title),
            item.complexityRating,
            complexityBucket(item.complexityRating)
        );
        for (const mode of item.modes) {
            insertModeStmt.run(item.slug, mode);
        }
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
        const complexityRating = complexityBySlug.get(slug) ?? null;
        const browseModes = collectAndroidBrowseModes(
            sectionRecords.map(record => record.data)
        );

        const jsonStr = JSON.stringify(sectionMap);
        // Gzip compress the section payload blob for maximum efficiency
        const compressedBlob = zlib.gzipSync(Buffer.from(jsonStr, 'utf8'), { level: 9 });

        batch.push({
            slug: slug,
            artist: meta.artist || null,
            title: meta.songTitle || null,
            url: cleanUrl,
            status: 'enriched',
            dataBlob: compressedBlob,
            complexityRating,
            modes: browseModes
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

if (harvestedCount !== folders.length) {
    throw new Error(`Only ${harvestedCount}/${folders.length} harvested songs were exportable`);
}
const browseStats = outDb.prepare(`
    SELECT
        COUNT(*) AS browseCount,
        COUNT(complexityRating) AS ratedCount
    FROM song_browse_entries
`).get();
if (browseStats.browseCount !== harvestedCount) {
    throw new Error(`Expected ${harvestedCount} browse rows, found ${browseStats.browseCount}`);
}
if (browseStats.ratedCount / browseStats.browseCount < 0.99) {
    throw new Error(
        `Complexity coverage is too low: ${browseStats.ratedCount}/${browseStats.browseCount}`
    );
}
const requiredModes = [
    'ionian',
    'dorian',
    'phrygian',
    'lydian',
    'mixolydian',
    'aeolian',
    'locrian',
];
const populatedModes = new Set(
    outDb.prepare('SELECT DISTINCT mode FROM song_browse_modes').all().map(row => row.mode)
);
const missingModes = requiredModes.filter(mode => !populatedModes.has(mode));
if (missingModes.length > 0) {
    throw new Error(`Required mode groups are empty: ${missingModes.join(', ')}`);
}

// 2. Also populate remaining catalog index songs from hooktheory_catalog.db (if any missing)
console.log('Merging catalog index from:', catalogDbPath);
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

const integrityResult = outDb.pragma('quick_check', { simple: true });
if (integrityResult !== 'ok') {
    throw new Error(`Generated catalog failed quick_check: ${integrityResult}`);
}
const relationshipErrors = outDb.prepare(`
    SELECT
        (SELECT COUNT(*)
         FROM song_browse_entries AS entries
         LEFT JOIN songs ON songs.slug = entries.slug
         WHERE songs.slug IS NULL) AS browseOrphans,
        (SELECT COUNT(*)
         FROM song_browse_modes AS modes
         LEFT JOIN song_browse_entries AS entries ON entries.slug = modes.slug
         WHERE entries.slug IS NULL) AS modeOrphans,
        (SELECT COUNT(*)
         FROM song_browse_entries
         WHERE complexityBucket IS NOT NULL
           AND (complexityBucket < 0 OR complexityBucket > 9)) AS invalidBuckets
`).get();
if (
    relationshipErrors.browseOrphans !== 0
    || relationshipErrors.modeOrphans !== 0
    || relationshipErrors.invalidBuckets !== 0
) {
    throw new Error(`Generated catalog relationship check failed: ${JSON.stringify(relationshipErrors)}`);
}

outDb.close();
catalogDb.close();

console.log('Compressing complete database to catalog.db.gz...');
const dbBuffer = fs.readFileSync(outputDbPath);
const finalGz = zlib.gzipSync(dbBuffer, { level: 9 });
fs.writeFileSync(outputGzPath, finalGz);

const rawMb = (fs.statSync(outputDbPath).size / (1024 * 1024)).toFixed(2);
const gzMb = (fs.statSync(outputGzPath).size / (1024 * 1024)).toFixed(2);

console.log(`🎉 SUCCESS!`);
console.log(`Raw Database (with ${harvestedCount} pre-harvested songs + full catalog): ${rawMb} MB`);
console.log(`Compressed Gzip Package (catalog.db.gz): ${gzMb} MB`);
