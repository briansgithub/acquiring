import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { hash, hashFile, stableJson, NORMALIZER_VERSION } from './common.mjs';
import { updateNormalizedCache, readNormalizedCache } from './source.mjs';
import { exportAnalysis, exportRuntime, familyMapping } from './export.mjs';
import { loadPopularityArtifact } from './popularity-cli.mjs';

export const BUILD_VERSION = 'aural-build-1';
function publishPointer(output, snapshotId, limit) {
  const name = limit ? `latest-sample-${limit}.json` : 'latest.json';
  const pointer = path.join(output, `${name}.${process.pid}.tmp`);
  fs.writeFileSync(pointer, stableJson({ snapshotId, path: `snapshots/${snapshotId}`, runtime: `snapshots/${snapshotId}/runtime.db` }));
  fs.renameSync(pointer, path.join(output, name));
}
export async function buildCorpus(options) {
  const started = performance.now(), log = options.log || (() => {});
  const { discoverPatterns, getPattern, occurrences } = await import('./miner.mjs');
  const { selectPatterns, calculateCoverage } = await import('./coverage.mjs');
  const config = { minSongs: options.minSongs ?? 2, structureMinSongs: options.structureMinSongs ?? 5, targetCoverage: options.targetCoverage ?? 0.8 };
  if (!Number.isInteger(config.minSongs) || config.minSongs < 2 || !Number.isInteger(config.structureMinSongs) || config.structureMinSongs < 2 || !Number.isFinite(config.targetCoverage) || config.targetCoverage <= 0 || config.targetCoverage > 1) throw Error('Invalid corpus configuration');
  fs.mkdirSync(options.output, { recursive: true });
  const sourceOptions = { ...options, normalizedFile: options.normalizedFile || path.join(options.output, options.limit ? `normalized-${options.limit}.db` : 'normalized.db'), log };
  const source = options.reuseSnapshotInputs
    ? (await import('./reuse.mjs')).reuseSnapshotInputs({ ...sourceOptions, snapshotDirectory: options.reuseSnapshotInputs })
    : updateNormalizedCache(sourceOptions);
  const normalized = readNormalizedCache(source.normalizedFile);
  let popularity = [], popularitySnapshotId = 'unavailable', popularityProvenance = null;
  if (options.popularityFile) {
    const artifact = loadPopularityArtifact(options.popularityFile);
    popularity = artifact.songs;
    popularitySnapshotId = artifact.snapshotId;
    popularityProvenance = artifact.manifest || artifact.provenance;
  }
  const codeFingerprint = hash(['common.mjs','normalize.mjs','source.mjs','reuse.mjs','miner.mjs','coverage.mjs','export.mjs','build.mjs', '../../contracts/aural-corpus/schema.sql'].map(name => [name, hashFile(new URL(name, import.meta.url))]));
  const catalogHash = hash(source.songs), rejectedSourceHash = hash(source.diagnostics);
  const snapshotId = hash({ build: BUILD_VERSION, codeFingerprint, normalization: source.normalizationFingerprint, mapping: familyMapping,
    source: source.sourceHash, catalogHash, rejectedSourceHash, config, scope: source.scope, popularity, popularitySnapshotId });
  const destination = path.join(options.output, 'snapshots', snapshotId);
  if (fs.existsSync(path.join(destination, 'manifest.json'))) {
    const manifest = JSON.parse(fs.readFileSync(path.join(destination, 'manifest.json'), 'utf8'));
    for (const [name, checksum] of Object.entries(manifest.files)) if (hashFile(path.join(destination, name)) !== checksum) throw Error(`Snapshot checksum mismatch: ${name}`);
    publishPointer(options.output, snapshotId, options.limit);
    return { snapshotId, destination, reusedSnapshot: true, sourceStats: source.stats };
  }
  const stage = path.join(options.output, 'snapshots', `.build-${snapshotId}-${process.pid}`);
  fs.mkdirSync(stage, { recursive: true });
  log({ stage: 'discover', runs: normalized.runs.length, tokens: normalized.runs.reduce((n, r) => n + r.tokens.length, 0) });
  const index = discoverPatterns(normalized.runs, { ...config, normalizationVersion: NORMALIZER_VERSION });
  log({ stage: 'select', candidates: index.candidates.length });
  const observedTransitionCounts = Object.fromEntries(Object.entries(normalized.denominators).map(([view, d]) => [view, d.observedTransitions]));
  const selection = selectPatterns(index, index.runs, { ...config, observedTransitionCounts });
  const observedCoverage = Object.fromEntries(Object.entries(normalized.denominators).map(([view, d]) => [view, {
    ...d, coveredTransitions: selection.views[view]?.coveredTransitions ?? 0,
    conservativeCoverage: d.observedTransitions ? (selection.views[view]?.coveredTransitions ?? 0) / d.observedTransitions : null,
    eligibleCoverage: selection.views[view]?.coverage ?? null,
    observedTargetReached: d.observedTransitions > 0 && (selection.views[view]?.coveredTransitions ?? 0) / d.observedTransitions >= config.targetCoverage
  }]));
  const report = { snapshotId, buildVersion: BUILD_VERSION, codeFingerprint, normalizerVersion: NORMALIZER_VERSION, normalizationFingerprint: source.normalizationFingerprint, sourceHash: source.sourceHash, catalogHash, rejectedSourceHash,
    familyMappingVersion: familyMapping.version, config, scope: source.scope,
    popularity: { snapshotId: popularitySnapshotId, provenance: popularityProvenance },
    availability: { catalogSongs: source.songs.length, scannedSongs: source.stats.scannedSongs, sections: normalized.sections.length, rejectedSources: source.diagnostics },
    diagnostics: normalized.diagnosticCounts, observedCoverage, selection };
  log({ stage: 'export', selected: selection.selected.length });
  const runtime = exportRuntime({ file: path.join(stage, 'runtime.db'), index, ...normalized, songs: source.songs, getPattern, snapshotId, popularity, popularitySnapshotId });
  report.curriculumFamilies = runtime.familyGroups.map(g => {
    const songs = new Set();
    for (const pattern of g.patterns) for (const occurrence of occurrences(index, pattern)) songs.add(index.runs[occurrence.runIndex].songId);
    return { familyId: g.familyId, view: g.view, patternIds: g.patterns.map(p => p.id),
      discovered: { occurrenceCount: g.patterns.reduce((n,p) => n+p.occurrenceCount, 0), distinctSongs: songs.size,
        coverage: calculateCoverage(index, g.patterns, { view: g.view, observedTransitionCounts }) },
      runtimeEligible: { occurrenceCount: g.occurrenceCount, distinctSongs: g.distinctSongs } };
  });
  delete runtime.familyGroups;
  const analysis = exportAnalysis({ file: path.join(stage, 'analysis.db'), index, ...normalized, selected: selection.selected, snapshotId, report, occurrences, normalizedFile: source.normalizedFile });
  fs.writeFileSync(path.join(stage, 'report.json'), stableJson({ ...report, runtime }));
  const manifest = { schemaVersion: 1, snapshotId, buildVersion: BUILD_VERSION, sourceHash: source.sourceHash,
    files: Object.fromEntries(['analysis.db', 'runtime.db', 'report.json'].map(name => [name, hashFile(path.join(stage, name))])) };
  fs.writeFileSync(path.join(stage, 'manifest.json'), stableJson(manifest));
  fs.renameSync(stage, destination);
  publishPointer(options.output, snapshotId, options.limit);
  return { snapshotId, destination, analysis, runtime, coverage: observedCoverage, sourceStats: source.stats,
    elapsedMs: Math.round(performance.now() - started), peakRssBytes: process.resourceUsage().maxRSS * 1024 };
}

async function main() {
  const args = process.argv.slice(2), values = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i].startsWith('--') || !args[i + 1] || args[i + 1].startsWith('--')) throw Error('Use --option value');
    values[args[i].slice(2)] = args[i + 1];
  }
  const known = ['catalog','cache-root','output','normalized-file','limit','min-songs','structure-min-songs','target-coverage','popularity-file','reuse-snapshot-inputs'];
  for (const key of Object.keys(values)) if (!known.includes(key)) throw Error(`Unknown option: ${key}`);
  const { default: root } = await import('../lib/dataRoot.js');
  const options = { catalog: values.catalog || path.join(root.getCatalogDir(), 'hooktheory_catalog.db'),
    cacheRoot: values['cache-root'] || root.getPlaybackCacheDir(), output: values.output || path.join(root.resolveDataRoot(), 'aural-corpus'),
    normalizedFile: values['normalized-file'], limit: Number(values.limit || 0), minSongs: Number(values['min-songs'] || 2),
    structureMinSongs: Number(values['structure-min-songs'] || 5), targetCoverage: Number(values['target-coverage'] || .8),
    popularityFile: values['popularity-file'], reuseSnapshotInputs: values['reuse-snapshot-inputs'], log: value => console.log(JSON.stringify(value)) };
  if (!Number.isInteger(options.limit) || options.limit < 0) throw Error('Invalid limit');
  console.log(JSON.stringify(await buildCorpus(options)));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
