/**
 * Compare discovered URLs against catalog DB.
 *   node _Research_testing/hooktheory_catalog/discoverDiff.js
 */

const { openDb } = require('./db');
const { discoverUrls } = require('./discover');

async function discoverDiff({ mode = 'quick', maxPages = 1, maxMeiliPages = 0 } = {}) {
  const db = openDb();
  const before = db.prepare('SELECT COUNT(*) AS n FROM songs').get().n;
  const result = await discoverUrls({ mode, maxPages, maxMeiliPages, db });
  const after = db.prepare('SELECT COUNT(*) AS n FROM songs').get().n;
  return {
    discovered: result.entries.length,
    newCount: after - before,
    total: after,
    pending: db.prepare("SELECT COUNT(*) AS n FROM songs WHERE status = 'pending'").get().n,
    discovery_complete: result.discovery_complete,
  };
}


module.exports = { discoverDiff };
