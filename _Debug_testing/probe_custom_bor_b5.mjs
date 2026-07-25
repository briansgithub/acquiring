#!/usr/bin/env node
import Database from "better-sqlite3";
import { chordInterpreter } from "../web-player/lib/music.js";

const db = new Database("sacred_ring_data/catalog/hooktheory_catalog.db", { readonly: true });

const rows = db.prepare(`
  SELECT key_json, chord_json, truth_pcs_json, eng_pcs_json, truth_roman, eng_roman, slug
  FROM engine_errors
  WHERE mod_signature = 'type=7 bor=custom alt=b5' AND notes_ok = 0
  LIMIT 50
`).all();

function parsePcs(s) {
  try { return JSON.parse(s); } catch { return s; }
}

const needy = db.prepare(`
  SELECT chord_json, key_json FROM engine_errors
  WHERE slug = 'ariana-grande__needy' AND mod_signature = 'type=7 bor=custom alt=b5' LIMIT 1
`).get();
console.log("NEEDY", JSON.stringify(JSON.parse(needy.chord_json), null, 2));

for (const r of rows) {
  const key = JSON.parse(r.key_json);
  const chord = JSON.parse(r.chord_json);
  const enriched = { ...chord, halfDim: true, flattenHalfDimB5: true };
  const built = chordInterpreter(enriched, key);
  const engNow = built.notes;
  const truth = parsePcs(r.truth_pcs_json);
  const engPcs = parsePcs(r.eng_pcs_json);
  const nowPcs = parsePcs(JSON.stringify(
    engNow.map((n) => {
      const map = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
      const m = n.match(/^([A-Ga-g])([#bx]*)/);
      let pc = map[m[1].toUpperCase()];
      for (const c of m[2]) { if (c === "#") pc++; else if (c === "b") pc--; }
      return ((pc % 12) + 12) % 12;
    }).sort((a, b) => a - b),
  ));
  const ok = JSON.stringify(nowPcs) === JSON.stringify(truth);
  console.log("---", r.slug, ok ? "FIXED" : "FAIL", r.truth_roman);
  if (!ok) console.log("truth", truth, "was", engPcs, "now", nowPcs);
}
