import assert from "node:assert/strict";
import { canonicalRoman, canonicalLetter, romanSignature, letterSignature, romanFromFragments, letterFromFragments, sourceFingerprint } from "./sourceAccuracy.mjs";

assert.equal(canonicalRoman("♭II⁶₄"), "bII64");
for (const [left, right] of [["I♮", "I"], ["V7(b9)", "V7"], ["V/ii(maj)", "V/ii"], ["i°7", "iø7"], ["i△7", "i7"]]) {
  assert.notEqual(canonicalRoman(left), canonicalRoman(right));
}
assert.equal(canonicalLetter("g#m7/D#"), "G#m7/D#");
assert.notEqual(canonicalLetter("g#m7(no5)"), canonicalLetter("G#m7"));
assert.deepEqual(letterSignature("g#m7(n°3n5)(b9#11)"), letterSignature("G#m7(no3)(no5)(#11)(b9)"));
assert.deepEqual(letterSignature("Fx7"), letterSignature("F##7"));
assert.notDeepEqual(letterSignature("C(add9)(add9)"), letterSignature("C(add9)"));
assert.notDeepEqual(letterSignature("C(b9)/D"), letterSignature("C/D(b9)"));
assert.deepEqual(romanSignature("Isus27(no3no5)"), romanSignature("I7sus2(no3)(no5)"));
assert.deepEqual(romanSignature("bV6(#23)sus2(loc)"), romanSignature("bV6(#2)(3)sus2(loc)"));
assert.notDeepEqual(romanSignature("I(add9)"), romanSignature("I(add9)(add9)"));
assert.notDeepEqual(romanSignature("V(maj)/ii"), romanSignature("V/ii(maj)"));
assert.notDeepEqual(romanSignature("I(b5)"), romanSignature("I"));
const text = (s, relX, y, fill = "#ffffff") => ({ s, relX, y, fill });
assert.equal(romanFromFragments([text("VI", 3, 761), text("6", 16, 762), text("4", 15, 767), text("D/A", 5, 798, "#dae0e6")]), "VI64");
assert.equal(letterFromFragments([text("eo", 0, 20, "#dae0e6"), text("(no5)", 10, 20, "#dae0e6")]), "e°(no5)");
assert.equal(romanFromFragments([text("i", 50, 698), text("ø6(b5)", 57, 702), text("5", 65, 711)]), "iø65(b5)");
assert.equal(romanFromFragments([text("V", 5, 730), text("7(b5)", 9, 731), text("sus2", 9, 733), text("(maj)", 7, 736), text("/", 16, 730), text("#iii", 19, 730), text("(maj)", 20, 736)]), "V7(b5)sus2(maj)/#iii(maj)");
const source = [{ id: "source", json: "{}", key: {}, truthRoman: "I", truthLetter: "C", truthPcs: [0, 4, 7], expectedRoman: "I" }];
assert.equal(sourceFingerprint(source), sourceFingerprint([{ ...source[0], expectedRoman: "changed parity output" }]));
assert.notEqual(sourceFingerprint(source), sourceFingerprint([{ ...source[0], truthRoman: "V" }]));
console.log("Source accuracy presentation, positioned figures, annotation scope, and independence checks passed");
