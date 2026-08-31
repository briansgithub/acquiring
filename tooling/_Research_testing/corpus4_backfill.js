#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { buildUnprocessedPool, loadBlockedSlugs } = require('../_Decode_oracle/corpus4/buildCorpus4');
const { tierForRank } = require('../_Decode_oracle/corpus3/tierMeta');

const ROOT = path.join(__dirname, '..', '_Decode_oracle');
const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, 'corpus4.json'), 'utf8'));
const OUT = path.join(ROOT, 'out');

function scrapeOk(s) {
  return s && s.sections && s.sections.some((x) => (x.rendered || []).length > 0);
}

function artistTitle(url) {
  const m = url.match(/theorytab\/view\/([^/]+)\/([^/?#]+)/);
  if (!m) return { artist: null, title: null };
  return { artist: m[1].replace(/-/g, ' '), title: m[2].replace(/-/g, ' ') };
}

const badIdx = [];
for (let i = 0; i < corpus.length; i++) {
  const e = corpus[i];
  const f = path.join(OUT, e.slug, 'scrape.json');
  let ok = false;
  if (fs.existsSync(f)) {
    try { ok = scrapeOk(JSON.parse(fs.readFileSync(f, 'utf8'))); } catch (_) {}
  }
  if (!ok) badIdx.push(i);
}

const blocked = loadBlockedSlugs();
const manifestSlugs = new Set(corpus.map((e) => e.slug));
for (const e of corpus) blocked.add(e.slug);

const pool = [...buildUnprocessedPool(blocked).values()].filter((item) => !manifestSlugs.has(item.slug));
const replacements = pool.slice(0, badIdx.length);
if (replacements.length < badIdx.length) {
  console.error(`Need ${badIdx.length} replacements, only ${replacements.length} available`);
  process.exit(1);
}

for (let j = 0; j < badIdx.length; j++) {
  const i = badIdx[j];
  const item = replacements[j];
  const tierMeta = tierForRank(corpus[i].complexityRank);
  const { artist, title } = artistTitle(item.url);
  corpus[i] = {
    ...corpus[i],
    slug: item.slug,
    url: item.url,
    artist,
    title,
    source: 'discovered:backfill',
    note: tierMeta.note,
  };
}

fs.writeFileSync(path.join(ROOT, 'corpus4.json'), JSON.stringify(corpus, null, 2));
console.log(`[backfill] replaced ${badIdx.length}`);
for (const i of badIdx) console.log(`  rank ${corpus[i].complexityRank}: ${corpus[i].slug}`);
