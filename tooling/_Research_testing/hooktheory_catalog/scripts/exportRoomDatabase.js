const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const Database = require('better-sqlite3');
const { resolveDisplayNames } = require('../lib/catalogDisplayNames');
const { catalogExportOptions, prepareCatalogOutput } = require('../lib/catalogExportOptions');
const catalogContractDir = path.resolve(__dirname, '../../../../contracts/catalog');
const catalogContract = JSON.parse(
    fs.readFileSync(path.join(catalogContractDir, 'contract.json'), 'utf8')
);
const catalogSchema = fs.readFileSync(path.join(catalogContractDir, 'schema.sql'), 'utf8');
const {
    alphabeticalGroup,
    complexityBucket,
    canonicalDiatonicMode,
    collectAndroidBrowseModes,
} = require('../lib/androidCatalogSections');

// See exportFullHarvestedRoomDatabase.js: __dirname-relative paths break when
// run from a git worktree, which has no android/ and no populated data dir.
const { getCatalogDir, getAndroidDir } = require('../../../lib/dataRoot');

const exportOptions = catalogExportOptions(process.argv.slice(2), {
    sourceDbPath: path.join(getCatalogDir(), 'hooktheory_catalog.db'),
    outputDir: getAndroidDir(),
    ...catalogContract,
});
const { sourceDbPath, outputDbPath, outputGzPath, namesBySlug } = exportOptions;

console.log('Connecting to source catalog DB...');
const srcDb = new Database(sourceDbPath, { readonly: true });
prepareCatalogOutput(exportOptions);

console.log('Creating Room-compatible SQLite DB at:', outputDbPath);
const outDb = new Database(outputDbPath);

outDb.exec(catalogSchema);

const rows = srcDb.prepare(`
    SELECT s.slug, s.artist, s.title, s.url, s.status, m.complexity_rating,
           d.hooktheory_song_name AS source_title
    FROM songs s
    LEFT JOIN song_metrics m ON m.slug = s.slug
    LEFT JOIN song_details d ON d.slug = s.slug
`).all();

const modesBySlug = new Map();
for (const section of srcDb.prepare(`
    SELECT slug, key_scale, section_data_json
    FROM song_sections
`).iterate()) {
    let modes = modesBySlug.get(section.slug);
    if (!modes) {
        modes = new Set();
        modesBySlug.set(section.slug, modes);
    }

    if (section.section_data_json) {
        try {
            const sectionData = JSON.parse(section.section_data_json);
            for (const mode of collectAndroidBrowseModes({ section: sectionData })) {
                modes.add(mode);
            }
        } catch (_) {
            // Fall back to the section's primary scale below.
        }
    }
    const primaryMode = canonicalDiatonicMode(section.key_scale);
    if (primaryMode) modes.add(primaryMode);
}

console.log(`Inserting ${rows.length} catalog songs into Room database...`);

const insertStmt = outDb.prepare(`
    INSERT INTO songs (slug, artist, title, url, status, dataBlob)
    VALUES (?, ?, ?, ?, ?, NULL)
`);
const insertBrowseStmt = outDb.prepare(`
    INSERT INTO song_browse_entries
        (slug, artist, title, alphaGroup, complexityRating, complexityBucket)
    VALUES (?, ?, ?, ?, ?, ?)
`);
const insertModeStmt = outDb.prepare(`
    INSERT OR IGNORE INTO song_browse_modes (slug, mode)
    VALUES (?, ?)
`);

const insertMany = outDb.transaction((songs) => {
    for (const song of songs) {
        const names = resolveDisplayNames(song, {
            namesBySlug, fallback: { title: song.source_title },
        });
        insertStmt.run(
            song.slug,
            names.artist || null,
            names.title || null,
            song.url,
            song.status || 'pending'
        );
        insertBrowseStmt.run(
            song.slug,
            names.artist || null,
            names.title || null,
            alphabeticalGroup(names.title),
            song.complexity_rating ?? null,
            complexityBucket(song.complexity_rating)
        );
        for (const mode of modesBySlug.get(song.slug) ?? []) {
            insertModeStmt.run(song.slug, mode);
        }
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
