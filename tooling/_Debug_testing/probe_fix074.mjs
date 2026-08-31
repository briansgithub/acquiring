#!/usr/bin/env node
import Database from "better-sqlite3";
import { chordInterpreter } from "../../web/lib/music.js";
import { noteNameToPc } from "../../web/lib/chordNoteUtils.js";

const db = new Database("acquiring_data/catalog/hooktheory_catalog.db", { readonly: true });

function pcs(notes) {
  return notes.map((n) => noteNameToPc(n)).sort((a, b) => a - b);
}

for (const sig of ["type=7 inv=3", "type=5 inv=2 bor=phrygianDominant", "type=9 alt=b5"]) {
  const rows = db
    .prepare(
      `SELECT slug, beat, truth_roman, truth_letter, chord_json, key_json, truth_pcs_json, eng_pcs_json
       FROM engine_errors WHERE mod_signature = ? AND notes_ok = 0`,
    )
    .all(sig);
  console.log(`\n=== ${sig} (${rows.length}) ===`);
  const seen = new Set();
  for (const r of rows) {
    const tag = `${r.truth_roman}|${JSON.parse(r.key_json).scale}`;
    if (seen.has(tag)) continue;
    seen.add(tag);
    const c = JSON.parse(r.chord_json);
    const k = JSON.parse(r.key_json);
    const built = chordInterpreter(c, k);
    const truth = JSON.parse(r.truth_pcs_json);
    const now = pcs(built.notes);
    console.log(r.slug.split("__")[0], r.truth_roman, k, "truth", truth, "now", now, built.notes);
  }
}
