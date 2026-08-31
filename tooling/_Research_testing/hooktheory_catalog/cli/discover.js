const { discoverUrls } = require('../lib/discover');
const { openDb } = require('../lib/db');

async function main() {
  const args = process.argv.slice(2);
  const opts = { mode: 'quick', maxPages: 3, maxMeiliPages: 0, write: true, resumeOffset: 0 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mode') opts.mode = args[++i] || 'quick';
    else if (args[i] === '--pages') opts.maxPages = Number(args[++i]) || 3;
    else if (args[i] === '--meili-pages') opts.maxMeiliPages = Number(args[++i]);
    else if (args[i] === '--resume-offset') opts.resumeOffset = Number(args[++i]) || 0;
    else if (args[i] === '--dry-run') opts.write = false;
  }
  const db = openDb();
  await discoverUrls({ ...opts, db, resumeOffset: opts.resumeOffset });
  const status = db.prepare('SELECT COUNT(*) AS total FROM songs').get();
  console.log(`[discover] catalog total=${status.total}`);
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { main };
