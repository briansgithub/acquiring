'use strict';

const { sha256String } = require('./hash');

const VERSION_QUALIFIER = /\b(?:acoustic|album|alternate|anniversary|clean|demo|edit|extended|instrumental|karaoke|live|mix|mono|orchestral|radio|remaster(?:ed)?|re-recorded|remix|single|stereo|version)\b/i;

function foldText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/[‐‑‒–—]/g, '-')
    .toLowerCase()
    .trim();
}

function normalizeWords(value) {
  return foldText(value)
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeArtist(value) {
  const folded = foldText(value)
    .replace(/\s+(?:feat(?:uring)?\.?|ft\.?|with)\s+.+$/i, '');
  return normalizeWords(folded);
}

function stripVersionQualifiers(value) {
  let result = foldText(value);
  result = result.replace(/\s*[\[(]([^\])]+)[\])]\s*$/g, (whole, inner) => (
    VERSION_QUALIFIER.test(inner) ? '' : whole
  ));
  result = result.replace(/\s+-\s+([^\-]+)$/g, (whole, suffix) => (
    VERSION_QUALIFIER.test(suffix) ? '' : whole
  ));
  return result;
}

function normalizeTitle(value) {
  return normalizeWords(stripVersionQualifiers(value));
}

function compositionIdentity({ artist, title, slug }) {
  const canonicalArtist = normalizeArtist(artist);
  const canonicalTitle = normalizeTitle(title);
  const fallback = normalizeWords(slug) || 'unknown';
  const canonicalKey = canonicalArtist && canonicalTitle
    ? `${canonicalArtist}\u001f${canonicalTitle}`
    : `fallback\u001f${fallback}`;

  return {
    canonicalArtist,
    canonicalTitle,
    canonicalKey,
    groupId: sha256String(`composition-v1\0${canonicalKey}`),
    usedFallback: !(canonicalArtist && canonicalTitle),
  };
}

module.exports = {
  compositionIdentity,
  foldText,
  normalizeArtist,
  normalizeTitle,
  normalizeWords,
  stripVersionQualifiers,
};
