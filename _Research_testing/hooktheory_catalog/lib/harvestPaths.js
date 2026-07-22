/**
 * Harvest artifact discovery — primary data root + legacy _Decode_oracle/out fallback.
 */

const fs = require('fs');
const path = require('path');
const { getHarvestRoot, getRepoRoot } = require('../../../lib/dataRoot');
const { harvestDirForSlug, harvestFileForSlug } = require('./harvestArtifact');

const LEGACY_OUT = path.join(getRepoRoot(), '_Decode_oracle', 'out');

function resolveHarvestDir(slug) {
  const primary = harvestDirForSlug(slug);
  if (fs.existsSync(path.join(primary, 'scrape.json'))) return primary;
  const legacy = path.join(LEGACY_OUT, slug);
  if (fs.existsSync(path.join(legacy, 'scrape.json'))) return legacy;
  return primary;
}

function resolveScrapeFile(slug) {
  const primary = harvestFileForSlug(slug);
  if (fs.existsSync(primary)) return primary;
  const legacy = path.join(LEGACY_OUT, slug, 'scrape.json');
  if (fs.existsSync(legacy)) return legacy;
  return primary;
}

function hasRenderedTruth(scrape) {
  return (scrape?.sections || []).some((s) => (s.rendered || []).length > 0);
}

function discoverScrapeDirsFromRoot(rootDir, { corpusSlugs } = {}) {
  const dirs = [];
  if (!fs.existsSync(rootDir)) return dirs;
  for (const name of fs.readdirSync(rootDir)) {
    const dir = path.join(rootDir, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const scrapeFile = path.join(dir, 'scrape.json');
    if (!fs.existsSync(scrapeFile)) continue;
    if (corpusSlugs && !corpusSlugs.has(name)) continue;
    dirs.push({ slug: name, dir, scrapeFile });
  }
  return dirs;
}

function discoverAllScrapeDirs({ corpusSlugs = null, fullTruthOnly = false } = {}) {
  const bySlug = new Map();
  for (const root of [getHarvestRoot(), LEGACY_OUT]) {
    for (const ent of discoverScrapeDirsFromRoot(root, { corpusSlugs })) {
      if (!bySlug.has(ent.slug)) bySlug.set(ent.slug, ent);
    }
  }

  let dirs = [...bySlug.values()];
  if (fullTruthOnly) {
    dirs = dirs.filter((ent) => {
      try {
        const scrape = JSON.parse(fs.readFileSync(ent.scrapeFile, 'utf8'));
        return hasRenderedTruth(scrape);
      } catch (_) {
        return false;
      }
    });
  }
  dirs.sort((a, b) => a.slug.localeCompare(b.slug));
  return dirs;
}

module.exports = {
  LEGACY_OUT,
  resolveHarvestDir,
  resolveScrapeFile,
  hasRenderedTruth,
  discoverAllScrapeDirs,
  discoverScrapeDirsFromRoot,
};
