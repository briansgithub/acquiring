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
 * hooktheory.com answers a nonexistent ARTIST page with HTTP 500, not 404.
 * Confirmed by probe: `beatles` -> 500 while `the-beatles` -> 200, and
 * `one-republic` -> 500 while `onerepublic` -> 200. Our artist_slug values are
 * derived from display names, so any name carrying an accent, a leading "The",
 * or bracket/symbol characters ("f(x)", "Rosalía", "R.E.M.") yields a slug the
 * site has no page for.
 *
 * Left classified as transient this costs 4 requests and ~24s of backoff per
 * bad slug, and the failures count toward the circuit breaker — roughly 460 of
 * 12k artists, i.e. ~1.8k pointless requests and hours of sleeping. Treating it
 * as a soft 404 is both faster and materially kinder to the host.
 *
 * Deliberately scoped to artist-page fetches: a 500 from the harvest/fetch
 * endpoints really can be transient and must keep its retries.
 */
function isSoftNotFound(err) {
  const status = err?.status;
  if (status === 500) return true;
  return /\b500\b/.test(String(err?.message || ''));
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
  deadArtists = new Set(),
  onDeadArtist = null,
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
  // Where the loop actually got to, and whether it ran out of artists or bailed.
  // Reporting artistSlugs.length unconditionally at the end would record a
  // halted sweep as a finished one and strand every remaining artist.
  let lastIndex = startIndex;
  let interrupted = false;

  for (let i = startIndex; i < artistSlugs.length; i++) {
    lastIndex = i;
    if (shouldStop()) { log('  stop requested — halting artist sweep'); interrupted = true; break; }
    const artist = artistSlugs[i];

    // Throwaway numeric/scratch artist handles return HTTP 500 from the artist
    // page (observed for "01"). Skipping them locally avoids burning requests
    // and avoids tripping the circuit breaker on failures that aren't our fault.
    if (isScratchUpload(artist, '')) { skipped += 1; continue; }

    // Already proven to have no page — costs zero requests on a resumed sweep.
    if (deadArtists.has(artist)) { skipped += 1; continue; }

    try {
      const html = await withRetry(() => fetchHtml(buildUrl(artist)), {
        retries: 3,
        onRetry: (r) => log(`  retry ${artist} (${r.kind}) wait=${Math.round(r.waitMs / 1000)}s`),
        // A 500 here means "no such artist"; retrying it is pure waste.
        isPermanent: isSoftNotFound,
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
      // Soft 404: record it so a resume never re-probes, and keep it away from
      // the breaker — a run of nonexistent artists is expected, not a signal
      // that the host is unhappy with us.
      if (isSoftNotFound(err)) {
        failed += 1;
        deadArtists.add(artist);
        onDeadArtist?.(artist);
        breaker.recordFailure('permanent');
        if (i % 25 === 0) onProgress?.({ index: i, checked, failed, found: found.length });
        await sleep(Math.max(600, intervalMs + (Math.random() * jitterMs * 2 - jitterMs)));
        continue;
      }
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
        interrupted = true;
        break;
      }
    }

    if (i % 25 === 0) onProgress?.({ index: i, checked, failed, found: found.length });
    await sleep(Math.max(600, intervalMs + (Math.random() * jitterMs * 2 - jitterMs)));
  }

  // On a clean finish the next resume should start past the end; on an
  // interrupted one it must start at the artist we stopped on, not past it.
  const finalIndex = interrupted ? lastIndex : artistSlugs.length;
  onProgress?.({
    index: finalIndex, checked, failed, skipped, found: found.length, done: !interrupted, interrupted,
  });
  return { found, checked, failed, skipped, interrupted, lastIndex: finalIndex };
}

module.exports = {
  CANDIDATE_PATTERNS,
  extractSongUrls,
  detectArtistUrlPattern,
  sweepArtists,
};
