/**
 * Discover TheoryTab songs via the Internet Archive's CDX index.
 *
 * Why this channel exists: Hooktheory's own Meilisearch index is a near-complete
 * ceiling (~40,267 songs) and query diversification provably cannot get past it.
 * The Wayback Machine independently recorded TheoryTab URLs over many years,
 * including songs our Meili-sourced catalog never saw (99.97% of our catalog
 * came from that single source). Crucially, enumerating candidates here costs
 * hooktheory.com ZERO requests — we only touch their servers to harvest
 * candidates that survive local filtering and aren't already in our DB.
 */

const fs = require('fs');
const path = require('path');
const catalogConfig = require('./catalogConfig');
const { slugify, buildTheoryTabUrl, isJunkUrl } = require('./catalogUtils');

const CDX_BASE = 'http://web.archive.org/cdx/search/cdx';
const CDX_TARGET = 'hooktheory.com/theorytab/view*';
const CDX_INTERVAL_MS = Number(process.env.WAYBACK_CDX_INTERVAL_MS || 1500);

/**
 * Path segments that are site assets mis-recorded as songs by archive crawlers
 * (relative-link resolution artifacts). Measured against a 30,760-URL sample:
 * svg=535, src=333, library-v04.xml=118, jToggle.html=108, refund-policy=91,
 * contact=78 — each appearing under many different "artists".
 */
const ASSET_ARTIFACT_TITLES = new Set([
  'svg', 'src', 'library-v04-xml', 'jtoggle-html', 'refund-policy', 'contact',
  'privacy-policy', 'terms', 'about', 'login', 'signup', 'index', 'undefined', 'null',
]);

/**
 * Scratch/placeholder uploads that exist on the site but aren't songs.
 * catalogUtils.isJunkUrl() catches test-\d / hookpad / scale exercises; these
 * are the additional patterns the archive surfaced. Filtering them locally is
 * the difference between spending a request and not — the whole point of
 * discovering candidates offline first.
 */
const SCRATCH_PATTERNS = [
  /temporary-theorytab/i,
  /glitched/i,
  /reupload\d*/i,
  /^melody-in-/i,
  /custom-arrangement/i,
  /^(untitled|no-name|new-song|asdf|qwerty|delete-me|scratch)/i,
];

function isScratchUpload(artistSlug, titleSlug) {
  if (SCRATCH_PATTERNS.some((re) => re.test(titleSlug) || re.test(artistSlug))) return true;
  // Numeric-only artist handles ("001", "01") are throwaway accounts; the
  // existing isJunkUrl only rejects short numeric *titles*, not artists.
  if (/^\d{1,4}$/.test(artistSlug)) return true;
  return false;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch (_) {
    return s;
  }
}

/**
 * archive.org's CDX endpoint returns transient 5xx (commonly 504) under load.
 * Retry with backoff so a long multi-page pull isn't lost to one blip.
 */
async function cdxFetch(params, { retries = 4 } = {}) {
  const url = `${CDX_BASE}?${new URLSearchParams(params).toString()}`;
  let delay = 3000;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': catalogConfig.userAgent } });
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(delay);
      delay = Math.min(delay * 2, 60000);
      continue;
    }
    if (res.ok) return res.text();
    if (res.status >= 500 || res.status === 429) {
      if (attempt === retries) throw new Error(`CDX HTTP ${res.status} after ${retries} retries for ${url}`);
      await sleep(delay);
      delay = Math.min(delay * 2, 60000);
      continue;
    }
    throw new Error(`CDX HTTP ${res.status} for ${url}`);
  }
  throw new Error(`CDX retries exhausted for ${url}`);
}

/**
 * CDX only returns a bare page count for a plain query — combining
 * showNumPages with output=json/fl/collapse makes it emit JSON rows instead
 * (`[["original"],[null]]`), which silently parses to 0 and skips the pull.
 */
async function getPageCount() {
  const txt = await cdxFetch({ url: CDX_TARGET, showNumPages: 'true' });
  const n = Number(String(txt).trim());
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`CDX returned an unusable page count: ${JSON.stringify(String(txt).slice(0, 80))}`);
  }
  return n;
}

/**
 * Pull every CDX page into a newline-delimited cache file. Resumable: an
 * existing cache is reused and only missing pages are fetched, so a re-run
 * after an interruption doesn't re-download what we already have.
 */
async function pullAllCdx(cacheFile, { onProgress = null, force = false } = {}) {
  const donePagesFile = `${cacheFile}.pages`;
  let urls = new Set();
  let donePages = new Set();

  if (!force && fs.existsSync(cacheFile)) {
    urls = new Set(fs.readFileSync(cacheFile, 'utf8').split('\n').filter(Boolean));
    if (fs.existsSync(donePagesFile)) {
      donePages = new Set(JSON.parse(fs.readFileSync(donePagesFile, 'utf8')));
    }
  }

  const pageCount = await getPageCount();
  onProgress?.({ stage: 'pagecount', pageCount, cachedUrls: urls.size, cachedPages: donePages.size });

  for (let page = 0; page < pageCount; page++) {
    if (donePages.has(page)) continue;
    const txt = await cdxFetch({
      url: CDX_TARGET, output: 'json', fl: 'original', collapse: 'urlkey', page: String(page),
    });
    let rows;
    try {
      rows = JSON.parse(txt);
    } catch (_) {
      rows = [];
    }
    for (const row of rows) {
      const u = Array.isArray(row) ? row[0] : row;
      if (u && u !== 'original') urls.add(u);
    }
    donePages.add(page);
    fs.writeFileSync(cacheFile, [...urls].join('\n'));
    fs.writeFileSync(donePagesFile, JSON.stringify([...donePages]));
    onProgress?.({ stage: 'page', page, pageCount, totalUrls: urls.size });
    await sleep(CDX_INTERVAL_MS);
  }

  return [...urls];
}

/** Parse an archived URL into our canonical slug + URL, or null if unusable. */
function parseArchivedUrl(rawUrl) {
  const m = String(rawUrl).match(/theorytab\/view\/([^/?#]+)\/([^/?#]+)/i);
  if (!m) return null;

  const artistRaw = safeDecode(m[1]);
  const titleRaw = safeDecode(m[2]);

  // Broken percent-encoding of non-ASCII names produces replacement chars;
  // the resulting slug would be a corrupt duplicate of a song we already hold
  // under its correctly-encoded slug, so drop it rather than fetch a bad URL.
  if (/[�?]/.test(artistRaw) || /[�?]/.test(titleRaw)) {
    return { rejected: 'mojibake' };
  }

  const artistSlug = slugify(artistRaw);
  const titleSlug = slugify(titleRaw);
  if (!artistSlug || !titleSlug) return { rejected: 'empty-segment' };
  if (ASSET_ARTIFACT_TITLES.has(titleSlug)) return { rejected: 'asset-artifact' };
  if (/\.(xml|html|json|js|css|png|jpg|svg)$/i.test(titleRaw)) return { rejected: 'asset-artifact' };
  if (isScratchUpload(artistSlug, titleSlug)) return { rejected: 'scratch-upload' };

  const url = buildTheoryTabUrl(artistRaw, titleRaw);
  return { slug: `${artistSlug}__${titleSlug}`, url, artistSlug, titleSlug };
}

/**
 * Reduce raw archived URLs to genuinely-new candidates.
 *
 * knownSlugs must contain EVERY slug in our songs table (not just playable
 * ones) — a slug we already hold as dead is a song we already answered, and
 * re-fetching it would spend requests re-confirming a known 404.
 */
function buildCandidates(rawUrls, knownSlugs) {
  const stats = {
    rawUrls: rawUrls.length,
    unparseable: 0,
    mojibake: 0,
    assetArtifact: 0,
    scratchUpload: 0,
    emptySegment: 0,
    junkFiltered: 0,
    alreadyKnown: 0,
    swapDuplicate: 0,
    candidates: 0,
  };
  const seen = new Set();
  const candidates = [];

  for (const rawUrl of rawUrls) {
    const parsed = parseArchivedUrl(rawUrl);
    if (!parsed) { stats.unparseable += 1; continue; }
    if (parsed.rejected === 'mojibake') { stats.mojibake += 1; continue; }
    if (parsed.rejected === 'asset-artifact') { stats.assetArtifact += 1; continue; }
    if (parsed.rejected === 'scratch-upload') { stats.scratchUpload += 1; continue; }
    if (parsed.rejected === 'empty-segment') { stats.emptySegment += 1; continue; }

    const { slug, url, artistSlug, titleSlug } = parsed;
    if (seen.has(slug)) continue;
    seen.add(slug);

    if (knownSlugs.has(slug)) { stats.alreadyKnown += 1; continue; }

    // Some archived URLs have artist/title reversed relative to the canonical
    // page. Measured at ~1.7% of not-in-DB slugs. Fetching these would 404 and
    // pollute the catalog with a bogus row for a song we already have.
    if (knownSlugs.has(`${titleSlug}__${artistSlug}`)) { stats.swapDuplicate += 1; continue; }

    if (isJunkUrl(url)) { stats.junkFiltered += 1; continue; }

    candidates.push({ slug, url, artistSlug, titleSlug });
  }

  stats.candidates = candidates.length;
  return { candidates, stats };
}

module.exports = {
  CDX_TARGET,
  ASSET_ARTIFACT_TITLES,
  getPageCount,
  pullAllCdx,
  parseArchivedUrl,
  /**
   * Same normalizer, named for the general case: any TheoryTab URL (archived,
   * or scraped from a live artist page) must be percent-decoded and slugified
   * before comparison, or `?foo-%28pop%29` reads as a song we don't have when
   * we already hold `foo-pop`.
   */
  canonicalizeTheoryTabUrl: parseArchivedUrl,
  isScratchUpload,
  buildCandidates,
};
