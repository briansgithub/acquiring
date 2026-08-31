#!/usr/bin/env node
import Database from "better-sqlite3";

const db = new Database("acquiring_data/catalog/hooktheory_catalog.db", { readonly: true });
const rows = db.prepare(`
  SELECT slug, truth_roman, truth_letter, truth_pcs_json, eng_pcs_json, key_json, chord_json
  FROM engine_errors
  WHERE mod_signature = 'type=7 inv=3' AND notes_ok = 0
`).all();

const byRoot = {};
for (const r of rows) {
  const c = JSON.parse(r.chord_json);
  const k = JSON.parse(r.key_json);
  const key = `${k.tonic} ${k.scale} r=${c.root}`;
  (byRoot[c.root] ??= []).push({
    key, roman: r.truth_roman, letter: r.truth_letter,
    truth: r.truth_pcs_json, eng: r.eng_pcs_json, slug: r.slug,
  });
}
for (const [root, arr] of Object.entries(byRoot).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`root ${root} n=${arr.length}`);
  for (const x of arr) console.log(" ", x);
}
