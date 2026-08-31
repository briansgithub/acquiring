/**
 * writeOutput.js — persist sharded chord DB + SUMMARY.md
 */

const fs = require('fs');
const path = require('path');
const { summarizeBuckets } = require('./buildDb');

const DB_DIR = path.join(__dirname);
const DEFAULT_DB_DIR = DB_DIR;
let activeDbDir = DEFAULT_DB_DIR;

function configureDbDir(dir) {
  activeDbDir = dir ? path.resolve(dir) : DEFAULT_DB_DIR;
}

function getDbDir() {
  return activeDbDir;
}
function shardDir() { return path.join(getDbDir(), 'byModification'); }
function compositeDir() { return path.join(getDbDir(), 'byCompositeKey'); }

function pct(n, d) {
  return d ? `${((100 * n) / d).toFixed(1)}%` : '-';
}

function safeFileName(key) {
  return key.replace(/[<>:"|?*\\]/g, '_');
}

function writeShardFile(dir, key, entries) {
  const fileName = `${safeFileName(key)}.json`;
  const filePath = path.join(dir, fileName);
  if (!entries.length) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return null;
  }
  fs.writeFileSync(filePath, JSON.stringify(entries, null, 2));
  return path.relative(getDbDir(), filePath).replace(/\\/g, '/');
}

function writeShards(map, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const index = {};
  for (const [key, entries] of map) {
    const rel = writeShardFile(dir, key, entries);
    if (rel) index[key] = { file: rel, count: entries.length };
  }
  return index;
}

function writeShardsPartial(map, dir, onlyKeys) {
  fs.mkdirSync(dir, { recursive: true });
  const index = {};
  for (const key of onlyKeys) {
    const entries = map.get(key) || [];
    const rel = writeShardFile(dir, key, entries);
    if (rel) index[key] = { file: rel, count: entries.length };
  }
  return index;
}

function writeSummary(statsMap, meta, outPath, allEntries = []) {
  const rows = [...statsMap.entries()]
    .map(([mod, s]) => ({ mod, ...s }))
    .sort((a, b) => a.notesOkPct - b.notesOkPct || b.total - a.total);

  const below99 = rows.filter((r) => r.notesOkPct < 99);
  const globalTotal = allEntries.length || meta.totalChords;
  const globalNotesOk = allEntries.filter((e) => e.notesOk).length;
  const globalRoman = allEntries.filter((e) => e.romanExact).length;
  const uniqueBelow99 = allEntries.filter((e) => !e.notesOk).length;

  const sourceCount = Array.isArray(meta.sources) ? meta.sources.length : (meta.sources || 0);
  const updatedLine = meta.lastUpdated ? ` | Updated: ${meta.lastUpdated}` : '';

  let md = `# Chord DB — modification pass rates\n\n`;
  md += `Built: ${meta.built}${updatedLine} | Sources: ${sourceCount} songs | Unique chords: ${globalTotal}\n\n`;
  md += `- **notesOk (unique):** ${pct(globalNotesOk, globalTotal)} (${globalNotesOk}/${globalTotal})\n`;
  md += `- **romanExact (unique):** ${pct(globalRoman, globalTotal)} (${globalRoman}/${globalTotal})\n`;
  md += `- **Chords below 99% target:** ${uniqueBelow99} failing (${pct(uniqueBelow99, globalTotal)} of corpus)\n`;
  md += `- **Buckets below 99%:** ${below99.length} / ${rows.length}\n\n`;

  if (below99.length) {
    md += `## Worst buckets (engine fix priority)\n\n`;
    for (const r of below99.slice(0, 12)) {
      md += `### \`${r.mod}\` — ${pct(r.notesOk, r.total)} (${r.notesOk}/${r.total})\n\n`;
      md += `Failure mix: engine=${r.byClass.engine || 0}, harness=${r.byClass.harness || 0}, piano_noise=${r.byClass.piano_noise || 0}\n\n`;
      if (r.failingExamples.length) {
        md += `Example:\n\`\`\`json\n${JSON.stringify(r.failingExamples[0], null, 2)}\n\`\`\`\n\n`;
      }
    }
  }

  md += `## All buckets (worst first)\n\n`;
  md += `| Modification | count | notesOk | romanExact | failing | engine | harness | piano | example |\n`;
  md += `|---|---:|---:|---:|---:|---:|---:|---:|---|\n`;
  for (const r of rows) {
    const ex = r.failingExamples[0];
    const failHint = ex ? `\`${ex.id}\` ${ex.truthRoman}→${ex.engRoman}` : '';
    md += `| ${r.mod} | ${r.total} | ${pct(r.notesOk, r.total)} | ${pct(r.romanExact, r.total)} | ${r.failing} | ${r.byClass.engine || 0} | ${r.byClass.harness || 0} | ${r.byClass.piano_noise || 0} | ${failHint} |\n`;
  }

  md += `\n## Recommended engine fix order\n\n`;
  md += `1. **suspensions** — not applied in \`chordInterpreter\` (0% notesOk expected)\n`;
  md += `2. **omits** — not applied in note builder\n`;
  md += `3. **adds** — extensions missing from generated notes\n`;
  md += `4. **alterations** — b9/#5/etc. not reflected in PCs\n`;
  md += `5. **type=13** — 13th chords missing extension notes\n`;
  md += `6. **borrowed=custom-array** — Roman + notes edge cases\n\n`;
  md += `See \`_Decode_oracle/DECODE_FIX_LOG.md\` for applied fixes and open gaps.\n`;

  fs.writeFileSync(outPath, md);
  return { rows, below99 };
}

function buildBucketIndex(statsMap, fileIndex) {
  const bucketIndex = {};
  for (const [key, s] of statsMap) {
    bucketIndex[key] = {
      file: fileIndex[key]?.file || `byModification/${safeFileName(key)}.json`,
      ...s,
      notesOkPct: Math.round(s.notesOkPct * 10) / 10,
      romanExactPct: Math.round(s.romanExactPct * 10) / 10,
    };
    delete bucketIndex[key].failingExamples;
  }
  return bucketIndex;
}

function buildCompositeIndex(byCompositeKey) {
  const compositeIndex = {};
  for (const [key, entries] of byCompositeKey) {
    compositeIndex[key] = {
      file: `byCompositeKey/${safeFileName(key)}.json`,
      count: entries.length,
    };
  }
  return compositeIndex;
}

function writeDatabase(db, opts = {}) {
  const statsMap = summarizeBuckets(db.byModification);
  const existing = loadIndex();
  const fullWrite = !opts.affectedModBuckets;
  const modShardDir = shardDir();
  const compShardDir = compositeDir();

  let modIndex;
  if (fullWrite) {
    modIndex = writeShards(db.byModification, modShardDir);
  } else {
    modIndex = writeShardsPartial(db.byModification, modShardDir, opts.affectedModBuckets);
    for (const [key, info] of Object.entries(existing?.bucketIndex || {})) {
      if (!modIndex[key] && info?.file) modIndex[key] = { file: info.file, count: info.total };
    }
  }

  let compositeIndex = {};
  if (db.byCompositeKey.size) {
    if (fullWrite) {
      compositeIndex = writeShards(db.byCompositeKey, compShardDir);
    } else if (opts.affectedCompositeKeys?.size) {
      compositeIndex = writeShardsPartial(db.byCompositeKey, compShardDir, opts.affectedCompositeKeys);
      for (const [key, info] of Object.entries(existing?.compositeIndex || {})) {
        if (!compositeIndex[key] && info?.file) compositeIndex[key] = info;
      }
    } else {
      compositeIndex = existing?.compositeIndex || buildCompositeIndex(db.byCompositeKey);
    }
  }

  const bucketIndex = buildBucketIndex(statsMap, modIndex);
  const index = {
    meta: { ...db.meta },
    bucketIndex,
    compositeIndex,
  };
  const globalNotesOk = db.allEntries.filter((e) => e.notesOk).length;
  index.meta.notesOkPct = db.meta.totalChords
    ? Math.round((100 * globalNotesOk) / db.meta.totalChords * 10) / 10
    : 100;
  fs.writeFileSync(path.join(getDbDir(), 'chord_db.json'), JSON.stringify(index, null, 2));

  const summary = writeSummary(statsMap, db.meta, path.join(getDbDir(), 'SUMMARY.md'), db.allEntries);
  return { index, summary };
}

function loadIndex() {
  const p = path.join(getDbDir(), 'chord_db.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function loadBucket(bucketKey) {
  const index = loadIndex();
  const info = index?.bucketIndex?.[bucketKey];
  if (!info?.file) return null;
  const file = path.join(getDbDir(), info.file);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

module.exports = {
  DB_DIR: DEFAULT_DB_DIR,
  configureDbDir,
  getDbDir,
  shardDir,
  compositeDir,
  writeDatabase,
  writeSummary,
  writeShardsPartial,
  loadIndex,
  loadBucket,
  pct,
};
