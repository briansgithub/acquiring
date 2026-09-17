import fs from 'node:fs';
import path from 'node:path';
import { openDatabase, transaction, stableJson, hash, moduleFingerprint, NORMALIZER_VERSION } from './common.mjs';
import { normalizeSection, sectionIdentity, sectionRevision } from './normalize.mjs';

const urlKey = value => String(value || '').trim().replace(/\/+$/, '');
export function catalogSongs(file) {
  const db = openDatabase(file, true);
  try { return db.prepare('SELECT slug,artist,title,url FROM songs ORDER BY slug').all(); }
  finally { db.close(); }
}

/** Scan source files, but rerun musical interpretation only for changed sections. */
export function updateNormalizedCache({ catalog, cacheRoot, normalizedFile, limit = 0, log = () => {} }) {
  if (path.resolve(catalog).toLowerCase() === path.resolve(normalizedFile).toLowerCase()) throw Error('Normalized cache must not overwrite the source catalog');
  const cacheVersion = `${NORMALIZER_VERSION}:${moduleFingerprint(new URL('./normalize.mjs', import.meta.url))}`;
  const songs = catalogSongs(catalog);
  const byUrl = new Map(songs.map(s => [urlKey(s.url), s]));
  const byId = new Map(songs.map(s => [s.slug, s]));
  fs.mkdirSync(path.dirname(normalizedFile), { recursive: true });
  const db = openDatabase(normalizedFile);
  // This is a rebuildable cache. WAL avoids a durable disk flush for every song;
  // an interrupted run is safely rescanned and never publishes a snapshot.
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;');
  db.exec(`CREATE TABLE IF NOT EXISTS sections (id TEXT PRIMARY KEY, revision TEXT NOT NULL, version TEXT NOT NULL, song_id TEXT NOT NULL, normalized TEXT NOT NULL, source TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cache_metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
  const cacheScope = stableJson({ cacheRoot: path.resolve(cacheRoot), catalog: path.resolve(catalog), limit });
  const oldScope = db.prepare("SELECT value FROM cache_metadata WHERE key='scope'").get()?.value;
  if (oldScope && oldScope !== cacheScope) { db.close(); throw Error('Cache scope changed; use a separate normalized file for partial/different sources'); }
  db.prepare("INSERT OR REPLACE INTO cache_metadata VALUES ('scope',?)").run(cacheScope);
  const get = db.prepare('SELECT revision,version FROM sections WHERE id=?');
  const put = db.prepare('INSERT OR REPLACE INTO sections VALUES (?,?,?,?,?,?)');
  const seen = new Map(), conflicts = new Set(), diagnostics = [];
  const stats = { scannedSongs: 0, files: 0, normalized: 0, reused: 0, deleted: 0, aliases: 0, conflicts: 0 };
  let folders = fs.readdirSync(cacheRoot, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
  if (limit) folders = folders.slice(0, limit);
  try {
    for (const folder of folders) {
      const dir = path.join(cacheRoot, folder), metadataFile = path.join(dir, '_metadata.json');
      let meta;
      try { meta = JSON.parse(fs.readFileSync(metadataFile, 'utf8')); }
      catch { diagnostics.push({ folder, reason: 'missing-or-invalid-song-metadata' }); continue; }
      const song = byUrl.get(urlKey(meta.url)) || byId.get(meta.slug);
      if (!song) { diagnostics.push({ folder, reason: 'unresolved-song-identity' }); continue; }
      stats.scannedSongs++;
      transaction(db, () => {
        for (const filename of fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== '_metadata.json').sort()) {
          stats.files++;
          const sourceName = `${folder}/${filename}`;
          let parsedId;
          try {
            const section = JSON.parse(fs.readFileSync(path.join(dir, filename), 'utf8'));
            const id = sectionIdentity(song.slug, section, sourceName), revision = sectionRevision(section);
            parsedId = id;
            if (seen.has(id)) {
              if (seen.get(id) === revision) stats.aliases++;
              else { conflicts.add(id); stats.conflicts++; diagnostics.push({ sourceName, reason: 'conflicting-section-revisions', sectionId: id }); }
              continue;
            }
            seen.set(id, revision);
            const existing = get.get(id);
            if (existing?.revision === revision && existing.version === cacheVersion) { stats.reused++; continue; }
            const normalized = normalizeSection({ songId: song.slug, section, sourceName });
            // Store original chords/key/timing, not unrelated melody or network credentials.
            const source = { songId: song.slug, title: song.title, artist: song.artist, sectionId: id, sectionName: section.sectionName,
              sourceName, revision, chords: section.chords, metadata: section.metadata };
            put.run(id, revision, cacheVersion, song.slug, stableJson(normalized), stableJson(source));
            stats.normalized++;
          } catch (error) {
            if (parsedId) conflicts.add(parsedId);
            diagnostics.push({ sourceName, reason: 'invalid-section', detail: error.message });
          }
        }
      });
      if (stats.scannedSongs % 1000 === 0) log({ stage: 'normalize', ...stats });
    }
    transaction(db, () => {
      const remove = db.prepare('DELETE FROM sections WHERE id=?');
      for (const { id } of db.prepare('SELECT id FROM sections').all()) if (!seen.has(id) || conflicts.has(id)) { remove.run(id); stats.deleted++; }
    });
    const manifest = [...seen].filter(([id]) => !conflicts.has(id)).sort(([a], [b]) => a < b ? -1 : 1);
    return { songs, stats, diagnostics, sourceHash: hash(manifest), normalizationFingerprint: cacheVersion, normalizedFile, scope: limit ? { limitFolders: limit } : { full: true } };
  } finally { db.close(); }
}

export function readNormalizedCache(file) {
  const db = openDatabase(file, true);
  const runs = [], sections = [], denominators = {}, diagnosticCounts = {};
  try {
    for (const row of db.prepare('SELECT id,song_id,revision,normalized FROM sections ORDER BY id').iterate()) {
      const section = JSON.parse(row.normalized);
      runs.push(...section.runs);
      sections.push({ id: row.id, songId: row.song_id, revision: row.revision, sectionName: section.sectionName });
      for (const d of section.diagnostics) diagnosticCounts[d.reason] = (diagnosticCounts[d.reason] || 0) + 1;
      for (const [view, counts] of Object.entries(section.denominators)) {
        denominators[view] ||= { observedTransitions: 0, eligibleTransitions: 0, uncertainTransitions: 0 };
        for (const [key, value] of Object.entries(counts)) denominators[view][key] += value;
      }
    }
    return { runs, sections, denominators, diagnosticCounts };
  } finally { db.close(); }
}
