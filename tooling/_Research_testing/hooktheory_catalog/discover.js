const { discoverUrls, discoverFromRecent, discoverFromMeili, entryFromUrl } = require('./lib/discover');
const { main } = require('./cli/discover');

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { discoverUrls, discoverFromRecent, discoverFromMeili, entryFromUrl, main };
