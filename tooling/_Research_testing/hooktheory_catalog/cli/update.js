const { main } = require('../lib/update');
if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
