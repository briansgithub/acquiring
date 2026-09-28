import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { catalogRanges, discoverPatterns } from './miner.mjs';
import { CATALOG_VERSION, baseScore, startingRomanGroup } from './catalog.mjs';
import { LOOP_REDUCTION_VERSION, reducedCatalogRanges } from './loop-reduction.mjs';
import { hash, hashFile, openDatabase, stableJson, transaction, NORMALIZER_VERSION } from './common.mjs';
import { readNormalizedCache, catalogSongs } from './source.mjs';

/** A linear-size on-device suffix catalog. Sections and runs are stored once;
 * suffix ranges encode occurrence sets for every implicit sequence length.
 */
export function exportCatalog({ file, index, songs, normalizedFile, snapshotId }) {
  const db = openDatabase(file), source = openDatabase(normalizedFile, true);
  try {
    db.exec(`CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE catalog_song(id TEXT PRIMARY KEY,title TEXT,artist TEXT,url TEXT);
      CREATE TABLE catalog_section(id TEXT PRIMARY KEY,song_id TEXT,revision TEXT,name TEXT,source BLOB,diagnostics TEXT);
      CREATE TABLE catalog_run(id INTEGER PRIMARY KEY,stable_id TEXT UNIQUE,view TEXT,song_id TEXT,section_id TEXT,revision TEXT,tokens TEXT,positions TEXT,key_json TEXT,source_key_json TEXT);
      CREATE TABLE catalog_suffix(rank INTEGER PRIMARY KEY,run_id INTEGER,offset INTEGER,start_index INTEGER,end_index INTEGER);
      CREATE UNIQUE INDEX suffix_location ON catalog_suffix(run_id,offset);
      CREATE TABLE catalog_range(id INTEGER PRIMARY KEY,view TEXT,mode TEXT,start_group TEXT,start_group_label TEXT,start INTEGER,end INTEGER,min_length INTEGER,max_length INTEGER,songs INTEGER,upper_score REAL);
      CREATE INDEX range_view_mode ON catalog_range(view,mode,start_group,upper_score DESC);
      CREATE INDEX range_view_start ON catalog_range(view,start_group,upper_score DESC);
      CREATE INDEX range_frequency ON catalog_range(view,songs DESC,(end-start+1) DESC,max_length DESC);
      CREATE INDEX range_mode_frequency ON catalog_range(view,mode,start_group,songs DESC,(end-start+1) DESC,max_length DESC);
      CREATE INDEX run_section ON catalog_run(section_id);
      CREATE TABLE catalog_token(token TEXT PRIMARY KEY,label TEXT,inversion_label TEXT);
      CREATE TABLE popularity(song_id TEXT PRIMARY KEY,score REAL,confidence REAL,provider_url TEXT,measured_at TEXT);
      CREATE TABLE catalog_array(name TEXT PRIMARY KEY,data BLOB);`);
    let sequenceCount = 0;
    transaction(db, () => {
      const meta = db.prepare('INSERT INTO metadata VALUES (?,?)');
      for (const [key, value] of Object.entries({ schema_version: CATALOG_VERSION, snapshot_id: snapshotId,
        normalization_version: index.normalizationVersion, popularity_version: 'unavailable' })) meta.run(key, value);
      const songStmt = db.prepare('INSERT INTO catalog_song VALUES (?,?,?,?)');
      for (const s of songs) songStmt.run(s.slug, s.title, s.artist, s.url ?? '');
      const sectionStmt = db.prepare('INSERT INTO catalog_section VALUES (?,?,?,?,?,?)');
      for (const row of source.prepare('SELECT id,song_id,revision,source,normalized FROM sections ORDER BY id').iterate()) {
        const section = JSON.parse(row.normalized);
        sectionStmt.run(row.id, row.song_id, row.revision, section.sectionName, gzipSync(Buffer.from(row.source)), stableJson(section.diagnostics));
      }
      const runStmt = db.prepare('INSERT INTO catalog_run VALUES (?,?,?,?,?,?,?,?,?,?)');
      const tokenStmt = db.prepare('INSERT OR IGNORE INTO catalog_token VALUES (?,?,?)');
      index.runs.forEach((r, i) => {
        runStmt.run(i, r.id, r.view, r.songId, r.sectionId, r.revision, gzipSync(Buffer.from(stableJson(r.tokens))), gzipSync(Buffer.from(stableJson(r.positions))), stableJson(r.key), stableJson(r.sourceKey ?? r.key));
        r.tokens.forEach((t, at) => tokenStmt.run(t, r.positions[at].degree, r.positions[at].roman));
      });
      const suffixStmt = db.prepare('INSERT INTO catalog_suffix VALUES (?,?,?,?,?)');
      const packed = Buffer.allocUnsafe(index.suffixArray.length * 8);
      index.suffixArray.forEach((pos, rank) => {
        const r = index.runAt[pos], offset = index.offsetAt[pos];
        const position=index.runs[r].positions[offset];
        suffixStmt.run(rank, r, offset, position.startIndex,position.endIndex); packed.writeInt32LE(r, rank * 8); packed.writeInt32LE(offset, rank * 8 + 4);
      });
      db.prepare('INSERT INTO catalog_array VALUES (?,?)').run('suffix_locations', packed);
      const rangeStmt = db.prepare('INSERT INTO catalog_range VALUES (?,?,?,?,?,?,?,?,?,?,?)');
      const rawRanges = catalogRanges(index);
      const rawSequenceCount = rawRanges.reduce((sum, r) => sum + r.maxLength - r.minLength + 1, 0);
      let id = 0;
      for (const r of reducedCatalogRanges(index, rawRanges)) {
        const view = index.runs[index.runAt[index.suffixArray[r.start]]].view;
        const source = index.runs[index.runAt[index.suffixArray[r.start]]];
        const sourceOffset = index.offsetAt[index.suffixArray[r.start]];
        const firstLabel = source.positions[sourceOffset].degree;
        const startGroup = startingRomanGroup(firstLabel, JSON.parse(source.tokens[sourceOffset]));
        if (!startGroup) throw Error(`Cannot group starting Roman numeral: ${firstLabel}`);
        const mode = source.sourceKey?.scale ?? source.key.scale;
        rangeStmt.run(id++, view, mode, startGroup.id, startGroup.label, r.start, r.end, r.minLength, r.maxLength, r.songCount, baseScore(r.maxLength, r.songCount, Math.min(r.end - r.start + 1, 4 * r.songCount)));
        sequenceCount += r.maxLength - r.minLength + 1;
      }
      meta.run('raw_sequence_count', String(rawSequenceCount));
      meta.run('sequence_reduction_version', LOOP_REDUCTION_VERSION);
      meta.run('sequence_count', String(sequenceCount));
    });
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw Error('Catalog integrity failure');
    return { sequenceCount, byteSize: fs.statSync(file).size };
  } finally { source.close(); db.close(); }
}

export async function buildCatalog({ normalizedFile, catalog, output }) {
  const started = performance.now(), normalized = readNormalizedCache(normalizedFile);
  const songs = catalogSongs(catalog);
  const snapshotId = hash({ catalog: CATALOG_VERSION, normalizer: NORMALIZER_VERSION, source: hashFile(normalizedFile), songs,
    code: ['catalog-export.mjs','catalog.mjs','miner.mjs','loop-reduction.mjs'].map(name => hashFile(new URL(name, import.meta.url))) });
  fs.mkdirSync(output, { recursive: true });
  const destination = path.join(output, snapshotId + '.db');
  if (fs.existsSync(destination)) return { snapshotId, destination, reused: true };
  const index = discoverPatterns(normalized.runs, { normalizationVersion: NORMALIZER_VERSION });
  const stage = destination + '.' + process.pid + '.tmp';
  const result = exportCatalog({ file: stage, index, songs, normalizedFile, snapshotId });
  const checksum = hashFile(stage); fs.renameSync(stage, destination);
  const manifest = { snapshotId, file: path.basename(destination), checksum, ...result, elapsedMs: Math.round(performance.now() - started) };
  fs.writeFileSync(destination + '.json', stableJson(manifest));
  fs.writeFileSync(path.join(output, 'latest.json.tmp'), stableJson(manifest));
  fs.renameSync(path.join(output, 'latest.json.tmp'), path.join(output, 'latest.json'));
  return manifest;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const [normalizedFile, catalog, output] = process.argv.slice(2);
  if (!normalizedFile || !catalog || !output) throw Error('Usage: node --max-old-space-size=8192 catalog-export.mjs <normalized.db> <song-catalog.db> <output-directory>');
  console.log(JSON.stringify(await buildCatalog({ normalizedFile, catalog, output })));
}
