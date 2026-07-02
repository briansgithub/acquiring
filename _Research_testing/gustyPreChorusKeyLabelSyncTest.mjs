import fs from "node:fs/promises";
import path from "node:path";
import { getChordSymbol } from "../web-player/lib/jsonToSymbol.js";
import { chordInterpreter } from "../web-player/lib/music.js";

const SCRAPE_PATH = path.resolve(
  "sacred_ring_data/harvest/nintendo__super-mario-galaxy---gusty-garden-galaxy/scrape.json"
);

function normalizeTonic(tonic) {
  return String(tonic || "C")
    .replace(/♭/g, "b")
    .replace(/♯/g, "#")
    .replace(/♮/g, "");
}

function activeSectionKeyAtBeat(keys, beat, fallbackKey) {
  if (!Array.isArray(keys) || keys.length === 0) return fallbackKey;
  let chosen = keys[0];
  for (const key of keys) {
    if ((key?.beat ?? 1) <= beat) chosen = key;
    else break;
  }
  return {
    tonic: normalizeTonic(chosen?.tonic || fallbackKey?.tonic || "C"),
    scale: chosen?.scale || fallbackKey?.scale || "major",
  };
}

function normalizeRoman(roman) {
  return String(roman || "").replaceAll("♭", "b").replaceAll("♯", "#").trim();
}

async function main() {
  const raw = await fs.readFile(SCRAPE_PATH, "utf8");
  const scrape = JSON.parse(raw);
  const preChorus = scrape.sections.find((s) => s.name === "Pre-Chorus");
  if (!preChorus) throw new Error("Pre-Chorus section not found");

  const keys = [...(preChorus.json?.metadata?.keys || [])].sort(
    (a, b) => (a?.beat ?? 1) - (b?.beat ?? 1)
  );
  const firstKey = activeSectionKeyAtBeat(keys, 1, { tonic: "C", scale: "major" });

  const chordRows = (preChorus.svg?.chordRows || []).map((r) => ({
    beat: Number(r.beat),
    truthRoman: normalizeRoman(r.roman),
  }));
  const truthByBeat = new Map(chordRows.map((r) => [r.beat, r.truthRoman]));

  const chords = (preChorus.json?.chords || []).filter((c) => !c.isRest);
  const mismatches = [];
  const keyTimeline = [];

  for (const chord of chords) {
    const beat = chord.beat === 0 ? 1 : chord.beat;
    const activeKey = activeSectionKeyAtBeat(keys, beat, firstKey);
    const engineRoman = normalizeRoman(getChordSymbol(chord, activeKey));
    const truthRoman = truthByBeat.get(beat);
    keyTimeline.push({ beat, key: activeKey, engineRoman, truthRoman });
    if (truthRoman && engineRoman !== truthRoman) {
      const chordData = chordInterpreter(chord, activeKey, { forceRootPosition: false });
      mismatches.push({
        beat,
        key: activeKey,
        truthRoman,
        engineRoman,
        notes: chordData.notes,
        degrees: chordData.chordDegrees,
      });
    }
  }

  const restartKey = activeSectionKeyAtBeat(keys, 1, firstKey);
  const keyChangedMidSection = keyTimeline.some((k) => k.key.tonic !== firstKey.tonic || k.key.scale !== firstKey.scale);
  const restartResetsToOriginal = restartKey.tonic === firstKey.tonic && restartKey.scale === firstKey.scale;

  const report = {
    section: preChorus.name,
    keyEntries: keys,
    firstKey,
    keyChangedMidSection,
    restartResetsToOriginal,
    mismatchCount: mismatches.length,
    mismatches,
    timelineSample: keyTimeline,
  };

  const outPath = path.resolve("_Research_testing/gustyPreChorusKeyLabelSyncReport.json");
  await fs.writeFile(outPath, JSON.stringify(report, null, 2));

  console.log("Gusty Pre-Chorus key-label sync test");
  console.log("Report:", outPath);
  console.log({
    chordsChecked: chords.length,
    keyChangedMidSection,
    restartResetsToOriginal,
    mismatchCount: mismatches.length,
  });

  process.exitCode = mismatches.length === 0 && keyChangedMidSection && restartResetsToOriginal ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
