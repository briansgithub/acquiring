#!/usr/bin/env node
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { dimFrameFromTruth } = require("../_Decode_oracle/truthLetterParse.js");

const cases = [
  ["iiø4(no5)2", "e°(n5)/D", { halfDim: false, dimTriad: true }],
  ["iiø4(no5)2", "d#°(n5)/C#", { halfDim: false, dimTriad: true }],
  ["iiø7", "dø7", { halfDim: true, dimTriad: false }],
  ["iiø7(no5)", "dø7(no5)", { halfDim: true, dimTriad: false }],
  ["ii°7", "d°7", { halfDim: false, dimTriad: true }],
];

let failed = 0;
for (const [roman, letter, want] of cases) {
  const got = dimFrameFromTruth(roman, letter);
  const ok = got.halfDim === want.halfDim && got.dimTriad === want.dimTriad;
  if (!ok) {
    console.error("FAIL", roman, letter, "want", want, "got", got);
    failed++;
  } else {
    console.log("ok", roman, letter, got);
  }
}
process.exit(failed ? 1 : 0);
