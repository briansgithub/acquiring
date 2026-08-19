import assert from "node:assert/strict";
import test from "node:test";

import { sectionLengthBeats } from "./timing.js";

test("section length preserves metadata trailing silence", () => {
  const notes = [{ beat: 1, duration: 4 }];
  const chords = [{ beat: 5, duration: 4 }];
  assert.equal(sectionLengthBeats(17, notes, chords), 17);
});

test("section length extends stale metadata to the latest event end", () => {
  const notes = [{ beat: 12, duration: 2 }];
  const chords = [{ beat: 9, duration: 8 }];
  assert.equal(sectionLengthBeats(10, notes, chords), 17);
});

test("section length handles beat-zero events and ignores malformed timing", () => {
  assert.equal(sectionLengthBeats(0, [
    { beat: 0, duration: 4 },
    { beat: "bad", duration: 99 },
    { beat: 50, duration: -1 },
  ]), 5);
  assert.equal(sectionLengthBeats(undefined, [], null), 1);
});
