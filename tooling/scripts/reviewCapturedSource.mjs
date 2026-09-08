// Produces evidence-backed extraction corrections only. No app interpreter is
// imported: changing or regenerating parity outputs cannot change this review.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { canonicalRoman, romanFromFragments, letterFromFragments, sourceFingerprint } from "./sourceAccuracy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const harvest = process.argv[2];
const output = process.argv[3];
if (!harvest || !output) throw new Error("Usage: node tooling/scripts/reviewCapturedSource.mjs <harvest-directory> <new-review-output.json>");
if (fs.existsSync(output)) throw new Error("Refusing to overwrite an existing source review. Generate a candidate at a new path and review its diff.");
const cases = JSON.parse(fs.readFileSync(path.join(root, "contracts/fixtures/hooktheory_parity.json"), "utf8"));
const cache = new Map();
const corrections = [];
const extraction = { matched: 0, missingSection: 0, countMismatch: 0, missingBeat: 0, changedObject: 0 };
const multiset = value => [...canonicalRoman(value)].sort().join("");
for (const item of cases) {
  const pieces = item.id.split("/");
  const slug = pieces.shift();
  const beat = Number(pieces.pop());
  const sectionName = pieces.join("/");
  if (!cache.has(slug)) {
    const sourcePath = path.join(harvest, slug, "scrape.json");
    if (!fs.existsSync(sourcePath)) { cache.set(slug, null); }
    else {
      const raw = fs.readFileSync(sourcePath);
      cache.set(slug, { data: JSON.parse(raw), sha256: crypto.createHash("sha256").update(raw).digest("hex") });
    }
  }
  const source = cache.get(slug);
  const section = source?.data.sections.find(section => section.name === sectionName);
  if (!section) { extraction.missingSection++; continue; }
  const chords = section.json?.chords?.filter(chord => !chord.isRest) || [];
  const index = chords.findIndex(chord => chord.beat === beat);
  if (index < 0) { extraction.missingBeat++; continue; }
  if (chords.length !== section.rendered?.length) { extraction.countMismatch++; continue; }
  const object = JSON.parse(item.json);
  if (Object.entries(object).some(([key, value]) => JSON.stringify(value) !== JSON.stringify(chords[index][key]))) {
    extraction.changedObject++; continue;
  }
  extraction.matched++;
  const rendered = section.rendered[index];
  const reconstructed = romanFromFragments(rendered.texts);
  // A changed symbol is not an extraction correction. Review it separately.
  const original = {};
  const corrected = {};
  if (reconstructed !== item.truthRoman && multiset(reconstructed) === multiset(item.truthRoman)) {
    original.truthRoman = item.truthRoman;
    corrected.truthRoman = reconstructed;
  }
  const letter = letterFromFragments(rendered.texts);
  const legacyRaw = letter.replace(/o+/g, "°");
  const firstCircle = legacyRaw.indexOf("°");
  const legacyClean = firstCircle < 0 ? legacyRaw : legacyRaw.slice(0, firstCircle + 1) + legacyRaw.slice(firstCircle + 1).replace(/°/g, "");
  // Limit this correction to the proven global-o replacement artifact. Do not
  // infer missing chord quality or change notes from a different capture.
  if (letter !== item.truthLetter && legacyClean === item.truthLetter) {
    original.truthLetter = item.truthLetter;
    corrected.truthLetter = letter;
  }
  if (!Object.keys(corrected).length) continue;
  corrections.push({
    id: item.id,
    category: "positioned-svg-extraction",
    original,
    corrected,
    reason: "Matching chord object and equal non-rest/rendered counts. Read SVG elements in their captured order, join visually stacked figured-bass digits top-to-bottom, and retain each borrowing tag on its side of the applied slash. Roman corrections preserve the exact symbol multiset. Letter corrections undo only the legacy global replacement of o in omission text by a diminished circle, verified by reproducing that original parser output.",
    source: { url: source.data.url, section: sectionName, beat, songId: section.songId, renderedOrder: index,
      capturePath: `harvest/${slug}/scrape.json`, captureSha256: source.sha256, raw: rendered.raw, texts: rendered.texts },
  });
}
const review = { schemaVersion: 1, caseCount: cases.length, sourceFingerprint: sourceFingerprint(cases),
  reviewedAt: "2026-09-08", source: "Frozen truthRoman, truthLetter and truthPcs in hooktheory_parity.json; expected* fields are explicitly excluded from this review.",
  extractionAudit: extraction,
  limitations: ["Recent harvests can lack the older rendered rows. They never overwrite the frozen truth fields.", "Pitch classes in the original fixture were inferred from rendered symbols, not independently recorded MIDI; documented parser corrections are required before treating discrepancies as interpreter bugs."],
  corrections };
fs.writeFileSync(output, JSON.stringify(review, null, 2) + "\n");
console.log(`Reviewed ${cases.length} captured cases: ${corrections.length} positioned SVG corrections; ${JSON.stringify(extraction)}`);
