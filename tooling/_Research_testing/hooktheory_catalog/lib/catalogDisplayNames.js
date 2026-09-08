const fs = require('fs');
const entities = require('./htmlDisplayEntities.json');

// Display-only decoding. Never feed this text back into URL/identity generation.
function normalizeDisplayText(value) {
  let text = String(value ?? '');
  let previous;
  do {
    previous = text;
    text = text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (whole, key) => {
      if (key[0] !== '#') return entities[key] ?? whole;
      const code = /^#x/i.test(key) ? parseInt(key.slice(2), 16) : Number(key.slice(1));
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code) : whole;
    });
  } while (text !== previous);
  return text.normalize('NFC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b\ufeff]/g, '')
    .replace(/\s+/gu, ' ').trim();
}

function fallbackDisplayName(value) {
  const text = normalizeDisplayText(value);
  if (!text) return '';
  // Preserve readable source punctuation and intentional mixed/all-uppercase text.
  if (text !== text.toLocaleLowerCase('en-US')) return text;
  return text.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/(^|[^\p{L}\p{N}'’])(\p{L})/gu, (_, separator, letter) => separator + letter.toLocaleUpperCase('en-US'));
}

function isDerivedName(value, slugValue) {
  const text = normalizeDisplayText(value);
  const slug = normalizeDisplayText(slugValue);
  return !text || text === slug || text === slug.replace(/[-_]+/g, ' ')
    || (text === text.toLocaleLowerCase('en-US') && /^[\p{L}\p{N}\s_().-]+$/u.test(text));
}

function preferDisplayName(existing, candidate, slugValue) {
  const oldName = normalizeDisplayText(existing);
  const newName = normalizeDisplayText(candidate);
  if (!newName) return oldName;
  if (!oldName) return newName;
  return !isDerivedName(oldName, slugValue) && isDerivedName(newName, slugValue) ? oldName : newName;
}

function isObviousSlug(value, field) {
  const text = normalizeDisplayText(value);
  // Lowercase alone is not evidence of a slug: boygenius and girl in red are
  // source display names. Preserve artist spellings such as blink-182 as well.
  if (field === 'artist' && /^[\p{L}]+-[\p{N}]+$/u.test(text)) return false;
  return !/\s/u.test(text) && /[-_]/u.test(text)
    && text === text.toLocaleLowerCase('en-US')
    && /^[\p{L}\p{N}_().-]+$/u.test(text);
}

function loadDisplayNameMap(filePath) {
  if (!filePath) return new Map();
  const document = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (document.version !== 1 || !document.songs || Array.isArray(document.songs)) {
    throw new Error('Expected a version 1 display-name document with a songs object');
  }
  const result = new Map();
  for (const [slug, names] of Object.entries(document.songs)) {
    if (!slug || typeof names.artist !== 'string' || typeof names.title !== 'string'
        || !normalizeDisplayText(names.artist) || !normalizeDisplayText(names.title)) {
      throw new Error(`Invalid display names for ${slug}`);
    }
    result.set(slug, names);
  }
  return result;
}

function resolveDisplayNames(song, { namesBySlug = new Map(), fallback = {} } = {}) {
  const override = namesBySlug.get(song.slug);
  const parts = String(song.slug || '').split('__');
  const resolve = (field, slug) => {
    if (override?.[field]) return normalizeDisplayText(override[field]);
    const supplied = normalizeDisplayText(song[field]);
    // Catalog artists take priority over potentially stale cache labels even
    // when the artist intentionally uses lowercase. API title metadata still
    // upgrades a legacy title reconstructed from a URL.
    const best = supplied && (song.display_name_source || (field === 'artist' && !isObviousSlug(supplied, field)))
      ? supplied : preferDisplayName(fallback[field], supplied, slug);
    if (!best) return fallbackDisplayName(slug);
    return isObviousSlug(best, field) ? fallbackDisplayName(best) : normalizeDisplayText(best);
  };
  return { artist: resolve('artist', parts[0]) || 'Unknown Artist', title: resolve('title', parts.slice(1).join('__')) || 'Unknown Title' };
}

module.exports = { normalizeDisplayText, fallbackDisplayName, preferDisplayName, resolveDisplayNames, loadDisplayNameMap };
