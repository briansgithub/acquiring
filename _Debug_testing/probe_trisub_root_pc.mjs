#!/usr/bin/env node
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { chordRootPc } = require("../_Decode_oracle/chordRootPc.js");
const { expectedPcs } = require("../_Decode_oracle/truthNotes.js");
const { parseLetter } = require("../_Decode_oracle/svgTruth.js");

const celine = {
  chord: { root: 2, type: 7, inversion: 3, applied: 5, substitutions: ["tri"] },
  key: { tonic: "E", scale: "minor" },
  letter: "G/F",
  roman: "bII42/ii°(∆-sub)",
};
const pc = chordRootPc(celine.chord, celine.key);
const exp = expectedPcs(parseLetter(celine.letter), celine.roman, celine.chord, celine.key);
console.log("triSub rootPc", pc, "expected", exp);
if (pc !== 7 || JSON.stringify(exp) !== JSON.stringify([2, 5, 7, 11])) {
  console.error("FAIL");
  process.exit(1);
}
console.log("ok");
