const { runDaemon } = require('../lib/catalogDaemon');
if (require.main === module) {
  runDaemon().catch((e) => { console.error(e); process.exit(1); });
}
