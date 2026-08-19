import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAYABLE_SONG_SCHEMA_VERSION,
  TheoryImportError,
  normalizeTheoryDocument,
} from "./theoryImport.js";

function chord(overrides = {}) {
  return {
    root: 1,
    beat: 1,
    duration: 4,
    type: 5,
    inversion: 0,
    applied: 0,
    borrowed: null,
    adds: [],
    omits: [],
    alterations: [],
    suspensions: [],
    substitutions: [],
    isRest: false,
    ...overrides,
  };
}

function note(overrides = {}) {
  return { sd: "1", octave: 0, beat: 1, duration: 1, isRest: false, ...overrides };
}

function section(overrides = {}) {
  return {
    sectionName: "Verse",
    songInfo: "Fixture Song",
    chords: [chord()],
    notes: [note()],
    metadata: {
      keys: [{ tonic: "C", scale: "major", beat: 1 }],
      tempos: [{ bpm: 120, beat: 1 }],
      meters: [{ numBeats: 4, beatUnit: 1, beat: 1 }],
      endBeat: 8,
    },
    ...overrides,
  };
}

test("normalizes a direct ExtractedSection without mutating it", () => {
  const input = section({
    sectionName: "<img src=x onerror=alert(1)>",
    chords: [chord({ beat: 0, privateTruth: "do-not-export", alterations: ["♭5"] })],
    notes: [note({ beat: 0, sd: "♯4", privatePitch: 99 })],
    metadata: { endBeat: 12 },
    privateOracle: { truth: true },
  });
  const before = structuredClone(input);
  const result = normalizeTheoryDocument(input, { fileName: "fallback.json" });

  assert.equal(result.schemaVersion, PLAYABLE_SONG_SCHEMA_VERSION);
  assert.equal(result.title, "Fixture Song");
  assert.equal(result.artist, "Local Theory");
  assert.equal(result.sections[0].sectionName, "<img src=x onerror=alert(1)>");
  assert.equal(result.sections[0].inlineData.chords[0].beat, 1);
  assert.deepEqual(result.sections[0].inlineData.chords[0].alterations, ["b5"]);
  assert.equal(result.sections[0].inlineData.notes[0].sd, "#4");
  assert.equal(result.sections[0].inlineData.metadata.endBeat, 12);
  assert.equal(result.sections[0].inlineData.privateOracle, undefined);
  assert.equal(result.sections[0].inlineData.chords[0].privateTruth, undefined);
  assert.equal(result.sections[0].inlineData.notes[0].privatePitch, undefined);
  assert.equal(result.warnings.filter(({ code }) => code === "BEAT_ZERO_NORMALIZED").length, 2);
  assert.deepEqual(input, before);
});

test("accepts analyzer output and strips private analysis fields", () => {
  const input = {
    schemaVersion: "hooktheory.midi-analysis.v1",
    source: { filename: "analyzed.mid" },
    analyzer: { privateModelData: true },
    sections: [{
      name: "Full Song",
      hooktheory: section({ sectionName: "Full Song", songInfo: null }),
      analysis: { frames: [{ secret: true }], globalConfidence: 0.8 },
    }],
  };
  const result = normalizeTheoryDocument(input, { sourceKind: "midi" });
  assert.equal(result.title, "analyzed");
  assert.equal(result.artist, "Local MIDI");
  assert.equal(result.sections[0].inlineData.analysis, undefined);
  assert.equal(result.sections[0].inlineData.chords.length, 1);
});

test("preserves array/map order and repeated section names through known wrappers", () => {
  const input = {
    title: "Wrapped Song",
    artist: "Wrapped Artist",
    sections: {
      first: { json: section({ sectionName: "Verse" }) },
      second: { bestPath: section({ sectionName: "Verse", chords: [chord({ root: 4 })] }) },
      third: { hooktheory: section({ sectionName: "Bridge", chords: [chord({ root: 5 })] }) },
    },
  };
  const result = normalizeTheoryDocument(input);
  assert.equal(result.title, "Wrapped Song");
  assert.equal(result.artist, "Wrapped Artist");
  assert.deepEqual(result.sections.map(({ sectionName }) => sectionName), ["Verse", "Verse", "Bridge"]);
  assert.deepEqual(result.sections.map(({ sectionIndex }) => sectionIndex), [0, 1, 2]);
  assert.deepEqual(result.sections.map(({ inlineData }) => inlineData.chords[0].root), [1, 4, 5]);
});

test("sorts explicit section indices and keeps stable unindexed and duplicate sections", () => {
  const result = normalizeTheoryDocument({
    sections: [
      section({ sectionName: "Verse", sectionIndex: 4, chords: [chord({ root: 4 })] }),
      section({ sectionName: "Verse", chords: [chord({ root: 5 })] }),
      { sectionIndex: 1, json: section({ sectionName: "Chorus", chords: [chord({ root: 1 })] }) },
      section({ sectionName: "Bridge", sectionIndex: 3, chords: [chord({ root: 3 })] }),
      section({ sectionName: "Verse", chords: [chord({ root: 6 })] }),
    ],
  });

  assert.deepEqual(result.sections.map(({ sectionName }) => sectionName), [
    "Chorus",
    "Bridge",
    "Verse",
    "Verse",
    "Verse",
  ]);
  assert.deepEqual(result.sections.map(({ sectionIndex }) => sectionIndex), [1, 3, 4, 5, 6]);
  assert.deepEqual(result.sections.map(({ inlineData }) => inlineData.chords[0].root), [1, 3, 4, 5, 6]);
});

test("accepts Android-style root maps and raw Hooktheory API jsonData", () => {
  const android = normalizeTheoryDocument({
    verseId: section({ sectionName: null }),
    chorusId: section({ sectionName: "Chorus" }),
  }, { fileName: "android-export.json" });
  assert.deepEqual(android.sections.map(({ sectionName }) => sectionName), ["verseId", "Chorus"]);

  const api = normalizeTheoryDocument({
    ID: "abc123",
    song: "API Song",
    artist: "API Artist",
    section: "API Verse",
    jsonData: JSON.stringify({
      chords: [chord()],
      notes: [],
      keys: [{ tonic: "E♭", scale: "minor", beat: 1 }],
      tempos: [{ bpm: 92, beat: 1 }],
      meters: ["6/8"],
      endBeat: 9,
    }),
  });
  assert.equal(api.title, "API Song");
  assert.equal(api.artist, "API Artist");
  assert.equal(api.sections[0].sectionName, "API Verse");
  assert.equal(api.sections[0].inlineData.songId, "abc123");
  assert.deepEqual(api.sections[0].inlineData.metadata.keys[0], { tonic: "Eb", scale: "minor", beat: 1 });
  assert.deepEqual(api.sections[0].inlineData.metadata.meters[0], { numBeats: 6, beatUnit: 0.5, beat: 1 });
});

test("flattens the active melody lane and warns about undisplayed lanes", () => {
  const result = normalizeTheoryDocument(section({
    chords: [],
    notes: {
      melody1: [note({ sd: "1" })],
      melody2: [note({ sd: "3" })],
      accompaniment: { ignored: true },
    },
    metadata: {
      activeMelodyIndex: 1,
      keys: [{ tonic: "C", scale: "major", beat: 1 }],
      tempos: [{ bpm: 120, beat: 1 }],
      meters: [[3, 4]],
    },
  }));
  assert.deepEqual(result.sections[0].inlineData.notes.map(({ sd }) => sd), ["3"]);
  assert.equal(result.sections[0].inlineData.metadata.endBeat, 2);
  const warning = result.warnings.find(({ code }) => code === "MELODY_LANES_OMITTED");
  assert.equal(warning.selectedLane, "melody2");
  assert.deepEqual(warning.omittedLanes, ["melody1"]);
});

test("reports melody-lane and raw top-level metadata paths against the source document", () => {
  assert.throws(
    () => normalizeTheoryDocument({
      chords: [],
      notes: { melody1: [note({ duration: "invalid" })] },
      keys: [{ tonic: "C", scale: "major", beat: 1 }],
      tempos: [{ bpm: 120, beat: 1 }],
      meters: [{ signature: "4/4", beat: 1 }],
    }),
    (error) => error instanceof TheoryImportError
      && error.issues.some(({ path }) => path === "$.notes.melody1[0].duration"),
  );
});

test("supplies explicit metadata defaults and retains event-derived trailing length", () => {
  const result = normalizeTheoryDocument({
    sectionName: "Chord only",
    chords: [chord({ beat: 5, duration: 3 })],
  });
  const data = result.sections[0].inlineData;
  assert.deepEqual(data.metadata.keys, [{ tonic: "C", scale: "major", beat: 1 }]);
  assert.deepEqual(data.metadata.tempos, [{ bpm: 120, beat: 1 }]);
  assert.deepEqual(data.metadata.meters, [{ numBeats: 4, beatUnit: 1, beat: 1 }]);
  assert.equal(data.metadata.endBeat, 8);
  assert.deepEqual(new Set(result.warnings.map(({ code }) => code)), new Set([
    "DEFAULT_KEY",
    "DEFAULT_TEMPO",
    "DEFAULT_METER",
  ]));
});

test("accepts melody-only sections and rejects empty sections", () => {
  const melodyOnly = normalizeTheoryDocument({ notes: [note()], metadata: {} });
  assert.equal(melodyOnly.sections[0].inlineData.chords.length, 0);
  assert.equal(melodyOnly.sections[0].inlineData.notes.length, 1);
  assert.throws(
    () => normalizeTheoryDocument({ chords: [], notes: [], metadata: {} }),
    (error) => error instanceof TheoryImportError
      && error.issues.some(({ path, code }) => path === "$" && code === "empty_section"),
  );
});

test("rejects malformed documents atomically with precise bounded paths", () => {
  const input = {
    sections: [
      section(),
      section({
        chords: [chord({ root: 9 }), chord({ duration: "never" })],
        notes: [note({ sd: "H4" })],
      }),
    ],
  };
  assert.throws(
    () => normalizeTheoryDocument(input),
    (error) => {
      assert.ok(error instanceof TheoryImportError);
      assert.equal(error.code, "INVALID_THEORY_DOCUMENT");
      assert.equal(error.statusCode, 422);
      assert.ok(error.issues.some(({ path }) => path === "$.sections[1].chords[0].root"));
      assert.ok(error.issues.some(({ path }) => path === "$.sections[1].chords[1].duration"));
      assert.ok(error.issues.some(({ path }) => path === "$.sections[1].notes[0].sd"));
      assert.ok(error.issues.length <= 50);
      return true;
    },
  );
});

test("bounds accumulated validation issues and reports truncation", () => {
  const badChords = Array.from({ length: 100 }, () => ({ beat: 1, duration: 1 }));
  assert.throws(
    () => normalizeTheoryDocument({ chords: badChords, notes: [] }),
    (error) => {
      assert.ok(error instanceof TheoryImportError);
      assert.equal(error.issues.length, 50);
      assert.equal(error.details.issues.length, 50);
      assert.equal(error.details.truncated, true);
      assert.ok(error.details.issueCount > error.issues.length);
      assert.ok(error.issues.every(({ path, code, message }) => (
        path.length <= 512 && code.length <= 80 && message.length <= 512
      )));
      return true;
    },
  );
});

test("requires explicit harmonic fields on non-rest chords but not rests", () => {
  assert.throws(
    () => normalizeTheoryDocument({
      sections: [
        section(),
        section({ chords: [{ beat: 1, duration: 4 }], notes: [] }),
      ],
    }),
    (error) => {
      assert.ok(error instanceof TheoryImportError);
      assert.deepEqual(
        error.issues
          .filter(({ code }) => code === "missing_field")
          .map(({ path }) => path),
        [
          "$.sections[1].chords[0].root",
          "$.sections[1].chords[0].type",
          "$.sections[1].chords[0].inversion",
          "$.sections[1].chords[0].applied",
        ],
      );
      return true;
    },
  );

  const restOnly = normalizeTheoryDocument({
    sectionName: "Rest",
    chords: [{ beat: 1, duration: 2, isRest: true }],
    notes: [],
  });
  assert.deepEqual(restOnly.sections[0].inlineData.chords[0], {
    beat: 1,
    duration: 2,
    isRest: true,
    root: 0,
    type: 5,
    inversion: 0,
    applied: 0,
    adds: [],
    omits: [],
    alterations: [],
    suspensions: [],
    substitutions: [],
  });
});

test("rejects malformed embedded JSON and invalid metadata representations", () => {
  assert.throws(
    () => normalizeTheoryDocument({ song: "Broken", jsonData: "{oops" }),
    (error) => error instanceof TheoryImportError
      && error.issues[0].path === "$.jsonData"
      && error.issues[0].code === "invalid_json",
  );
  assert.throws(
    () => normalizeTheoryDocument(section({
      metadata: {
        keys: [{ tonic: "Not a key", scale: "major" }],
        tempos: [{ bpm: -1 }],
        meters: ["7/3"],
      },
    })),
    (error) => error instanceof TheoryImportError
      && error.issues.some(({ path }) => path === "$.metadata.keys[0].tonic")
      && error.issues.some(({ path }) => path === "$.metadata.tempos[0].bpm")
      && error.issues.some(({ path }) => path === "$.metadata.meters[0].denominator"),
  );
});

test("direct chord/note data wins over a raw section-marker metadata field", () => {
  const result = normalizeTheoryDocument(section({
    sections: [{ name: "Marker only", beat: 3 }],
  }));
  assert.equal(result.sections.length, 1);
  assert.equal(result.sections[0].sectionName, "Verse");
});
