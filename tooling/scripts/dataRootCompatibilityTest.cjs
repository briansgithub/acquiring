const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const modulePath = path.join(repoRoot, 'tooling', 'lib', 'dataRoot.js');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'acquiring-data-root-'));

function resolveWith(env, expression = 'd.resolveDataRoot()') {
  const child = spawnSync(
    process.execPath,
    ['-e', `const d=require(${JSON.stringify(modulePath)}); console.log(${expression})`],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        ACQUIRING_DATA: '',
        SACRED_RING_DATA: '',
        ACQUIRING_ANDROID_DIR: '',
        SACRED_RING_ANDROID_DIR: '',
        ACQUIRING_SKIP_DATA_MIGRATION: '1',
        ...env,
      },
      encoding: 'utf8',
    }
  );
  assert.equal(child.status, 0, child.stderr);
  return { output: child.stdout.trim().split(/\r?\n/).at(-1), warning: child.stderr };
}

try {
  const current = path.join(tempRoot, 'current');
  const legacy = path.join(tempRoot, 'legacy');
  assert.equal(resolveWith({ ACQUIRING_DATA: current, SACRED_RING_DATA: legacy }).output, current);

  const legacyResult = resolveWith({ SACRED_RING_DATA: legacy });
  assert.equal(legacyResult.output, legacy);
  assert.match(legacyResult.warning, /deprecated/i);

  const androidOverride = path.join(tempRoot, 'android');
  assert.equal(resolveWith({ ACQUIRING_ANDROID_DIR: androidOverride }, 'd.getAndroidDir()').output, androidOverride);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('data-root compatibility tests passed');
