#!/usr/bin/env node
import Database from "better-sqlite3";
import { chordInterpreter } from "../web-player/lib/music.js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { mergeMods } = require("../_Decode_oracle/truthLetterParse.js");

const db = new Database("sacred_ring_data/catalog/hooktheory_catalog.db", { readonly: true });
const rows = db
  .prepare(
    `SELECT slug, beat, truth_roman, truth_letter, chord_json, key_json, truth_pcs_json, eng_pcs_json
     FROM engine_errors WHERE mod_signature = 'type=7 inv=3 applied' AND notes_ok = 0`,
  )
  .all();

function pcs(notes) {
  const map = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return notes
    .map((n) => {
      const m = n.match(/^([A-Ga-g])([#bx]*)/);
      let pc = map[m[1].toUpperCase()];
      for (const c of m[2]) {
        if (c === "#") pc++;
        else if (c === "b") pc--;
      }
      return ((pc % 12) + 12) % 12;
    })
    .sort((a, b) => a - b);
}

for (const r of rows) {
  const c = JSON.parse(r.chord_json);
  const k = JSON.parse(r.key_json);
  const mods = mergeMods(r.truth_letter, r.truth_roman, c);
  const enriched = { ...c, ...mods, _triSubDominant: c.substitutions?.includes("tri") };
  const built = chordInterpreter(enriched, k);
  const truth = JSON.parse(r.truth_pcs_json);
  console.log("---", r.slug, r.beat, r.truth_roman, r.truth_letter);
  console.log("chord", c);
  console.log("truth", truth, "eng", JSON.parse(r.eng_pcs_json), "now", pcs(built.notes), built.notes);
}
