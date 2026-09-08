import fs from "node:fs";
import path from "node:path";
import { canonicalRoman } from "./sourceAccuracy.mjs";

const oracle = process.argv[2];
if (!oracle) throw new Error("Usage: node tooling/scripts/sourceCollisionAudit.mjs <existing-oracle-directory> [--json]");
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const cases = new Map();
for (const directory of ["chord_db", "chord_db_corpus2", "chord_db_corpus3", "chord_db_corpus4"]) {
  for (const type of [5, 7, 9, 11, 13]) {
    const file = path.join(oracle, directory, "byModification", `type=${type}.json`);
    if (!fs.existsSync(file)) continue;
    for (const item of JSON.parse(fs.readFileSync(file, "utf8"))) {
      // Keep every interpretive field, including enriched/optional flags. Only
      // recording position and duration are irrelevant to chord interpretation.
      const chord = Object.fromEntries(Object.entries(item.chord).filter(([key]) => !["beat", "duration", "recordingEndBeat"].includes(key)));
      const key = JSON.stringify(stable({ chord, key: item.key }));
      if (!cases.has(key)) cases.set(key, new Map());
      cases.get(key).set(item.id, { id: item.id, truthRoman: item.truthRoman, truthLetter: item.truthLetter, truthPcs: item.truthPcs });
    }
  }
}
const collisions = [];
for (const [input, entries] of cases) {
  const variants = new Map();
  for (const entry of entries.values()) {
    const signature = JSON.stringify({ roman: canonicalRoman(entry.truthRoman), pcs: entry.truthPcs });
    if (!variants.has(signature)) variants.set(signature, []);
    variants.get(signature).push(entry);
  }
  if (variants.size > 1) collisions.push({ input: JSON.parse(input), variants: [...variants.values()] });
}
if (process.argv.includes("--json")) console.log(JSON.stringify({ completeSignatures: cases.size, conflictingSignatures: collisions.length, collisions }, null, 2));
else {
  console.log(`Existing source collision audit: ${cases.size} complete object/key signatures; ${collisions.length} incompatible Roman/PC evidence groups.`);
  for (const collision of collisions.slice(0, 12)) console.log(JSON.stringify({ input: collision.input, variants: collision.variants.map(items => ({ count: items.length, first: items[0] })) }));
}
