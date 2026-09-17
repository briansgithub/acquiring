import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { hash, hashFile, stableJson, NORMALIZER_VERSION } from './common.mjs';
import { updateNormalizedCache, readNormalizedCache } from './source.mjs';
import { exportAnalysis, exportRuntime, familyMapping } from './export.mjs';
import { loadPopularityArtifact } from './popularity-cli.mjs';

export const BUILD_VERSION = 'aural-build-1';
export async function buildCorpus(options) {
  const started = performance.now(), log = options.log || (() => {});
  const { discoverPatterns, getPattern, occurrences } = await import('./miner.mjs');
  const { selectPatterns, calculateCoverage } = await import('./coverage.mjs');
  const config = { minSongs: options.minSongs ?? 2, structureMinSongs: options.structureMinSongs ?? 5, targetCoverage: options.targetCoverage ?? 0.8 };
  if (!Number.isInteger(config.minSongs) || config.minSongs < 2 || !Number.isInteger(config.structureMinSongs) || config.structureMinSongs < 2 || config.targetCoverage <= 0 || config.targetCoverage > 1) throw Error('Invalid corpus configuration');
  fs.mkdirSync(options.output, { recursive: true });
  const source = updateNormalizedCache({ ...options, normalizedFile: options.normalizedFile || path.join(options.output, options.limit ? `normalized-${options.limit}.db` : 'normalized.db'), log });
  const normalized = readNormalizedCache(source.normalizedFile);
  let popularity = [];
  if (options.popularityFile) {
    popularity = loadPopularityArtifact(options.popularityFile).songs;
  }
  const codeFingerprint = hash(['common.mjs','normalize.mjs','source.mjs','miner.mjs','coverage.mjs','export.mjs','build.mjs'].map(name => [name, hashFile(new URL(name, import.meta.url))]));
  const snapshotId = hash({ build: BUILD_VERSION, codeFingerprint, normalization: NORMALIZER_VERSION, mapping: familyMapping, source: source.sourceHash, config, scope: source.scope, popularity });
  const destination = path.join(options.output, 'snapshots', snapshotId);
  if (fs.existsSync(path.join(destination, 'manifest.json'))) {
    const manifest = JSON.parse(fs.readFileSync(path.join(destination, 'manifest.json'), 'utf8'));
    for (const [name, checksum] of Object.entries(manifest.files)) if (hashFile(path.join(destination, name)) !== checksum) throw Error(`Snapshot checksum mismatch: ${name}`);
    return { snapshotId, destination, reusedSnapshot: true, sourceStats: source.stats };
  }
  const stage = path.join(options.output, 'snapshots', `.build-${snapshotId}-${process.pid}`);
  fs.mkdirSync(stage, { recursive: true });
  log({ stage: 'discover', runs: normalized.runs.length, tokens: normalized.runs.reduce((n, r) => n + r.tokens.length, 0) });
  const index = discoverPatterns(normalized.runs, { ...config, normalizationVersion: NORMALIZER_VERSION });
  log({ stage: 'select', candidates: index.candidates.length });
  const selection = selectPatterns(index, normalized.runs, config);
  const observedCoverage = Object.fromEntries(Object.entries(normalized.denominators).map(([view, d]) => [view, {
    ...d, coveredTransitions: selection.views[view]?.coveredTransitions ?? 0,
    conservativeCoverage: d.observedTransitions ? (selection.views[view]?.coveredTransitions ?? 0) / d.observedTransitions : null,
    eligibleCoverage: selection.views[view]?.coverage ?? null,
    observedTargetReached: d.observedTransitions > 0 && (selection.views[view]?.coveredTransitions ?? 0) / d.observedTransitions >= config.targetCoverage
  }]));
  const report = { snapshotId, buildVersion: BUILD_VERSION, codeFingerprint, normalizerVersion: NORMALIZER_VERSION, sourceHash: source.sourceHash,
    familyMappingVersion: familyMapping.version, config, scope: source.scope,
    availability: { catalogSongs: source.songs.length, scannedSongs: source.stats.scannedSongs, sections: normalized.sections.length, rejectedSources: source.diagnostics },
    diagnostics: normalized.diagnosticCounts, observedCoverage, selection };
  log({ stage: 'export', selected: selection.selected.length });
  const runtime = exportRuntime({ file: path.join(stage, 'runtime.db'), index, ...normalized, songs: source.songs, getPattern, snapshotId, popularity });
  report.curriculumFamilies = runtime.familyGroups.map(g => ({ familyId: g.familyId, view: g.view, occurrenceCount: g.occurrenceCount,
    distinctSongs: g.distinctSongs, patternIds: g.patterns.map(p => p.id), coverage: calculateCoverage(index, g.patterns, { view: g.view }) }));
  delete runtime.familyGroups;
  const analysis = exportAnalysis({ file: path.join(stage, 'analysis.db'), index, ...normalized, selected: selection.selected, snapshotId, report, occurrences });
  fs.writeFileSync(path.join(stage, 'report.json'), stableJson({ ...report, runtime }));
  const manifest = { schemaVersion: 1, snapshotId, buildVersion: BUILD_VERSION, sourceHash: source.sourceHash,
    files: Object.fromEntries(['analysis.db', 'runtime.db', 'report.json'].map(name => [name, hashFile(path.join(stage, name))])) };
  fs.writeFileSync(path.join(stage, 'manifest.json'), stableJson(manifest));
  fs.renameSync(stage, destination);
  const pointer = path.join(options.output, `latest-${process.pid}.json`);
  fs.writeFileSync(pointer, stableJson({ snapshotId, path: `snapshots/${snapshotId}`, runtime: `snapshots/${snapshotId}/runtime.db` }));
  fs.renameSync(pointer, path.join(options.output, 'latest.json'));
  return { snapshotId, destination, analysis, runtime, coverage: observedCoverage, sourceStats: source.stats,
    elapsedMs: Math.round(performance.now() - started), peakRssBytes: process.resourceUsage().maxRSS * 1024 };
}

async function main() {
  const args = process.argv.slice(2), values = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i].startsWith('--') || !args[i + 1] || args[i + 1].startsWith('--')) throw Error('Use --option value');
    values[args[i].slice(2)] = args[i + 1];
  }
  const known = ['catalog','cache-root','output','normalized-file','limit','min-songs','structure-min-songs','target-coverage','popularity-file'];
  for (const key of Object.keys(values)) if (!known.includes(key)) throw Error(`Unknown option: ${key}`);
  const { default: root } = await import('../lib/dataRoot.js');
  const options = { catalog: values.catalog || path.join(root.getCatalogDir(), 'hooktheory_catalog.db'),
    cacheRoot: values['cache-root'] || root.getPlaybackCacheDir(), output: values.output || path.join(root.resolveDataRoot(), 'aural-corpus'),
    normalizedFile: values['normalized-file'], limit: Number(values.limit || 0), minSongs: Number(values['min-songs'] || 2),
    structureMinSongs: Number(values['structure-min-songs'] || 5), targetCoverage: Number(values['target-coverage'] || .8),
    popularityFile: values['popularity-file'], log: value => console.log(JSON.stringify(value)) };
  if (!Number.isInteger(options.limit) || options.limit < 0) throw Error('Invalid limit');
  console.log(JSON.stringify(await buildCorpus(options)));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
