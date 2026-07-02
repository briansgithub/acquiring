/**
 * Closed-loop verification for mid-section key changes in Gusty Garden Pre-Chorus.
 *
 * Compares static-key decoding (old behavior) vs active-key-per-beat decoding (new behavior)
 * for both melody and chord streams, and writes a focused report.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, "..");
const SCRAPE_PATH = path.join(
  REPO,
  "sacred_ring_data",
  "harvest",
  "nintendo__super-mario-galaxy---gusty-garden-galaxy",
  "scrape.json",
);
const OUT_PATH = path.join(REPO, "_Research_testing", "gustyPreChorusKeyChangeReport.json");

const { parseKey, sdToToneJSNoteName, chordInterpreter } = await import(
  pathToFileURL(path.join(REPO, "web-player", "lib", "music.js")).href
);

function activeKeyAtBeat(keys, beat, fallback) {
  if (!Array.isArray(keys) || !keys.length) return fallback;
  let chosen = keys[0];
  for (const k of keys) {
    if ((k?.beat ?? 1) <= beat) chosen = k;
    else break;
  }
  if (!chosen) return fallback;
  return {
    tonic: String(chosen.tonic || fallback?.tonic || "C")
      .replace(/♭/g, "b")
      .replace(/♯/g, "#")
      .replace(/♮/g, ""),
    scale: chosen.scale || fallback?.scale || "major",
  };
}

function stableStringify(v) {
  return JSON.stringify(v, null, 2);
}

function hasKeyChange(section) {
  const keys = section?.json?.metadata?.keys;
  return Array.isArray(keys) && keys.length > 1;
}

function findPreChorusSection(scrape) {
  const withPreChorus = scrape.sections.filter((s) => {
    const name = String(s?.name || "").toLowerCase();
    return name.includes("pre-chorus");
  });
  const preWithKeyChange = withPreChorus.find((s) => hasKeyChange(s));
  if (preWithKeyChange) return preWithKeyChange;
  return withPreChorus[0] || null;
}

function sameArray(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

const scrape = JSON.parse(fs.readFileSync(SCRAPE_PATH, "utf8"));
const pre = findPreChorusSection(scrape);
if (!pre?.json) {
  throw new Error("Pre-Chorus section not found in scrape.json");
}

const metadata = pre.json.metadata || {};
const keys = Array.isArray(metadata.keys) ? [...metadata.keys].sort((a, b) => (a?.beat ?? 1) - (b?.beat ?? 1)) : [];
const staticKey = parseKey(metadata);
const keyChangeBeat = keys.length > 1 ? (keys[1].beat ?? 33) : null;

const notes = Array.isArray(pre.json.notes) ? pre.json.notes : [];
const chords = Array.isArray(pre.json.chords) ? pre.json.chords : [];

const melodyRows = [];
for (const note of notes) {
  if (note.isRest) continue;
  const beat = note.beat === 0 ? 1 : note.beat;
  const activeKey = activeKeyAtBeat(keys, beat, staticKey);
  const oldAbsolute = sdToToneJSNoteName(note.sd, note.octave, staticKey, 4);
  const newAbsolute = sdToToneJSNoteName(note.sd, note.octave, activeKey, 4);
  melodyRows.push({
    beat,
    sd: note.sd,
    octave: note.octave,
    oldAbsolute,
    newAbsolute,
    changed: oldAbsolute !== newAbsolute,
    activeKey,
  });
}

const chordRows = [];
for (const chord of chords) {
  if (chord.isRest) continue;
  const beat = chord.beat === 0 ? 1 : chord.beat;
  const activeKey = activeKeyAtBeat(keys, beat, staticKey);
  const oldDecoded = chordInterpreter(chord, staticKey);
  const newDecoded = chordInterpreter(chord, activeKey);
  chordRows.push({
    beat,
    root: chord.root,
    type: chord.type,
    inversion: chord.inversion,
    borrowed: chord.borrowed,
    oldNotes: oldDecoded.notes,
    newNotes: newDecoded.notes,
    notesChanged: !sameArray(oldDecoded.notes, newDecoded.notes),
    oldDegrees: oldDecoded.chordDegrees,
    newDegrees: newDecoded.chordDegrees,
    degreesChanged: !sameArray(oldDecoded.chordDegrees, newDecoded.chordDegrees),
    activeKey,
  });
}

const melodyAfterChange = keyChangeBeat == null ? [] : melodyRows.filter((r) => r.beat >= keyChangeBeat);
const chordAfterChange = keyChangeBeat == null ? [] : chordRows.filter((r) => r.beat >= keyChangeBeat);

const report = {
  song: scrape.title,
  section: pre.name,
  staticKey,
  keys,
  keyChangeBeat,
  summary: {
    melodyTotal: melodyRows.length,
    melodyAfterChange: melodyAfterChange.length,
    melodyChangedAfterChange: melodyAfterChange.filter((r) => r.changed).length,
    chordTotal: chordRows.length,
    chordAfterChange: chordAfterChange.length,
    chordNotesChangedAfterChange: chordAfterChange.filter((r) => r.notesChanged).length,
    chordDegreesChangedAfterChange: chordAfterChange.filter((r) => r.degreesChanged).length,
  },
  melodyExamplesAfterChange: melodyAfterChange.filter((r) => r.changed).slice(0, 20),
  chordExamplesAfterChange: chordAfterChange
    .filter((r) => r.notesChanged || r.degreesChanged)
    .slice(0, 20),
};

fs.writeFileSync(OUT_PATH, stableStringify(report));

console.log("Gusty Pre-Chorus key-change closed-loop test");
console.log("Report:", OUT_PATH);
console.log(stableStringify(report.summary));

