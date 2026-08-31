const { main } = require('./cli/rateProbe');
if (require.main === module) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
module.exports = require('./lib/rateProbe');
