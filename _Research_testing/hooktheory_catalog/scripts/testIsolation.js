const fs = require('fs');
const os = require('os');
const path = require('path');

/** Configure an isolated data root before catalog modules are loaded. */
function isolateCatalogTest(name, {
  cloneCatalog = false,
  playbackDirs = [],
  harvestDirs = [],
} = {}) {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const sourceRoot = process.env.SACRED_RING_DATA
    ? path.resolve(process.env.SACRED_RING_DATA)
    : path.join(repoRoot, 'sacred_ring_data');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `sacred-ring-${name}-`));

  if (cloneCatalog) {
    const sourceBase = path.join(sourceRoot, 'catalog', 'hooktheory_catalog.db');
    const destBase = path.join(tempRoot, 'catalog', 'hooktheory_catalog.db');
    fs.mkdirSync(path.dirname(destBase), { recursive: true });
    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(`${sourceBase}${suffix}`)) {
        fs.copyFileSync(`${sourceBase}${suffix}`, `${destBase}${suffix}`);
      }
    }
  }

  for (const dir of playbackDirs) {
    const from = path.join(sourceRoot, 'playback', '.hooktheory_cache', dir);
    const to = path.join(tempRoot, 'playback', '.hooktheory_cache', dir);
    if (!fs.existsSync(from)) continue;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to, { recursive: true });
  }

  for (const dir of harvestDirs) {
    const from = path.join(sourceRoot, 'harvest', dir);
    const to = path.join(tempRoot, 'harvest', dir);
    if (!fs.existsSync(from)) continue;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to, { recursive: true });
  }

  process.env.SACRED_RING_DATA = tempRoot;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch (_) {}
  };
  process.once('exit', cleanup);
  return { tempRoot, cleanup };
}

module.exports = { isolateCatalogTest };
