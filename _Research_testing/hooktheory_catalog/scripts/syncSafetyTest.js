const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { hasAuthorization } = require('../cli/sync-catalog');
const { unsuccessfulPhases } = require('../cli/overnight-run');
const { acquireLock, releaseLock } = require('../lib/runGuard');

assert.strictEqual(hasAuthorization([], {}), false, 'live sync must fail closed');
assert.strictEqual(hasAuthorization(['--dry-run'], {}), true, 'dry-run must remain inspectable');
assert.strictEqual(
  hasAuthorization([], { HOOKTHEORY_CATALOG_AUTHORIZED: '1' }),
  true,
  'explicit authorization marker must enable an authorized run',
);

assert.deepStrictEqual(
  unsuccessfulPhases({ discover: { status: 'done' }, harvest: { status: 'error', error: 'boom' } }),
  ['harvest=error (boom)'],
  'a failed phase must make the overall scheduled run fail',
);
assert.deepStrictEqual(
  unsuccessfulPhases({ discover: { status: 'interrupted' } }),
  ['discover=interrupted'],
  'an interrupted phase must make the overall scheduled run fail',
);
assert.strictEqual(
  hasAuthorization([], { HOOKTHEORY_CATALOG_AUTHORIZED: 'true' }),
  false,
  'authorization marker must be exact',
);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sacred-ring-sync-safety-'));
const lockFile = path.join(dir, 'sync.lock');
try {
  assert.strictEqual(acquireLock(lockFile).acquired, true, 'first lock acquisition must win');
  assert.strictEqual(acquireLock(lockFile).acquired, false, 'same process must not acquire twice');
  releaseLock(lockFile);

  fs.writeFileSync(lockFile, JSON.stringify({ pid: 99999999, startedAt: '2000-01-01T00:00:00Z' }));
  assert.strictEqual(acquireLock(lockFile).acquired, true, 'stale lock must be reclaimable');
  releaseLock(lockFile);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('syncSafetyTest: PASS');
