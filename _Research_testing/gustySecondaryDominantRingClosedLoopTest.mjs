import fs from "node:fs/promises";
import path from "node:path";
import { getChordSymbol } from "../web-player/lib/jsonToSymbol.js";
import { getNoteLabel } from "../web-player/lib/music.js";

const SCRAPE_PATH = path.resolve(
  "sacred_ring_data/harvest/nintendo__super-mario-galaxy---gusty-garden-galaxy/scrape.json",
);
const OUT_JSON = path.resolve("_Research_testing/gustySecondaryDominantRingClosedLoopReport.json");
const OUT_MD = path.resolve("_Research_testing/gustySecondaryDominantRingClosedLoopTable.md");

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

function resolvePlacementDegreeFromNote(noteName, key) {
  if (!noteName || !key) return null;
  for (let degree = 1; degree <= 7; degree += 1) {
    if (getNoteLabel(degree, key) === noteName) return degree;
  }
  const noteLetter = String(noteName)[0]?.toUpperCase();
  if (!noteLetter) return null;
  for (let degree = 1; degree <= 7; degree += 1) {
    const diatonic = getNoteLabel(degree, key);
    if (diatonic && diatonic[0]?.toUpperCase() === noteLetter) return degree;
  }
  return null;
}

function expectedPlacementForChord(chord, activeKey) {
  const colorDegree = Number(chord?.root);
  const appliedDegree = Number(chord?.applied);
  if (!Number.isInteger(colorDegree) || colorDegree < 1 || colorDegree > 7) {
    return {
      placementDegree: null,
      colorDegree: null,
      targetTonicNote: null,
      appliedRootNote: null,
      reason: "invalid root",
    };
  }

  if (!Number.isInteger(appliedDegree) || appliedDegree < 1 || appliedDegree > 7) {
    return {
      placementDegree: colorDegree,
      colorDegree,
      targetTonicNote: null,
      appliedRootNote: null,
      reason: "non-applied chord: placement follows root",
    };
  }

  const targetTonicNote = getNoteLabel(colorDegree, activeKey);
  const appliedKey = { tonic: targetTonicNote, scale: "major" };
  const appliedRootNote = getNoteLabel(appliedDegree, appliedKey);
  const mapped = resolvePlacementDegreeFromNote(appliedRootNote, activeKey);
  const placementDegree = mapped ?? colorDegree;

  return {
    placementDegree,
    colorDegree,
    targetTonicNote,
    appliedRootNote,
    reason: mapped
      ? `applied chord: ${appliedDegree} of ${colorDegree} => ${appliedRootNote} => degree ${placementDegree} in current key`
      : `applied chord: fallback to root ${colorDegree} (no mapping for ${appliedRootNote})`,
  };
}

function quoteMd(value) {
  return String(value).replace(/\|/g, "\\|");
}

function sectionSortByBeat(a, b) {
  return (a?.beat ?? 1) - (b?.beat ?? 1);
}

async function main() {
  const raw = await fs.readFile(SCRAPE_PATH, "utf8");
  const scrape = JSON.parse(raw);
  const sections = Array.isArray(scrape.sections) ? scrape.sections : [];

  const rows = [];
  const failures = [];
  let totalChordsChecked = 0;
  let totalApplied = 0;
  let totalAffected = 0;

  for (const section of sections) {
    const sectionName = section?.name || "Unknown";
    const metadata = section?.json?.metadata || {};
    const keys = Array.isArray(metadata.keys) ? [...metadata.keys].sort(sectionSortByBeat) : [];
    const fallbackKey = activeSectionKeyAtBeat(keys, 1, { tonic: "C", scale: "major" });
    const chords = Array.isArray(section?.json?.chords) ? section.json.chords : [];

    for (const chord of chords) {
      if (!chord || chord.isRest) continue;
      totalChordsChecked += 1;
      const beat = chord.beat === 0 ? 1 : chord.beat;
      const activeKey = activeSectionKeyAtBeat(keys, beat, fallbackKey);
      const expected = expectedPlacementForChord(chord, activeKey);
      const isApplied = Number(chord.applied) >= 1 && Number(chord.applied) <= 7;
      if (isApplied) totalApplied += 1;

      const colorValid = expected.colorDegree === Number(chord.root);
      const placementValid = isApplied
        ? Number.isInteger(expected.placementDegree) && expected.placementDegree >= 1 && expected.placementDegree <= 7
        : expected.placementDegree === Number(chord.root);
      const isAffected = isApplied && expected.placementDegree !== expected.colorDegree;
      if (isAffected) totalAffected += 1;

      const row = {
        section: sectionName,
        beat,
        key: `${activeKey.tonic} ${activeKey.scale}`,
        symbol: getChordSymbol(chord, activeKey),
        root: Number(chord.root),
        applied: Number(chord.applied || 0),
        placementDegree: expected.placementDegree,
        colorDegree: expected.colorDegree,
        targetTonicNote: expected.targetTonicNote,
        appliedRootNote: expected.appliedRootNote,
        affected: isAffected,
        colorValid,
        placementValid,
        valid: colorValid && placementValid,
        whyValid: expected.reason,
      };
      rows.push(row);
      if (!row.valid) failures.push(row);
    }
  }

  const affectedRows = rows.filter((r) => r.affected);
  const report = {
    song: scrape.title || "nintendo - Super Mario Galaxy - Gusty Garden Galaxy",
    totals: {
      sectionsChecked: sections.length,
      chordsChecked: totalChordsChecked,
      appliedChords: totalApplied,
      affectedAppliedChords: totalAffected,
      failures: failures.length,
    },
    pass: failures.length === 0,
    affectedRows,
    failures,
  };

  const mdLines = [];
  mdLines.push("# Gusty Garden Galaxy Secondary-Dominant Ring Closed-Loop Results");
  mdLines.push("");
  mdLines.push(`- Sections checked: ${report.totals.sectionsChecked}`);
  mdLines.push(`- Chords checked: ${report.totals.chordsChecked}`);
  mdLines.push(`- Applied chords checked: ${report.totals.appliedChords}`);
  mdLines.push(`- Affected chords (placement != color root): ${report.totals.affectedAppliedChords}`);
  mdLines.push(`- Failures: ${report.totals.failures}`);
  mdLines.push("");
  mdLines.push("## Affected Chords Table");
  mdLines.push("");
  mdLines.push("| Section | Beat | Key | Symbol | Root(color) | Applied | Placement | Target tonic | Applied root note | Why valid |");
  mdLines.push("|---|---:|---|---|---:|---:|---:|---|---|---|");
  for (const r of affectedRows) {
    mdLines.push(
      `| ${quoteMd(r.section)} | ${r.beat} | ${quoteMd(r.key)} | ${quoteMd(r.symbol)} | ${r.colorDegree} | ${r.applied} | ${r.placementDegree} | ${quoteMd(r.targetTonicNote || "—")} | ${quoteMd(r.appliedRootNote || "—")} | ${quoteMd(r.whyValid)} |`,
    );
  }
  if (!affectedRows.length) {
    mdLines.push("| _none_ |  |  |  |  |  |  |  |  | no secondary-dominant chords produced changed placement |");
  }

  await fs.writeFile(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(OUT_MD, `${mdLines.join("\n")}\n`, "utf8");

  console.log("Gusty Garden Galaxy secondary-dominant closed-loop ring test");
  console.log(`JSON report: ${OUT_JSON}`);
  console.log(`Markdown table: ${OUT_MD}`);
  console.log(JSON.stringify(report.totals, null, 2));

  process.exitCode = report.pass ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
