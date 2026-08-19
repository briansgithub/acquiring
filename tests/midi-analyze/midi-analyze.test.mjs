import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { analyzeMidi, MIDI_ANALYSIS_SCHEMA_VERSION } from "../../lib/midi/analyze/index.js";
import { normalizeMetadata } from "../../lib/midi/analyze/normalize.js";
import {
  modulationFixture,
  syncopatedHarmonyFixture,
  type0HarmonyFixture,
  type1SongFixture,
  type2Fixture,
} from "./fixtures.mjs";

test("analyzes SMF type 0, sustains note spans, and emits Hooktheory-compatible data", async () => {
  const fixture = type0HarmonyFixture();
  const result = await analyzeMidi(fixture, {
    filename: "nested\\type0-harmony.mid",
    topK: 3,
    includeBorrowed: false,
    includeApplied: false,
  });

  assert.equal(result.schemaVersion, MIDI_ANALYSIS_SCHEMA_VERSION);
  assert.equal(result.version, 1);
  assert.equal(result.analyzer.version, "1.0.0");
  assert.equal(result.analyzer.modelVersion, null);
  assert.equal(result.analyzer.catalogPriors.trainingSplit, "train");
  assert.equal(result.source.format, 0);
  assert.equal(result.source.ppq, 480);
  assert.equal(result.source.filename, "type0-harmony.mid");
  assert.equal(result.source.name, "type0-harmony.mid");
  assert.equal(result.source.sha256, createHash("sha256").update(fixture).digest("hex"));
  assert.ok(result.source.eventCount > 0);
  assert.ok(Array.isArray(result.source.warnings));
  assert.equal(result.sections.length, 1);

  const section = result.sections[0];
  assert.equal(section.name, "Full Song");
  assert.equal(section.hooktheory.sectionName, "Full Song");
  assert.equal(section.hooktheory.songInfo, "type0-harmony.mid");
  assert.equal(section.hooktheory.metadata.tempos[0].bpm, 120);
  assert.equal(section.hooktheory.metadata.meters[0].numBeats, 4);
  assert.equal(section.hooktheory.metadata.meters[0].beatUnit, 1);
  assert.equal(section.hooktheory.metadata.keys[0].tonic, "C");
  assert.equal(section.hooktheory.chords[0].root, 1);
  assert.equal(section.hooktheory.chords[0].type, 5);
  assert.deepEqual(section.hooktheory.notes, []);
  assert.ok(section.analysis.warnings.some((warning) => warning.code === "NO_DEFENSIBLE_MELODY"));
  assert.ok(section.analysis.tracks[0].sustainExtendedNotes >= 3);
  assert.ok(section.analysis.keyAlternatives.length >= 1);
  assert.equal(section.analysis.keyAlternatives.length, 3);
  assert.equal(section.analysis.chordAlternatives[0].alternatives.length, 3);
  assert.equal(section.analysis.segmentation.topK, 3);
  assert.equal(section.analysis.key.source, "midi-key-signature");
  assert.equal(section.analysis.key.authority, "weak");
  assert.equal(section.analysis.key.timeline[0].source, "midi-key-signature");
  assert.equal(section.analysis.key.timeline[0].authority, "weak");
  assert.equal(section.analysis.analyzerVersion, "1.0.0");
  assert.equal(section.analysis.modelVersion, null);
  assert.ok(section.analysis.globalConfidence >= 0 && section.analysis.globalConfidence <= 1);
  assert.equal(section.analysis.confidenceCalibration.status, "uncalibrated");
  assert.equal(section.analysis.noteRoles.total, section.analysis.noteRoles.returned);
  assert.ok(section.analysis.noteRoles.items.every((note) => note.roles.melody >= 0));
  assert.doesNotThrow(() => JSON.stringify(result));
});

test("analyzes SMF type 1 tracks and selects a raw marker section", async () => {
  const fixture = type1SongFixture();
  const fullSong = await analyzeMidi(fixture, { sourceName: "type1-song.mid" });
  const repeated = await analyzeMidi(fixture, { sourceName: "type1-song.mid" });
  assert.deepEqual(repeated, fullSong);
  assert.equal(fullSong.source.format, 1);
  assert.deepEqual(fullSong.source.markers.map((marker) => marker.name), ["Verse", "Chorus"]);
  assert.equal(fullSong.sections[0].hooktheory.notes.length, 8);
  assert.equal(fullSong.sections[0].analysis.melody.trackIndex, 2);
  assert.equal(fullSong.sections[0].analysis.defaultsUsed.tempo, false);
  assert.equal(fullSong.sections[0].analysis.defaultsUsed.meter, false);

  const chorus = await analyzeMidi(type1SongFixture(), { marker: "Chorus" });
  assert.equal(chorus.sections[0].name, "Chorus");
  assert.equal(chorus.sections[0].range.startTick, 1920);
  assert.equal(chorus.sections[0].hooktheory.sectionName, "Chorus");
  assert.equal(chorus.sections[0].hooktheory.chords[0].beat, 1);
  assert.equal(chorus.sections[0].hooktheory.metadata.endBeat, 5);
  assert.equal(chorus.sections[0].hooktheory.notes.length, 4);
});

test("decodes every standard key-signature accidental count to the correct major or minor tonic", () => {
  const signatureKeys = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
  const relativeMinors = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#", "G#", "D#", "A#"];
  const major = normalizeMetadata({ header: {
    keySignatures: signatureKeys.map((key, ticks) => ({ key, scale: "major", ticks })),
  } });
  const minor = normalizeMetadata({ header: {
    keySignatures: signatureKeys.map((key, ticks) => ({ key, scale: "minor", ticks })),
  } });

  assert.deepEqual(major.keySignatures.map((key) => key.tonic), signatureKeys);
  assert.deepEqual(minor.keySignatures.map((key) => key.tonic), relativeMinors);
  assert.ok(major.keySignatures.every((key) => key.source === "midi-key-signature"));
  assert.ok(major.keySignatures.every((key) => key.authority === "weak"));
  assert.ok(major.keySignatures.every((key) => key.exact === false));
});

test("infers a deterministic smoothed local-key timeline when explicit key events are absent", async () => {
  const fixture = modulationFixture();
  const options = { sourceName: "c-to-d-modulation.mid", topK: 5, keyHopBeats: 2 };
  const result = await analyzeMidi(fixture, options);
  const repeated = await analyzeMidi(fixture, options);
  const analysis = result.sections[0].analysis;

  assert.deepEqual(repeated, result);
  assert.equal(result.source.metadata.keySignatures.length, 0);
  assert.equal(analysis.key.source, "local-profile-smoothed");
  assert.equal(analysis.key.authority, "inferred");
  assert.ok(analysis.key.timeline.length >= 2);
  assert.deepEqual(
    analysis.key.timeline.map(({ tonic, scale }) => ({ tonic, scale })),
    repeated.sections[0].analysis.key.timeline.map(({ tonic, scale }) => ({ tonic, scale })),
  );
  assert.equal(analysis.key.timeline[0].tonic, "C");
  assert.ok(analysis.key.timeline.slice(1).some((key) => key.tonic === "D" && key.scale === "major"));
  assert.equal(analysis.key.pathAlternatives.length, 5);
});

test("adds off-grid harmonic boundaries for syncopated chord changes", async () => {
  const result = await analyzeMidi(syncopatedHarmonyFixture(), {
    sourceName: "syncopated-harmony.mid",
    gridBeats: 1,
    minAdaptiveBeats: 0.25,
  });
  const analysis = result.sections[0].analysis;
  const syncopatedFrame = analysis.frames.find((frame) => frame.startTick === 720);

  assert.equal(analysis.segmentation.method, "adaptive-evidence-grid-beam");
  assert.ok(syncopatedFrame, "expected a frame at the 1.5-beat harmonic change");
  assert.ok(syncopatedFrame.boundaryEvidence.sources.includes("note-onset"));
  assert.ok(syncopatedFrame.boundaryEvidence.sources.includes("bass-change"));
});

test("returns deterministic complete top-K chord paths", async () => {
  const fixture = syncopatedHarmonyFixture();
  const options = { sourceName: "top-k-paths.mid", gridBeats: 1, topK: 5 };
  const result = await analyzeMidi(fixture, options);
  const repeated = await analyzeMidi(fixture, options);
  const analysis = result.sections[0].analysis;
  const paths = analysis.sequenceAlternatives;

  assert.deepEqual(repeated.sections[0].analysis.sequenceAlternatives, paths);
  assert.equal(paths.length, 5);
  assert.deepEqual(paths.map((path) => path.rank), [1, 2, 3, 4, 5]);
  assert.ok(paths.every((path, index) => index === 0 || paths[index - 1].score >= path.score));
  assert.ok(Math.abs(paths.reduce((sum, path) => sum + path.probability, 0) - 1) < 0.00001);
  for (const path of paths) {
    assert.ok(path.segments.length > 0);
    assert.equal(path.segments[0].startTick, analysis.frames[0].startTick);
    assert.equal(path.segments.at(-1).endTick, analysis.frames.at(-1).endTick);
  }
});

test("rejects SMF type 2 with a structured public error", async () => {
  await assert.rejects(
    analyzeMidi(type2Fixture()),
    (error) => {
      assert.equal(error.code, "UNSUPPORTED_MIDI_FORMAT");
      assert.equal(error.statusCode, 422);
      assert.match(error.message, /type 2/i);
      return true;
    },
  );
});

test("rejects non-MIDI input with a structured 400 error", async () => {
  await assert.rejects(
    analyzeMidi(Uint8Array.from([1, 2, 3])),
    (error) => {
      assert.equal(error.code, "INVALID_MIDI");
      assert.equal(error.statusCode, 400);
      return true;
    },
  );
});

test("enforces byte and raw-event limits before theory inference", async () => {
  const fixture = type0HarmonyFixture();
  await assert.rejects(
    analyzeMidi(fixture, { maxBytes: fixture.byteLength - 1 }),
    (error) => error.code === "MIDI_TOO_LARGE" && error.statusCode === 413,
  );
  await assert.rejects(
    analyzeMidi(fixture, { maxEvents: 1 }),
    (error) => error.code === "MIDI_TOO_MANY_EVENTS" && error.statusCode === 413,
  );
  await assert.rejects(
    analyzeMidi(fixture, { topK: 2.5 }),
    (error) => error.code === "INVALID_ANALYSIS_OPTIONS" && error.statusCode === 400,
  );
});
