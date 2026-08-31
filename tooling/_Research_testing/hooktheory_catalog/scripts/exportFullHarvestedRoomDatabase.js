const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const Database = require('better-sqlite3');
const catalogContractDir = path.resolve(__dirname, '../../../../contracts/catalog');
const catalogContract = JSON.parse(
    fs.readFileSync(path.join(catalogContractDir, 'contract.json'), 'utf8')
);
const catalogSchema = fs.readFileSync(path.join(catalogContractDir, 'schema.sql'), 'utf8');
const {
    buildOrderedAndroidSectionMap,
    alphabeticalGroup,
    complexityBucket,
    collectAndroidBrowseModes,
} = require('../lib/androidCatalogSections');

// Resolve through dataRoot rather than __dirname: run from a git worktree,
// __dirname-relative paths point inside the worktree, where acquiring_data
// has no catalog DB and android/ does not exist at all. That is exactly how
// the overnight run's export/publish phases failed.
const {
  getPlaybackCacheDir,
  getCatalogDir,
  getAndroidDir,
} = require('../../../lib/dataRoot');

const cacheDir = getPlaybackCacheDir();
const catalogDbPath = path.join(getCatalogDir(), 'hooktheory_catalog.db');
const outputDbPath = path.join(getAndroidDir(), catalogContract.databaseFilename);
const outputGzPath = path.join(getAndroidDir(), catalogContract.archiveFilename);

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

const catalogRows = catalogDb.prepare('SELECT slug, artist, title, url, status FROM songs').all();
const urlKey = (value) => String(value || '').trim().replace(/\/+$/, '');
const catalogSlugByUrl = new Map(catalogRows.map(row => [urlKey(row.url), row.slug]));

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

outDb.exec(catalogSchema);

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
        const urlDerivedSlug = cleanUrl.substringAfter
            ? cleanUrl.substringAfter("theorytab/view/").replace("/", "__")
            : cleanUrl.split('theorytab/view/')[1].replace(/\//g, '__');
        // The source slug is the catalog identity. URL paths deliberately keep
        // punctuation that slugify removes, so deriving identity from a repaired
        // URL would create a second Android-only song (for example `(hellsing-
        // opening)` versus `hellsing-opening`). Match the unique source URL first.
        const slug = catalogSlugByUrl.get(urlKey(cleanUrl)) || urlDerivedSlug;

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
if (browseStats.ratedCount / browseStats.browseCount < 0.8) {
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

const identityMismatches = outDb.prepare(`
    SELECT slug, url FROM songs WHERE dataBlob IS NOT NULL
`).all().filter(row => {
    const sourceSlug = catalogSlugByUrl.get(urlKey(row.url));
    return sourceSlug && sourceSlug !== row.slug;
});
if (identityMismatches.length > 0) {
    throw new Error(`Generated catalog changed source identity for ${identityMismatches.length} harvested song(s): `
        + JSON.stringify(identityMismatches.slice(0, 5)));
}

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
