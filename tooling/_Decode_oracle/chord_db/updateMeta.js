/**
 * updateMeta.js — recompute meta totals, source slugs, corpus provenance.
 */

const path = require('path');

function sourceSlugs(allEntries) {
  return [...new Set(allEntries.map((e) => e.song))].sort();
}

function updateMeta(db, { corpusFile } = {}) {
  const meta = { ...db.meta };
  const now = new Date().toISOString();
  if (!meta.built) meta.built = now;
  meta.lastUpdated = now;

  const slugs = sourceSlugs(db.allEntries);
  meta.sources = slugs;
  meta.totalChords = db.allEntries.length;
  meta.uniqueChords = db.allEntries.length;

  if (!Array.isArray(meta.corpora)) meta.corpora = [];
  if (corpusFile) {
    const file = path.basename(corpusFile);
    const added = now.slice(0, 10);
    if (!meta.corpora.some((c) => c.file === file)) {
      meta.corpora.push({ file, added });
    }
  }

  const notesOk = db.allEntries.filter((e) => e.notesOk).length;
  meta.notesOkPct = meta.totalChords
    ? Math.round((100 * notesOk) / meta.totalChords * 10) / 10
    : 100;

  return meta;
}

module.exports = { updateMeta, sourceSlugs };
