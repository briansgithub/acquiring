#!/usr/bin/env node
/**
 * buildCorpus4.js — 500-song corpus of songs NOT yet oracle-scraped.
 *
 * Excludes any slug with a valid scrape in out/ (already used for engine regression).
 * Sources mirror corpus3: curated corpora, tier seeds, discovered URLs, cache metadata.
 *
 *   node _Decode_oracle/corpus4/buildCorpus4.js
 *   node _Decode_oracle/corpus4/buildCorpus4.js --target 500
 *   node _Decode_oracle/corpus4/buildCorpus4.js --scraped-only   # legacy: scraped-truth only
 */

const fs = require('fs');
const path = require('path');
const { discoverAllScrapeDirs } = require('../../_Research_testing/hooktheory_catalog/lib/harvestPaths');
const { TIERS, tierForRank } = require('../corpus3/tierMeta');
const {
  buildPool,
  bucketByTier,
  fillToTarget,
  assignTierHeuristic,
} = require('../corpus3/buildCorpus3');
const { slugForUrl } = require('../run');

const ROOT = path.join(__dirname, '..');
const TARGET = 500;

function parseArgs(argv) {
  const out = { target: TARGET, write: true, scrapedOnly: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--target') out.target = Number(argv[++i]) || TARGET;
    else if (argv[i] === '--dry-run') out.write = false;
    else if (argv[i] === '--scraped-only') out.scrapedOnly = true;
  }
  return out;
}

function loadJsonIfExists(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function scrapeOk(scrape) {
  return scrape
    && scrape.sections
    && scrape.sections.length > 0
    && scrape.sections.some((s) => (s.rendered || []).length > 0);
}

function isJunkSlug(slug) {
  return !slug || slug === '_test' || slug.startsWith('_');
}

function isJunkUrl(url) {
  const m = url.match(/theorytab\/view\/([^/]+)\/([^/?#]+)/);
  if (!m) return true;
  const [, artist, title] = m;
  if (/[()]/.test(artist) || /test-?\d|hookpad|tutorial|major-scales|minor-scales/i.test(title)) return true;
  if (/^\d+$/.test(title) && title.length < 4) return true;
  if (artist.startsWith('_') || title.startsWith('_')) return true;
  if (/[:*?"<>|]/.test(title)) return true;
  return false;
}

function loadProcessedSlugs() {
  const processed = new Set();
  for (const ent of discoverAllScrapeDirs({ fullTruthOnly: true })) {
    if (isJunkSlug(ent.slug)) continue;
    processed.add(ent.slug);
  }
  return processed;
}

function artistTitleFromUrl(url) {
  const m = url.match(/theorytab\/view\/([^/]+)\/([^/?#]+)/);
  if (!m) return { artist: null, title: null };
  return { artist: m[1].replace(/-/g, ' '), title: m[2].replace(/-/g, ' ') };
}

function discoverScraped() {
  const items = [];
  for (const ent of discoverAllScrapeDirs({ fullTruthOnly: true })) {
    try {
      const scrape = JSON.parse(fs.readFileSync(ent.scrapeFile, 'utf8'));
      if (!scrapeOk(scrape) || !scrape.url) continue;
      if (isJunkSlug(ent.slug) || isJunkUrl(scrape.url)) continue;
      items.push({ slug: ent.slug, url: scrape.url, scrape });
    } catch (_) {}
  }
  return items;
}

function loadBlockedSlugs() {
  const blocked = loadProcessedSlugs();
  for (const ent of discoverAllScrapeDirs()) {
    if (isJunkSlug(ent.slug)) continue;
    try {
      const scrape = JSON.parse(fs.readFileSync(ent.scrapeFile, 'utf8'));
      if (scrape.errors?.some((e) => /404|not found/i.test(e))) blocked.add(ent.slug);
    } catch (_) {}
  }
  return blocked;
}

function urlsFromDiscovered(blocked) {
  const research = path.join(ROOT, '..', '_Research_testing', 'discovered_urls.json');
  const data = loadJsonIfExists(research);
  if (!data?.urls) return [];
  const out = [];
  for (const url of data.urls) {
    if (isJunkUrl(url)) continue;
    const slug = slugForUrl(url);
    if (!slug || blocked.has(slug)) continue;
    out.push({
      url,
      slug,
      tier: assignTierHeuristic(url, null),
      source: 'discovered',
    });
  }
  return out;
}

function buildUnprocessedPool(blocked) {
  const discovered = urlsFromDiscovered(blocked);
  if (discovered.length >= TARGET) {
    const bySlug = new Map(discovered.map((item) => [item.slug, item]));
    return bySlug;
  }
  const pool = buildPool();
  const filtered = new Map(discovered.map((item) => [item.slug, item]));
  for (const [slug, item] of pool) {
    if (blocked.has(slug) || filtered.has(slug)) continue;
    filtered.set(slug, item);
  }
  return filtered;
}

function toManifestEntries(ordered) {
  return ordered.map((item, i) => {
    const rank = i + 1;
    const tierMeta = tierForRank(rank);
    const { artist, title } = artistTitleFromUrl(item.url);
    return {
      complexityRank: rank,
      tier: tierMeta.tier,
      note: item.note || tierMeta.note,
      artist,
      title,
      slug: item.slug,
      url: item.url,
      alternates: [],
      source: item.source,
    };
  });
}

function buildScrapedCorpus(hints) {
  const scraped = discoverScraped();
  const pool = scraped.map((s) => {
    const hint = hints.get(s.slug);
    const tier = hint?.tier ?? assignTierHeuristic(s.url, null);
    return {
      ...s,
      tier,
      note: hint?.note,
      priorRank: hint?.complexityRank,
      source: hint?.source ? `${hint.source}:scraped` : 'out:scraped',
      chordCount: s.scrape.sections.reduce((n, sec) => n + (sec.rendered || []).length, 0),
    };
  });
  pool.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return (a.priorRank ?? 9999) - (b.priorRank ?? 9999) || a.slug.localeCompare(b.slug);
  });
  return pool.map((item, i) => {
    const rank = i + 1;
    const tierMeta = tierForRank(Math.min(rank, 500));
    const { artist, title } = artistTitleFromUrl(item.url);
    return {
      complexityRank: rank,
      tier: item.tier,
      note: item.note || tierMeta.note,
      artist,
      title,
      slug: item.slug,
      url: item.url,
      alternates: [],
      source: item.source,
      chordCount: item.chordCount,
    };
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const processed = loadProcessedSlugs();
  const blocked = loadBlockedSlugs();
  let corpus;

  if (args.scrapedOnly) {
    corpus = buildScrapedCorpus(new Map());
    console.log(`[buildCorpus4] mode=scraped-only count=${corpus.length}`);
  } else {
    const pool = buildUnprocessedPool(blocked);
    const buckets = bucketByTier(pool);
    const ordered = fillToTarget(buckets, args.target);
    corpus = toManifestEntries(ordered);

    const tierCounts = {};
    for (const e of corpus) tierCounts[e.tier] = (tierCounts[e.tier] || 0) + 1;

    console.log(`[buildCorpus4] mode=unprocessed target=${args.target}`);
    console.log(`[buildCorpus4] processed=${processed.size} blocked=${blocked.size} pool=${pool.size} selected=${corpus.length}`);
    console.log(`[buildCorpus4] per-tier: ${JSON.stringify(tierCounts)}`);

    if (corpus.length < args.target) {
      console.warn(`[buildCorpus4] WARNING: only ${corpus.length}/${args.target} unprocessed songs available`);
      console.warn('[buildCorpus4] Run discover_theorytab_search.js to expand discovered_urls.json');
    }
  }

  const outPath = path.join(ROOT, 'corpus4.json');
  if (args.write) {
    fs.writeFileSync(outPath, JSON.stringify(corpus, null, 2));
    console.log(`[buildCorpus4] wrote ${outPath}`);
  }
  return corpus;
}

if (require.main === module) main();

module.exports = {
  loadProcessedSlugs,
  loadBlockedSlugs,
  buildUnprocessedPool,
  toManifestEntries,
  discoverScraped,
  isJunkUrl,
};
