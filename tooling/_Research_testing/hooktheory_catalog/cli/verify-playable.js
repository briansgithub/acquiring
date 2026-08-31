/**
 * Verify, for every catalogued song, whether it has real playable chord/melody
 * data — purely from local DB + on-disk artifacts, no hooktheory.com requests.
 *
 *   node cli/verify-playable.js [--out <dir>]
 */

const fs = require('fs');
const path = require('path');
const { openDb } = require('../lib/db');
const { verifyAll, BUCKETS } = require('../lib/verifyPlayable');

function parseArgs(argv) {
  const args = { out: process.env.VERIFY_PLAYABLE_OUT || null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') args.out = argv[++i];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.out) {
    console.error('Missing output directory. Pass --out <dir> or set VERIFY_PLAYABLE_OUT.');
    process.exit(1);
  }
  fs.mkdirSync(args.out, { recursive: true });

  const db = openDb();
  const { results, counts, total, mismatchCount } = verifyAll(db);
  db.close();

  const summary = { total, counts, mismatchCount, generatedAt: new Date().toISOString() };
  const needsAttention = results.filter((r) => r.bucket !== 'playable');

  fs.writeFileSync(path.join(args.out, 'verify-playable-summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(args.out, 'verify-playable-results.json'), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(args.out, 'missing-playable.json'), JSON.stringify(needsAttention, null, 2));

  console.log('=== Playable Verification Summary ===');
  console.log(`Total songs: ${total}`);
  for (const bucket of BUCKETS) {
    console.log(`  ${bucket.padEnd(24)} ${counts[bucket]}`);
  }
  console.log(`DB/filesystem mismatches noted: ${mismatchCount}`);
  console.log(`\nOutput written to: ${args.out}`);
}

if (require.main === module) main();

module.exports = { main };
