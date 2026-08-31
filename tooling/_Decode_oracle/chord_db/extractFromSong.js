/**
 * extractFromSong.js — build indexed chord entries from one harvest/<slug>/scrape.json.
 */

const fs = require('fs');
const path = require('path');
const { rowToEntry } = require('./chordEntry');
const { loadSongCompare, enrichRowsWithKeys } = require('./collectSongs');
const { resolveHarvestDir } = require('../../_Research_testing/hooktheory_catalog/lib/harvestPaths');

async function extractFromSong(slug, opts = {}) {
  const dir = resolveHarvestDir(slug);
  const scrapeFile = path.join(dir, 'scrape.json');
  const { scrape, compareResult } = await loadSongCompare({ slug, dir, scrapeFile }, opts);
  const pairs = enrichRowsWithKeys(slug, scrape, compareResult);
  return pairs.map(({ row, ctx }) => rowToEntry(row, ctx));
}

module.exports = { extractFromSong };
