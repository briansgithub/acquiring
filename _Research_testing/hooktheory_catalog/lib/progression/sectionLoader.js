/**
 * Load section JSON payloads from playback cache for a catalog song.
 */

const fs = require('fs');
const path = require('path');
const { getPlaybackCacheDir } = require('../../../../lib/dataRoot');

function sectionNameFromFile(file) {
  const base = file.replace(/\.json$/i, '');
  const idx = base.indexOf(' - ');
  return idx >= 0 ? base.slice(0, idx) : base;
}

function listSectionFiles(cacheDirName) {
  const dir = path.join(getPlaybackCacheDir(), cacheDirName);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f !== '_metadata.json')
    .map((file) => ({
      sectionType: sectionNameFromFile(file),
      filePath: path.join(dir, file),
    }));
}

function loadSectionsFromCache(cacheDirName) {
  const out = [];
  for (const { sectionType, filePath } of listSectionFiles(cacheDirName)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      out.push({ sectionType, data });
    } catch {
      // skip corrupt section files
    }
  }
  return out;
}

function listAllProcessedSongs(catalogDb) {
  return catalogDb.prepare(`
    SELECT slug, cache_dir FROM songs
    WHERE processed_at IS NOT NULL AND cache_dir IS NOT NULL AND cache_dir != ''
    ORDER BY slug
  `).all();
}

module.exports = {
  sectionNameFromFile,
  listSectionFiles,
  loadSectionsFromCache,
  listAllProcessedSongs,
};
