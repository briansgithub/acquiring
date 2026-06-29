/**
 * Add a TheoryTab URL to the catalog and run metadata → processed (not oracle). */

const { parseTheoryTabUrl } = require('./catalogUtils');
const { upsertSong } = require('./db');
const { runPipelineAction, flagsPayload } = require('./pipelineOps');

const STEPS = ['metadata', 'processed'];

async function runFullPipeline(db, slug) {
  for (const action of STEPS) {
    const result = await runPipelineAction(db, slug, action);
    if (!result.ok) return result;
  }
  return flagsPayload(db, slug);
}

async function addSongFromUrl(db, url) {
  const parsed = parseTheoryTabUrl(url);
  if (!parsed) return { ok: false, status: 400, error: 'invalid TheoryTab URL' };
  upsertSong(db, {
    ...parsed,
    status: 'pending',
    discovery_source: 'user_url',
  });
  return runFullPipeline(db, parsed.slug);
}

module.exports = { STEPS, runFullPipeline, addSongFromUrl };
