const assert = require('node:assert/strict');
const {
  alphabeticalGroup,
  complexityBucket,
  canonicalDiatonicMode,
  collectAndroidBrowseModes,
} = require('../lib/androidCatalogSections');

assert.equal(alphabeticalGroup('  autumn leaves'), 'A');
assert.equal(alphabeticalGroup('7 Nation Army'), '7');
assert.equal(alphabeticalGroup('0 to 100'), '0');
assert.equal(alphabeticalGroup('!Song'), '#');
assert.equal(alphabeticalGroup(null), '#');

assert.equal(complexityBucket(0), 0);
assert.equal(complexityBucket(9.999), 0);
assert.equal(complexityBucket(10), 1);
assert.equal(complexityBucket(100), 9);
assert.equal(complexityBucket(null), null);

assert.equal(canonicalDiatonicMode('major'), 'ionian');
assert.equal(canonicalDiatonicMode('minor'), 'aeolian');
assert.equal(canonicalDiatonicMode('harmonicMinor'), null);

const modes = collectAndroidBrowseModes({
  verse: {
    metadata: {
      keys: [
        { scale: 'major' },
        { scale: 'dorian' },
        { scale: 'dorian' },
      ],
    },
  },
  chorus: {
    metadata: {
      keys: [
        { scale: 'minor' },
        { scale: 'major' },
        { scale: 'phrygianDominant' },
      ],
    },
  },
});
assert.deepEqual(new Set(modes), new Set(['ionian', 'dorian', 'aeolian']));

assert.deepEqual(
  new Set(collectAndroidBrowseModes({
    sourceSectionData: { keys: [{ scale: 'lydian' }, { scale: 'locrian' }] },
  })),
  new Set(['lydian', 'locrian']),
);

console.log('Android catalog browse metadata tests passed.');
