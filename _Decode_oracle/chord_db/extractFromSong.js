/**
 * extractFromSong.js — build indexed chord entries from one out/<slug>/scrape.json.
 */

const fs = require('fs');
const path = require('path');
const { rowToEntry } = require('./chordEntry');
const { OUT, loadSongCompare, enrichRowsWithKeys } = require('./collectSongs');

async function extractFromSong(slug, opts = {}) {
  const dir = path.join(OUT, slug);
  const scrapeFile = path.join(dir, 'scrape.json');
  if (!fs.existsSync(scrapeFile)) {
    throw new Error(`No scrape.json for slug "${slug}" (${scrapeFile})`);
  }
  const { scrape, compareResult } = await loadSongCompare({ slug, dir, scrapeFile }, opts);
  const pairs = enrichRowsWithKeys(slug, scrape, compareResult);
  return pairs.map(({ row, ctx }) => rowToEntry(row, ctx));
}

module.exports = { extractFromSong };
