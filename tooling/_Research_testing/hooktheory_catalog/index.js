/**
 * Hooktheory catalog module — self-contained under _Research_testing/hooktheory_catalog/
 */

const paths = require('./lib/paths');
const db = require('./lib/db');
const discover = require('./lib/discover');
const enrich = require('./lib/enrich');
const update = require('./lib/update');
const daemon = require('./lib/catalogDaemon');
const daemonState = require('./lib/daemonState');
const config = require('./lib/catalogConfig');
const api = require('./lib/api/hooktheoryApi');

module.exports = {
  paths,
  db,
  discover,
  enrich,
  update,
  daemon,
  daemonState,
  config,
  api,
  openDb: db.openDb,
  getCatalogStatus: db.getCatalogStatus,
  listSongs: db.listSongs,
  runUpdate: update.runUpdate,
  runDaemon: daemon.runDaemon,
};
