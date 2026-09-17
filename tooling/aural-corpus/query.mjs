import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { MINER_VERSION, getPattern, hydrateIndex } from './miner.mjs';
import { hash, NORMALIZER_VERSION } from './common.mjs';
import { normalizeChord, strictKey } from './normalize.mjs';

const VIEWS = new Set(['harmony', 'harmony_bass']);
const BINARY_FIELDS = ['suffixArray', 'runAt', 'offsetAt', 'runStarts', 'lcp'];
const text = value => typeof value === 'string' ? value : Buffer.from(value).toString('utf8');
const parse = (value, label) => {
  try { return JSON.parse(text(value)); } catch { throw new Error(`Invalid JSON in analysis ${label}`); }
};

/**
 * Offline inspection API: reads saved suffix arrays and normalized runs, never re-mines.
 * Hydrates all runs/arrays, including the miner's rolling-hash helpers; memory is O(index size).
 * Reuse the returned index for multiple lookups. Android uses runtime.db's indexed tables instead.
 */
export function loadAnalysisIndex(file) {
  const db = new DatabaseSync(path.resolve(file), { readOnly: true });
  try {
    const snapshots = db.prepare('SELECT id,report FROM analysis_snapshot LIMIT 2').all();
    if (snapshots.length !== 1) throw new Error('Analysis must contain exactly one snapshot');
    const snapshotId = snapshots[0].id, report = parse(snapshots[0].report, 'report');
    if (report.snapshotId !== snapshotId || report.buildVersion !== 'aural-build-1' || report.normalizerVersion !== NORMALIZER_VERSION) throw new Error('Unsupported or inconsistent analysis snapshot versions');
    const values = new Map(db.prepare('SELECT key,value FROM compact_index').all().map(row => [row.key, row.value]));
    const required = [...BINARY_FIELDS, 'metadata', 'tokenDictionary', 'intervals'];
    for (const field of required) if (!values.has(field)) throw new Error(`Analysis missing compact ${field}`);
    const metadata = parse(values.get('metadata'), 'metadata');
    if (metadata.version !== MINER_VERSION || metadata.normalizationVersion !== NORMALIZER_VERSION || metadata.minSongs !== report.config?.minSongs || !Number.isInteger(metadata.minSongs) || metadata.minSongs < 2) throw new Error('Unsupported or inconsistent compact index metadata');
    const arrays = {};
    for (const field of BINARY_FIELDS) {
      const value = values.get(field);
      if (!(value instanceof Uint8Array) || value.byteLength % 4) throw new Error(`Invalid little-endian array: ${field}`);
      const buffer = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
      const result = new Int32Array(buffer.length / 4);
      for (let index = 0; index < result.length; index++) result[index] = buffer.readInt32LE(index * 4);
      arrays[field] = result;
    }
    const runs = db.prepare('SELECT id,run_index,view,song_id,section_id,revision,tokens,positions,transition_ids FROM run ORDER BY run_index').all().map((row, index) => {
      if (row.run_index !== index) throw new Error('Analysis run indexes must be contiguous');
      const run = { id: row.id, view: row.view, songId: row.song_id, sectionId: row.section_id, revision: row.revision,
        tokens: parse(row.tokens, 'run tokens'), positions: parse(row.positions, 'run positions'), transitionIds: parse(row.transition_ids, 'transition IDs') };
      if (!VIEWS.has(run.view) || !Array.isArray(run.tokens) || !run.tokens.every(token => typeof token === 'string' && token.length) ||
          !Array.isArray(run.positions) || run.positions.length !== run.tokens.length || !Array.isArray(run.transitionIds) || run.transitionIds.length !== Math.max(0, run.tokens.length - 1)) throw new Error('Malformed normalized analysis run');
      for (const position of run.positions) if (!Number.isInteger(position.startIndex) || !Number.isInteger(position.endIndex) || position.startIndex < 0 || position.endIndex < position.startIndex || !Number.isFinite(position.startBeat) || !Number.isFinite(position.endBeat) || position.endBeat <= position.startBeat) throw new Error('Malformed original event position');
      return run;
    });
    validateArrays(arrays, runs);
    const dictionary = parse(values.get('tokenDictionary'), 'token dictionary');
    const intervals = parse(values.get('intervals'), 'intervals');
    if (!Array.isArray(dictionary) || !dictionary.every(token => typeof token === 'string') || new Set(dictionary).size !== dictionary.length || !Array.isArray(intervals)) throw new Error('Malformed compact dictionary or intervals');
    const knownTokens = new Set(dictionary);
    if (runs.some(run => run.tokens.some(token => !knownTokens.has(token)))) throw new Error('Run contains token absent from dictionary');
    const candidates = db.prepare('SELECT descriptor FROM progression_pattern ORDER BY id').all().map(row => parse(row.descriptor, 'pattern descriptor'));
    const index = hydrateIndex({ ...metadata, ...arrays, runs, tokenDictionary: dictionary, intervals, candidates });
    return Object.assign(index, { snapshotId, report, analysisFile: path.resolve(file) });
  } finally { db.close(); }
}

function validateArrays(arrays, runs) {
  const { suffixArray, runAt, offsetAt, runStarts, lcp } = arrays;
  const tokenCount = runs.reduce((sum, run) => sum + run.tokens.length, 0);
  if (suffixArray.length !== tokenCount || lcp.length !== tokenCount || runAt.length !== tokenCount + runs.length || offsetAt.length !== runAt.length || runStarts.length !== runs.length) throw new Error('Inconsistent compact array lengths');
  let nextStart = 0;
  for (let runIndex = 0; runIndex < runs.length; runIndex++) {
    if (runStarts[runIndex] !== nextStart) throw new Error('Invalid run start offset');
    for (let offset = 0; offset < runs[runIndex].tokens.length; offset++, nextStart++) if (runAt[nextStart] !== runIndex || offsetAt[nextStart] !== offset) throw new Error('Invalid suffix location mapping');
    if (runAt[nextStart] !== -1 || offsetAt[nextStart] !== -1) throw new Error('Missing run boundary delimiter');
    nextStart++;
  }
  const seen = new Uint8Array(runAt.length);
  for (let rank = 0; rank < suffixArray.length; rank++) {
    const at = suffixArray[rank];
    if (at < 0 || at >= runAt.length || runAt[at] < 0 || seen[at]) throw new Error('Invalid or duplicate suffix position');
    seen[at] = 1;
    const remaining = runs[runAt[at]].tokens.length - offsetAt[at];
    if (lcp[rank] < 0 || lcp[rank] > remaining || rank === 0 && lcp[rank] !== 0) throw new Error('Invalid LCP bounds');
  }
}

export function lookupOccurrences({ file, index: loaded, view, tokens, offset = 0, limit = 100 }) {
  if (!VIEWS.has(view)) throw new Error('view must be harmony or harmony_bass');
  if (!Array.isArray(tokens) || tokens.length < 2 || !tokens.every(token => typeof token === 'string' && token.length)) throw new Error('tokens must contain at least two normalized chord tokens');
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 10000) throw new Error('offset must be nonnegative and limit must be 1..10000');
  const index = loaded ?? loadAnalysisIndex(file);
  if (index.version !== MINER_VERSION || index.normalizationVersion !== NORMALIZER_VERSION) throw new Error('Unsupported loaded index version');
  const pattern = getPattern(index, { view, tokens });
  const result = { snapshotId: index.snapshotId, pattern: pattern ? { id: pattern.id, view: pattern.view, length: pattern.length, occurrenceCount: pattern.occurrenceCount, songCount: pattern.songCount } : null,
    offset, limit, nextOffset: null, order: 'suffix-rank', occurrences: [] };
  if (!pattern) return result;
  const end = Math.min(pattern.occurrenceCount, offset + limit);
  for (let ordinal = offset; ordinal < end; ordinal++) {
    const suffixRank = pattern.intervalStart + ordinal, position = index.suffixArray[suffixRank];
    const run = index.runs[index.runAt[position]], start = index.offsetAt[position], finish = start + pattern.length - 1;
    const first = run.positions[start], last = run.positions[finish];
    result.occurrences.push({
      occurrenceId: hash(['occurrence', pattern.id, run.sectionId, first.startIndex, last.endIndex]),
      sourceId: `${run.songId}|${run.sectionId}|${first.startIndex}|${last.endIndex}`,
      patternId: pattern.id, runId: run.id, view, songId: run.songId, sectionId: run.sectionId, sourceRevision: run.revision,
      start, end: finish, suffixRank, startIndex: first.startIndex, endIndex: last.endIndex,
      startBeat: first.startBeat, endBeat: last.endBeat, positions: run.positions.slice(start, finish + 1),
      transitionIds: run.transitionIds.slice(start, finish),
    });
  }
  if (end < pattern.occurrenceCount) result.nextOffset = end;
  return result;
}

export function runQueryCli(argv) {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) return { help: 'node tooling/aural-corpus/query.mjs --analysis <analysis.db> --view harmony|harmony_bass --chords <JSON chord array> --key <JSON tonic/scale> [--offset 0] [--limit 100]\nOffline lookup hydrates saved arrays and runs in memory; it does not mine or modify the database.\n' };
  const options = {}, allowed = new Set(['analysis', 'view', 'chords', 'key', 'offset', 'limit']);
  for (let position = 0; position < argv.length; position += 2) {
    const key = argv[position]?.slice(2), value = argv[position + 1];
    if (!argv[position]?.startsWith('--') || !allowed.has(key) || value == null || Object.hasOwn(options, key)) throw new Error(`Invalid query option: ${argv[position]}`);
    options[key] = value;
  }
  for (const key of ['analysis', 'view', 'chords', 'key']) if (!options[key]) throw new Error(`Missing --${key}`);
  if (!VIEWS.has(options.view)) throw new Error('view must be harmony or harmony_bass');
  const chords = parse(options.chords, 'query chords'), key = strictKey(parse(options.key, 'query key'));
  if (!Array.isArray(chords) || chords.length < 2) throw new Error('Query chords must contain at least two chords');
  const tokens = chords.map(chord => normalizeChord(chord, key).tokens[options.view]);
  return lookupOccurrences({ file: options.analysis, view: options.view, tokens, offset: options.offset === undefined ? 0 : Number(options.offset), limit: options.limit === undefined ? 100 : Number(options.limit) });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result = runQueryCli(process.argv.slice(2)); process.stdout.write(result.help ?? `${JSON.stringify(result)}\n`); }
  catch (error) { process.stderr.write(`Analysis query failed: ${error.message}\n`); process.exitCode = 1; }
}
