// Copy the bundled Android speech clips (Kokoro af_heart, 24 kHz mono int16 LE) byte-for-byte into
// public/voice and write a SHA-256 manifest. Run from pwa/: `node scripts/voice/sync-voice-pack.mjs [--check]`.
// --check fails when public/voice drifts from android/app/src/main/res/raw (N07, owner decision 2026-11-18).
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = resolve('../android/app/src/main/res/raw');
const target = resolve('public/voice');
const check = process.argv.includes('--check');
const stems = (await readdir(source)).filter(name => /^(root_degree|root_suffix|root_accidental|melody_fn|mode)_[a-z_]+\.pcm$/.test(name)).sort();
const files = [];
if (!check) await mkdir(target, { recursive: true });
for (const name of stems) {
  const bytes = await readFile(resolve(source, name));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  files.push({ stem: name.slice(0, -4), bytes: bytes.length, sha256 });
  if (check) {
    const copy = await readFile(resolve(target, name)).catch(() => null);
    if (!copy || createHash('sha256').update(copy).digest('hex') !== sha256) throw new Error(`public/voice/${name} differs from Android`);
  } else {
    await writeFile(resolve(target, name), bytes);
  }
}
const manifest = JSON.stringify({ schemaVersion: 1, sampleRate: 24000, format: 'pcm_s16le_mono',
  source: 'android/app/src/main/res/raw', voice: 'Kokoro-82M af_heart (Apache-2.0)', files }, null, 1) + '\n';
if (check) {
  if ((await readFile(resolve(target, 'manifest.json'), 'utf8')) !== manifest) throw new Error('public/voice/manifest.json is stale');
} else {
  await writeFile(resolve(target, 'manifest.json'), manifest);
}
console.log(`${check ? 'Verified' : 'Synced'} ${files.length} voice clips (${files.reduce((n, f) => n + f.bytes, 0)} bytes)`);
