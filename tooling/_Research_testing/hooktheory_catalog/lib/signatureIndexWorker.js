/**
 * Worker: parse section JSON files and emit signature aggregates.
 */

const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const { chordSignature } = require('./chordSignature');
const { sigOf, hasMods, chordShape } = require('./modSignature');

function processJobs(jobs) {
  const bySig = new Map();
  for (const job of jobs) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(job.filePath, 'utf8'));
    } catch (_) {
      continue;
    }
    for (const chord of data.chords || []) {
      if (chord.isRest) continue;
      const signature = chordSignature(chord);
      if (!signature) continue;
      const shape = chordShape(chord);
      let ent = bySig.get(signature);
      if (!ent) {
        ent = {
          signature,
          mod_signature: sigOf(chord),
          has_mods: hasMods(chord) ? 1 : 0,
          occurrence_count: 0,
          sample_chord_json: JSON.stringify(shape),
          sample_refs: [],
          slug: job.slug,
        };
        bySig.set(signature, ent);
      }
      ent.occurrence_count += 1;
      if (ent.sample_refs.length < 5) {
        ent.sample_refs.push({ slug: job.slug, section: job.section, beat: chord.beat });
      }
    }
  }
  return [...bySig.values()];
}

try {
  const entries = processJobs(workerData.jobs || []);
  parentPort.postMessage({ ok: true, entries });
} catch (err) {
  parentPort.postMessage({ ok: false, error: err.message });
}
