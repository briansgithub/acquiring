const { enrichPending } = require('../lib/enrich');

async function main() {
  const limit = Number(process.argv.find((a, i) => process.argv[i - 1] === '--limit') || 10);
  const results = await enrichPending({ limit });
  const ok = results.filter((r) => r.ok).length;
  console.log(`[enrich] done ${ok}/${results.length} ok`);
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { main };
