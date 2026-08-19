import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { analyzeMidi } from "../../lib/midi/analyze/index.js";
import { renderSectionToMidi } from "../../lib/midi/render/index.mjs";
import {
  buildMidi,
  modulationFixture,
  syncopatedHarmonyFixture,
  type0HarmonyFixture,
  type1SongFixture,
  type2Fixture,
} from "../../tests/midi-analyze/fixtures.mjs";

const modalSection = {
  sectionName: "Bridge",
  songId: "android-modal-golden",
  songInfo: "Android Modal Golden",
  chords: [
    { root: 1, type: 5, inversion: 0, applied: 0, beat: 1, duration: 2 },
    { root: 5, type: 7, inversion: 0, applied: 0, beat: 3, duration: 2 },
  ],
  notes: [
    { sd: "1", octave: 0, beat: 1, duration: 1 },
    { sd: "2", octave: 0, beat: 2, duration: 1 },
    { sd: "5", octave: 0, beat: 3, duration: 1 },
  ],
  metadata: {
    keys: [
      { tonic: "D", scale: "dorian", beat: 1 },
      { tonic: "E", scale: "phrygian", beat: 3 },
    ],
    tempos: [
      { bpm: 100, beat: 1, swingFactor: 0.2, swingBeat: 0.5 },
      { bpm: 120, beat: 3, swingFactor: 0, swingBeat: 0.5 },
    ],
    meters: [
      { numBeats: 4, beatUnit: 1, beat: 1 },
      { numBeats: 3, beatUnit: 0.5, beat: 3 },
    ],
    endBeat: 5,
  },
};

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function write(filename, bytes) {
  const target = path.resolve(filename);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);
  return { file: path.basename(target), sha256: digest(bytes), size: bytes.length };
}

async function analyzeGolden(name, bytes) {
  try {
    return await analyzeMidi(bytes, { sourceName: name, topK: 5 });
  } catch (error) {
    return {
      error: {
        code: error.code || "MIDI_ANALYSIS_FAILED",
        message: error.message,
        statusCode: error.statusCode || 400,
      },
    };
  }
}

export async function generateGoldenFixtures(outputDir) {
  const smpte = buildMidi(0, [{ events: [], endTick: 0 }], 0xe728);
  const cases = [
    ["type0-harmony.mid", type0HarmonyFixture()],
    ["type1-song.mid", type1SongFixture()],
    ["modulation.mid", modulationFixture()],
    ["syncopated.mid", syncopatedHarmonyFixture()],
    ["modal-roundtrip.mid", renderSectionToMidi(modalSection).bytes],
    ["type2.mid", type2Fixture()],
    ["smpte.mid", smpte],
    ["invalid.mid", Uint8Array.from([0x6e, 0x6f, 0x74, 0x2d, 0x6d, 0x69, 0x64, 0x69])],
  ];
  const entries = [];
  for (const [name, input] of cases) {
    const bytes = Buffer.from(input);
    const source = await write(path.join(outputDir, name), bytes);
    const analysis = Buffer.from(`${JSON.stringify(await analyzeGolden(name, bytes), null, 2)}\n`);
    const result = await write(path.join(outputDir, `${name}.analysis.json`), analysis);
    entries.push({ name, source, result });
  }
  const manifest = {
    analyzerVersion: "deterministic-v1",
    cases: entries,
    schemaVersion: "hooktheory-android-midi-goldens/v1",
  };
  await write(
    path.join(outputDir, "manifest.json"),
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
  );
  return manifest;
}
