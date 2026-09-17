import { createHash, randomBytes } from 'node:crypto';
import { existsSync, linkSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import {
  POPULARITY_VERSION, buildPopularitySnapshot, createPopularityPilot,
  exportPopularityWeights, reportPopularityPilot,
} from './popularity.mjs';

const canonical = value => value && typeof value === 'object' ? Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const json = file => JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));

export const HELP = `Offline popularity enrichment (Node 24+)
  node tooling/aural-corpus/popularity-cli.mjs pilot --catalog <SQLite> --output <pilot.json> [--limit 500] [--seed text]
  node tooling/aural-corpus/popularity-cli.mjs import --input <provider.json> --catalog <SQLite> --as-of <ISO timestamp> --output <snapshot.json> [--weights-output <weights.json>] [--max-age-days 180]
  node tooling/aural-corpus/popularity-cli.mjs report --pilot <pilot.json> --snapshot <snapshot.json> --output <report.json> [--audit <audit.json>]

Inputs are read-only. Outputs must not exist. No network requests are made.
Import writes a full auditable snapshot usable by the corpus build; optional weights output is compact.
Audit JSON: { audits: [{songId,correct}], elapsedSeconds?, apiRequests?, costPerRequest?, currency? }.
`;

/** Works with the production songs contract and the richer source catalog without reading blobs. */
export function readPopularityCatalog(file) {
  const db = new DatabaseSync(path.resolve(file), { readOnly: true });
  try {
    const columns = new Set(db.prepare('PRAGMA table_info(songs)').all().map(row => row.name));
    if (!columns.has('slug')) throw new Error('catalog requires songs.slug');
    const optional = (names, alias) => {
      const column = names.find(name => columns.has(name));
      return column ? `"${column}" AS "${alias}"` : `NULL AS "${alias}"`;
    };
    const sql = `SELECT slug AS id, ${optional(['artist'], 'artist')}, ${optional(['title'], 'title')}, ${optional(['genre'], 'genre')}, ${optional(['year', 'release_year', 'releaseYear'], 'year')} FROM songs ORDER BY slug`;
    return db.prepare(sql).all().map(row => ({
      id: row.id, artist: row.artist, title: row.title,
      genre: typeof row.genre === 'string' ? row.genre : null,
      year: Number.isInteger(row.year) ? row.year : null,
    }));
  } finally { db.close(); }
}

/** Atomic no-replace publish on the output filesystem. Existing artifacts are never overwritten. */
function publish(file, value) {
  const destination = path.resolve(file);
  mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    linkSync(temporary, destination);
  } finally { if (existsSync(temporary)) unlinkSync(temporary); }
}

function assertOutputPaths(outputFiles, inputFiles) {
  const seen = new Set(inputFiles.map(file => path.resolve(file).toLowerCase()));
  for (const output of outputFiles) {
    const resolved = path.resolve(output);
    if (seen.has(resolved.toLowerCase()) || existsSync(resolved)) throw new Error(`output must be a new artifact: ${resolved}`);
    seen.add(resolved.toLowerCase());
  }
}

function compactArtifact(snapshot) {
  const weights = exportPopularityWeights(snapshot);
  const body = {
    version: POPULARITY_VERSION, snapshotId: weights.snapshotId, songs: weights.songs,
    provenance: snapshot.manifest,
  };
  return { ...body, artifactHash: digest(body) };
}

/** Validate both CLI export forms before consuming weights in the production corpus build. */
export function validatePopularityArtifact(artifact) {
  if (artifact?.version !== POPULARITY_VERSION || !/^pop-[a-f0-9]{64}$/.test(artifact.snapshotId ?? '')) throw new Error('unsupported or invalid popularity artifact identity');
  const manifest = artifact.manifest ?? artifact.provenance;
  if (manifest?.scoringVersion !== POPULARITY_VERSION || manifest?.rights?.allowDerivedRedistribution !== true || typeof manifest.rights.basis !== 'string' || !manifest.rights.basis.trim()) throw new Error('popularity artifact lacks supported scoring provenance or redistribution rights');
  if (artifact.manifest) {
    const { snapshotId, version, ...body } = artifact;
    if (snapshotId !== `pop-${digest(body)}`) throw new Error('popularity snapshot hash mismatch');
    if (!manifest.rights.allowRawStorage && Object.hasOwn(body, 'rawMeasurements')) throw new Error('snapshot contains raw data without storage rights');
  } else {
    const { artifactHash, ...body } = artifact;
    if (artifactHash !== digest(body)) throw new Error('popularity weights hash mismatch');
  }
  if (!Array.isArray(artifact.songs)) throw new Error('popularity artifact songs must be an array');
  const seen = new Set();
  for (const song of artifact.songs) {
    if (typeof song.songId !== 'string' || !song.songId.trim() || seen.has(song.songId)) throw new Error('popularity artifact song IDs must be unique');
    seen.add(song.songId);
    if (song.score !== null && (!Number.isFinite(song.score) || song.score < 0 || song.score > 1)) throw new Error('popularity score must be null or in [0, 1]');
    if (!Number.isFinite(song.confidence) || song.confidence < 0 || song.confidence > 1 || (song.score === null && song.confidence !== 0)) throw new Error('invalid popularity confidence');
  }
  return artifact;
}

export function loadPopularityArtifact(file) { return validatePopularityArtifact(json(file)); }

function argumentsFor(argv) {
  const [command, ...tail] = argv;
  if (command === '--help' || command === '-h' || command === 'help') return { command: 'help', options: {} };
  const allowed = {
    pilot: ['catalog', 'output', 'limit', 'seed'],
    import: ['input', 'catalog', 'as-of', 'output', 'weights-output', 'max-age-days'],
    report: ['pilot', 'snapshot', 'audit', 'output'],
  };
  if (!allowed[command]) throw new Error('expected pilot, import, or report command; use --help');
  const options = {};
  for (let index = 0; index < tail.length; index += 2) {
    const flag = tail[index]; const value = tail[index + 1];
    if (!flag.startsWith('--') || !allowed[command].includes(flag.slice(2)) || !value || value.startsWith('--') || Object.hasOwn(options, flag.slice(2))) throw new Error(`invalid or repeated argument: ${flag}`);
    options[flag.slice(2)] = value;
  }
  const required = { pilot: ['catalog', 'output'], import: ['input', 'catalog', 'as-of', 'output'], report: ['pilot', 'snapshot', 'output'] };
  for (const key of required[command]) if (!options[key]) throw new Error(`missing --${key}`);
  return { command, options };
}

export function runPopularityCli(argv) {
  const { command, options } = argumentsFor(argv);
  if (command === 'help') return { help: HELP };
  if (command === 'pilot') {
    assertOutputPaths([options.output], [options.catalog]);
    const catalog = readPopularityCatalog(options.catalog);
    const pilot = createPopularityPilot(catalog, { limit: options.limit === undefined ? 500 : Number(options.limit), seed: options.seed });
    publish(options.output, pilot);
    return { command, output: path.resolve(options.output), sampleSize: pilot.selected.length, corpusCount: catalog.length };
  }
  if (command === 'import') {
    const outputs = [options.output, options['weights-output']].filter(Boolean);
    assertOutputPaths(outputs, [options.input, options.catalog]);
    const catalog = readPopularityCatalog(options.catalog);
    const snapshot = buildPopularitySnapshot(json(options.input), {
      songIds: catalog.map(song => song.id), asOf: options['as-of'], maxAgeDays: options['max-age-days'] === undefined ? 180 : Number(options['max-age-days']),
    });
    // This command prepares app-consumable artifacts, so derived-score rights are required.
    const compact = compactArtifact(snapshot);
    const artifact = { version: POPULARITY_VERSION, ...snapshot };
    validatePopularityArtifact(artifact); validatePopularityArtifact(compact);
    publish(options.output, artifact);
    if (options['weights-output']) publish(options['weights-output'], compact);
    return { command, output: path.resolve(options.output), snapshotId: snapshot.snapshotId, corpusCount: catalog.length, rankedSongs: snapshot.songs.filter(song => song.score != null).length, weightsOutput: options['weights-output'] ? path.resolve(options['weights-output']) : null };
  }
  assertOutputPaths([options.output], [options.pilot, options.snapshot, options.audit].filter(Boolean));
  const pilot = json(options.pilot);
  if (pilot?.pilotVersion !== 'aural-popularity-pilot-1' || !Array.isArray(pilot.selected) || !Array.isArray(pilot.strata)) throw new Error('unsupported or invalid pilot manifest');
  const snapshot = loadPopularityArtifact(options.snapshot);
  if (!snapshot.manifest || !snapshot.songs.every(song => Array.isArray(song.matches))) throw new Error('report requires the full snapshot, not compact weights');
  if (pilot.corpusIdentityHash !== snapshot.manifest.referencePopulationHash || pilot.corpusCount !== snapshot.songs.length) throw new Error('pilot and snapshot must reference the same catalog population');
  const population = new Set(snapshot.songs.map(song => song.songId));
  const selected = new Set(pilot.selected.map(song => song.id));
  if (selected.size !== pilot.selected.length || [...selected].some(songId => !population.has(songId))) throw new Error('pilot selection contains duplicate or unknown songs');
  const audit = options.audit ? json(options.audit) : {};
  if (!audit || typeof audit !== 'object' || Array.isArray(audit)) throw new Error('audit must be an object');
  const allowedAudit = new Set(['audits', 'elapsedSeconds', 'apiRequests', 'costPerRequest', 'currency']);
  if (Object.keys(audit).some(key => !allowedAudit.has(key)) || audit.audits != null && !Array.isArray(audit.audits)) throw new Error('invalid audit report fields');
  const report = reportPopularityPilot(pilot, snapshot, audit);
  publish(options.output, report);
  return { command, output: path.resolve(options.output), sampleSize: report.sampleSize, scoreCoverage: report.scoreCoverage, auditedAccuracy: report.auditedAccuracy };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = runPopularityCli(process.argv.slice(2));
    process.stdout.write(result.help ?? `${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`Popularity analysis failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
