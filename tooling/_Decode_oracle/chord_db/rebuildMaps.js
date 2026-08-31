/**
 * rebuildMaps.js — index flat entry list into modification / composite maps.
 */

function indexEntries(allEntries) {
  const byModification = new Map();
  const byCompositeKey = new Map();
  for (const entry of allEntries) {
    for (const bucket of entry.buckets) {
      if (!byModification.has(bucket)) byModification.set(bucket, []);
      byModification.get(bucket).push(entry);
    }
    if (entry.compositeKey) {
      if (!byCompositeKey.has(entry.compositeKey)) byCompositeKey.set(entry.compositeKey, []);
      byCompositeKey.get(entry.compositeKey).push(entry);
    }
  }
  return { byModification, byCompositeKey };
}

function rebuildDbMaps(db) {
  const maps = indexEntries(db.allEntries);
  db.byModification = maps.byModification;
  db.byCompositeKey = maps.byCompositeKey;
  return db;
}

module.exports = { indexEntries, rebuildDbMaps };
