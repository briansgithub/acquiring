/**
 * Pipeline hooks for progression index updates (non-blocking).
 */

const { addSong, deleteSong } = require('./indexManager');

async function indexSongAfterProcessed(slug) {
  try {
    return await addSong(slug);
  } catch (err) {
    console.warn(`[progressionIndex] addSong failed for ${slug}:`, err.message);
    return { ok: false, error: err.message };
  }
}

async function removeSongFromIndex(slug) {
  try {
    return await deleteSong(slug);
  } catch (err) {
    console.warn(`[progressionIndex] deleteSong failed for ${slug}:`, err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { indexSongAfterProcessed, removeSongFromIndex };
