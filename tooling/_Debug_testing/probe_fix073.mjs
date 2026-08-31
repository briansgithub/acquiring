#!/usr/bin/env node
/** Probe Fix 073 clusters: type=5 alt=b5, type=5 omit=5, type=7 inv=3 bor=phrygianDominant */
import Database from "better-sqlite3";
import { chordInterpreter } from "../../web/lib/music.js";

const db = new Database("acquiring_data/catalog/hooktheory_catalog.db", { readonly: true });

function pcs(notes) {
  const map = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return notes.map((n) => {
    const m = n.match(/^([A-Ga-g])([#bx]*)/);
    let pc = map[m[1].toUpperCase()];
    for (const c of m[2]) { if (c === "#") pc++; else if (c === "b") pc--; }
    return ((pc % 12) + 12) % 12;
  }).sort((a, b) => a - b);
}

const CLUSTERS = [
  "type=5 alt=b5",
  "type=5 omit=5",
  "type=7 inv=3 bor=phrygianDominant",
];

for (const sig of CLUSTERS) {
  console.log(`\n=== ${sig} ===`);
  const rows = db.prepare(`
    SELECT slug, beat, truth_roman, truth_letter, truth_pcs_json, eng_pcs_json, chord_json, key_json
    FROM engine_errors WHERE mod_signature = ? AND notes_ok = 0
    LIMIT 6
  `).all(sig);

  console.log(`count: ${db.prepare(`SELECT COUNT(*) AS c FROM engine_errors WHERE mod_signature = ? AND notes_ok = 0`).get(sig).c}`);

  for (const r of rows) {
    const chord = JSON.parse(r.chord_json);
    const key = JSON.parse(r.key_json);
    const plain = pcs(chordInterpreter(chord, key).notes);
    const enriched = pcs(chordInterpreter({ ...chord, halfDim: true }, key).notes);
    const truth = JSON.parse(r.truth_pcs_json);
  const was = JSON.parse(r.eng_pcs_json);
    console.log({
      slug: r.slug,
      beat: r.beat,
      truthRoman: r.truth_roman,
      truthLetter: r.truth_letter,
      chord,
      key,
      truth,
      was,
      plain,
      enriched,
      plainOk: JSON.stringify(plain) === JSON.stringify(truth),
      enrichedOk: JSON.stringify(enriched) === JSON.stringify(truth),
    });
  }
}

// Manual repro for 10cc case
console.log("\n=== MANUAL 10cc III(b5) ===");
const chord1 = { root: 3, type: 5, alterations: ["b5"] };
const key1 = { tonic: "D#", scale: "harmonicMinor" };
console.log("plain", pcs(chordInterpreter(chord1, key1).notes), chordInterpreter(chord1, key1).notes);

console.log("\n=== MANUAL primus III+(no5) ===");
const chord2 = { root: 3, type: 5, omits: [5] };
const key2 = { tonic: "D#", scale: "harmonicMinor" };
console.log("plain", pcs(chordInterpreter(chord2, key2).notes), chordInterpreter(chord2, key2).notes);

console.log("\n=== MANUAL aiko bVI+△42(phdm) inv=3 ===");
const chord3 = { root: 6, type: 7, inversion: 3, borrowed: "phrygianDominant" };
const key3 = { tonic: "A", scale: "minor" };
console.log("plain", pcs(chordInterpreter(chord3, key3).notes), chordInterpreter(chord3, key3).notes);
