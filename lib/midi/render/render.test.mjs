import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import ToneMidi from "@tonejs/midi";

import {
  AUGMENTATION_FAMILY_IDS,
  RENDERER_FAMILY_IDS,
  augmentRenderPlan,
  createRenderPlan,
  renderPlanToMidi,
  renderSectionToMidi,
} from "./index.mjs";

const { Midi } = ToneMidi;

function sectionFixture() {
  return {
    songId: "fixture-song",
    songInfo: "Renderer Fixture",
    sectionName: "Verse",
    split: "train",
    fold: 2,
    splitGroup: "fixture-song",
    notes: {
      melody1: [
        { sd: "1", octave: 0, beat: 1, duration: 1, isRest: false, velocity: 100 },
        { sd: "3", octave: 0, beat: 2, duration: 0.5, isRest: false },
        { sd: "1", octave: 0, beat: 3, duration: 1, isRest: false },
        { sd: "rest", octave: 0, beat: 4, duration: 1, isRest: true },
      ],
      melody2: [
        { sd: "7", octave: 2, beat: 1, duration: 4, isRest: false },
      ],
    },
    chords: [
      {
        root: 1,
        beat: 1,
        duration: 2,
        type: 5,
        inversion: 0,
        applied: 0,
        adds: [],
        omits: [],
        alterations: [],
        suspensions: [],
        borrowed: null,
        isRest: false,
      },
      {
        root: 5,
        beat: 3,
        duration: 2,
        type: 7,
        inversion: 1,
        applied: 0,
        adds: [],
        omits: [],
        alterations: [],
        suspensions: [],
        borrowed: null,
        isRest: false,
      },
    ],
    metadata: {
      activeMelodyIndex: 0,
      endBeat: 6,
      keys: [
        { beat: 1, tonic: "C", scale: "major" },
        { beat: 3, tonic: "G", scale: "major" },
      ],
      tempos: [
        { beat: 1, bpm: 120, swingFactor: 0, swingBeat: 0.5 },
        { beat: 3, bpm: 90, swingFactor: 0.12, swingBeat: 0.5 },
      ],
      meters: [
        { beat: 1, numBeats: 4, beatUnit: 1 },
        { beat: 5, numBeats: 3, beatUnit: 1 },
      ],
    },
  };
}

function rawHeader(bytes) {
  const data = Buffer.from(bytes);
  assert.equal(data.subarray(0, 4).toString("ascii"), "MThd");
  return {
    length: data.readUInt32BE(4),
    format: data.readUInt16BE(8),
    trackCount: data.readUInt16BE(10),
    division: data.readUInt16BE(12),
  };
}

test("round-trips a deterministic 192-PPQ type-1 melody/harmony MIDI", () => {
  const section = sectionFixture();
  const first = renderSectionToMidi(section);
  const second = renderSectionToMidi(section);
  assert.deepEqual(Buffer.from(first.bytes), Buffer.from(second.bytes));

  assert.deepEqual(rawHeader(first.bytes), {
    length: 6,
    format: 1,
    trackCount: 3,
    division: 192,
  });

  const parsed = new Midi(first.bytes);
  assert.equal(parsed.header.ppq, 192);
  assert.deepEqual(parsed.header.tempos.map(({ ticks, bpm }) => [ticks, Math.round(bpm)]), [
    [0, 120],
    [384, 90],
  ]);
  assert.deepEqual(parsed.header.timeSignatures.map(({ ticks, timeSignature }) => [ticks, timeSignature]), [
    [0, [4, 4]],
    [768, [3, 4]],
  ]);
  assert.deepEqual(parsed.header.keySignatures, [
    { ticks: 0, key: "C", scale: "major" },
    { ticks: 384, key: "G", scale: "major" },
  ]);
  assert.deepEqual(parsed.tracks.map((track) => track.name), ["Melody", "Harmony"]);
  assert.deepEqual(parsed.tracks[0].notes.map(({ midi, ticks, durationTicks }) => ({
    midi,
    ticks,
    durationTicks,
  })), [
    { midi: 60, ticks: 0, durationTicks: 192 },
    { midi: 64, ticks: 192, durationTicks: 96 },
    { midi: 67, ticks: 384, durationTicks: 192 },
  ]);
  assert.equal(parsed.tracks[1].notes.length, 7);
  assert.ok(parsed.header.meta.some(({ text }) => text.startsWith("hooktheory:provenance:v1:")));
  assert.equal(first.sidecar.splitMetadata.split, "train");
  assert.equal(first.sidecar.splitMetadata.fold, 2);
  assert.equal(first.sidecar.render.keyEvents[1].tonic, "G");
  assert.equal(first.sidecar.rendererFamilyId, RENDERER_FAMILY_IDS.CANONICAL);
  assert.equal(first.sidecar.decoderVersion, "harmonic-analysis/v1");
  assert.equal(first.sidecar.artifactKind, "synthetic");
  assert.match(first.sidecar.sourceSha256, /^[a-f0-9]{64}$/);
  assert.match(first.sidecar.midiSha256, /^[a-f0-9]{64}$/);
});

test("renderer strips oracle-private poison before decoding and sidecar generation", () => {
  const clean = sectionFixture();
  const poisoned = structuredClone(clean);
  Object.assign(poisoned.chords[0], {
    _truthLetter: "F#dim/C#",
    _truthRoman: "poisoned",
    _letterRootName: "F#",
    _letterBassName: "C#",
    _letterQuality: "diminished",
    _triSubDominant: true,
    halfDim: true,
    dimTriad: true,
    appliedDenomMaj: true,
    _truthEnriched: true,
  });

  const cleanRender = renderSectionToMidi(clean);
  const poisonedRender = renderSectionToMidi(poisoned);
  assert.deepEqual(Buffer.from(poisonedRender.bytes), Buffer.from(cleanRender.bytes));
  const renderedChord = createRenderPlan(poisoned)
    .tracks.find((track) => track.id === "harmony")
    .decodedChords[0].chord;
  assert.equal(Object.keys(renderedChord).some((key) => key.startsWith("_")), false);
  assert.equal("halfDim" in renderedChord, false);
  assert.equal("dimTriad" in renderedChord, false);
});

test("canonical voicing makes the decoder's inversion voice the actual MIDI bass", () => {
  const plan = createRenderPlan({
    sectionName: "Borrowed inversion",
    split: "train",
    splitGroup: "borrowed-inversion-fixture",
    chords: [{ root: 2, type: 7, inversion: 1, borrowed: "lydian", beat: 1, duration: 4 }],
    notes: [],
    metadata: {
      keys: [{ tonic: "F#", scale: "major", beat: 1 }],
      tempos: [{ bpm: 120, beat: 1 }],
      meters: [{ numBeats: 4, beatUnit: 1, beat: 1 }],
      endBeat: 5,
    },
  });
  const chord = plan.tracks.find((track) => track.id === "harmony").decodedChords[0];
  assert.deepEqual(chord.decodedNames, ["B#4", "D#4", "Gb4", "G#4"]);
  assert.deepEqual(chord.renderedMidi, [72, 75, 78, 80]);
});

test("augmentation is deterministic, transposes active keys, and preserves split metadata", () => {
  const base = createRenderPlan(sectionFixture());
  const config = {
    seed: "fixture-seed",
    transposeSemitones: 2,
    velocityScale: 0.95,
    velocityJitter: 0.04,
    timingJitterTicks: 3,
    durationJitterTicks: 2,
    permuteTracks: true,
  };
  const first = augmentRenderPlan(base, config);
  const second = augmentRenderPlan(base, config);
  assert.deepEqual(first, second);
  assert.equal(base.keyEvents[0].tonic, "C", "the source plan is not mutated");
  assert.deepEqual(first.keyEvents.map(({ tonic }) => tonic), ["D", "A"]);
  assert.deepEqual(first.provenance.splitMetadata, {
    split: "train",
    fold: 2,
    group: "fixture-song",
  });
  assert.deepEqual(new Set(first.tracks.map(({ id }) => id)), new Set(["melody", "harmony"]));

  const basePitches = new Map(base.tracks.flatMap((track) => (
    track.notes.map((note) => [`${track.id}:${note.groupId}:${note.voiceIndex}`, note.midi])
  )));
  for (const track of first.tracks) {
    for (const note of track.notes) {
      assert.equal(note.midi, basePitches.get(`${track.id}:${note.groupId}:${note.voiceIndex}`) + 2);
      assert.ok(note.ticks >= 0);
      assert.ok(note.durationTicks >= 1);
      assert.ok(note.velocity > 0 && note.velocity <= 1);
    }
  }

  const firstMidi = renderPlanToMidi(first, { sourceSha256: "fixture" });
  const secondMidi = renderPlanToMidi(second, { sourceSha256: "fixture" });
  assert.deepEqual(Buffer.from(firstMidi.bytes), Buffer.from(secondMidi.bytes));
  assert.equal(rawHeader(firstMidi.bytes).format, 1);
  assert.throws(
    () => augmentRenderPlan(base, { split: "test" }),
    /split metadata is immutable/,
  );
  assert.throws(
    () => augmentRenderPlan(base, { timing: { group: "leak" } }),
    /split metadata is immutable/,
  );
  assert.throws(
    () => augmentRenderPlan(base, { rendererFamilyId: "spoofed" }),
    /cannot be overridden/,
  );
  const validationPlan = createRenderPlan({ ...sectionFixture(), split: "validation" });
  assert.throws(
    () => augmentRenderPlan(validationPlan, { seed: "forbidden" }),
    /training-only/,
  );
  const ungroupedPlan = createRenderPlan({ ...sectionFixture(), splitGroup: null });
  assert.throws(
    () => augmentRenderPlan(ungroupedPlan, { seed: "forbidden" }),
    /composition group/,
  );
});

test("every seeded renderer family is deterministic and carries a holdout ID", () => {
  const base = createRenderPlan(sectionFixture());
  const expectedOperations = {
    [RENDERER_FAMILY_IDS.OCTAVE]: ["octave-shift", "octave-doubling"],
    [RENDERER_FAMILY_IDS.VOICING]: ["voicing"],
    [RENDERER_FAMILY_IDS.ARPEGGIO_STRUM]: ["strum"],
    [RENDERER_FAMILY_IDS.BASS]: ["bass-split"],
    [RENDERER_FAMILY_IDS.SUSTAIN]: ["sustain-pedal"],
    [RENDERER_FAMILY_IDS.SYNCOPATION]: ["syncopation"],
    [RENDERER_FAMILY_IDS.HUMANIZE]: ["humanize"],
    [RENDERER_FAMILY_IDS.TRACK_LAYOUT]: ["track-dropout", "track-merge", "track-permutation"],
    [RENDERER_FAMILY_IDS.INSTRUMENTATION]: ["instrument-program"],
    [RENDERER_FAMILY_IDS.COMPOSITE]: ["octave-doubling", "voicing", "strum", "bass-split"],
  };
  for (const familyId of AUGMENTATION_FAMILY_IDS) {
    const config = { recipe: familyId, seed: "family-matrix" };
    const first = augmentRenderPlan(base, config);
    const second = augmentRenderPlan(base, config);
    assert.deepEqual(first, second, familyId);
    assert.equal(first.augmentation.rendererFamilyId, familyId);
    assert.equal(first.augmentation.familyHoldoutKey, familyId);
    assert.equal(first.augmentation.exampleGroupId, "fixture-song");
    const operationTypes = new Set(first.augmentation.operations.map((operation) => operation.type));
    assert.ok(expectedOperations[familyId].some((type) => operationTypes.has(type)), `${familyId} did not apply its texture`);
    assert.deepEqual(first.provenance.splitMetadata, base.provenance.splitMetadata);
    assert.deepEqual(
      Buffer.from(renderPlanToMidi(first, { sourceSha256: "family-matrix" }).bytes),
      Buffer.from(renderPlanToMidi(second, { sourceSha256: "family-matrix" }).bytes),
      familyId,
    );
  }
});

test("composite texture recipe covers label-safe texture operations and emits CC64", () => {
  const base = createRenderPlan(sectionFixture());
  const augmented = augmentRenderPlan(base, {
    recipe: RENDERER_FAMILY_IDS.COMPOSITE,
    seed: "composite-fixture",
  });
  const operationTypes = new Set(augmented.augmentation.operations.map((operation) => operation.type));
  for (const expected of [
    "octave-doubling", "voicing", "strum", "bass-split", "sustain-pedal",
    "syncopation", "humanize", "instrument-program", "track-permutation",
  ]) {
    assert.ok(operationTypes.has(expected), `missing ${expected}`);
  }
  assert.ok(augmented.tracks.some((track) => track.id === "bass"));
  assert.ok(augmented.tracks.some((track) => (track.controlChanges || []).some((control) => control.number === 64)));
  assert.deepEqual(augmented.provenance.splitMetadata, base.provenance.splitMetadata);
  assert.equal(base.tracks.length, 2, "the source plan remains unchanged");

  const sourcePitchClasses = new Map();
  for (const track of base.tracks) {
    for (const note of track.notes) {
      const key = `${track.id}:${note.sourceIndex}`;
      if (!sourcePitchClasses.has(key)) sourcePitchClasses.set(key, new Set());
      sourcePitchClasses.get(key).add(note.midi % 12);
    }
  }
  for (const track of augmented.tracks) {
    for (const note of track.notes) {
      const sourceId = note.sourceTrack?.id || (note.sourceChordRoot != null ? "harmony" : "melody");
      assert.ok(sourcePitchClasses.get(`${sourceId}:${note.sourceIndex}`)?.has(note.midi % 12));
    }
  }

  const rendered = renderPlanToMidi(augmented, { sourceSha256: "composite" });
  assert.equal(rendered.sidecar.rendererFamilyId, RENDERER_FAMILY_IDS.COMPOSITE);
  const parsed = new Midi(rendered.bytes);
  assert.ok(parsed.tracks.some((track) => (track.controlChanges[64] || []).length >= 2));
  assert.ok(parsed.tracks.some((track) => track.instrument.number !== 0));
});

test("track-layout dropout is deterministic, retains one source, and records the dropped track", () => {
  const base = createRenderPlan(sectionFixture());
  const dropped = augmentRenderPlan(base, {
    recipe: RENDERER_FAMILY_IDS.TRACK_LAYOUT,
    seed: "forced-dropout",
    layoutVariant: "dropout",
    trackDropoutProbability: 0,
  });
  assert.equal(dropped.tracks.length, 1);
  assert.equal(dropped.augmentation.droppedTracks.length, 1);
  assert.deepEqual(dropped.provenance.splitMetadata, base.provenance.splitMetadata);
  assert.throws(
    () => augmentRenderPlan(base, { dropTrackIds: ["melody", "harmony"] }),
    /cannot remove every track/,
  );
});

test("track merging remains within one source and survives MIDI round-trip", () => {
  const base = createRenderPlan(sectionFixture());
  const sourceNoteCount = base.tracks.reduce((sum, track) => sum + track.notes.length, 0);
  const merged = augmentRenderPlan(base, {
    seed: "merge",
    permuteTracks: true,
    mergeTracks: true,
  });
  assert.equal(merged.tracks.length, 1);
  assert.equal(merged.tracks[0].notes.length, sourceNoteCount);
  assert.equal(merged.tracks[0].mergedFrom.length, 2);
  assert.equal(merged.provenance.splitMetadata.split, "train");

  const rendered = renderPlanToMidi(merged, { sourceSha256: "fixture" });
  assert.deepEqual(rawHeader(rendered.bytes), {
    length: 6,
    format: 1,
    trackCount: 2,
    division: 192,
  });
  const parsed = new Midi(rendered.bytes);
  assert.equal(parsed.tracks.length, 1);
  assert.equal(parsed.tracks[0].name, "Combined");
  assert.equal(parsed.tracks[0].notes.length, sourceNoteCount);
});

test("public CLI writes parseable MIDI and the default provenance sidecar", async (t) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "theory-to-midi-"));
  t.after(() => fs.rm(temporaryDirectory, { recursive: true, force: true }));
  const inputPath = path.join(temporaryDirectory, "section.json");
  const outputPath = path.join(temporaryDirectory, "section.midi");
  await fs.writeFile(inputPath, JSON.stringify(sectionFixture()), "utf8");

  const cliPath = fileURLToPath(new URL("../../../tools/theory-to-midi/cli.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [
    cliPath,
    inputPath,
    outputPath,
    "--transpose",
    "-2",
    "--seed",
    "cli-test",
    "--augmentation-family",
    RENDERER_FAMILY_IDS.HUMANIZE,
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);

  const bytes = await fs.readFile(outputPath);
  assert.equal(rawHeader(bytes).division, 192);
  const parsed = new Midi(bytes);
  assert.equal(parsed.tracks.length, 2);
  const sidecar = JSON.parse(await fs.readFile(`${outputPath}.provenance.json`, "utf8"));
  assert.equal(sidecar.splitMetadata.split, "train");
  assert.equal(sidecar.augmentation.transposeSemitones, -2);
  assert.equal(sidecar.rendererFamilyId, RENDERER_FAMILY_IDS.HUMANIZE);
  assert.match(sidecar.midiSha256, /^[a-f0-9]{64}$/);
});
