/**
 * URL/slug helpers for TheoryTab catalog.
 */

const BASE = 'https://www.hooktheory.com';

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[''´`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function slugForUrl(url) {
  const m = String(url).match(/theorytab\/view\/([^/]+)\/([^/?#]+)/);
  const raw = m ? `${m[1]}__${m[2]}` : String(url).replace(/[^a-z0-9]+/gi, '_').slice(0, 60);
  return raw.replace(/[:*?"<>|]/g, '-');
}

function parseTheoryTabUrl(url) {
  const m = String(url).match(/theorytab\/view\/([^/]+)\/([^/?#]+)/);
  if (!m) return null;
  const artistSlug = m[1];
  const titleSlug = m[2];
  return {
    artist_slug: artistSlug,
    title_slug: titleSlug,
    artist: artistSlug.replace(/-/g, ' '),
    title: titleSlug.replace(/-/g, ' '),
    slug: slugForUrl(url),
    url: url.split('#')[0],
  };
}

function buildTheoryTabUrl(artist, song) {
  const artistSlug = slugify(artist);
  const titleSlug = slugify(song);
  return `${BASE}/theorytab/view/${artistSlug}/${titleSlug}`;
}

function normalizeTheoryTabUrl(href) {
  if (!href) return null;
  const full = href.startsWith('http') ? href : `${BASE}${href.startsWith('/') ? '' : '/'}${href}`;
  const m = full.match(/theorytab\/view\/([^/?#]+)\/([^/?#]+)/);
  if (!m) return null;
  return `${BASE}/theorytab/view/${m[1]}/${m[2]}`;
}

function isJunkUrl(url) {
  const m = String(url).match(/theorytab\/view\/([^/]+)\/([^/?#]+)/);
  if (!m) return true;
  const [, artist, title] = m;
  if (/[()]/.test(artist) || /test-?\d|hookpad|tutorial|major-scales|minor-scales/i.test(title)) return true;
  if (/^\d+$/.test(title) && title.length < 4) return true;
  if (artist.startsWith('_') || title.startsWith('_')) return true;
  if (/[:*?"<>|]/.test(title)) return true;
  return false;
}

module.exports = {
  BASE,
  slugify,
  slugForUrl,
  parseTheoryTabUrl,
  buildTheoryTabUrl,
  normalizeTheoryTabUrl,
  isJunkUrl,
};
