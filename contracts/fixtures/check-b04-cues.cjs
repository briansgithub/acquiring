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
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const hash = b => createHash('sha256').update(b).digest('hex');
const read = p => fs.readFileSync(path.join(root,p));
const manifest = JSON.parse(read('pwa/public/voice/manifest.json'));
for (const f of manifest.files) {
  for (const prefix of ['pwa/public/voice/', 'android/app/src/main/res/raw/', 'ios/Packages/AcquiringKit/Sources/AcquiringAudio/Resources/Voice/']) {
    const b = read(prefix + f.stem + '.pcm');
    assert.equal(b.length, f.bytes); assert.equal(hash(b), f.sha256);
  }
}
const provenance = JSON.parse(read('contracts/fixtures/b04-provenance.json'));
for (const [name, sha] of Object.entries(provenance.fixtures)) assert.equal(hash(read('pwa/src/audio/synth/fixtures/'+name+'.json')),sha);
const { sonicStretch } = require(path.join(root, 'pwa/src/audio/synth/sonic.ts'));
const native = JSON.parse(read('contracts/fixtures/b04-native-sonic.json'));
assert.deepEqual(native, JSON.parse(read('pwa/src/audio/synth/fixtures/native-sonic.json')));
function synth(n,seed) {
  const out=new Int16Array(n); let lcg=seed|0;
  for(let i=0;i<n;i++) {
    lcg=(Math.imul(lcg,1664525)+1013904223)|0;
    const tri=(((i%109)*24000)/109|0)-12000;
    const tri2=(((i%55)*8000)/55|0)-4000;
    const noise=((lcg>>>16)%1001)-500;
    const env=i<2400?(i*10/24|0):(i>n-2400?((n-i)*10/24|0):1000);
    out[i]=(((tri+tri2)*env)/1000|0)+noise;
  } return out;
}
const bytes=read(native.clip.path); assert.equal(hash(bytes),native.clip.sha256);
const clip=Int16Array.from({length:native.clip.firstClipFrames},(_,i)=>bytes.readInt16LE(i*2));
const sources=[synth(7200,12345),synth(12000,777),clip];
for(const c of native.cases) {
  const output=sonicStretch(sources[c.source],24000,Math.fround(c.natural/c.target),2**c.pitchExponent,c.target);
  assert.equal(hash(Buffer.from(output.buffer)),c.sha256);
}
console.log(`${manifest.files.length} exact offline assets; ${native.cases.length} PWA/JVM Sonic cases; three frozen fixture hashes passed. Swift/C runtime remains unverified.`);
