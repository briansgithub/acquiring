import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openDatabase, moduleFingerprint } from './common.mjs';
import { updateNormalizedCache, readNormalizedCache } from './source.mjs';

test('normalization fingerprint follows shared transitive modules across checkouts', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aural-fingerprint-test-'));
  try {
    for (const name of ['first', 'second']) {
      const dir = path.join(temp, name); fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'entry.mjs'), "import { value } from './theory.mjs'; export { value };");
      fs.writeFileSync(path.join(dir, 'theory.mjs'), "export { value } from './scales.mjs';");
      fs.writeFileSync(path.join(dir, 'scales.mjs'), 'export const value = [0,4,7];');
    }
    const first = () => moduleFingerprint(pathToFileURL(path.join(temp, 'first', 'entry.mjs')));
    const second = () => moduleFingerprint(pathToFileURL(path.join(temp, 'second', 'entry.mjs')));
    assert.equal(first(), second());
    fs.writeFileSync(path.join(temp, 'second', 'scales.mjs'), 'export const value = [0,3,7];');
    assert.notEqual(first(), second());
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test('cached additions edits deletions equal a fresh rebuild, preserving unrelated IDs', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aural-source-test-'));
  try {
    const catalog = path.join(temp, 'catalog.db'), cacheRoot = path.join(temp, 'songs');
    fs.mkdirSync(cacheRoot);
    const db = openDatabase(catalog);
    db.exec('CREATE TABLE songs(slug TEXT PRIMARY KEY,artist TEXT,title TEXT,url TEXT)');
    const addSong = (id, roots) => {
      db.prepare('INSERT OR REPLACE INTO songs VALUES (?,?,?,?)').run(id, 'Artist', id, `https://example.test/${id}`);
      const dir = path.join(cacheRoot, id); fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, '_metadata.json'), JSON.stringify({ url: `https://example.test/${id}` }));
      fs.writeFileSync(path.join(dir, 'verse.json'), JSON.stringify({ songId: `src-${id}`, sectionName: 'Verse', metadata: { keys: [{ tonic: 'C', scale: 'major', beat: 1 }] }, chords: roots.map((root, i) => ({ root, beat: i + 1, duration: 1 })) }));
    };
    addSong('one', [1, 5, 1]); addSong('two', [4, 5, 1]);
    const options = { catalog, cacheRoot, normalizedFile: path.join(temp, 'cached.db') };
    assert.throws(() => updateNormalizedCache({ ...options, normalizedFile: catalog }), /must not overwrite/);
    const first = updateNormalizedCache(options);
    const before = readNormalizedCache(options.normalizedFile);
    assert.equal(first.stats.normalized, 2);
    assert.equal(updateNormalizedCache(options).stats.reused, 2);
    addSong('two', [2, 5, 1]); addSong('three', [1, 4, 1]);
    updateNormalizedCache(options);
    const cached = readNormalizedCache(options.normalizedFile);
    assert.deepEqual(cached.runs.filter(r => r.songId === 'one'), before.runs.filter(r => r.songId === 'one'));
    fs.unlinkSync(path.join(cacheRoot, 'three', 'verse.json'));
    assert.equal(updateNormalizedCache(options).stats.deleted, 1);
    updateNormalizedCache({ ...options, normalizedFile: path.join(temp, 'fresh.db') });
    assert.deepEqual(readNormalizedCache(options.normalizedFile), readNormalizedCache(path.join(temp, 'fresh.db')));
    db.close();
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test('conflicting source aliases are quarantined, identical aliases do not multiply occurrences', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aural-alias-test-'));
  try {
    const catalog = path.join(temp, 'catalog.db'), cacheRoot = path.join(temp, 'songs'), dir = path.join(cacheRoot, 's');
    fs.mkdirSync(dir, { recursive: true });
    const db = openDatabase(catalog);
    db.exec("CREATE TABLE songs(slug TEXT,artist TEXT,title TEXT,url TEXT); INSERT INTO songs VALUES('s','a','t','url')"); db.close();
    fs.writeFileSync(path.join(dir, '_metadata.json'), '{"url":"url"}');
    const section = { songId: 'one', sectionName: 'Verse', chords: [{ root: 1, beat: 1, duration: 1 }], metadata: { keys: [{ tonic: 'C', scale: 'major', beat: 1 }] } };
    fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify(section));
    fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify(section));
    const options = { catalog, cacheRoot, normalizedFile: path.join(temp, 'cache.db') };
    assert.equal(updateNormalizedCache(options).stats.aliases, 1);
    section.chords[0].root = 5; fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify(section));
    assert.equal(updateNormalizedCache(options).stats.conflicts, 1);
    assert.equal(readNormalizedCache(options.normalizedFile).sections.length, 0);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
