/**
 * Alternative-entry lookup for broken/unplayable songs.
 *
 * One Meilisearch query per song against Hooktheory's own first-party search
 * index (the same index their site's search page uses) — reuses the existing
 * rate-limited, auth-cached client in meiliClient.js. This never scrapes or
 * crawls; it's a single lightweight lookup per song.
 */

const { searchWithAuth } = require('./meiliClient');
const { slugify, slugForUrl, buildTheoryTabUrl } = require('./catalogUtils');

// Independent thresholds, not a blended average: a candidate must be a plausible
// match on BOTH artist and title. An average lets a same-artist/different-song
// hit (e.g. another track by the same band) sneak through on artist strength
// alone, which isn't what "alternative entry for this song" means.
//
// Title matching needs two agreeing signals, not one: char-level similarity
// alone is fooled by titles sharing a long common prefix (e.g. two tracks
// from the same soundtrack/album, "Game Name - Track A" vs "Game Name -
// Track B" — most characters match even though the actual song differs).
// Word-overlap (Jaccard) alone is fooled the same way in the other
// direction. Requiring both keeps genuine near-duplicates (typos, "The "
// dropped, punctuation) while rejecting same-series/different-song hits.
// Word-overlap is the primary title gate, not char-similarity: char
// similarity is fooled by "templated" titles from the same soundtrack/album
// ("Mega Man 5 - Gravity Man Stage" vs "... Dark Man Stage" score ~0.85 on
// char-similarity despite being different songs, because most characters in
// the shared template match). Word-overlap on the same pairs tops out
// ~0.71, cleanly separated from genuine reformats (dropped "The", punctuation
// changes) which score ~0.8+. Char-similarity is kept only as a secondary
// ranking signal, not a hard gate.
const MIN_ARTIST_SCORE = 0.75;
const MIN_TITLE_WORD_SCORE = 0.75;
const MAX_CANDIDATES = 3;

// Artist is NOT an unconditional gate. Hooktheory re-attributes entries (a
// game soundtrack filed under "nintendo" reappears under "Koji Kondo"), so
// requiring artist similarity hides genuine relocations. But dropping it
// entirely lets generic one-word titles collide across unrelated artists
// ("Home" by anyone matches "Home" by anyone). So a candidate qualifies via
// EITHER path:
//   1. same artist  — a retitle within one artist's catalogue, or
//   2. a long, distinctive title match — strong enough to carry a re-attribution.
const DISTINCTIVE_TITLE_WORD_SCORE = 0.85;
const DISTINCTIVE_TITLE_MIN_WORDS = 3;

/** Levenshtein edit distance. */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const row = new Array(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      row[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, row[j], row[j - 1]);
      prev = tmp;
    }
  }
  return row[n];
}

/** 0..1 similarity ratio (1 = identical). */
function stringSimilarity(a, b) {
  const sa = String(a || '');
  const sb = String(b || '');
  const maxLen = Math.max(sa.length, sb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(sa, sb) / maxLen;
}

/** 0..1 word-overlap ratio of two hyphen-slugs (1 = identical word sets). */
function wordOverlap(slugA, slugB) {
  const setA = new Set(String(slugA || '').split('-').filter(Boolean));
  const setB = new Set(String(slugB || '').split('-').filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection += 1;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Search Hooktheory's Meilisearch index for a possible alternative entry.
 * Returns up to MAX_CANDIDATES candidates sorted by score desc, excluding
 * the original song's own slug.
 */
async function searchAlternative({ slug, artist, title }) {
  // Title-only query: searching "<artist> <title>" biases Meilisearch toward
  // the old (possibly wrong) attribution and hurts recall on relocated entries.
  const query = (title || '').trim() || (artist || '').trim();
  if (!query) return [];

  const json = await searchWithAuth({
    q: query,
    limit: 20,
    attributesToRetrieve: ['artist', 'song', 'id'],
  });
  const hits = json.hits || [];

  const targetArtist = slugify(artist);
  const targetTitle = slugify(title);

  const scored = [];
  const seenSlugs = new Set();
  for (const hit of hits) {
    if (!hit.artist || !hit.song) continue;
    const candidateUrl = buildTheoryTabUrl(hit.artist, hit.song);
    const candidateSlug = slugForUrl(candidateUrl);
    if (candidateSlug === slug || seenSlugs.has(candidateSlug)) continue;
    seenSlugs.add(candidateSlug);

    const candidateTitleSlug = slugify(hit.song);
    const artistScore = stringSimilarity(slugify(hit.artist), targetArtist);
    const titleCharScore = stringSimilarity(candidateTitleSlug, targetTitle);
    const titleWordScore = wordOverlap(candidateTitleSlug, targetTitle);

    if (titleWordScore < MIN_TITLE_WORD_SCORE) continue;

    const sameArtist = artistScore >= MIN_ARTIST_SCORE;
    const distinctiveTitle = titleWordScore >= DISTINCTIVE_TITLE_WORD_SCORE
      && targetTitle.split('-').filter(Boolean).length >= DISTINCTIVE_TITLE_MIN_WORDS;
    if (!sameArtist && !distinctiveTitle) continue;

    scored.push({
      artist: hit.artist,
      title: hit.song,
      url: candidateUrl,
      slug: candidateSlug,
      score: titleCharScore * 0.6 + titleWordScore * 0.2 + artistScore * 0.2,
      artistScore,
      titleCharScore,
      titleWordScore,
      // Flags the re-attribution path so review can eyeball those specifically.
      reattributed: !sameArtist,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_CANDIDATES);
}

module.exports = {
  MIN_ARTIST_SCORE,
  MIN_TITLE_WORD_SCORE,
  DISTINCTIVE_TITLE_WORD_SCORE,
  MAX_CANDIDATES,
  levenshtein,
  stringSimilarity,
  wordOverlap,
  searchAlternative,
};
