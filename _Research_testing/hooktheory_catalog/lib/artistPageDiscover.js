/**
 * Per-artist page enumeration.
 *
 * Rationale: 64% of artists in our catalog have exactly one song — the
 * signature of search-driven discovery missing the long tail. An artist's own
 * page lists all of their TheoryTabs, so one request per known artist should
 * surface songs Meilisearch never ranked high enough to reach.
 *
 * The URL pattern is NOT assumed. detectArtistUrlPattern() probes a handful of
 * plausible shapes against a known-dense artist and only proceeds if one
 * actually returns that artist's song links — otherwise the sweep aborts
 * rather than generating thousands of 404s.
 */

const { fetchHtml } = require('./api/hooktheoryApi');
const { normalizeTheoryTabUrl, isJunkUrl, slugify } = require('./catalogUtils');
const { canonicalizeTheoryTabUrl, isScratchUpload } = require('./waybackDiscover');
const { sleep, withRetry, classifyError, CircuitBreaker } = require('./runGuard');

const BASE = 'https://www.hooktheory.com';

const CANDIDATE_PATTERNS = [
  (a) => `${BASE}/theorytab/artist/${a}`,
  (a) => `${BASE}/theorytab/artists/${a}`,
  (a) => `${BASE}/theorytab/view/${a}`,
  (a) => `${BASE}/artist/${a}`,
];

/**
 * Pull every /theorytab/view/<artist>/<title> link out of a page, canonicalized
 * to the same slug form the catalog stores. Returns [{slug, url}].
 *
 * Canonicalization is not cosmetic: live pages emit percent-encoded paths
 * (`.../advanced-card-game-%28pop%29`), which compare as "missing" against our
 * decoded slugs and would inject thousands of duplicate rows.
 */
function extractSongUrls(html) {
  const out = new Map();
  const re = /\/theorytab\/view\/([^/"'?#\s]+)\/([^/"'?#\s]+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = normalizeTheoryTabUrl(`/theorytab/view/${m[1]}/${m[2]}`);
    if (!raw || isJunkUrl(raw)) continue;
    const canon = canonicalizeTheoryTabUrl(raw);
    if (!canon || canon.rejected) continue;
    if (!out.has(canon.slug)) out.set(canon.slug, { slug: canon.slug, url: canon.url });
  }
  return [...out.values()];
}

/**
 * Probe candidate URL shapes against a dense artist. A pattern only counts if
 * the page actually contains multiple song links for THAT artist — a 200 with
 * no links is a soft-404 or a redirect to the homepage.
 */
async function detectArtistUrlPattern(probeArtistSlug, { minLinks = 3, log = () => {} } = {}) {
  for (const build of CANDIDATE_PATTERNS) {
    const url = build(probeArtistSlug);
    try {
      const html = await fetchHtml(url);
      const links = extractSongUrls(html);
      const own = links.filter((l) => l.slug.startsWith(`${probeArtistSlug}__`));
      log(`  probe ${url} -> HTTP ok, ${links.length} song links (${own.length} for this artist)`);
      if (own.length >= minLinks) return build;
    } catch (err) {
      log(`  probe ${url} -> ${classifyError(err)}: ${err.message}`);
    }
    await sleep(2000);
  }
  return null;
}

/**
 * Walk every artist, collecting song URLs we don't already hold.
 * Checkpoints through onProgress so a restart can resume mid-sweep.
 */
async function sweepArtists(artistSlugs, buildUrl, {
  knownSlugs,
  intervalMs = 1200,
  jitterMs = 400,
  startIndex = 0,
  onProgress = null,
  onFound = null,
  log = () => {},
  shouldStop = () => false,
} = {}) {
  const breaker = new CircuitBreaker({
    threshold: 12,
    cooldownMs: 10 * 60 * 1000,
    maxTrips: 6,
    onEvent: (e) => log(`  [breaker] ${e.type} trips=${e.trips}${e.cooldownMs ? ` cooldown=${Math.round(e.cooldownMs / 1000)}s` : ''}`),
  });

  const found = [];
  let checked = 0;
  let failed = 0;

  let skipped = 0;

  for (let i = startIndex; i < artistSlugs.length; i++) {
    if (shouldStop()) { log('  stop requested — halting artist sweep'); break; }
    const artist = artistSlugs[i];

    // Throwaway numeric/scratch artist handles return HTTP 500 from the artist
    // page (observed for "01"). Skipping them locally avoids burning requests
    // and avoids tripping the circuit breaker on failures that aren't our fault.
    if (isScratchUpload(artist, '')) { skipped += 1; continue; }

    try {
      const html = await withRetry(() => fetchHtml(buildUrl(artist)), {
        retries: 3,
        onRetry: (r) => log(`  retry ${artist} (${r.kind}) wait=${Math.round(r.waitMs / 1000)}s`),
      });
      breaker.recordSuccess();
      checked += 1;

      for (const { slug, url } of extractSongUrls(html)) {
        if (knownSlugs.has(slug)) continue;
        knownSlugs.add(slug);
        found.push({ slug, url, viaArtist: artist });
        onFound?.({ slug, url, viaArtist: artist });
      }
    } catch (err) {
      const kind = classifyError(err);
      failed += 1;
      if (kind !== 'permanent') log(`  fail ${artist}: ${kind} ${err.message}`);
      const action = breaker.recordFailure(kind);
      if (action === 'cooldown') {
        const ms = breaker.cooldownFor();
        log(`  cooling down ${Math.round(ms / 60000)}min after repeated failures`);
        await sleep(ms);
      } else if (action === 'give-up') {
        log('  too many circuit trips — aborting artist sweep to avoid hammering the host');
        onProgress?.({ index: i, checked, failed, found: found.length, abort: true });
        break;
      }
    }

    if (i % 25 === 0) onProgress?.({ index: i, checked, failed, found: found.length });
    await sleep(Math.max(600, intervalMs + (Math.random() * jitterMs * 2 - jitterMs)));
  }

  onProgress?.({ index: artistSlugs.length, checked, failed, skipped, found: found.length, done: true });
  return { found, checked, failed, skipped };
}

module.exports = {
  CANDIDATE_PATTERNS,
  extractSongUrls,
  detectArtistUrlPattern,
  sweepArtists,
};
