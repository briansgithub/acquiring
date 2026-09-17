import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPopularitySnapshot, collectProviderImport, createPopularityPilot, exportPopularityWeights, reportPopularityPilot, validateProviderImport } from './popularity.mjs';

const observedAt = '2026-09-01T00:00:00.000Z';
const collectedAt = '2026-09-17T00:00:00.000Z';
const measurement = (category, value) => ({ metric: category === 'enduring' ? 'lifetime-listeners' : 'monthly-plays', category, value, unit: 'count', territory: 'global', timeWindow: category === 'enduring' ? 'lifetime' : '30days', observedAt });
const observation = (songId, enduring, recent, overrides = {}) => ({
  songId, providerTrackId: `track-${songId}`, versionKind: 'studio',
  match: { status: 'confirmed', confidence: 1, reviewed: true, artistMatched: true, titleMatched: true, versionMatched: true },
  measurements: [enduring == null ? null : measurement('enduring', enduring), recent == null ? null : measurement('recent', recent)].filter(Boolean), ...overrides,
});
const input = (observations = []) => ({ schemaVersion: 1, provider: 'fixture-provider', dataVersion: 'test-1', collectedAt, rights: { allowDerivedRedistribution: true, allowRawStorage: true, basis: 'synthetic fixture' }, observations });

test('component midranks combine 80% enduring and 20% recent without adding counts', () => {
  const result = buildPopularitySnapshot(input([observation('a', 100, 1), observation('b', 200, 0), observation('c', 300, 3)]));
  assert.deepEqual(result.songs.map(song => song.score), [0.1, 0.4, 1]);
  assert.deepEqual(result.songs.map(song => song.confidence), [1, 1, 1]);
  assert.equal(result.manifest.metricReference.length, 2);
  assert.equal(result.manifest.refreshCadenceDays, 30);
});

test('ties and singleton metrics remain neutral and equal', () => {
  const tied = buildPopularitySnapshot(input([observation('a', 10, null), observation('b', 10, null)]));
  assert.deepEqual(tied.songs.map(song => song.score), [0.5, 0.5]);
  const only = buildPopularitySnapshot(input([observation('a', 10, null)]));
  assert.equal(only.songs[0].score, 0.5);
});

test('missing categories keep scores missing, available-weight confidence shrinks toward neutral', () => {
  const result = buildPopularitySnapshot(input([observation('a', 10, null), observation('b', 20, 20)]), { songIds: ['a', 'b', 'unknown'] });
  assert.equal(result.songs[0].score, 0);
  assert.equal(result.songs[0].confidence, 0.8);
  assert.deepEqual(result.songs[0].missingCategories, ['recent']);
  assert.equal(result.songs[2].score, null);
  assert.equal(result.songs[2].confidence, 0);
});

test('ambiguous identities and wrong recording versions cannot become ranked matches', () => {
  const uncertain = observation('a', 100, 10); uncertain.match.status = 'ambiguous';
  const result = buildPopularitySnapshot(input([uncertain]));
  assert.equal(result.songs[0].score, null);
  assert.equal(result.diagnostics.ambiguous, 1);
  const wrongVersion = observation('a', 100, 10); wrongVersion.match.versionMatched = false;
  assert.throws(() => validateProviderImport(input([wrongVersion])), /agreement/);
  const unreviewed = observation('a', 100, 10); unreviewed.match.reviewed = false;
  assert.throws(() => validateProviderImport(input([unreviewed])), /exact recording identifier/);
  unreviewed.match.method = 'exact_identifier';
  assert.doesNotThrow(() => validateProviderImport(input([unreviewed])));
});

test('duplicate releases never sum their measurements or inflate the reference population', () => {
  const original = [observation('a', 100, 10), observation('b', 200, 20), observation('c', 300, 30)];
  const duplicate = observation('a', 100, 10, { providerTrackId: 'alternate-release-a' });
  const baseline = buildPopularitySnapshot(input(original));
  const added = buildPopularitySnapshot(input([...original, duplicate]));
  assert.deepEqual(added.songs.map(song => song.score), baseline.songs.map(song => song.score));
  assert.equal(added.manifest.metricReference[0].count, 3);
  assert.equal(added.diagnostics.duplicateRecordingMeasurements, 2);
});

test('conflicting duplicate measurements resolve deterministically and cross-song IDs are rejected', () => {
  const a = observation('a', 100, 10), duplicate = structuredClone(a);
  duplicate.match.confidence = 0.4;
  assert.equal(buildPopularitySnapshot(input([a, duplicate])).snapshotId, buildPopularitySnapshot(input([duplicate, a])).snapshotId);
  const b = observation('b', 200, 20, { providerTrackId: a.providerTrackId });
  assert.throws(() => validateProviderImport(input([a, b])), /multiple canonical songs/);
});

test('territory/window/unit measurements normalize separately', () => {
  const a = observation('a', 10, null), b = observation('b', 20, null);
  b.measurements[0].territory = 'US';
  const result = buildPopularitySnapshot(input([a, b]));
  assert.equal(result.manifest.metricReference.length, 2);
  assert.deepEqual(result.songs.map(song => song.score), [0.5, 0.5]);
});

test('expired and impossible timestamps are explicit rather than silently ranked', () => {
  const old = observation('a', 10, 10); old.measurements.forEach(value => { value.observedAt = '2020-01-01T00:00:00.000Z'; });
  const result = buildPopularitySnapshot(input([old]));
  assert.equal(result.songs[0].score, null);
  assert.equal(result.diagnostics.expiredMeasurements, 2);
  const future = observation('a', 10, 10); future.measurements[0].observedAt = '2099-01-01T00:00:00.000Z';
  assert.throws(() => buildPopularitySnapshot(input([future])), /postdate/);
  assert.throws(() => buildPopularitySnapshot(input(), { asOf: '2020-01-01T00:00:00.000Z' }), /precede/);
});

test('snapshot and production export respect separate raw and derived rights', () => {
  const data = input([observation('a', 10, 10)]); data.rights.allowRawStorage = false;
  const snapshot = buildPopularitySnapshot(data);
  assert.equal('rawMeasurements' in snapshot, false);
  assert.deepEqual(Object.keys(exportPopularityWeights(snapshot).songs[0]), ['songId', 'score', 'confidence']);
  data.rights.allowDerivedRedistribution = false;
  assert.throws(() => exportPopularityWeights(buildPopularitySnapshot(data)), /redistribution/);
});

test('snapshot content is deterministic across observation/population order', () => {
  const rows = [observation('a', 10, 1), observation('b', 20, 3), observation('c', 30, 2)];
  assert.deepEqual(buildPopularitySnapshot(input(rows)), buildPopularitySnapshot(input([...rows].reverse()), { songIds: ['c', 'b', 'a'] }));
});

test('schema rejects malformed and out-of-population observations', () => {
  const invalid = input([observation('a', 10, 1)]); invalid.observations[0].measurements[0].value = -1;
  assert.throws(() => validateProviderImport(invalid), /nonnegative/);
  assert.throws(() => validateProviderImport({ ...input(), schemaVersion: 99 }), /schema/);
  assert.throws(() => buildPopularitySnapshot(input([observation('a', 1, 1)]), { songIds: ['b'] }), /reference population/);
  assert.throws(() => validateProviderImport({ ...input(), rights: null }), /rights/);
});

test('500-song pilot is reproducible, includes unknown metadata, and balances strata/artists', () => {
  const catalog = Array.from({ length: 1200 }, (_, n) => ({ id: `song-${n}`, artist: n % 2 ? `artist-${n % 17}` : undefined, genre: n % 3 ? 'pop' : undefined, year: n % 5 ? 1985 + n % 4 * 10 : undefined }));
  const pilot = createPopularityPilot(catalog);
  assert.equal(pilot.selected.length, 500);
  assert.equal(new Set(pilot.selected.map(song => song.id)).size, 500);
  assert.deepEqual(pilot, createPopularityPilot([...catalog].reverse()));
  assert.ok(pilot.strata.some(stratum => stratum.stratum === '["unknown","unknown"]' && stratum.selected > 0));
  assert.equal(createPopularityPilot(catalog.slice(0, 4)).selected.length, 4);
  assert.deepEqual(createPopularityPilot([]).selected, []);
});

test('pilot reports measured coverage, audited accuracy and labeled projections', () => {
  const pilot = createPopularityPilot([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  const snapshot = buildPopularitySnapshot(input([observation('a', 10, 10), observation('b', 20, 20)]), { songIds: ['a', 'b', 'c'] });
  const report = reportPopularityPilot(pilot, snapshot, { audits: [{ songId: 'a', correct: true }, { songId: 'b', correct: false }], elapsedSeconds: 10, apiRequests: 6, costPerRequest: 0.01, currency: 'USD' });
  assert.equal(report.matchCoverage, 2 / 3); assert.equal(report.auditedAccuracy, 0.5);
  assert.equal(report.songsPerSecond, 0.3); assert.equal(report.projectedRequests, 6); assert.equal(report.projectedCost, 0.06);
  assert.equal(reportPopularityPilot(pilot, snapshot).auditedAccuracy, null);
  assert.equal(reportPopularityPilot(pilot, snapshot).projectedCost, null);
  assert.throws(() => reportPopularityPilot(pilot, snapshot, { audits: [{ songId: 'c', correct: true }] }), /confirmed match/);
});

test('provider boundary cannot make live calls before rights have been established', async () => {
  let calls = 0;
  const adapter = { name: 'soundcharts-fixture', fetchObservations: async () => { calls++; return [observation('a', 10, 10)]; } };
  await assert.rejects(collectProviderImport(adapter, [{ id: 'a' }], { rights: null, collectedAt, dataVersion: '1' }), /rights/);
  assert.equal(calls, 0);
  const collected = await collectProviderImport(adapter, [{ id: 'a' }], { rights: input().rights, collectedAt, dataVersion: '1' });
  assert.equal(calls, 1); assert.equal(collected.provider, 'soundcharts-fixture');
});
