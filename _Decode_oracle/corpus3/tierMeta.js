/**
 * Complexity tier definitions for corpus3 (500 songs, increasing difficulty).
 *
 * tier 1–5 coarse buckets; complexityRank 1–500 fine ordering within corpus.
 */

const TIERS = [
  {
    tier: 1,
    label: 'basic triads',
    note: 'I-IV-V, I-V-vi-IV, diatonic triads, no extensions',
    rankStart: 1,
    rankEnd: 100,
    count: 100,
  },
  {
    tier: 2,
    label: 'sevenths / sus / inversions',
    note: '7ths, sus2/4, add chords, simple inversions',
    rankStart: 101,
    rankEnd: 200,
    count: 100,
  },
  {
    tier: 3,
    label: 'applied / secondary dominants',
    note: 'V/V, V/ii, chromatic approach, applied sevenths',
    rankStart: 201,
    rankEnd: 300,
    count: 100,
  },
  {
    tier: 4,
    label: 'borrowed / modal / suspensions',
    note: 'mode mixture, dorian/phrygian, sus+alt, power chords',
    rankStart: 301,
    rankEnd: 400,
    count: 100,
  },
  {
    tier: 5,
    label: 'jazz / extended / chromatic',
    note: 'ii-V-I chains, 9/11/13, alterations, classical chromaticism',
    rankStart: 401,
    rankEnd: 500,
    count: 100,
  },
];

function tierForRank(rank) {
  return TIERS.find((t) => rank >= t.rankStart && rank <= t.rankEnd) || TIERS[TIERS.length - 1];
}

module.exports = { TIERS, tierForRank };
