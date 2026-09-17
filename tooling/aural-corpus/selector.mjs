import { createHash } from 'node:crypto';

export const SELECTOR_VERSION = 'aural-selector-2';
export const DEFAULT_SETTINGS = Object.freeze({ popularity: true, variety: true, favorites: false, distinguishInversions: false });
const ZERO_SEED = 0x6d2b79f5;

/** Portable PRNG: unsigned xorshift32, zero replaced by 0x6d2b79f5; divide by 2^32. */
export function xorshift32(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new TypeError('seed must be uint32');
  let state = seed === 0 ? ZERO_SEED : seed;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
}

const compare = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
function id(value, label) {
  if (typeof value !== 'string' || !/^[\x21-\x7e]+$/.test(value)) throw new TypeError(`${label} must be a nonempty printable ASCII identifier`);
  return value;
}
function unique(items, label) {
  const seen = new Set();
  for (const item of items) { id(item.id, label); if (seen.has(item.id)) throw new TypeError(`duplicate ${label}: ${item.id}`); seen.add(item.id); }
}
function unit(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new TypeError(`${label} must be in [0, 1]`);
  return value;
}
export function popularityWeight(popularity) {
  if (popularity?.score == null) return 1;
  const score = unit(popularity.score, 'popularity.score');
  // Missing confidence is unknown evidence, never a silently fully trusted score.
  const confidence = popularity.confidence == null ? 0 : unit(popularity.confidence, 'popularity.confidence');
  return 1 + confidence * (score - 0.5);
}
function choose(items, random) {
  const threshold = random() * items.reduce((sum, item) => sum + item.weight, 0);
  let cumulative = 0;
  for (const item of items) { cumulative += item.weight; if (threshold < cumulative) return item; }
  return items.at(-1); // Floating-point rounding at the upper endpoint.
}
function fingerprint(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

/** Source spans encode physical transitions [start,end), so shared endpoint chords are fresh. */
export function parseSourceSpan(sourceId) {
  if (typeof sourceId !== 'string') return null;
  const parts = sourceId.split('|');
  if (parts.length !== 4 || !parts[0] || !parts[1] || !/^\d+$/.test(parts[2]) || !/^\d+$/.test(parts[3])) return null;
  const start = Number(parts[2]), end = Number(parts[3]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start) return null;
  return { sectionKey: `${parts[0]}|${parts[1]}`, start, end };
}

/** Build once per selection: O(history log history), then O(log section history) per candidate. */
export function createSourceFamiliarity(heardSourceIds) {
  const exact = new Set(heardSourceIds), sections = new Map();
  for (const sourceId of exact) {
    const span = parseSourceSpan(sourceId);
    if (!span) continue;
    if (!sections.has(span.sectionKey)) sections.set(span.sectionKey, []);
    sections.get(span.sectionKey).push({ start: span.start, end: span.end });
  }
  for (const [key, spans] of sections) {
    spans.sort((a, b) => a.start - b.start || a.end - b.end);
    const merged = [];
    for (const span of spans) {
      const last = merged.at(-1);
      if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
      else merged.push({ ...span });
    }
    sections.set(key, merged);
  }
  return sourceId => {
    if (exact.has(sourceId)) return true;
    const span = parseSourceSpan(sourceId);
    const intervals = span && sections.get(span.sectionKey);
    if (!intervals) return false;
    let low = 0, high = intervals.length;
    while (low < high) { const middle = Math.floor((low + high) / 2); if (intervals[middle].end <= span.start) low = middle + 1; else high = middle; }
    return low < intervals.length && intervals[low].start < span.end;
  };
}

/** Input is already musically eligible. No family, inversion, or context matching happens here. */
export function selectExample({ songs, seed, settings = {}, context = {}, favoriteSongIds = [], snapshotId = null, popularitySnapshotId = null }) {
  xorshift32(seed); // Validate even when empty or intentionally reusing a passage.
  const effectiveSettings = { ...DEFAULT_SETTINGS, ...settings };
  if (Object.keys(effectiveSettings).some(key => !Object.hasOwn(DEFAULT_SETTINGS, key) || typeof effectiveSettings[key] !== 'boolean')) throw new TypeError('unknown or nonboolean setting');
  if (!Array.isArray(songs)) throw new TypeError('songs must be an array');
  unique(songs, 'song');
  const isFamiliar = createSourceFamiliarity(context.heardSourceIds ?? []);
  const favorites = new Set(favoriteSongIds);
  const recent = context.recentSongIds ?? [];
  const assessment = context.assessment === true;
  const locations = new Set();
  let groups = songs.map(song => {
    if (!Array.isArray(song.sections)) throw new TypeError('sections must be an array');
    unique(song.sections, 'section');
    const position = recent.slice(0, 10).indexOf(song.id);
    const recency = !effectiveSettings.variety || position < 0 ? 1 : position < 3 ? 0.25 : 0.6;
    return {
      id: song.id,
      weight: (effectiveSettings.popularity ? popularityWeight(song.popularity) : 1) *
        (effectiveSettings.favorites && favorites.has(song.id) ? 1.5 : 1) * recency,
      sections: song.sections.map(section => {
        if (!Array.isArray(section.occurrences)) throw new TypeError('occurrences must be an array');
        unique(section.occurrences, 'occurrence');
        return {
          id: section.id,
          weight: effectiveSettings.popularity && section.popularity?.trustworthy === true ? popularityWeight(section.popularity) : 1,
          occurrences: section.occurrences.map(occurrence => {
            if (locations.has(occurrence.id)) throw new TypeError(`occurrence appears in multiple sections: ${occurrence.id}`);
            locations.add(occurrence.id);
            const sourceId = id(occurrence.sourceId ?? occurrence.id, 'sourceId');
            return { id: occurrence.id, sourceId, familiar: isFamiliar(sourceId), weight: 1 };
          }).sort(compare),
        };
      }).sort(compare),
    };
  }).sort(compare);
  const hasFresh = groups.some(song => song.sections.some(section => section.occurrences.some(occurrence => !occurrence.familiar)));
  if (assessment && hasFresh) groups = groups.map(song => ({ ...song, sections: song.sections.map(section => ({ ...section, occurrences: section.occurrences.filter(occurrence => !occurrence.familiar) })) }));
  groups = groups.map(song => ({ ...song, sections: song.sections.filter(section => section.occurrences.length) })).filter(song => song.sections.length);
  const supportedOccurrenceId = !assessment && context.supportedOccurrenceId != null ? context.supportedOccurrenceId : null;
  const selectionContext = {
    selectorVersion: SELECTOR_VERSION, seed, effectiveSettings, snapshotId, popularitySnapshotId,
    assessment, freshPoolApplied: assessment && hasFresh, supportedOccurrenceId,
    // Final candidate weights and source identities make replay independent of mutable history/popularity.
    groups, candidateFingerprint: fingerprint(groups),
  };
  return { ...replaySelection(selectionContext), selectionContext };
}

export function replaySelection(selectionContext) {
  const { groups, seed, supportedOccurrenceId } = selectionContext;
  // v1 contexts already materialize familiar flags and weights; replay must retain their old result.
  if (!['aural-selector-1', SELECTOR_VERSION].includes(selectionContext.selectorVersion)) throw new TypeError('unsupported selector version');
  if (fingerprint(groups) !== selectionContext.candidateFingerprint) throw new TypeError('candidate context hash mismatch');
  const random = xorshift32(seed);
  if (!groups.length) return { selection: null, fallbackReason: 'no_eligible_occurrences', draws: [] };
  if (supportedOccurrenceId != null && !selectionContext.assessment) {
    for (const song of groups) for (const section of song.sections) {
      const occurrence = section.occurrences.find(item => item.id === supportedOccurrenceId);
      if (occurrence) return { selection: selection(song, section, occurrence), reused: true, draws: [], fallbackReason: null };
    }
  }
  const draws = [];
  const draw = () => { const value = random(); draws.push(value); return value; };
  const song = choose(groups, draw);
  const section = choose(song.sections, draw);
  const occurrence = choose(section.occurrences, draw);
  return { selection: selection(song, section, occurrence), reused: false, draws, fallbackReason: null };
}

function selection(song, section, occurrence) {
  return { songId: song.id, sectionId: section.id, occurrenceId: occurrence.id, sourceId: occurrence.sourceId, familiar: occurrence.familiar };
}
