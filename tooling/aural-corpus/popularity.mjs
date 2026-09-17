import { createHash } from 'node:crypto';

export const POPULARITY_VERSION = 'aural-popularity-1';
export const POPULARITY_IMPORT_VERSION = 1;
const CATEGORY_WEIGHT = Object.freeze({ enduring: 0.8, recent: 0.2 });
const canonical = value => value && typeof value === 'object' ? Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(canonical(value))).digest('hex');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function string(value, field) { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} must be nonempty text`); return value; }
function unit(value, field) { if (!Number.isFinite(value) || value < 0 || value > 1) throw new TypeError(`${field} must be in [0, 1]`); return value; }
function date(value, field) { if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(value) || !Number.isFinite(Date.parse(value))) throw new TypeError(`${field} must be an ISO timestamp`); return value; }

/** Validates a portable provider import. This function performs no network access or writes. */
export function validateProviderImport(input) {
  if (input?.schemaVersion !== POPULARITY_IMPORT_VERSION) throw new TypeError('unsupported popularity import schema');
  string(input.provider, 'provider'); string(input.dataVersion, 'dataVersion'); date(input.collectedAt, 'collectedAt');
  if (typeof input.rights?.allowDerivedRedistribution !== 'boolean' || typeof input.rights?.allowRawStorage !== 'boolean') throw new TypeError('explicit storage and derived redistribution rights are required');
  string(input.rights.basis, 'rights.basis');
  if (!Array.isArray(input.observations)) throw new TypeError('observations must be an array');
  const recordingOwners = new Map();
  for (const observation of input.observations) {
    string(observation.songId, 'songId');
    const match = observation.match;
    if (!['confirmed', 'ambiguous', 'unmatched'].includes(match?.status)) throw new TypeError('invalid match status');
    unit(match.confidence, 'match.confidence');
    for (const key of ['reviewed', 'artistMatched', 'titleMatched', 'versionMatched']) if (typeof match[key] !== 'boolean') throw new TypeError(`match.${key} must be boolean`);
    if (!['studio', 'live', 'remix', 'cover', 'unknown'].includes(observation.versionKind)) throw new TypeError('invalid recording versionKind');
    if (match.status === 'confirmed') {
      string(observation.providerTrackId, 'providerTrackId');
      if (!match.artistMatched || !match.titleMatched || !match.versionMatched || observation.versionKind === 'unknown') throw new TypeError('confirmed matches require artist, title, and recording-version agreement');
      if (!match.reviewed && match.method !== 'exact_identifier') throw new TypeError('unreviewed confirmed matches require an exact recording identifier');
      const owner = recordingOwners.get(observation.providerTrackId);
      if (owner && owner !== observation.songId) throw new TypeError('a confirmed recording cannot identify multiple canonical songs');
      recordingOwners.set(observation.providerTrackId, observation.songId);
    }
    if (!Array.isArray(observation.measurements)) throw new TypeError('measurements must be an array');
    if (match.status === 'unmatched' && observation.measurements.length) throw new TypeError('unmatched songs cannot carry measurements');
    const metrics = new Set();
    for (const measurement of observation.measurements) {
      for (const key of ['metric', 'unit', 'territory', 'timeWindow']) string(measurement[key], key);
      if (!Object.hasOwn(CATEGORY_WEIGHT, measurement.category)) throw new TypeError('measurement category must be enduring or recent');
      if (!Number.isFinite(measurement.value) || measurement.value < 0) throw new TypeError('measurement value must be finite and nonnegative');
      date(measurement.observedAt, 'measurement.observedAt');
      if (Date.parse(measurement.observedAt) > Date.parse(input.collectedAt)) throw new TypeError('measurement cannot postdate collection');
      const key = metricKey(measurement);
      if (metrics.has(key)) throw new TypeError('duplicate comparable measurement within a recording');
      metrics.add(key);
    }
  }
  return input;
}

function metricKey(measurement) { return JSON.stringify([measurement.metric, measurement.category, measurement.unit, measurement.territory, measurement.timeWindow]); }

/** Relative midrank in a fixed import reference population; ties get the same percentile. */
function percentileRanks(values) {
  const sorted = [...values].sort((a, b) => a.value - b.value || compare(a.songId, b.songId));
  const result = new Map();
  for (let start = 0; start < sorted.length;) {
    let end = start + 1;
    while (end < sorted.length && sorted[end].value === sorted[start].value) end++;
    const rank = sorted.length === 1 ? 0.5 : ((start + end - 1) / 2) / (sorted.length - 1);
    for (let index = start; index < end; index++) result.set(sorted[index].songId, rank);
    start = end;
  }
  return result;
}

/** Offline enrichment. The caller supplies the complete reference population, including unmatched songs. */
export function buildPopularitySnapshot(input, { songIds, asOf = input.collectedAt, maxAgeDays = 180 } = {}) {
  validateProviderImport(input);
  date(asOf, 'asOf');
  if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0) throw new TypeError('maxAgeDays must be positive');
  if (Date.parse(asOf) < Date.parse(input.collectedAt)) throw new TypeError('asOf cannot precede collection');
  const ids = [...new Set(songIds ?? input.observations.map(item => item.songId))].sort(compare);
  ids.forEach(value => string(value, 'songId'));
  const known = new Set(ids);
  if (input.observations.some(item => !known.has(item.songId))) throw new TypeError('observation is outside the reference population');
  const diagnostics = { ambiguous: 0, unmatched: 0, expiredMeasurements: 0, duplicateRecordingMeasurements: 0, redistributionBlocked: !input.rights.allowDerivedRedistribution };
  const best = new Map();
  const matches = new Map(ids.map(songId => [songId, []]));
  const cutoff = Date.parse(asOf) - maxAgeDays * 86400000;
  for (const observation of input.observations) {
    matches.get(observation.songId).push({
      providerTrackId: observation.providerTrackId ?? null, versionKind: observation.versionKind,
      status: observation.match.status, confidence: observation.match.confidence, reviewed: observation.match.reviewed,
      artistMatched: observation.match.artistMatched, titleMatched: observation.match.titleMatched,
      versionMatched: observation.match.versionMatched, method: observation.match.method ?? null,
    });
    if (observation.match.status !== 'confirmed') { diagnostics[observation.match.status]++; continue; }
    for (const measurement of observation.measurements) {
      if (Date.parse(measurement.observedAt) < cutoff) { diagnostics.expiredMeasurements++; continue; }
      const key = metricKey(measurement);
      if (!best.has(key)) best.set(key, new Map());
      const perSong = best.get(key);
      const previous = perSong.get(observation.songId);
      const entry = { songId: observation.songId, value: measurement.value, confidence: observation.match.confidence, providerTrackId: observation.providerTrackId, measurement };
      // Duplicate releases do not get summed. Prefer the latest observation, then greater evidence,
      // then a stable recording ID. Taking one measurement avoids double-counting audiences.
      if (previous) diagnostics.duplicateRecordingMeasurements++;
      const newer = !previous || Date.parse(measurement.observedAt) > Date.parse(previous.measurement.observedAt);
      const tiedDate = previous && Date.parse(measurement.observedAt) === Date.parse(previous.measurement.observedAt);
      const tieKey = item => JSON.stringify([item.providerTrackId, canonical(item.measurement)]);
      const betterTie = tiedDate && (entry.value > previous.value || (entry.value === previous.value && (entry.confidence > previous.confidence || (entry.confidence === previous.confidence && compare(tieKey(entry), tieKey(previous)) < 0))));
      if (newer || betterTie) perSong.set(observation.songId, entry);
    }
  }
  const components = new Map(ids.map(songId => [songId, { enduring: [], recent: [] }]));
  const metricReference = [];
  const rawMeasurements = [];
  for (const [key, perSong] of [...best].sort(([a], [b]) => compare(a, b))) {
    const entries = [...perSong.values()]; const ranks = percentileRanks(entries);
    metricReference.push({ key: JSON.parse(key), count: entries.length, method: 'midrank-percentile-v1' });
    for (const entry of entries.sort((a, b) => compare(a.songId, b.songId))) {
      components.get(entry.songId)[entry.measurement.category].push({ score: ranks.get(entry.songId), confidence: entry.confidence });
      if (input.rights.allowRawStorage) rawMeasurements.push({ songId: entry.songId, providerTrackId: entry.providerTrackId, ...entry.measurement });
    }
  }
  const songs = ids.map(songId => {
    const aggregate = {};
    let numerator = 0, availableWeight = 0, confidence = 0;
    for (const category of Object.keys(CATEGORY_WEIGHT)) {
      const data = components.get(songId)[category];
      if (!data.length) { aggregate[category] = null; continue; }
      const score = data.reduce((sum, item) => sum + item.score, 0) / data.length;
      const matchConfidence = data.reduce((sum, item) => sum + item.confidence, 0) / data.length;
      aggregate[category] = { score, confidence: matchConfidence, metrics: data.length };
      numerator += score * CATEGORY_WEIGHT[category]; availableWeight += CATEGORY_WEIGHT[category]; confidence += matchConfidence * CATEGORY_WEIGHT[category];
    }
    return {
      songId, score: availableWeight ? numerator / availableWeight : null, confidence: availableWeight ? confidence : 0,
      components: aggregate, missingCategories: Object.keys(aggregate).filter(category => aggregate[category] == null),
      matches: matches.get(songId).sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b))),
    };
  });
  const manifest = {
    schemaVersion: 1, scoringVersion: POPULARITY_VERSION, provider: input.provider, dataVersion: input.dataVersion,
    collectedAt: input.collectedAt, asOf, maxAgeDays, rights: { allowDerivedRedistribution: input.rights.allowDerivedRedistribution, allowRawStorage: input.rights.allowRawStorage, basis: input.rights.basis },
    componentWeights: CATEGORY_WEIGHT, referencePopulationHash: hash(ids), metricReference,
    refreshCadenceDays: 30, scoreInterpretation: 'relative popularity within this fixed reference population',
  };
  const result = { manifest, songs, diagnostics, ...(input.rights.allowRawStorage ? { rawMeasurements } : {}) };
  return { snapshotId: `pop-${hash(result)}`, ...result };
}

/** Portable production export never carries raw measurements or unresolved identities. */
export function exportPopularityWeights(snapshot) {
  if (!snapshot.manifest.rights.allowDerivedRedistribution) throw new Error('provider rights do not permit derived-score redistribution');
  return {
    snapshotId: snapshot.snapshotId, scoringVersion: snapshot.manifest.scoringVersion,
    songs: snapshot.songs.map(({ songId, score, confidence }) => ({ songId, score, confidence })),
  };
}

/** Deterministic round-robin across coarse metadata strata, balanced by artist within a stratum. */
export function createPopularityPilot(catalog, { limit = 500, seed = 'aural-popularity-pilot-1' } = {}) {
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError('pilot limit must be a positive integer');
  const seen = new Set(); const strata = new Map();
  for (const song of catalog) {
    string(song.id, 'song.id');
    if (seen.has(song.id)) throw new TypeError(`duplicate catalog song: ${song.id}`);
    seen.add(song.id);
    const year = Number.isInteger(song.year) ? Math.floor(song.year / 10) * 10 : 'unknown';
    const genre = song.genre?.trim().toLowerCase() || 'unknown';
    const artist = song.artist?.trim().toLowerCase() || 'unknown';
    const key = JSON.stringify([genre, year]);
    if (!strata.has(key)) strata.set(key, new Map());
    const artists = strata.get(key);
    if (!artists.has(artist)) artists.set(artist, []);
    artists.get(artist).push({ ...song, rank: hash(`${seed}\0${song.id}`) });
  }
  const queues = [...strata].sort(([a], [b]) => compare(hash(`${seed}\0${a}`), hash(`${seed}\0${b}`))).map(([stratum, artists]) => ({
    stratum,
    artists: [...artists].sort(([a], [b]) => compare(hash(`${seed}\0${a}`), hash(`${seed}\0${b}`))).map(([, items]) => items.sort((a, b) => compare(a.rank, b.rank))),
    artistCursor: 0,
  }));
  const selected = [];
  while (selected.length < Math.min(limit, catalog.length)) {
    let progressed = false;
    for (const queue of queues) {
      if (selected.length >= limit) break;
      for (let attempt = 0; attempt < queue.artists.length; attempt++) {
        const bucket = queue.artists[queue.artistCursor++ % queue.artists.length];
        if (!bucket.length) continue;
        const { rank, ...song } = bucket.shift(); selected.push({ ...song, stratum: queue.stratum }); progressed = true; break;
      }
    }
    if (!progressed) break;
  }
  return {
    pilotVersion: 'aural-popularity-pilot-1', seed, requestedLimit: limit, corpusCount: catalog.length,
    corpusIdentityHash: hash([...seen].sort(compare)), selected,
    strata: [...strata.keys()].sort(compare).map(stratum => ({ stratum, selected: selected.filter(song => song.stratum === stratum).length })),
  };
}

/** Audited accuracy is deliberately null until actual human reviews are supplied. */
export function reportPopularityPilot(pilot, snapshot, { audits = [], elapsedSeconds = null, apiRequests = null, costPerRequest = null, currency = null } = {}) {
  for (const [key, value] of Object.entries({ elapsedSeconds, apiRequests, costPerRequest })) if (value != null && (!Number.isFinite(value) || value < 0)) throw new TypeError(`${key} must be nonnegative or null`);
  if (costPerRequest != null && !currency) throw new TypeError('currency required for cost estimates');
  const selectedIds = new Set(pilot.selected.map(song => song.id));
  const found = new Map(snapshot.songs.filter(song => selectedIds.has(song.songId)).map(song => [song.songId, song]));
  const reviewed = new Set();
  for (const audit of audits) {
    if (!selectedIds.has(audit.songId) || reviewed.has(audit.songId) || typeof audit.correct !== 'boolean') throw new TypeError('audits require unique pilot songs and a boolean verdict');
    if (!found.get(audit.songId)?.matches.some(match => match.status === 'confirmed')) throw new TypeError('matching accuracy audits require a confirmed match');
    reviewed.add(audit.songId);
  }
  const count = pilot.selected.length;
  const usable = [...found.values()].filter(song => song.score != null).length;
  const confirmed = [...found.values()].filter(song => song.matches.some(match => match.status === 'confirmed')).length;
  const correct = audits.filter(audit => audit.correct).length;
  return {
    pilotVersion: pilot.pilotVersion, snapshotId: snapshot.snapshotId, sampleSize: count, corpusCount: pilot.corpusCount,
    matchedSongs: confirmed, matchCoverage: count ? confirmed / count : null, usableScores: usable, scoreCoverage: count ? usable / count : null,
    auditedMatches: audits.length, auditedAccuracy: audits.length ? correct / audits.length : null,
    songsPerSecond: elapsedSeconds > 0 ? count / elapsedSeconds : null,
    projectedRequests: count && apiRequests != null ? Math.ceil(apiRequests / count * pilot.corpusCount) : null,
    projectedCost: count && apiRequests != null && costPerRequest != null ? apiRequests / count * pilot.corpusCount * costPerRequest : null,
    currency, measurements: { elapsedSeconds, apiRequests, costPerRequest },
    strata: pilot.strata.map(stratum => ({ ...stratum, usableScores: pilot.selected.filter(song => song.stratum === stratum.stratum && found.get(song.id)?.score != null).length })),
    limitations: ['Popularity is relative to the reference population and represented audiences.', 'Unaudited matches are not evidence of measured matching accuracy.', 'Cost and throughput projections assume the pilot request mix remains representative.'],
  };
}

/** Adapter boundary for a future licensed provider. Nothing is fetched without explicit rights. */
export async function collectProviderImport(adapter, songs, { rights, dataVersion, collectedAt }) {
  if (!adapter || typeof adapter.fetchObservations !== 'function' || typeof adapter.name !== 'string') throw new TypeError('provider adapter requires name and fetchObservations');
  if (!rights?.allowRawStorage || !rights?.allowDerivedRedistribution || !rights?.basis) throw new Error('live enrichment requires confirmed raw-storage and derived-redistribution rights');
  const observations = await adapter.fetchObservations(songs);
  return validateProviderImport({ schemaVersion: 1, provider: adapter.name, dataVersion, collectedAt, rights, observations });
}
