import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  FAILURE_CLEANUP_TARGET, PRESERVING_FAILURE_CLEANUP, patchSqliteSahPool, sqlitePreservationPlugin,
} from './patch.mjs';

const runtimeRoot = process.env.PWA_SQLITE_RUNTIME_ROOT || fileURLToPath(new URL('../../', import.meta.url));
const modulePath = resolve(runtimeRoot, 'node_modules/@sqlite.org/sqlite-wasm/dist/index.mjs');
const source = await readFile(modulePath, 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;

test('pinned package has exactly one supported transformation', () => {
  const patched = patchSqliteSahPool(source);
  assert.equal(patched.replace(PRESERVING_FAILURE_CLEANUP, FAILURE_CLEANUP_TARGET), source);
  assert.notEqual(patched, source);
  assert.throws(() => patchSqliteSahPool(patched), /SHA256/);
});
test('source hash or zero/multiple targets fail closed', () => {
  assert.throws(() => patchSqliteSahPool(source + '\n'), /SHA256/);
  assert.throws(() => patchSqliteSahPool(source.replace(FAILURE_CLEANUP_TARGET, '')), /target count/);
  assert.throws(() => patchSqliteSahPool(source + FAILURE_CLEANUP_TARGET), /target count/);
  assert.throws(() => patchSqliteSahPool(new Uint8Array()), TypeError);
});
test('Vite plugin transforms only the browser bundle and propagates drift failures', () => {
  const plugin = sqlitePreservationPlugin();
  assert.equal(plugin.transform(source, modulePath).code, patchSqliteSahPool(source));
  assert.equal(plugin.transform(source, modulePath + '?v=test').code, patchSqliteSahPool(source));
  assert.equal(plugin.transform(source, modulePath.replace('index.mjs', 'node.mjs')), null);
  assert.equal(plugin.transform('unrelated', '/src/index.mjs'), null);
  assert.throws(() => plugin.transform(source + '\n', modulePath), /SHA256/);
});

async function cleanup(options, pointer = 17) {
  const calls = [];
  const original = new Error('original-init-failure');
  const thePool = {
    getVfs: () => ({ pointer, dispose: () => calls.push('dispose') }),
    releaseAccessHandles: () => calls.push('release'),
    removeVfs: async () => { calls.push('remove'); throw new Error('ignored-removal-failure'); },
  };
  const capi = { sqlite3_vfs_unregister: value => calls.push(['unregister', value]) };
  const fn = new AsyncFunction('options', 'thePool', 'capi', 'e', PRESERVING_FAILURE_CLEANUP + '\nthrow e;');
  await assert.rejects(fn(options, thePool, capi, original), value => value === original);
  return calls;
}
test('explicit preservation unregisters, disposes and releases without removal', async () => {
  assert.deepEqual(await cleanup({ preserveOnInitFailure: true }), [['unregister', 17], 'dispose', 'release']);
});
test('default and false preserve the original removal path and original error', async () => {
  for (const options of [{}, { preserveOnInitFailure: false }]) assert.deepEqual(await cleanup(options), ['remove']);
});
test('already-unregistered preservation is a no-op, matching upstream', async () => {
  assert.deepEqual(await cleanup({ preserveOnInitFailure: true }, 0), []);
});
