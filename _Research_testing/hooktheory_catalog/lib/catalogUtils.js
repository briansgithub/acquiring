/**
 * URL/slug helpers for TheoryTab catalog.
 */

const BASE = 'https://www.hooktheory.com';

/**
 * Catalog-internal identity key. Deliberately lossy: it collapses every run of
 * non-alphanumerics to one hyphen so `foo-(bar)`, `foo--bar` and `foo-bar` all
 * name the same song and can't enter the catalog as three rows.
 *
 * This is NOT Hooktheory's slug rule and must never be used to build a URL we
 * intend to fetch. Hooktheory keeps punctuation their paths — the real page for
 * "The World Without Logos (Hellsing Opening)" lives at
 * `.../the-world-without-logos-(hellsing-opening)`, which this function cannot
 * reproduce. 13% of the real URLs the Wayback index has recorded are unbuildable
 * from here. When a ground-truth path is available (archived URL, artist-page
 * href, add-by-URL), keep that path for the URL and use this only for the key.
 */
function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[''´`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Build a TheoryTab URL from real, already-decoded path segments — the shape to
 * use whenever the segments came from a source that observed them (as opposed
 * to being synthesized from display text by slugify).
 *
 * encodeURIComponent leaves `( ) . - _ ~ ! *` alone, which is what Hooktheory
 * itself serves, and escapes the characters that would otherwise break the
 * path (`? # % /`).
 */
function theoryTabUrlFromPath(artistPath, titlePath) {
  const enc = (s) => encodeURIComponent(String(s || '')).replace(/%20/g, '-');
  return `${BASE}/theorytab/view/${enc(artistPath)}/${enc(titlePath)}`;
}

function slugForUrl(url) {
  const m = String(url).match(/theorytab\/view\/([^/]+)\/([^/?#]+)/);
  const raw = m ? `${m[1]}__${m[2]}` : String(url).replace(/[^a-z0-9]+/gi, '_').slice(0, 60);
  return raw.replace(/[:*?"<>|]/g, '-');
}

/**
 * Split a TheoryTab URL into the catalog row it describes.
 *
 * The key fields are slugified from the DECODED segments so that a real path
 * (`.../starstrukk-(feat.-katy-perry)`) keys to the same row as a synthesized
 * one, while `url` keeps the path exactly as observed — that URL is what we
 * later fetch, and re-deriving it from the key is what made 13% of real pages
 * unreachable.
 */
function parseTheoryTabUrl(url) {
  const m = String(url).match(/theorytab\/view\/([^/]+)\/([^/?#]+)/);
  if (!m) return null;
  const dec = (s) => { try { return decodeURIComponent(s); } catch (_) { return s; } };
  const artistPath = dec(m[1]);
  const titlePath = dec(m[2]);
  const artistSlug = slugify(artistPath);
  const titleSlug = slugify(titlePath);
  if (!artistSlug || !titleSlug) return null;
  return {
    artist_slug: artistSlug,
    title_slug: titleSlug,
    artist: artistPath.replace(/-/g, ' '),
    title: titlePath.replace(/-/g, ' '),
    slug: `${artistSlug}__${titleSlug}`,
    url: url.split('#')[0],
  };
}

/**
 * Hooktheory's own slug rule, reconstructed from ground truth: 35,603 pairs of
 * (song_details.hooktheory_song_name, the title_slug that actually fetched).
 * It reproduces 99.99% of them, against 99.94% for slugify() — and unlike
 * slugify() it is right about the punctuation classes that were failing:
 * parentheses and dots survive, " - " stays three hyphens.
 *
 * Character behaviour, all measured rather than assumed:
 *   apostrophes  dropped        don't      -> dont
 *   whitespace   -> '-'         a b        -> a-b
 *   ( ) . _ ~ -  kept           foo (bar)  -> foo-(bar)
 *   /            -> '-slash-'   10/10      -> 10-slash-10
 *   &            -> '-and-'     A&W        -> a-and-w
 *   $            -> 's'         chanel$    -> chanels
 *   , ! : ; etc  dropped        Lights, C  -> lights-c
 *
 * HTML entities are deliberately NOT decoded: Hooktheory stores some titles
 * with the entity text intact, so "A&amp;E" really does live at "a-and-ampe".
 *
 * Still a guess, not an observation — only for sources that hand us display
 * text and no URL. Prefer theoryTabUrlFromPath() whenever a path was observed.
 */
function hooktheorySlug(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[''´`]/g, '')
    .replace(/\//g, '-slash-')
    .replace(/&/g, '-and-')
    .replace(/\$/g, 's')
    .replace(/[^a-z0-9().~_\s-]/g, '')
    .replace(/\s/g, '-');
}

/**
 * Synthesize a URL from display text, for sources that carry no URL of their
 * own (a Meilisearch hit is artist + song strings and nothing else).
 */
function buildTheoryTabUrl(artist, song) {
  return theoryTabUrlFromPath(hooktheorySlug(artist), hooktheorySlug(song));
}

function normalizeTheoryTabUrl(href) {
  if (!href) return null;
  const full = href.startsWith('http') ? href : `${BASE}${href.startsWith('/') ? '' : '/'}${href}`;
  const m = full.match(/theorytab\/view\/([^/?#]+)\/([^/?#]+)/);
  if (!m) return null;
  return `${BASE}/theorytab/view/${m[1]}/${m[2]}`;
}

/**
 * Reject paths that aren't songs. Judged on the DECODED segments, because a
 * real URL now reaches here percent-encoded.
 *
 * Two former rules are gone: they rejected songs that exist.
 *  - parentheses in the artist segment — that's how Hooktheory writes real
 *    acts: (G)I-DLE, (Sandy) Alex G, -(chk chk chk)-. 86 artists in the
 *    archived index were being discarded outright.
 *  - `[:*?"<>|]` in the title — a Windows *filename* constraint applied to URL
 *    validity, dropping another 75 real titles. Filename safety is already
 *    handled where it belongs, in slugForUrl().
 */
function isJunkUrl(url) {
  const m = String(url).match(/theorytab\/view\/([^/]+)\/([^/?#]+)/);
  if (!m) return true;
  const dec = (s) => { try { return decodeURIComponent(s); } catch (_) { return s; } };
  const artist = dec(m[1]);
  const title = dec(m[2]);
  if (/test-?\d|hookpad|tutorial|major-scales|minor-scales/i.test(title)) return true;
  if (/^\d+$/.test(title) && title.length < 4) return true;
  if (artist.startsWith('_') || title.startsWith('_')) return true;
  return false;
}

module.exports = {
  BASE,
  slugify,
  hooktheorySlug,
  slugForUrl,
  parseTheoryTabUrl,
  buildTheoryTabUrl,
  theoryTabUrlFromPath,
  normalizeTheoryTabUrl,
  isJunkUrl,
};
