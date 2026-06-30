/**
 * Discover TheoryTab URLs via Meilisearch, recent page, and search crawl.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { openDb, upsertSong, upsertMeiliSectionStub } = require('./db');
const { paginateAll } = require('./meiliClient');
const {
  BASE,
  buildTheoryTabUrl,
  normalizeTheoryTabUrl,
  parseTheoryTabUrl,
  isJunkUrl,
} = require('./catalogUtils');
const { acquire } = require('./api/hooktheoryApi');

const { LEGACY_DISCOVERED } = require('./paths');

function parseArgs(argv) {
  const out = { mode: 'quick', maxPages: 3, maxMeiliPages: 0, write: true, resumeOffset: 0 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--mode') out.mode = argv[++i] || 'quick';
    else if (argv[i] === '--pages') out.maxPages = Number(argv[++i]) || 3;
    else if (argv[i] === '--meili-pages') out.maxMeiliPages = Number(argv[++i]);
    else if (argv[i] === '--resume-offset') out.resumeOffset = Number(argv[++i]) || 0;
    else if (argv[i] === '--dry-run') out.write = false;
  }
  if (out.mode === 'full' && argv.indexOf('--meili-pages') === -1) out.maxMeiliPages = 0;
  return out;
}

function entryFromUrl(url, source) {
  if (isJunkUrl(url)) return null;
  const parsed = parseTheoryTabUrl(url);
  if (!parsed) return null;
  return { ...parsed, discovery_source: source };
}

function entryFromArtistSong(artist, song, source) {
  return entryFromUrl(buildTheoryTabUrl(artist, song), source);
}

function upsertEntries(db, entries) {
  const seen = new Set();
  let newCount = 0;
  for (const entry of entries) {
    if (!entry || seen.has(entry.slug)) continue;
    seen.add(entry.slug);
    if (upsertSong(db, entry)) newCount++;
  }
  return newCount;
}

async function discoverFromRecent(maxScroll = 3) {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const found = [];
  try {
    await page.goto(`${BASE}/theorytab/recent`, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 2000));
    for (let i = 0; i < maxScroll; i++) {
      const links = await page.evaluate(() =>
        [...document.querySelectorAll('a[href*="/theorytab/view/"]')].map((a) => a.href),
      );
      for (const href of links) {
        const entry = entryFromUrl(normalizeTheoryTabUrl(href), 'recent');
        if (entry) found.push(entry);
      }
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
      await new Promise((r) => setTimeout(r, 1200));
    }
  } finally {
    await browser.close();
  }
  return found;
}

async function discoverFromSearchQueries(queries) {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const found = [];
  try {
    for (const q of queries) {
      await acquire('www.hooktheory.com');
      const url = `${BASE}/theorytab/search?q=${encodeURIComponent(q)}`;
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
        await new Promise((r) => setTimeout(r, 1200));
        const links = await page.evaluate(() =>
          [...document.querySelectorAll('a[href*="/theorytab/view/"]')].map((a) => a.href),
        );
        for (const href of links) {
          const entry = entryFromUrl(normalizeTheoryTabUrl(href), `search:${q}`);
          if (entry) found.push(entry);
        }
        console.log(`[discover] search q=${q} links=${links.length}`);
      } catch (e) {
        console.log(`[discover] search q=${q} err: ${e.message}`);
      }
    }
  } finally {
    await browser.close();
  }
  return found;
}

/**
 * @param {number} maxPages 0 = unlimited until Meilisearch exhausted
 * @param {number} startOffset resume pagination offset
 * @param {function} [onPage] callback({ page, offset, batch, uniqueCount })
 */
async function discoverFromMeili(maxPages = 0, startOffset = 0, onPage = null, db = null) {
  const found = [];
  const seenSongs = new Set();
  let lastOffset = startOffset;
  let totalEstimate = null;

  for await (const { hits, offset, page } of paginateAll({
    pageSize: 200,
    query: '',
    startOffset,
    maxPages,
  })) {
    lastOffset = offset + hits.length;
    for (const hit of hits) {
      const songKey = `${hit.artist}::${hit.song}`;
      const entry = entryFromArtistSong(hit.artist, hit.song, 'meilisearch');
      if (!entry) continue;

      if (db) {
        upsertSong(db, entry);
        // Meili hit.id is an index row id, NOT the public API song id — sections
        // are resolved from the TheoryTab page at light-harvest time (sectionResolve.js).
      }

      if (!seenSongs.has(songKey)) {
        seenSongs.add(songKey);
        found.push(entry);
      }
    }
    if (onPage) {
      onPage({
        page,
        offset: lastOffset,
        batch: hits.length,
        uniqueCount: seenSongs.size,
        totalEstimate,
      });
    }
    console.log(`[discover] meili page=${page} offset=${lastOffset} batch=${hits.length} unique=${seenSongs.size}`);
  }

  return { entries: found, finalOffset: lastOffset, complete: true, uniqueSongs: seenSongs.size };
}

function loadLegacyDiscovered() {
  // Removed: catalog songs must enter via discover / add-by-URL / light catalog only.
  return [];
}

function searchQueriesForMode(mode) {
  const alpha = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
  if (mode === 'quick') return alpha.slice(0, 6);
  if (mode === 'full') return alpha;
  return alpha.slice(0, 10);
}

async function discoverUrls(opts = {}) {
  const db = opts.db || openDb();
  const mode = opts.mode || 'quick';
  const entries = [];
  let meiliResult = null;

  if (!opts.meiliOnly) {
    if (!opts.skipRecent) entries.push(...await discoverFromRecent(mode === 'full' ? 5 : 2));
    if (!opts.skipSearch) {
      entries.push(...await discoverFromSearchQueries(searchQueriesForMode(mode)));
    }
  }

  const meiliPages = opts.maxMeiliPages ?? (mode === 'full' ? 0 : 0);
  const runMeili = opts.forceMeili || mode === 'full' || meiliPages > 0;
  if (runMeili) {
    meiliResult = await discoverFromMeili(
      meiliPages,
      opts.resumeOffset || 0,
      opts.onMeiliPage,
      opts.write !== false ? db : null,
    );
    entries.push(...meiliResult.entries);
  }

  let newCount = 0;
  if (opts.write !== false) {
    newCount = upsertEntries(db, entries);
    console.log(`[discover] upserted ${entries.length} entries, ${newCount} new`);
  }

  return {
    entries,
    newCount,
    meiliResult,
    discovery_complete: meiliResult?.complete ?? false,
    finalOffset: meiliResult?.finalOffset ?? opts.resumeOffset ?? 0,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = openDb();
  await discoverUrls({ ...args, db, resumeOffset: args.resumeOffset });
  const status = db.prepare('SELECT COUNT(*) AS total FROM songs').get();
  console.log(`[discover] catalog total=${status.total}`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = {
  discoverUrls,
  discoverFromRecent,
  discoverFromMeili,
  entryFromUrl,
};
