#!/usr/bin/env node
/**
 * buildCorpus3.js — assemble corpus3.json (500 songs, increasing complexity).
 *
 * Sources (priority order):
 *   1. corpus_all.json + corpus.json + corpus2.json (known oracle songs)
 *   2. corpus3/seeds/tier*.json (curated per-tier URLs)
 *   3. _Research_testing/discovered_urls.json (browse/search scrape)
 *   4. out scrape.json dirs + .hooktheory_cache metadata
 *
 *   node _Decode_oracle/corpus3/buildCorpus3.js
 *   node _Decode_oracle/corpus3/buildCorpus3.js --target 500
 */

const fs = require('fs');
const path = require('path');
const { TIERS, tierForRank } = require('./tierMeta');
const { slugForUrl } = require('../run');

const ROOT = path.join(__dirname, '..');
const RESEARCH = path.join(ROOT, '..', '_Research_testing');
const TARGET = 500;

function parseArgs(argv) {
  const out = { target: TARGET, write: true };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--target') out.target = Number(argv[++i]) || TARGET;
    else if (argv[i] === '--dry-run') out.write = false;
  }
  return out;
}

function loadJsonIfExists(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function urlsFromCorpusFile(p) {
  const data = loadJsonIfExists(p);
  if (!Array.isArray(data)) return [];
  const out = [];
  for (const e of data) {
    if (e.url) out.push({ url: e.url, tier: e.tier, note: e.note, source: path.basename(p) });
    for (const alt of e.alternates || []) out.push({ url: alt, tier: e.tier, note: e.note, source: path.basename(p) + ':alt' });
  }
  return out;
}

function urlsFromSeeds() {
  const out = [];
  for (const t of TIERS) {
    const seedFile = path.join(__dirname, 'seeds', `tier${t.tier}.json`);
    const data = loadJsonIfExists(seedFile);
    if (!Array.isArray(data)) continue;
    for (const item of data) {
      const url = typeof item === 'string' ? item : item.url;
      if (url) out.push({ url, tier: t.tier, note: item.note || t.note, source: `seed:tier${t.tier}` });
    }
  }
  return out;
}

function urlsFromDiscovered() {
  const data = loadJsonIfExists(path.join(RESEARCH, 'discovered_urls.json'));
  if (!data?.urls) return [];
  return data.urls.map((url) => ({ url, tier: null, source: 'discovered' }));
}

function urlsFromOut() {
  const outDir = path.join(ROOT, 'out');
  if (!fs.existsSync(outDir)) return [];
  const out = [];
  for (const name of fs.readdirSync(outDir)) {
    const scrapeFile = path.join(outDir, name, 'scrape.json');
    if (!fs.existsSync(scrapeFile)) continue;
    try {
      const s = JSON.parse(fs.readFileSync(scrapeFile, 'utf8'));
      if (s.url) out.push({ url: s.url, tier: null, source: 'out' });
    } catch (_) {}
  }
  return out;
}

function urlsFromCache() {
  const cache = path.join(ROOT, '..', '.hooktheory_cache');
  if (!fs.existsSync(cache)) return [];
  const out = [];
  for (const artist of fs.readdirSync(cache)) {
    const meta = path.join(cache, artist, '_metadata.json');
    if (!fs.existsSync(meta)) continue;
    try {
      const m = JSON.parse(fs.readFileSync(meta, 'utf8'));
      if (m.url) out.push({ url: m.url, tier: null, source: 'cache' });
    } catch (_) {}
  }
  return out;
}

function artistTitleFromUrl(url) {
  const m = url.match(/theorytab\/view\/([^/]+)\/([^/?#]+)/);
  if (!m) return { artist: null, title: null };
  const artist = m[1].replace(/-/g, ' ');
  const title = m[2].replace(/-/g, ' ');
  return { artist, title };
}

function sourcePriority(source = '') {
  if (source.startsWith('corpus')) return 0;
  if (source.startsWith('seed')) return 1;
  if (source === 'out') return 2;
  if (source === 'cache') return 3;
  return 4;
}

function isJunkUrl(url) {
  const m = url.match(/theorytab\/view\/([^/]+)\/([^/?#]+)/);
  if (!m) return true;
  const [artist, title] = m;
  if (/[()]/.test(artist) || /test-?\d|hookpad|tutorial|major-scales|minor-scales/i.test(title)) return true;
  if (/^\d+$/.test(title) && title.length < 4) return true;
  return false;
}

function hasScrape(slug) {
  const f = path.join(ROOT, 'out', slug, 'scrape.json');
  return fs.existsSync(f);
}

function assignTierHeuristic(url, hinted) {
  if (hinted) return hinted;
  const slug = slugForUrl(url).toLowerCase();
  const jazz = /jazz|coltrane|ellington|monk|miles-davis|brubeck|evans|gershwin|kosma|jobim|joplin|chopin|debussy|bach|mozart|beethoven|corea|metheny|montgomery|rollins|henderson|guaraldi|hancock|sinatra|autumn-leaves|giant-steps|round-midnight|maple-leaf|so-what|summertime|ipanema|corcovado|waltz-for-debby|take-five|take-the-a-train|spain|st-thomas|naima|recorda-me|four-on-six|cantaloupe|watermelon-man|blue-in-green|sentimental-mood|fly-me-to-the-moon/;
  const applied = /penny-lane|god-only-knows|isnt-she-lovely|somebody-to-love|killer-queen|sir-duke|superstition|piano-man|hey-jude|bridge-over|i-want-you-back|billie-jean|eight-days-a-week/;
  const borrowed = /creep|eleanor-rigby|clocks|come-as-you-are|karma-police|while-my-guitar|black-hole|lucy-in-the-sky|strawberry|modal|dorian|hotel-california|boulevard|back-to-black|space-oddity|light-my-fire|smells-like/;
  const sevenths = /wonderwall|perfect|someone-like-you|your-song|something|hotel-california|africa|take-on-me|dreams|every-breath|scientist|sweet-child|all-of-me|stand-by-me/;
  if (jazz.test(slug)) return 5;
  if (borrowed.test(slug)) return 4;
  if (applied.test(slug)) return 3;
  if (sevenths.test(slug)) return 2;
  return 1;
}

function compareItems(a, b) {
  const pa = sourcePriority(a.source);
  const pb = sourcePriority(b.source);
  if (pa !== pb) return pa - pb;
  const sa = hasScrape(a.slug) ? 0 : 1;
  const sb = hasScrape(b.slug) ? 0 : 1;
  if (sa !== sb) return sa - sb;
  return a.slug.localeCompare(b.slug);
}

function buildPool() {
  const sources = [
    ...urlsFromCorpusFile(path.join(ROOT, 'corpus.json')),
    ...urlsFromCorpusFile(path.join(ROOT, 'corpus2.json')),
    ...urlsFromCorpusFile(path.join(ROOT, 'corpus_all.json')),
    ...urlsFromSeeds(),
    ...urlsFromDiscovered(),
    ...urlsFromOut(),
    ...urlsFromCache(),
  ];

  const bySlug = new Map();
  for (const item of sources) {
    if (isJunkUrl(item.url)) continue;
    const slug = slugForUrl(item.url);
    if (!slug || slug.startsWith('_')) continue;
    const tier = assignTierHeuristic(item.url, item.tier);
    const prev = bySlug.get(slug);
    const priority = sourcePriority(item.source);
    const prevPriority = prev ? sourcePriority(prev.source) : 99;
    if (!prev || priority < prevPriority || (item.tier && !prev.tier)) {
      bySlug.set(slug, { ...item, slug, tier: item.tier || tier });
    }
  }
  return bySlug;
}

function bucketByTier(pool) {
  const buckets = Object.fromEntries(TIERS.map((t) => [t.tier, []]));
  for (const item of pool.values()) {
    const t = Math.min(5, Math.max(1, item.tier || 1));
    buckets[t].push(item);
  }
  for (const t of Object.keys(buckets)) {
    buckets[t].sort(compareItems);
  }
  return buckets;
}

function fillToTarget(buckets, target) {
  const ordered = [];
  const perTier = Math.floor(target / TIERS.length);
  const extra = target % TIERS.length;

  for (const t of TIERS) {
    const want = perTier + (t.tier <= extra ? 1 : 0);
    const list = buckets[t.tier];
    ordered.push(...list.slice(0, want));
  }

  if (ordered.length < target) {
    const used = new Set(ordered.map((x) => x.slug));
    const rest = [...poolValues(buckets)].filter((x) => !used.has(x.slug));
    rest.sort((a, b) => a.tier - b.tier || compareItems(a, b));
    for (const item of rest) {
      if (ordered.length >= target) break;
      ordered.push(item);
    }
  }

  return ordered.slice(0, target);
}

function poolValues(buckets) {
  const all = [];
  for (const t of TIERS) all.push(...buckets[t.tier]);
  return all;
}

function toCorpusEntries(ordered) {
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const pool = buildPool();
  const buckets = bucketByTier(pool);
  const ordered = fillToTarget(buckets, args.target);
  const corpus = toCorpusEntries(ordered);

  const tierCounts = {};
  for (const e of corpus) tierCounts[e.tier] = (tierCounts[e.tier] || 0) + 1;

  console.log(`[buildCorpus3] pool=${pool.size} selected=${corpus.length} target=${args.target}`);
  console.log(`[buildCorpus3] per-tier: ${JSON.stringify(tierCounts)}`);

  if (corpus.length < args.target) {
    console.warn(`[buildCorpus3] WARNING: only ${corpus.length}/${args.target} unique songs available`);
    console.warn(`[buildCorpus3] Run discover_theorytab_search.js and add corpus3/seeds/tier*.json`);
  }

  const outPath = path.join(ROOT, 'corpus3.json');
  if (args.write) {
    fs.writeFileSync(outPath, JSON.stringify(corpus, null, 2));
    console.log(`[buildCorpus3] wrote ${outPath}`);
  }
  return corpus;
}

if (require.main === module) main();

module.exports = { buildPool, bucketByTier, fillToTarget, toCorpusEntries, assignTierHeuristic };
