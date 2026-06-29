/**
 * Unified harvest artifact paths and validation (_Decode_oracle/out/<slug>/scrape.json).
 */

const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./paths');

const HARVEST_ROOT = path.join(REPO_ROOT, '_Decode_oracle', 'out');

function slugForUrl(url) {
  const m = String(url).match(/theorytab\/view\/([^/]+)\/([^/?#]+)/);
  const raw = m ? `${m[1]}__${m[2]}` : String(url).replace(/[^a-z0-9]+/gi, '_').slice(0, 60);
  return raw.replace(/[:*?"<>|]/g, '-');
}

function harvestDirForSlug(slug) {
  return path.join(HARVEST_ROOT, slug);
}

function harvestFileForSlug(slug) {
  return path.join(harvestDirForSlug(slug), 'scrape.json');
}

function harvestOk(scrape) {
  return scrape && scrape.sections && scrape.sections.length > 0
    && scrape.sections.some((s) => s.json || ((s.rendered || []).length > 0));
}

function isLightHarvest(scrape) {
  return scrape?.harvestMode === 'light';
}

function loadHarvest(slug) {
  const filePath = harvestFileForSlug(slug);
  if (!fs.existsSync(filePath)) return null;
  try {
    const scrape = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!harvestOk(scrape)) return null;
    return {
      slug,
      dir: harvestDirForSlug(slug),
      path: filePath,
      scrape,
    };
  } catch (_) {
    return null;
  }
}

function isHarvested(slug) {
  return loadHarvest(slug) != null;
}

function clearHarvestArtifact(slug) {
  const filePath = harvestFileForSlug(slug);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

module.exports = {
  HARVEST_ROOT,
  slugForUrl,
  harvestDirForSlug,
  harvestFileForSlug,
  harvestOk,
  loadHarvest,
  isHarvested,
  isLightHarvest,
  clearHarvestArtifact,
};
