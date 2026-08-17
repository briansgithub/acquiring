/**
 * Repair the double-encoded subset of dead rows and drop crawler-artifact rows.
 *
 * Two independent findings from re-checking the 258 rows the URL-preservation
 * backfill (backfill-real-urls.js) could not recover:
 *
 * 1. Double encoding. waybackDiscover's old safeDecode() decoded a CDX URL
 *    once. Some archived paths were encoded twice, so one pass left literal
 *    `%28`/`%29` sitting in the "decoded" text — which the OLD slugify() then
 *    read as ordinary characters, baking the digits "28"/"29" straight into
 *    the stored slug (e.g. melody-28bermei-inazawa-original-29). That corrupt
 *    slug is a distinct primary key from the song's real slug, so these exist
 *    as duplicate dead rows sitting alongside a second dead row already using
 *    the correct slug (or, once, an already-enriched row). Fixed decoding
 *    (lib/waybackDiscover.js) now resolves the real URL; 5 of 5 probed live.
 *    Since it changes the slug, applying the fix means merging two rows, not
 *    a plain UPDATE — see mergeDuplicate() below.
 *
 * 2. Crawler artifacts. The Wayback index recorded text that was never a
 *    TheoryTab path — Google text-fragment anchors, pasted redirect params,
 *    literal `\n\n` from a text dump, markdown syntax, base64 tokens. These
 *    aren't songs; every one checked already has its clean-title counterpart
 *    in the catalog as a live row. No DB write is needed for the rows already
 *    sitting here: status='dead' already keeps them out of the harvest queue
 *    even under --force (lightHarvest.js excludes it unconditionally), and
 *    lib/waybackDiscover.js now rejects this shape at ingest — via the new
 *    isCrawlerArtifact() check, before the knownSlugs dedupe even runs — so a
 *    future CDX pass won't re-add them either. This script only reports them,
 *    for visibility into what the dead count is actually made of.
 *
 *   node scripts/fix-double-encoded-urls.js            # dry run
 *   node scripts/fix-double-encoded-urls.js --apply
 *   node scripts/fix-double-encoded-urls.js --rollback <file>
 */

const fs = require('fs');
const path = require('path');
const { openDb } = require('../lib/db');
const { canonicalizeTheoryTabUrl } = require('../lib/waybackDiscover');
const { DATA_DIR } = require('../lib/paths');

const CHILD_TABLES = ['song_details', 'song_metrics', 'song_sections', 'alt_candidates'];

function plan(db) {
  const dead = db.prepare("SELECT * FROM songs WHERE url_source = 'observed' AND status = 'dead'").all();
  const bySlug = new Map(db.prepare('SELECT * FROM songs').all().map((r) => [r.slug, r]));
  const takenUrls = new Set(db.prepare('SELECT url FROM songs').all().map((r) => r.url));

  const fixes = []; // simple in-place URL fix, slug unchanged
  const merges = []; // decode changed the slug: fold the corrupted row into its clean twin
  const duplicates = []; // decode changed the slug, and the clean twin is already enriched
  const artifacts = []; // not a song
  const skipped = { unparseable: 0, unchanged: 0, urlTaken: 0 };

  for (const row of dead) {
    const res = canonicalizeTheoryTabUrl(row.url);
    if (!res) { skipped.unparseable += 1; continue; }
    if (res.rejected === 'crawler-artifact') { artifacts.push(row); continue; }
    if (res.rejected) { skipped.unparseable += 1; continue; }
    if (res.url === row.url) { skipped.unchanged += 1; continue; }

    if (res.slug === row.slug) {
      if (takenUrls.has(res.url)) { skipped.urlTaken += 1; continue; }
      takenUrls.add(res.url);
      fixes.push({ slug: row.slug, from: row.url, to: res.url });
      continue;
    }

    const twin = bySlug.get(res.slug);
    if (!twin) {
      // No collision: renaming this row's own slug is a plain fix, just with
      // a slug change too.
      if (takenUrls.has(res.url)) { skipped.urlTaken += 1; continue; }
      takenUrls.add(res.url);
      fixes.push({ slug: row.slug, newSlug: res.slug, from: row.url, to: res.url });
    } else if (twin.status !== 'dead') {
      // The song is already resolved under its correct slug (usually
      // enriched); the corrupted-slug row is a pure duplicate.
      duplicates.push({ corrupted: row, canonical: twin });
    } else {
      // Both rows are dead: the corrupted one is a parsing artifact of the
      // clean one. Fold it in — canonical row keeps its (already-correct)
      // slug, gets the now-decodable URL, and is requeued.
      merges.push({ corrupted: row, canonical: twin, to: res.url });
    }
  }

  return { fixes, merges, duplicates, artifacts, skipped, deadTotal: dead.length };
}

function collectChildRows(db, slug) {
  const rows = {};
  for (const t of CHILD_TABLES) {
    rows[t] = db.prepare(`SELECT * FROM ${t} WHERE slug = ?`).all(slug);
  }
  return rows;
}

function deleteChildRows(db, slug) {
  for (const t of CHILD_TABLES) db.prepare(`DELETE FROM ${t} WHERE slug = ?`).run(slug);
}

function apply(db, { fixes, merges, duplicates }) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const journal = path.join(DATA_DIR, `fix_double_encoded_${stamp}.rollback.json`);

  const journalData = {
    fixes,
    merges: merges.map((m) => ({
      ...m,
      corruptedRow: m.corrupted,
      corruptedChildren: collectChildRows(db, m.corrupted.slug),
      canonicalRowBefore: m.canonical,
    })),
    duplicates: duplicates.map((d) => ({
      ...d,
      corruptedChildren: collectChildRows(db, d.corrupted.slug),
    })),
  };
  fs.writeFileSync(journal, JSON.stringify(journalData, null, 2));

  const fixSimple = db.prepare(`
    UPDATE songs SET url = ?, status = 'pending', error_message = NULL,
      last_checked_at = NULL, url_source = 'observed'
    WHERE slug = ?
  `);
  const fixRenamed = db.prepare(`
    UPDATE songs SET slug = ?, url = ?, status = 'pending', error_message = NULL,
      last_checked_at = NULL, url_source = 'observed'
    WHERE slug = ?
  `);
  const repointCanonical = db.prepare(`
    UPDATE songs SET url = ?, status = 'pending', error_message = NULL,
      last_checked_at = NULL, url_source = 'observed'
    WHERE slug = ?
  `);
  const deleteSong = db.prepare('DELETE FROM songs WHERE slug = ?');

  const run = db.transaction(() => {
    for (const f of fixes) {
      if (f.newSlug) fixRenamed.run(f.newSlug, f.to, f.slug);
      else fixSimple.run(f.to, f.slug);
    }
    for (const m of merges) {
      deleteChildRows(db, m.corrupted.slug);
      deleteSong.run(m.corrupted.slug);
      repointCanonical.run(m.to, m.canonical.slug);
    }
    for (const d of duplicates) {
      deleteChildRows(db, d.corrupted.slug);
      deleteSong.run(d.corrupted.slug);
    }
  });
  run();

  return journal;
}

function rollback(db, journalFile) {
  const data = JSON.parse(fs.readFileSync(journalFile, 'utf8'));

  const run = db.transaction(() => {
    for (const f of data.fixes) {
      if (f.newSlug) {
        db.prepare('UPDATE songs SET slug = ?, url = ?, status = ?, url_source = NULL WHERE slug = ?')
          .run(f.slug, f.from, 'dead', f.newSlug);
      } else {
        db.prepare('UPDATE songs SET url = ?, status = ?, url_source = NULL WHERE slug = ?')
          .run(f.from, 'dead', f.slug);
      }
    }
    for (const m of data.merges) {
      // Restore the canonical row's prior state, then re-insert the deleted twin.
      const c = m.canonicalRowBefore;
      const cols = Object.keys(c).filter((k) => k !== 'slug');
      db.prepare(`UPDATE songs SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE slug = ?`)
        .run(...cols.map((k) => c[k]), c.slug);
      const row = m.corruptedRow;
      db.prepare(`INSERT INTO songs (${Object.keys(row).join(', ')}) VALUES (${Object.keys(row).map(() => '?').join(', ')})`)
        .run(...Object.values(row));
      for (const [table, rows] of Object.entries(m.corruptedChildren)) {
        for (const r of rows) {
          db.prepare(`INSERT INTO ${table} (${Object.keys(r).join(', ')}) VALUES (${Object.keys(r).map(() => '?').join(', ')})`)
            .run(...Object.values(r));
        }
      }
    }
    for (const d of data.duplicates) {
      const row = d.corrupted;
      db.prepare(`INSERT INTO songs (${Object.keys(row).join(', ')}) VALUES (${Object.keys(row).map(() => '?').join(', ')})`)
        .run(...Object.values(row));
      for (const [table, rows] of Object.entries(d.corruptedChildren)) {
        for (const r of rows) {
          db.prepare(`INSERT INTO ${table} (${Object.keys(r).join(', ')}) VALUES (${Object.keys(r).map(() => '?').join(', ')})`)
            .run(...Object.values(r));
        }
      }
    }
  });
  run();
  return { fixes: data.fixes.length, merges: data.merges.length, duplicates: data.duplicates.length };
}

function main() {
  const argv = process.argv.slice(2);
  const db = openDb();

  const rollbackIdx = argv.indexOf('--rollback');
  if (rollbackIdx !== -1) {
    const file = argv[rollbackIdx + 1];
    if (!file) throw new Error('--rollback needs a journal file');
    const counts = rollback(db, file);
    console.log(`[fix-double-encoded] reverted: ${JSON.stringify(counts)}`);
    return;
  }

  const { fixes, merges, duplicates, artifacts, skipped, deadTotal } = plan(db);
  console.log(`[fix-double-encoded] url_source=observed dead rows: ${deadTotal}`);
  console.log(`[fix-double-encoded]   simple URL fix (slug unchanged or newly free): ${fixes.length}`);
  console.log(`[fix-double-encoded]   merge into existing dead twin: ${merges.length}`);
  console.log(`[fix-double-encoded]   pure duplicate of an already-resolved song: ${duplicates.length}`);
  console.log(`[fix-double-encoded]   crawler artifacts (already dead, no write needed): ${artifacts.length}`);
  console.log(`[fix-double-encoded]   skipped: ${JSON.stringify(skipped)}`);

  console.log('\n--- fixes ---');
  for (const f of fixes) console.log(`  ${f.slug}${f.newSlug ? ` -> ${f.newSlug}` : ''}\n    ${f.from}\n    -> ${f.to}`);
  console.log('\n--- merges (sample) ---');
  for (const m of merges.slice(0, 10)) console.log(`  drop ${m.corrupted.slug}, repoint ${m.canonical.slug} -> ${m.to}`);
  console.log('\n--- duplicates (sample) ---');
  for (const d of duplicates.slice(0, 10)) console.log(`  drop ${d.corrupted.slug} (already have it as ${d.canonical.slug}, status=${d.canonical.status})`);
  console.log('\n--- artifacts (sample) ---');
  for (const a of artifacts.slice(0, 10)) console.log(`  ${a.slug}: ${a.url}`);

  if (!argv.includes('--apply')) {
    console.log('\n[fix-double-encoded] dry run — re-run with --apply to write');
    return;
  }
  const journal = apply(db, { fixes, merges, duplicates });
  console.log(`\n[fix-double-encoded] applied; rollback journal: ${journal}`);
  console.log('[fix-double-encoded] repaired rows are now status=pending — harvest them to resolve');
}

if (require.main === module) main();

module.exports = { plan, apply, rollback };
