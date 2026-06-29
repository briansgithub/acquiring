/**
 * Add a TheoryTab URL to the catalog, harvest once, then parallel metadata + processed.
 */

const { parseTheoryTabUrl } = require('./catalogUtils');
const { upsertSong } = require('./db');
const { runHarvest } = require('./pipelineOps');

async function addSongFromUrl(db, url) {
  const parsed = parseTheoryTabUrl(url);
  if (!parsed) return { ok: false, status: 400, error: 'invalid TheoryTab URL' };
  upsertSong(db, {
    ...parsed,
    status: 'pending',
    discovery_source: 'user_url',
  });
  return runHarvest(db, parsed.slug);
}

module.exports = { addSongFromUrl };
