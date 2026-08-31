const { enrichPending, enrichSong, enrichNextPending, launchBrowser } = require('./lib/enrich');
const { main } = require('./cli/enrich');

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { enrichPending, enrichSong, enrichNextPending, launchBrowser, main };
