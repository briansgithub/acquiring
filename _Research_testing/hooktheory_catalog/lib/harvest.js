/**
 * Single browser pass: scrape TheoryTab page + SongMetrics into unified harvest artifact.
 */

const fs = require('fs');
const path = require('path');
const { scrapeSong } = require('../../../_Decode_oracle/scrapeSong');
const { parseMetricsFromHtml } = require('./metricsParse');
const {
  slugForUrl,
  harvestDirForSlug,
  harvestFileForSlug,
  harvestOk,
  loadHarvest,
} = require('./harvestArtifact');

async function harvestSong(url, { rescrape = false } = {}) {
  const slug = slugForUrl(url);
  const dir = harvestDirForSlug(slug);
  const scrapeFile = harvestFileForSlug(slug);

  if (!rescrape) {
    const existing = loadHarvest(slug);
    if (existing) return { ...existing, cached: true };
  }

  fs.mkdirSync(dir, { recursive: true });
  const scrape = await scrapeSong(url, dir, {
    verbose: true,
    skipScreenshots: true,
    scrapePiano: true,
    returnHtml: true,
  });

  if (scrape.pageHtml) {
    const { metrics, difficulty_label } = parseMetricsFromHtml(scrape.pageHtml);
    scrape.metrics = metrics;
    scrape.difficulty_label = difficulty_label || null;
    delete scrape.pageHtml;
  }

  if (!harvestOk(scrape)) {
    const err = scrape.errors?.join('; ') || 'harvest found no section data';
    throw Object.assign(new Error(err), { status: 500 });
  }

  scrape.harvestedAt = new Date().toISOString();
  delete scrape.harvestMode;
  fs.writeFileSync(scrapeFile, JSON.stringify(scrape, null, 2));

  return {
    slug,
    dir,
    path: scrapeFile,
    scrape,
    cached: false,
  };
}

module.exports = { harvestSong };
