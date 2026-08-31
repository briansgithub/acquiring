#!/usr/bin/env node
import Database from "better-sqlite3";

const db = new Database("acquiring_data/catalog/hooktheory_catalog.db", { readonly: true });
const rows = db
  .prepare(
    `SELECT slug, truth_roman, truth_letter, mod_signature, notes_ok
     FROM engine_errors WHERE truth_roman LIKE '%sus7%' AND chord_json LIKE '%"type":5%' LIMIT 30`,
  )
  .all();
console.log("count", rows.length);
for (const r of rows) {
  console.log(r.notes_ok ? "ok" : "FAIL", r.mod_signature, r.truth_roman, r.truth_letter);
}
