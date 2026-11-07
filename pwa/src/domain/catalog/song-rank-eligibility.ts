import type { AuralSongRankApi, AuralSongRankFragment, AuralSongRankInput } from './song-rank-contracts';

const ROW_MAX = 10_000, TEXT_MAX = 8 * 1024 * 1024;

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected object');
  return value as Record<string, unknown>;
}
function integer(value: unknown, low: number, high: number): number {
  if (typeof value !== 'number') throw new TypeError('Expected number');
  if (!Number.isInteger(value) || value < low || value > high) throw new RangeError('Integer out of range');
  return value === 0 ? 0 : value;
}
function strings() {
  let total = 0;
  return (value: unknown): string => {
    if (typeof value !== 'string') throw new TypeError('Expected string');
    total += value.length;
    if (value.length > 4096 || total > TEXT_MAX) throw new RangeError('Text budget exceeded');
    return value;
  };
}
function array<T>(value: unknown, copy: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new TypeError('Expected array');
  const length = value.length;
  integer(length, 0, ROW_MAX);
  const result: T[] = [];
  for (let i = 0; i < length; i++) result.push(copy(value[i]));
  return result;
}
function snapshot(input: AuralSongRankInput) {
  const value = object(input), text = strings();
  const songByRank = array(value.songByRank, text);
  const validSongIds = array(value.validSongIds, text);
  const popularity = array(value.popularity, item => {
    const row = object(item), songId = text(row.songId), raw = row.score;
    let score: number | null;
    if (raw === null) score = null;
    else if (typeof raw !== 'number') throw new TypeError('Expected number');
    else if (!Number.isFinite(raw)) throw new RangeError('Expected finite number');
    else score = raw;
    return { songId, score };
  });
  const percent = integer(value.percent, 0, 100);
  const valid = new Set(validSongIds);
  const scores = new Map<string, number | null>();
  for (const row of popularity) {
    if (scores.has(row.songId)) throw new RangeError('Duplicate popularity ID');
    scores.set(row.songId, row.score);
  }
  return { songByRank, valid, scores, percent };
}
function qualifies(song: string, valid: Set<string>, scores: Map<string, number | null>, percent: number): boolean {
  if (!valid.has(song)) return false;
  const score = scores.get(song);
  return score != null && score >= 0 && score <= 1 && score >= percent / 100;
}

/** Frozen 801cf798 AuralCatalog.eligibleRankBits 186..195 / helper 33..37 / Corpus83. */
export function buildAuralSongRankFragment(input: AuralSongRankInput): AuralSongRankFragment {
  const s = snapshot(input);
  const rankCount = s.songByRank.length;
  const words: number[] = new Array((rankCount + 31) >> 5).fill(0);
  for (let rank = 0; rank < rankCount; rank++) {
    if (qualifies(s.songByRank[rank]!, s.valid, s.scores, s.percent)) {
      words[rank >>> 5] = (words[rank >>> 5]! | (1 << (rank & 31))) >>> 0;
    }
  }
  return Object.freeze({ rankCount, words: Object.freeze(words) });
}
export const auralSongRankApi: AuralSongRankApi = Object.freeze({ buildAuralSongRankFragment });
