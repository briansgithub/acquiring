/**
 * loadDb.js — load existing chord_db.json + shards (or empty state on first run).
 */

const fs = require('fs');
const path = require('path');
const { loadIndex, DB_DIR } = require('./writeOutput');
const { indexEntries } = require('./rebuildMaps');

function loadDatabase() {
  const index = loadIndex();
  const entriesById = new Map();

  if (index?.bucketIndex) {
    const seenFiles = new Set();
    for (const info of Object.values(index.bucketIndex)) {
      if (!info?.file || seenFiles.has(info.file)) continue;
      seenFiles.add(info.file);
      const filePath = path.join(DB_DIR, info.file);
      if (!fs.existsSync(filePath)) continue;
      const entries = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      for (const e of entries) entriesById.set(e.id, e);
    }
  }

  const allEntries = [...entriesById.values()];
  const { byModification, byCompositeKey } = indexEntries(allEntries);

  return {
    meta: index?.meta ? { ...index.meta } : {},
    allEntries,
    byModification,
    byCompositeKey,
  };
}

function emptyDatabase() {
  return {
    meta: {},
    allEntries: [],
    byModification: new Map(),
    byCompositeKey: new Map(),
  };
}

module.exports = { loadDatabase, emptyDatabase };
