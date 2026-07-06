/**
 * Disk + in-memory cache for /api/songs playback library index.
 * Full scan of 34k+ cache dirs takes ~20s; cached JSON read is ~100ms.
 */

const fs = require("fs");
const path = require("path");
const { getCatalogDir } = require("../lib/dataRoot");

let memoryCache = null;
let buildPromise = null;

function cacheFilePath() {
  return path.join(getCatalogDir(), "playback_library_cache.json");
}

async function countCacheDirs(cacheRoot) {
  const entries = await fs.promises.readdir(cacheRoot, { withFileTypes: true });
  let n = 0;
  for (const ent of entries) {
    if (ent.isDirectory()) n++;
  }
  return n;
}

function readDiskCache() {
  const file = cacheFilePath();
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    console.warn("playback_library_cache.json unreadable, rebuilding:", e.message);
    return null;
  }
}

function writeDiskCache(payload) {
  const file = cacheFilePath();
  const tmp = `${file}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(payload), "utf8");
    fs.renameSync(tmp, file);
  } catch (e) {
    console.warn("Failed to write playback library cache:", e.message);
  }
}

async function loadLibrary(scanFn, cacheRoot) {
  if (memoryCache) return memoryCache;
  if (buildPromise) return buildPromise;

  buildPromise = (async () => {
    const dirCount = await countCacheDirs(cacheRoot);
    const disk = readDiskCache();
    if (disk?.library?.length && disk.dirCount === dirCount) {
      memoryCache = disk.library;
      return memoryCache;
    }

    const library = await scanFn();
    memoryCache = library;
    writeDiskCache({ dirCount, builtAt: Date.now(), library });
    return library;
  })();

  try {
    return await buildPromise;
  } finally {
    buildPromise = null;
  }
}

function invalidatePlaybackLibraryCache() {
  memoryCache = null;
  buildPromise = null;
  const file = cacheFilePath();
  if (fs.existsSync(file)) {
    try {
      fs.unlinkSync(file);
    } catch (_) {}
  }
}

module.exports = { loadLibrary, invalidatePlaybackLibraryCache };
