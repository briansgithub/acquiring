import fs from "fs";
import { pathToFileURL } from "url";
import path from "path";

const LOG = path.resolve("debug-b08c51.log");
const sessionId = "b08c51";

function log(location, message, data, hypothesisId) {
  const line = JSON.stringify({
    sessionId,
    location,
    message,
    data,
    timestamp: Date.now(),
    hypothesisId,
    runId: "sim",
  });
  fs.appendFileSync(LOG, line + "\n");
}

const webPlayer = path.resolve("web-player");
const scales = await import(pathToFileURL(path.join(webPlayer, "lib/scales.js")).href);
const music = await import(pathToFileURL(path.join(webPlayer, "lib/music.js")).href);
const jsonToSymbol = await import(pathToFileURL(path.join(webPlayer, "lib/jsonToSymbol.js")).href);

const songPath = path.resolve(
  "sacred_ring_data/playback/.hooktheory_cache/weird-al-yankovic - Everything_You_Know_Is_Wrong/Instrumental - 1569999 - dPoDLORAonM.json"
);
const data = JSON.parse(fs.readFileSync(songPath, "utf8"));
const sectionKeys = [...data.metadata.keys].sort((a, b) => (a.beat ?? 1) - (b.beat ?? 1));
const fallbackKey = music.parseKey(data.metadata);

function activeKeyAtBeat(beat) {
  let chosen = sectionKeys[0];
  for (const k of sectionKeys) {
    if ((k.beat ?? 1) <= beat) chosen = k;
    else break;
  }
  const tonic = String(chosen.tonic || fallbackKey.tonic)
    .replace(/♭/g, "b")
    .replace(/♯/g, "#");
  return { tonic, scale: chosen.scale || fallbackKey.scale || "major" };
}

function getColor(scheme, root, scaleType, borrowed = null) {
  if (scheme === "boomwhacker") {
    const result = scales.getBoomwhackerColor(root, scaleType, borrowed || null);
    if (result && result.isPattern) {
      return { kind: "pattern", hex: result.hexColor, ok: !!(result.color1 && result.color2) };
    }
    return { kind: "hex", value: result, ok: result != null };
  }
  if (scheme === "hooktheory") {
    const result = scales.getHooktheoryColor(root, scaleType);
    return { kind: typeof result === "string" ? "hex" : "pattern", ok: result != null };
  }
  const result = scales.getScaleDegreeColor(root, scaleType);
  return { kind: "hex", value: result, ok: result != null };
}

function simulateDrawNode(scheme, root, scaleType, borrowed, label) {
  const color = getColor(scheme, root, scaleType, borrowed);
  if (!color.ok) {
    log("sim:drawNode", "invalid color", { scheme, root, scaleType, borrowed, label, color }, "A");
    return false;
  }
  // mimic drawNode hexColor access
  const fake = color.kind === "pattern" ? { hexColor: color.hex } : color.value;
  try {
    const hexColor = fake.hexColor || fake;
    void hexColor;
    return true;
  } catch (err) {
    log("sim:drawNode", "hexColor throw", { scheme, root, label, err: String(err) }, "A");
    return false;
  }
}

function simulateTransitionTable(scheme, key, grouped) {
  const symbolToRoot = new Map();
  for (let placement = 1; placement <= 7; placement++) {
    for (const entry of grouped[placement] || []) {
      if (!symbolToRoot.has(entry.symbol)) {
        symbolToRoot.set(entry.symbol, entry.colorDegree ?? entry.chord?.root ?? placement);
      }
    }
  }
  for (const [sym, root] of symbolToRoot) {
    try {
      const fc = getColor(scheme, root, key.scale);
      if (!fc.ok) {
        log("sim:transitionTable", "null fromColor", { sym, root, scheme, key }, "G");
        return false;
      }
      const hex = fc.kind === "pattern" ? fc.hex : fc.value;
      void hex;
    } catch (err) {
      log("sim:transitionTable", "fromColor throw", { sym, root, err: String(err) }, "G");
      return false;
    }
  }
  return true;
}

function buildGrouped(key) {
  const grouped = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((i) => [i, []]));
  const seen = new Set();
  for (const c of data.chords) {
    if (c.isRest) continue;
    const colorDegree = Number(c.root);
    if (colorDegree < 1 || colorDegree > 7) continue;
    const sym = jsonToSymbol.getChordSymbol(c, key);
    const placement = colorDegree; // simplified
    const borrowedKey = c.borrowed ? String(c.borrowed) : "";
    const uniqueKey = `${placement}-${colorDegree}-${sym}-${borrowedKey}`;
    if (!seen.has(uniqueKey)) {
      seen.add(uniqueKey);
      grouped[placement].push({ symbol: sym, chord: c, colorDegree });
    }
  }
  return grouped;
}

log("sim:start", "simulating Instrumental section", { chords: data.chords.length, keys: sectionKeys.length }, "F");

for (const scheme of ["diatonic", "hooktheory", "boomwhacker"]) {
  let failures = 0;
  for (let beat = 1; beat <= 50; beat++) {
    const key = activeKeyAtBeat(beat);
    const chord = data.chords.find((c) => {
      const s = c.beat === 0 ? 1 : c.beat;
      return beat >= s && beat < s + c.duration;
    });
    if (!chord || chord.isRest) continue;
    try {
      music.chordInterpreter(chord, key);
      if (!simulateDrawNode(scheme, chord.root, key.scale, chord.borrowed, `beat-${beat}`)) failures++;
      if (!simulateDrawNode(scheme, chord.root, key.scale, chord.borrowed, `active-${beat}`)) failures++;
    } catch (err) {
      failures++;
      log("sim:beat", "interpret/draw throw", { scheme, beat, root: chord.root, applied: chord.applied, key, err: String(err) }, "F");
    }
    const prevKey = activeKeyAtBeat(beat - 0.01);
    const keyChanged = `${prevKey.tonic}-${prevKey.scale}` !== `${key.tonic}-${key.scale}`;
    if (keyChanged) {
      log("sim:keyChange", "key boundary", { beat, from: prevKey, to: key, scheme }, "F");
      const grouped = buildGrouped(key);
      if (!simulateTransitionTable(scheme, key, grouped)) failures++;
    }
  }
  log("sim:schemeDone", "scheme simulation complete", { scheme, failures }, "F");
}

console.log("Wrote logs to", LOG);
