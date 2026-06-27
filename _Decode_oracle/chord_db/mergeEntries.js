/**
 * mergeEntries.js — add/replace/remove chord entries by song slug (dedupe id: slug/section/beat).
 */

function bucketsForEntries(entries) {
  const mods = new Set();
  const composites = new Set();
  for (const e of entries) {
    for (const b of e.buckets) mods.add(b);
    if (e.compositeKey) composites.add(e.compositeKey);
  }
  return { mods, composites };
}

function unionSets(a, b) {
  for (const x of b) a.add(x);
  return a;
}

function removeSongs(db, slugs) {
  const slugSet = new Set(slugs);
  const removed = db.allEntries.filter((e) => slugSet.has(e.song));
  const { mods, composites } = bucketsForEntries(removed);
  db.allEntries = db.allEntries.filter((e) => !slugSet.has(e.song));
  return {
    removedCount: removed.length,
    affectedModBuckets: mods,
    affectedCompositeKeys: composites,
  };
}

function replaceSongEntries(db, entries) {
  const slugs = [...new Set(entries.map((e) => e.song))];
  const removeResult = removeSongs(db, slugs);
  const { mods, composites } = bucketsForEntries(entries);
  for (const e of entries) db.allEntries.push(e);
  return {
    addedCount: entries.length,
    removedCount: removeResult.removedCount,
    affectedModBuckets: unionSets(new Set(removeResult.affectedModBuckets), mods),
    affectedCompositeKeys: unionSets(new Set(removeResult.affectedCompositeKeys), composites),
  };
}

module.exports = { removeSongs, replaceSongEntries, bucketsForEntries };
