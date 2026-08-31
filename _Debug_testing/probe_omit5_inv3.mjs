#!/usr/bin/env node
import Database from "better-sqlite3";
import { chordInterpreter } from "../web/lib/music.js";

const db = new Database("acquiring_data/catalog/hooktheory_catalog.db", { readonly: true });
const rows = db.prepare(`
  SELECT chord_json, key_json, truth_pcs_json, eng_pcs_json, slug
  FROM engine_errors
  WHERE mod_signature = 'type=7 inv=3 omit=5' AND notes_ok = 0
  LIMIT 8
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
  const enriched = { ...chord, halfDim: true };
  const notes = chordInterpreter(enriched, key).notes;
  const truth = JSON.parse(r.truth_pcs_json);
  const now = pcs(notes);
  console.log({
    slug: r.slug,
    truth,
    was: JSON.parse(r.eng_pcs_json),
    now,
    notes,
  });
}

const all = db.prepare(`
  SELECT slug, beat, truth_roman, truth_letter, truth_pcs_json, chord_json, key_json
  FROM engine_errors WHERE mod_signature = 'type=7 inv=3 omit=5' AND notes_ok = 0
`).all();
console.log("\nALL", all.length);
for (const r of all) {
  const k = JSON.parse(r.key_json);
  const c = JSON.parse(r.chord_json);
  console.log(r.slug, r.beat, k.tonic, k.scale, r.truth_letter, JSON.parse(r.truth_pcs_json));
}
