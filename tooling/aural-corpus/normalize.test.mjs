import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeChord, normalizeSection } from './normalize.mjs';
const key = { tonic: 'C', scale: 'major' };
const chord = (root, beat, extra = {}) => ({ root, beat, duration: 1, ...extra });
const section = chords => ({ songId: 'source', sectionName: 'Verse', chords, metadata: { keys: [{ ...key, beat: 1 }] } });

test('secondary dominant preserves numerator, target and extension across keys', () => {
  // Hooktheory encodes V/V as root=5 (target), applied=5 (numerator).
  const applied = { root: 5, applied: 5 };
  const c = normalizeChord(applied, key);
  const d = normalizeChord(applied, { tonic: 'D', scale: 'major' });
  assert.equal(c.degree, 'V/V');
  assert.equal(c.rootMidi % 12, 2); // D in C major
  assert.equal(d.rootMidi % 12, 4); // E in D major
  assert.equal(c.tokens.harmony, d.tokens.harmony);
  const plainMajorII = normalizeChord({ root: 2, borrowed: 'lydian' }, key);
  assert.deepEqual(c.notes.map(n => n % 12).sort(), plainMajorII.notes.map(n => n % 12).sort());
  assert.notEqual(c.tokens.harmony, plainMajorII.tokens.harmony);
  assert.notEqual(c.tokens.harmony, normalizeChord({ ...applied, type: 7 }, key).tokens.harmony);
  assert.notEqual(c.tokens.harmony, normalizeChord({ root: 2, applied: 5 }, key).tokens.harmony);
  assert.throws(() => normalizeChord({ ...applied, uncertain: true }, key), /uncertain-chord/);
});
test('transposition invariant but qualities, borrowing and applied functions remain different', () => {
  for (const c of [{ root: 1 }, { root: 5, applied: 5 }, { root: 4, borrowed: 'minor' }, { root: 5, type: 7 }, { root: 1, adds: [9] }]) {
    assert.equal(normalizeChord(c, key).tokens.harmony, normalizeChord(c, { tonic: 'F#', scale: 'major' }).tokens.harmony);
  }
  assert.notEqual(normalizeChord({ root: 5 }, key).tokens.harmony, normalizeChord({ root: 5, type: 7 }, key).tokens.harmony);
  assert.notEqual(normalizeChord({ root: 5, applied: 5 }, key).tokens.harmony, normalizeChord({ root: 2 }, key).tokens.harmony);
});
test('inversion views collapse differently without discarding source spans', () => {
  const result = normalizeSection({ songId: 's', section: section([chord(1, 1), chord(1, 2, { inversion: 1 }), chord(5, 3)]) });
  const grouped = result.runs.find(r => r.view === 'harmony');
  const bass = result.runs.find(r => r.view === 'harmony_bass');
  assert.equal(grouped.tokens.length, 2); assert.equal(bass.tokens.length, 3);
  assert.equal(grouped.positions[0].endIndex, 1); assert.equal(grouped.positions[0].varyingBass, true);
  assert.equal(grouped.transitionIds[0], bass.transitionIds[1]);
});
test('rest, gap, missing key and uncertainty never bridge chords', () => {
  for (const middle of [chord(2, 2, { isRest: true }), chord(2, 2, { uncertain: true })]) {
    const r = normalizeSection({ songId: 's', section: section([chord(1, 1), middle, chord(5, 3)]) });
    assert.ok(r.runs.every(run => run.tokens.length === 1));
  }
  const r = normalizeSection({ songId: 's', section: section([chord(1, 1), chord(5, 4)]) });
  assert.equal(r.denominators.harmony.eligibleTransitions, 0);
  const unknown = normalizeSection({ songId: 's', section: { chords: [chord(1, 1), chord(5, 2)] } });
  assert.equal(unknown.runs.length, 0); assert.equal(unknown.denominators.harmony.observedTransitions, 1);
});
test('modulation uses local key and splits at change with uncovered denominator', () => {
  const s = section([chord(1, 1), chord(5, 2), chord(1, 3)]);
  s.metadata.keys.push({ tonic: 'G', scale: 'major', beat: 2 });
  const r = normalizeSection({ songId: 's', section: s });
  assert.deepEqual(r.runs.filter(r => r.view === 'harmony').map(r => r.tokens.length), [1, 2]);
  assert.equal(r.denominators.harmony.observedTransitions, 2);
  assert.equal(r.denominators.harmony.uncertainTransitions, 1);
});
test('stable physical identities survive unrelated additions and cache timestamps', () => {
  const s = section([chord(1, 1), chord(5, 2), chord(1, 3)]);
  const a = normalizeSection({ songId: 's', section: s });
  const b = normalizeSection({ songId: 's', section: { ...s, cachedAt: 'changed' } });
  assert.deepEqual(a, b);
  assert.notEqual(a.runs[0].transitionIds[0], a.runs[0].transitionIds[1]);
});
test('conflicting keys, invalid flags and null events preserve technical uncertainty', () => {
  const s = section([chord(1, 1), chord(5, 2)]);
  s.metadata.keys.push({ tonic: 'G', scale: 'major', beat: 1 });
  const r = normalizeSection({ songId: 's', section: s });
  assert.equal(r.runs.length, 0); assert.equal(r.diagnostics[0].reason, 'conflicting-keys');
  assert.throws(() => normalizeChord({ root: 1, confidence: '1' }, key), /confidence/);
  assert.throws(() => normalizeChord({ root: 1, halfDim: 'false' }, key), /halfDim/);
  const nullEvent = normalizeSection({ songId: 's', section: section([chord(1, 1), null, chord(5, 3)]) });
  assert.equal(nullEvent.denominators.harmony.observedTransitions, 2);
  assert.ok(nullEvent.runs.every(run => run.tokens.length === 1));
});
