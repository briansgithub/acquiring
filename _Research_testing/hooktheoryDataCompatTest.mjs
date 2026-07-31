import assert from "node:assert/strict";
import {
  LEGACY_PIANO_MAN_CHORUS,
  migrateLegacyChord,
  migrateLegacySectionData,
} from "../web-player/lib/hooktheoryDataCompat.js";

const oldChord = {
  root: 5,
  beat: 40,
  duration: 3,
  type: 11,
  inversion: 0,
  applied: 0,
  adds: [],
  omits: [],
  alterations: [],
  suspensions: [],
};

const oldSection = {
  numericId: LEGACY_PIANO_MAN_CHORUS.numericId,
  metadata: { fp: LEGACY_PIANO_MAN_CHORUS.fingerprint },
  chords: [oldChord],
};

const migrated = migrateLegacySectionData(oldSection);
assert.deepEqual(migrated.chords[0], { ...oldChord, type: 9, suspensions: [4] });
assert.deepEqual(oldSection.chords[0], oldChord, "migration must not mutate cached data");

const canonical = { ...oldChord, type: 9, suspensions: [4] };
assert.equal(migrateLegacyChord(canonical, oldSection), canonical, "canonical payloads stay unchanged");

const genuineEleventh = { ...oldChord, beat: 41 };
assert.equal(migrateLegacyChord(genuineEleventh, oldSection), genuineEleventh, "only the stale signature migrates");

const genuineOtherSong = { ...oldChord };
assert.equal(
  migrateLegacyChord(genuineOtherSong, { numericId: "other", metadata: { fp: "other" } }),
  genuineOtherSong,
  "genuine type=11 chords from other sources stay unchanged",
);

console.log("Hooktheory data compatibility tests passed.");
