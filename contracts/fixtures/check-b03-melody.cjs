// Run with Node 24. Uses built-in TypeScript transformation; no dependencies or emitted files.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { registerHooks, stripTypeScriptTypes } = require('node:module');
registerHooks({
  resolve(specifier, context, next) {
    try { return next(specifier, context); }
    catch (error) {
      if (specifier.startsWith('.')) {
        for (const suffix of ['.ts', '/index.ts']) {
          try { return next(specifier + suffix, context); } catch {}
        }
      }
      throw error;
    }
  },
  load(url, context, next) {
    if (url.endsWith('.ts')) return { format: 'module', shortCircuit: true,
      source: stripTypeScriptTypes(fs.readFileSync(new URL(url), 'utf8'), {mode: 'transform'}) };
    return next(url, context);
  }
});
const root = path.resolve(__dirname, '../..');
const model = require(path.join(root, 'pwa/src/domain/music/melody-function.ts'));
const { SpelledPitch } = require(path.join(root, 'pwa/src/domain/music/spelled-pitch.ts'));
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'b03-melody-function.json')));
assert.equal(data.authority, '3c887223b2d06b4c3a1010d0f8a23ceaf8977d08');
for (const c of data.roles) {
  const pitch = name => name ? SpelledPitch.parse(name, 4) : null;
  const description = model.describeMelodyFunction({ ...c, key: { tonic: 'C', scale: 'major' },
    currentPitch: pitch(c.current), previousPitch: pitch(c.previous), nextPitch: pitch(c.next) });
  assert.deepEqual({title: description.title, tone: description.tone, cue: model.spokenMelodyFunction(description)}, c.expected, c.id);
}
for (const c of data.registers) assert.deepEqual((c.mode === 'singing' ? model.foldMelodyIntoSingingRange : model.spokenMelodyRegister)(c.input), c.expected, c.id);
for (const c of data.timelines) {
  const input = c.expected.map(e => ({...e, spokenMelodyCue: null, melodyCueMidi: null}));
  assert.deepEqual(model.annotateMelodyVoiceCues(c.section, c.melody, input), c.expected, c.id);
}
console.log(`B03 PWA verification passed: ${data.roles.length} roles, ${data.registers.length} registers, ${data.timelines.length} native timelines. Swift not executed.`);
