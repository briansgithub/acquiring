/**
 * Re-enrich the first N catalog songs (by discovery order) to validate extended API field capture.
 * Output: _Debug_testing/hooktheory_catalog/re_enrich_report.json
 *
 *   node _Debug_testing/re_enrich_test_batch.cjs [--limit 20]
 */

const fs = require('fs');
const path = require('path');
const catalogRoot = path.join(__dirname, '..', '_Research_testing', 'hooktheory_catalog');
const { openDb, listSongsByFirstSeen } = require(path.join(catalogRoot, 'lib', 'db'));
const { enrichSongs, launchBrowser } = require(path.join(catalogRoot, 'lib', 'enrich'));

const OUT_DIR = path.join(__dirname, 'hooktheory_catalog');
const OUT_FILE = path.join(OUT_DIR, 're_enrich_report.json');

function parseLimit(argv) {
  const idx = argv.indexOf('--limit');
  if (idx >= 0) return Number(argv[idx + 1]) || 20;
  return 20;
}

async function main() {
  const limit = parseLimit(process.argv);
  const db = openDb();
  const batch = listSongsByFirstSeen(db, limit);
  if (!batch.length) {
    console.error('[re-enrich] no songs in catalog');
    process.exit(1);
  }

  console.log(`[re-enrich] starting batch of ${batch.length} songs`);
  const browser = await launchBrowser();
  const startedAt = new Date().toISOString();
  const results = [];

  try {
    await enrichSongs(db, batch, {
      browser,
      onProgress: (r) => {
        console.log(`[re-enrich] ${r.slug} ${r.ok ? 'ok' : r.status || 'fail'}`);
        results.push({
          slug: r.slug,
          ok: r.ok,
          status: r.status || null,
          error: r.error || null,
          primary_key: r.details ? `${r.details.primary_key_tonic} ${r.details.primary_key_scale}` : null,
          bpm: r.details?.bpm ?? null,
          has_melody: r.details?.has_melody ?? null,
          total_notes: r.details?.total_notes ?? null,
          youtube_id: r.details?.youtube_id ?? null,
        });
      },
    });
  } finally {
    await browser.close();
  }

  const ok = results.filter((r) => r.ok).length;
  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    limit,
    requested: batch.map((s) => s.slug),
    ok,
    failed: results.length - ok,
    results,
  };

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));
  console.log(`[re-enrich] done ${ok}/${results.length} ok → ${OUT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
