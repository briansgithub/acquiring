import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hash, openDatabase, stableJson, transaction, NORMALIZER_VERSION } from './common.mjs';
import { normalizeChord } from './normalize.mjs';

const contractRoot = new URL('../../contracts/aural-corpus/', import.meta.url);
export const familyMapping = JSON.parse(fs.readFileSync(new URL('families.json', contractRoot), 'utf8'));
const functionLabel = degree => ({ I: 'home', ii: 'preparation', IV: 'preparation', V: 'tension', vi: 'relative', 'V/V': 'applied tension' }[degree] || 'harmony');
const simpleToken = token => {
  const t = JSON.parse(token);
  return t.mode === 'major' && t.type === 5 && !t.borrowed &&
    ['adds', 'omits', 'alterations', 'suspensions', 'substitutions'].every(k => !t[k]?.length) &&
    ['useMaj7', 'halfDim', 'dimTriad', 'appliedDenomMaj', 'flattenHalfDimB5'].every(k => !t[k]);
};

/** Runtime bindings are explicitly separate from discovery and never broaden musical matches. */
export function* curriculumOccurrences(runs, index, getPattern, onPattern = () => {}) {
  const bindings = familyMapping.families.flatMap(f => Object.entries(f.variants).map(([variantId, degrees]) => ({ familyId: f.id, variantId, degrees })));
  const simple = new Map();
  const patterns = new Map();
  for (const run of runs) {
    if (run.key?.scale !== 'major') continue;
    const eligible = run.tokens.map(t => { if (!simple.has(t)) simple.set(t, simpleToken(t)); return simple.get(t); });
    for (const binding of bindings) for (let start = 0; start + binding.degrees.length <= run.tokens.length; start++) {
      const end = start + binding.degrees.length - 1;
      const positions = run.positions.slice(start, end + 1);
      if (positions.some((p, i) => p.degree !== binding.degrees[i] || p.varyingBass || !eligible[start + i])) continue;
      const tokens = run.tokens.slice(start, end + 1), lookup = stableJson([run.view, tokens]);
      if (!patterns.has(lookup)) patterns.set(lookup, getPattern(index, { view: run.view, tokens }));
      const pattern = patterns.get(lookup);
      if (!pattern) continue;
      onPattern(pattern, binding, run);
      const first = positions[0], last = positions.at(-1);
      const occurrenceId = hash(['occurrence', pattern.id, run.sectionId, first.startIndex, last.endIndex]);
      const sourceId = `${run.songId}|${run.sectionId}|${first.startIndex}|${last.endIndex}`;
      const events = positions.map(p => ({ notes: p.notes, rootMidi: p.rootMidi, bassMidi: p.bassMidi, degree: p.degree,
        functionLabel: functionLabel(p.degree), beats: p.endBeat - p.startBeat }));
      const tonic = normalizeChord({ root: 1 }, run.key);
      yield { occurrenceId, sourceId, patternId: pattern.id, songId: run.songId, sectionId: run.sectionId, sourceRevision: run.revision,
        startIndex: first.startIndex, endIndex: last.endIndex, view: run.view, familyId: binding.familyId, variantId: binding.variantId,
        keyTonic: run.key.tonic, keyScale: run.key.scale, tempo: 80, events, degreeLabels: binding.degrees,
        context: [{ notes: tonic.notes, rootMidi: tonic.rootMidi, bassMidi: tonic.bassMidi, degree: 'I', functionLabel: 'home', beats: 2 }],
        contextSource: 'synthetic-tonic-reference', transformations: { timing: 'source-beats', reference: 'synthetic-tonic', repeatedIdenticalAttacks: 'sustained' } };
    }
  }
}

export function exportRuntime({ file, runs, sections, songs, index, getPattern, snapshotId, popularity = [] }) {
  const db = openDatabase(file), songMap = new Map(songs.map(s => [s.slug, s]));
  const sectionMap = new Map(sections.map(s => [s.id, s]));
  const popMap = new Map(popularity.map(s => [s.songId, s]));
  let occurrenceCount = 0;
  const familyGroups = new Map();
  const collect = (pattern, binding, run) => {
    const key = `${binding.familyId}:${run.view}`;
    if (!familyGroups.has(key)) familyGroups.set(key, { familyId: binding.familyId, view: run.view, patterns: new Map(), songs: new Set(), occurrenceCount: 0 });
    const group = familyGroups.get(key);
    group.patterns.set(pattern.id, pattern); group.songs.add(run.songId); group.occurrenceCount++;
  };
  try {
    db.exec(fs.readFileSync(new URL('schema.sql', contractRoot), 'utf8'));
    transaction(db, () => {
      const meta = db.prepare('INSERT INTO metadata VALUES (?,?)');
      for (const [k, v] of Object.entries({ schema_version: '1', snapshot_id: snapshotId, family_mapping_version: familyMapping.version,
        normalization_version: NORMALIZER_VERSION, popularity_version: popularity.length ? hash(popularity) : 'unavailable' })) meta.run(k, v);
      const songStmt = db.prepare('INSERT OR IGNORE INTO quiz_song VALUES (?,?,?,?,?)');
      const sectionStmt = db.prepare('INSERT OR IGNORE INTO quiz_section VALUES (?,?,NULL,0)');
      const occurrenceStmt = db.prepare('INSERT OR IGNORE INTO quiz_occurrence VALUES (?,?,?,?,?,?,?,?,?)');
      for (const occurrence of curriculumOccurrences(runs, index, getPattern, collect)) {
        const song = songMap.get(occurrence.songId), section = sectionMap.get(occurrence.sectionId), popularity = popMap.get(occurrence.songId);
        songStmt.run(occurrence.songId, song?.title || '', song?.artist || '', popularity?.score ?? null, popularity?.confidence ?? 0);
        sectionStmt.run(occurrence.sectionId, occurrence.songId);
        const payload = { ...occurrence, title: song?.title || '', artist: song?.artist || '', sectionName: section?.sectionName || '' };
        const result = occurrenceStmt.run(occurrence.occurrenceId, occurrence.sourceId, occurrence.patternId, occurrence.songId, occurrence.sectionId,
          occurrence.view, occurrence.familyId, occurrence.variantId, stableJson(payload));
        occurrenceCount += Number(result.changes);
      }
    });
    const songsCount = db.prepare('SELECT count(*) AS n FROM quiz_song').get().n;
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw Error('Runtime database integrity failed');
    return { occurrenceCount, songCount: songsCount, byteSize: fs.statSync(file).size,
      familyGroups: [...familyGroups.values()].map(g => ({ ...g, patterns: [...g.patterns.values()], distinctSongs: g.songs.size, songs: undefined })) };
  } finally { db.close(); }
}

export function exportAnalysis({ file, index, runs, sections, selected, snapshotId, report, occurrences }) {
  const db = openDatabase(file);
  try {
    db.exec(`CREATE TABLE analysis_snapshot(id TEXT PRIMARY KEY,report TEXT NOT NULL);
      CREATE TABLE section(id TEXT PRIMARY KEY,song_id TEXT,revision TEXT,name TEXT);
      CREATE TABLE run(id TEXT PRIMARY KEY,run_index INTEGER UNIQUE,view TEXT,song_id TEXT,section_id TEXT,revision TEXT,tokens TEXT,positions TEXT,transition_ids TEXT);
      CREATE TABLE suffix(rank INTEGER PRIMARY KEY,run_index INTEGER,offset INTEGER,lcp INTEGER);
      CREATE TABLE progression_pattern(id TEXT PRIMARY KEY,view TEXT,length INTEGER,song_count INTEGER,occurrence_count INTEGER,descriptor TEXT);
      CREATE TABLE progression_stats(pattern_id TEXT PRIMARY KEY,stats TEXT);
      CREATE TABLE progression_occurrence(pattern_id TEXT,run_id TEXT,start INTEGER,end INTEGER,PRIMARY KEY(pattern_id,run_id,start,end));
      CREATE INDEX occurrence_lookup ON progression_occurrence(pattern_id,run_id);
      CREATE TABLE compact_index(key TEXT PRIMARY KEY,value BLOB);`);
    transaction(db, () => {
      db.prepare('INSERT INTO analysis_snapshot VALUES (?,?)').run(snapshotId, stableJson(report));
      const sectionStmt = db.prepare('INSERT INTO section VALUES (?,?,?,?)');
      for (const s of sections) sectionStmt.run(s.id, s.songId, s.revision, s.sectionName || '');
      const runStmt = db.prepare('INSERT INTO run VALUES (?,?,?,?,?,?,?,?,?)');
      for (const [i, r] of index.runs.entries()) runStmt.run(r.id, i, r.view, r.songId, r.sectionId, r.revision, stableJson(r.tokens), stableJson(r.positions), stableJson(r.transitionIds));
      const patternStmt = db.prepare('INSERT OR IGNORE INTO progression_pattern VALUES (?,?,?,?,?,?)');
      for (const p of index.candidates) patternStmt.run(p.id, p.view, p.length, p.songCount, p.occurrenceCount, stableJson(p));
      const statsStmt = db.prepare('INSERT INTO progression_stats VALUES (?,?)');
      const occStmt = db.prepare('INSERT OR IGNORE INTO progression_occurrence VALUES (?,?,?,?)');
      const descriptors = new Map(index.candidates.map(p => [p.id, p]));
      for (const p of selected) {
        const descriptor = descriptors.get(p.id || p.patternId);
        if (!descriptor) continue;
        statsStmt.run(descriptor.id, stableJson(p));
        for (const o of occurrences(index, descriptor)) occStmt.run(descriptor.id, o.runId, o.start, o.end);
      }
      const compactStmt = db.prepare('INSERT INTO compact_index VALUES (?,?)');
      compactStmt.run('metadata', stableJson({ version: index.version, normalizationVersion: index.normalizationVersion, minSongs: index.minSongs }));
      // Store little-endian integer arrays explicitly; Swift/Kotlin can decode the same format.
      for (const field of ['suffixArray','runAt','offsetAt','runStarts','lcp']) if (index[field]) {
        const data = index[field], buffer = Buffer.allocUnsafe(data.length * 4);
        for (let i = 0; i < data.length; i++) buffer.writeInt32LE(data[i], i * 4);
        compactStmt.run(field, buffer);
      }
      for (const field of ['tokenDictionary','intervals']) if (index[field]) compactStmt.run(field, stableJson(index[field]));
    });
    return { byteSize: fs.statSync(file).size };
  } finally { db.close(); }
}
