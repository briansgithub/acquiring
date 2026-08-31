#!/usr/bin/env node
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { openDb } = require("../_Research_testing/hooktheory_catalog/lib/db.js");

const db = openDb();
const total = db.prepare(
  "SELECT COUNT(*) AS n FROM engine_errors WHERE failure_class = 'engine' AND notes_ok = 0",
).get().n;

const pcsMatch = db.prepare(`
  SELECT COUNT(*) AS n FROM engine_errors
  WHERE failure_class = 'engine' AND notes_ok = 0 AND truth_pcs_json = eng_pcs_json
`).get().n;

const flags = db.prepare(`
  SELECT failure_flags_json, COUNT(*) AS n
  FROM engine_errors
  WHERE failure_class = 'engine' AND notes_ok = 0
  GROUP BY failure_flags_json
  ORDER BY n DESC
  LIMIT 12
`).all();

console.log({ totalEngineFails: total, pcsMatchButFail: pcsMatch, pcsMismatch: total - pcsMatch });
console.log("top flag combos:", flags);
db.close();
