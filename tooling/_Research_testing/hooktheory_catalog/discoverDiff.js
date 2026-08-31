const { discoverDiff } = require('./lib/discoverDiff');
if (require.main === module) {
  const mode = process.argv.includes('--full') ? 'full' : 'quick';
  discoverDiff({ mode }).then((r) => {
    console.log(JSON.stringify(r, null, 2));
  }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
module.exports = { discoverDiff };
