#!/usr/bin/env node
/**
 * Distill engine_errors into an AI-ready markdown fix brief.
 *
 *   node _Debug_testing/queryTopErrors.mjs
 *   node _Debug_testing/queryTopErrors.mjs --limit 20 --class engine
 *   node _Debug_testing/queryTopErrors.mjs --out _Debug_testing/top_errors.md
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { openDb } = require('../_Research_testing/hooktheory_catalog/lib/db.js');
const { queryTopErrorSignatures, getErrorCatalogStats } = require('../_Research_testing/hooktheory_catalog/lib/engineErrorDb.js');

const LOCUS_HINTS = [
  { re: /bor=locrian|bor=phrygian|bor=dorian/, hint: 'borrowedModeDimSeventhDegree / rootToDiatonicTriad in music.js' },
  { re: /alt=b5|alt=#5/, hint: 'chordAlterations.js applyAlterations' },
  { re: /omit=/, hint: 'seventh selection + chordOmits.js' },
  { re: /sus=/, hint: 'chordSuspensions.js' },
  { re: /type=(9|11|13)/, hint: 'chordExtensions.js' },
  { re: /applied/, hint: 'resolveAppliedBorrowedChord / buildChordFromNoteName in music.js' },
  { re: /inv=/, hint: 'applyInversion / finalizeVoicing (orderOk)' },
];

function parseArgs(argv) {
  const out = { limit: 20, failureClass: 'engine', outFile: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit') out.limit = Number(argv[++i]) || 20;
    else if (argv[i] === '--class') out.failureClass = argv[++i] || 'engine';
    else if (argv[i] === '--out') out.outFile = argv[++i];
  }
  return out;
}

function locusFor(modSig) {
  for (const { re, hint } of LOCUS_HINTS) {
    if (re.test(modSig)) return hint;
  }
  return 'music.js chord pipeline — see ORACLE_GUIDE/04_find_and_fix.md symptom table';
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const db = openDb();
  const stats = getErrorCatalogStats(db);
  const rows = queryTopErrorSignatures(db, { limit: opts.limit });

  const lines = [];
  lines.push('# Engine error fix brief');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Catalog stats');
  lines.push('');
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|------:|`);
  lines.push(`| Signatures indexed | ${stats.signatures} |`);
  lines.push(`| Fetch queue | ${stats.fetch_queued} (${stats.fetch_done} full) |`);
  lines.push(`| Compared chord rows | ${stats.errors_total} |`);
  lines.push(`| Engine failures | ${stats.engine_fails} |`);
  lines.push(`| Error signature groups | ${stats.error_signatures} |`);
  lines.push('');
  lines.push('## Top failure signatures');
  lines.push('');

  if (!rows.length) {
    lines.push('_No engine failures in catalog yet. Run `buildFetchQueue` + `batchFullFetch` + `batchCompareCatalog`._');
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    lines.push(`### ${i + 1}. \`${r.mod_signature}\` (${r.engine_fail_count} fails / ${r.total_compared} compared)`);
    lines.push('');
    lines.push(`- **Suggested locus:** ${locusFor(r.mod_signature)}`);
    lines.push(`- **Example:** \`${r.slug}/${r.section_name}/${r.beat}\``);
    lines.push(`- **truthRoman:** ${r.truth_roman ?? '—'} → **engRoman:** ${r.eng_roman ?? '—'}`);
    lines.push(`- **truthLetter:** ${r.truth_letter ?? '—'} → **engLetter:** ${r.eng_letter ?? '—'}`);
    lines.push(`- **truthPcs:** ${r.truth_pcs_json ?? '—'}`);
    lines.push(`- **engPcs:** ${r.eng_pcs_json ?? '—'}`);
    lines.push(`- **key:** ${r.key_json ?? '—'}`);
    lines.push(`- **chord:** ${r.chord_json ?? '—'}`);
    lines.push('');
  }

  const text = lines.join('\n');
  if (opts.outFile) {
    const outPath = path.resolve(opts.outFile);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, text);
    console.log(`Wrote ${outPath}`);
  } else {
    console.log(text);
  }
  db.close();
}

main();
