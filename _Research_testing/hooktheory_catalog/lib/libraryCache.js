/**
 * Caching layer for the unified library.
 * The library computation is heavy (iterates over tens of thousands of rows and hits the filesystem),
 * so we cache the final JSON string payload to disk and serve it directly in API handlers.
 */

const fs = require('fs');
const path = require('path');
const { getCatalogDir } = require('../../../lib/dataRoot');
const { listLibrary } = require('./library');

function getCacheFilePath() {
  return path.join(getCatalogDir(), 'library_cache.json');
}

function getLibraryCache(db) {
  const cacheFile = getCacheFilePath();
  if (fs.existsSync(cacheFile)) {
    try {
      return fs.readFileSync(cacheFile, 'utf8');
    } catch (e) {
      console.error('Failed to read library cache, rebuilding...', e);
    }
  }
  return rebuildLibraryCache(db);
}

function rebuildLibraryCache(db) {
  const cacheFile = getCacheFilePath();
  const songs = listLibrary(db);
  const dataString = JSON.stringify({ songs });
  
  // Write to a temporary file first, then rename to avoid race conditions/partial reads
  const tempFile = cacheFile + '.tmp';
  try {
    fs.writeFileSync(tempFile, dataString, 'utf8');
    fs.renameSync(tempFile, cacheFile);
  } catch (e) {
    console.error('Failed to write library cache', e);
  }
  
  return dataString;
}

function invalidateLibraryCache() {
  const cacheFile = getCacheFilePath();
  if (fs.existsSync(cacheFile)) {
    try {
      fs.unlinkSync(cacheFile);
    } catch (e) {
      console.error('Failed to invalidate library cache', e);
    }
  }
}

module.exports = {
  getLibraryCache,
  rebuildLibraryCache,
  invalidateLibraryCache,
};
