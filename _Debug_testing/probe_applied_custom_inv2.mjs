#!/usr/bin/env node
import Database from "better-sqlite3";
import { chordInterpreter } from "../web-player/lib/music.js";
import { resolveBorrowedScale, getScaleChordQualities } from "../web-player/lib/musicScale.js";
import { getNoteLabel } from "../web-player/lib/musicScale.js";
import { MAJOR_SCALE_CHORD_QUALITIES } from "../web-player/lib/scales.js";

const db = new Database("sacred_ring_data/catalog/hooktheory_catalog.db", { readonly: true });
const rows = db.prepare(`
  SELECT chord_json, key_json, truth_pcs_json, eng_pcs_json, slug, truth_roman, truth_letter
  FROM engine_errors
  WHERE mod_signature = 'type=5 inv=2 applied bor=custom' AND notes_ok = 0
`).all();

function pcs(notes) {
  const map = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return notes.map((n) => {
    const m = n.match(/^([A-Ga-g])([#bx]*)/);
    let pc = map[m[1].toUpperCase()];
    for (const c of m[2]) { if (c === "#") pc++; else if (c === "b") pc--; }
    return ((pc % 12) + 12) % 12;
  }).sort((a, b) => a - b);
}

for (const r of rows) {
  const chord = JSON.parse(r.chord_json);
  const key = JSON.parse(r.key_json);
  const enriched = { ...chord, dimTriad: true };
  const built = chordInterpreter(enriched, key);
  const { key: mk, customScaleIntervals, scaleChordQualities } = resolveBorrowedScale(key, chord.borrowed);
  const q = getScaleChordQualities(mk.scale, scaleChordQualities);
  const targetNote = getNoteLabel(chord.root, mk, customScaleIntervals);
  const appliedKey = { tonic: targetNote, scale: "major" };
  const appliedRoot = getNoteLabel(chord.applied, appliedKey);
  console.log({
    slug: r.slug,
    roman: r.truth_roman,
    letter: r.truth_letter,
    truth: JSON.parse(r.truth_pcs_json),
    eng: JSON.parse(r.eng_pcs_json),
    now: pcs(built.notes),
    notes: built.notes,
    targetNote,
    appliedRoot,
    appliedQual: MAJOR_SCALE_CHORD_QUALITIES[chord.applied - 1],
    borDeg5Qual: q[4],
  });
}
