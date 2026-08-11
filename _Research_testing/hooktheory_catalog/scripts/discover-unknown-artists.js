/**
 * Find artists that exist on Hooktheory but are absent from our catalog.
 *
 * Closes a structural blind spot: the artist-page sweep only visits artists we
 * already hold, so an artist we never discovered can never be found by it —
 * and Meilisearch's index is a proven ceiling. The Internet Archive recorded
 * /theorytab/artist/<slug> pages independently, so diffing those slugs against
 * our catalog surfaces entire artists we've never seen.
 *
 * Costs hooktheory.com ZERO requests (archive.org only).
 *
 *   node scripts/discover-unknown-artists.js
 */

const fs = require('fs');
const path = require('path');
const catalogConfig = require('../lib/catalogConfig');
const { slugify } = require('../lib/catalogUtils');
const { isScratchUpload } = require('../lib/waybackDiscover');
const { openDb } = require('../lib/db');
const { dataPath } = require('../lib/paths');

const CDX_BASE = 'http://web.archive.org/cdx/search/cdx';
const TARGET = 'hooktheory.com/theorytab/artist/*';
const OUT_DIR = path.join(dataPath('.'), 'wayback');
const OUT_FILE = path.join(OUT_DIR, 'unknown-artists.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdxFetch(params, retries = 4) {
  const url = `${CDX_BASE}?${new URLSearchParams(params).toString()}`;
  let delay = 3000;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': catalogConfig.userAgent } });
      if (res.ok) return res.text();
      if (res.status >= 500 || res.status === 429) {
        if (attempt === retries) throw new Error(`CDX HTTP ${res.status}`);
      } else {
        throw new Error(`CDX HTTP ${res.status}`);
      }
    } catch (err) {
      if (attempt === retries) throw err;
    }
    await sleep(delay);
    delay = Math.min(delay * 2, 60000);
  }
  throw new Error('unreachable');
}

function artistSlugFromUrl(u) {
  const m = String(u).match(/theorytab\/artist\/([^/?#]+)/i);
  if (!m) return null;
  let raw;
  try { raw = decodeURIComponent(m[1]); } catch (_) { raw = m[1]; }
  if (/[�?]/.test(raw)) return null;
  const slug = slugify(raw);
  if (!slug) return null;
  if (isScratchUpload(slug, '')) return null;
  return slug;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const pageCountRaw = await cdxFetch({ url: TARGET, showNumPages: 'true' });
  const pageCount = Number(String(pageCountRaw).trim());
  if (!Number.isFinite(pageCount) || pageCount <= 0) {
    throw new Error(`unusable CDX page count: ${JSON.stringify(String(pageCountRaw).slice(0, 80))}`);
  }
  console.log(`CDX reports ${pageCount} pages for ${TARGET}`);

  const slugs = new Set();
  for (let page = 0; page < pageCount; page++) {
    const txt = await cdxFetch({
      url: TARGET, output: 'json', fl: 'original', collapse: 'urlkey', page: String(page),
    });
    let rows;
    try { rows = JSON.parse(txt); } catch (_) { rows = []; }
    for (const row of rows) {
      const u = Array.isArray(row) ? row[0] : row;
      if (!u || u === 'original') continue;
      const s = artistSlugFromUrl(u);
      if (s) slugs.add(s);
    }
    if (page % 5 === 0) console.log(`  page ${page}/${pageCount} — ${slugs.size} distinct artist slugs`);
    await sleep(1500);
  }

  const db = openDb();
  const known = new Set(
    db.prepare('SELECT DISTINCT artist_slug FROM songs WHERE artist_slug IS NOT NULL')
      .all().map((r) => r.artist_slug),
  );
  db.close();

  const unknown = [...slugs].filter((s) => !known.has(s)).sort();
  console.log(`\narchived artist slugs: ${slugs.size}`);
  console.log(`already in catalog:    ${slugs.size - unknown.length}`);
  console.log(`NOT in catalog:        ${unknown.length}`);
  console.log(`sample: ${unknown.slice(0, 15).join(', ')}`);

  fs.writeFileSync(OUT_FILE, JSON.stringify(unknown, null, 2));
  console.log(`\nwrote ${OUT_FILE}`);
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { main, artistSlugFromUrl };
