/**
 * Guards the split between the catalog's identity key and the URL it fetches.
 *
 * The bug this pins down: every discovery path rebuilt the fetch URL with
 * slugify(), which collapses punctuation runs. Hooktheory keeps them, so any
 * song with parentheses, a dot or a " - " in its path was requested at an
 * address that cannot exist and recorded dead — 83% of the dead rows in the
 * catalog. slug stays lossy (one row per song); url must stay verbatim.
 */

const assert = require('assert');
const {
  slugify,
  hooktheorySlug,
  isJunkUrl,
  parseTheoryTabUrl,
  buildTheoryTabUrl,
  theoryTabUrlFromPath,
} = require('../lib/catalogUtils');
const { canonicalizeTheoryTabUrl } = require('../lib/waybackDiscover');

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failures += 1;
    console.log(`FAIL ${name}: ${err.message}`);
  }
}

check('archived URL keeps its real path, not a rebuilt one', () => {
  const archived = 'http://web.archive.org/web/2020/https://www.hooktheory.com/theorytab/view/yasushi-ishii/the-world-without-logos-%28hellsing-opening%29';
  const canon = canonicalizeTheoryTabUrl(archived);
  assert.strictEqual(
    canon.url,
    'https://www.hooktheory.com/theorytab/view/yasushi-ishii/the-world-without-logos-(hellsing-opening)',
  );
  // ...while the key stays the collapsed form, so it can't double-insert.
  assert.strictEqual(canon.slug, 'yasushi-ishii__the-world-without-logos-hellsing-opening');
});

check('" - " separators survive (the largest loss class)', () => {
  const canon = canonicalizeTheoryTabUrl(
    'https://www.hooktheory.com/theorytab/view/shoji-meguro/persona-4---studio-backlot',
  );
  assert.ok(canon.url.endsWith('/persona-4---studio-backlot'), canon.url);
  assert.strictEqual(canon.slug, 'shoji-meguro__persona-4-studio-backlot');
});

check('encoded and synthesized forms key to the same row', () => {
  const encoded = parseTheoryTabUrl(
    'https://www.hooktheory.com/theorytab/view/070-shake/natural-habitat-%28ft-ken-carson%29',
  );
  const synthesized = parseTheoryTabUrl(buildTheoryTabUrl('070 shake', 'Natural Habitat (ft Ken Carson)'));
  assert.strictEqual(encoded.slug, synthesized.slug);
  assert.notStrictEqual(encoded.url, synthesized.url); // only one of them resolves
});

check('theoryTabUrlFromPath leaves Hooktheory punctuation alone', () => {
  assert.strictEqual(
    theoryTabUrlFromPath('(g)i-dle', 'eyes-roll'),
    'https://www.hooktheory.com/theorytab/view/(g)i-dle/eyes-roll',
  );
  assert.strictEqual(
    theoryTabUrlFromPath('32ki', 'dimention-no.n'),
    'https://www.hooktheory.com/theorytab/view/32ki/dimention-no.n',
  );
});

check('junk filter no longer discards real acts and titles', () => {
  assert.strictEqual(isJunkUrl('https://www.hooktheory.com/theorytab/view/(g)i-dle/eyes-roll'), false);
  assert.strictEqual(isJunkUrl('https://www.hooktheory.com/theorytab/view/nier/specimen:-patchworked'), false);
  assert.strictEqual(isJunkUrl('https://www.hooktheory.com/theorytab/view/x/specimen%3A-patchworked'), false);
});

check('junk filter still rejects what it should', () => {
  assert.strictEqual(isJunkUrl('https://www.hooktheory.com/theorytab/view/foo/test-010'), true);
  assert.strictEqual(isJunkUrl('https://www.hooktheory.com/theorytab/view/foo/major-scales'), true);
  assert.strictEqual(isJunkUrl('https://www.hooktheory.com/theorytab/view/_scratch/thing'), true);
  assert.strictEqual(isJunkUrl('https://www.hooktheory.com/not-a-theorytab-url'), true);
});

check('synthesized URLs follow Hooktheory\'s rule, not the key rule', () => {
  // The song this whole repair started from: reported dead, alive all along at
  // the parenthesized path.
  assert.strictEqual(
    buildTheoryTabUrl('Yasushi Ishii', 'The World Without Logos (Hellsing Opening)'),
    'https://www.hooktheory.com/theorytab/view/yasushi-ishii/the-world-without-logos-(hellsing-opening)',
  );
  assert.strictEqual(hooktheorySlug("Sweet Child O' Mine"), 'sweet-child-o-mine');
  assert.strictEqual(hooktheorySlug('Earthbound Zero - Pollyanna'), 'earthbound-zero---pollyanna');
  assert.strictEqual(hooktheorySlug('Lights, Camera, Action'), 'lights-camera-action');
  assert.strictEqual(hooktheorySlug('Dimention No.N'), 'dimention-no.n');
  assert.strictEqual(hooktheorySlug('10/10'), '10-slash-10');
  assert.strictEqual(hooktheorySlug('A&W'), 'a-and-w');
  assert.strictEqual(hooktheorySlug('brand new chanel$'), 'brand-new-chanels');
});

check('slugify stays lossy on purpose', () => {
  assert.strictEqual(slugify('Foo (Bar)'), 'foo-bar');
  assert.strictEqual(slugify('Foo - Bar'), 'foo-bar');
});

console.log(failures === 0 ? 'urlPreservationTest: all passed' : `urlPreservationTest: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
