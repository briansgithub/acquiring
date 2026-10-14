import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchSqliteSahPool, SQLITE_SOURCE_SHA256 } from './patch.mjs';

const runtimeRoot = resolve(process.env.PWA_SQLITE_RUNTIME_ROOT || fileURLToPath(new URL('../../', import.meta.url)));
const require = createRequire(resolve(runtimeRoot, 'package.json'));
const { chromium } = require('playwright');
const dist = resolve(runtimeRoot, 'node_modules/@sqlite.org/sqlite-wasm/dist');
const artifact = resolve('.artifacts/pwa-port/sqlite-safety', randomUUID());
await mkdir(artifact, { recursive: true });
const source = await readFile(resolve(dist, 'index.mjs'), 'utf8');
await writeFile(resolve(artifact, 'sqlite.mjs'), patchSqliteSahPool(source));
await writeFile(resolve(artifact, 'worker.mjs'), await readFile(new URL('./browser-worker.mjs', import.meta.url)));
const routes = new Map([
  ['/', ['text/html', Buffer.from('<!doctype html><title>Isolated SQLite safety fixture</title>')]],
  ['/worker.mjs', ['text/javascript', await readFile(resolve(artifact, 'worker.mjs'))]],
  ['/sqlite.mjs', ['text/javascript', await readFile(resolve(artifact, 'sqlite.mjs'))]],
  ['/sqlite3.wasm', ['application/wasm', await readFile(resolve(dist, 'sqlite3.wasm'))]],
]);
const server = createServer((request, response) => {
  const route = routes.get(request.url);
  if (!route) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': route[0], 'Cache-Control': 'no-store' });
  response.end(route[1]);
});
let browser;
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(origin);
  const run = phase => page.evaluate(async phase => {
    const worker = new Worker('/worker.mjs', { type: 'module' });
    (globalThis.fixtureWorkers ??= []).push(worker);
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Worker phase timed out: ' + phase)), 20000);
      worker.onerror = event => { clearTimeout(timeout); reject(new Error(event.message)); };
      worker.onmessage = ({ data }) => { clearTimeout(timeout); data.ok ? resolve(data) : reject(new Error(data.error)); };
      worker.postMessage(phase);
    });
    if (phase === 'prepare') worker.terminate();
    return result;
  }, phase);
  const prepare = await run('prepare');
  assert.equal(prepare.capacity, 4);
  assert.equal(prepare.files.length, 4);
  const failure = await run('fail');
  assert.equal(failure.failure.name, 'NoModificationAllowedError');
  assert.match(failure.failure.message, /injected-mid-acquire/);
  assert.equal(failure.apiChecks, 1);
  assert.equal(failure.attempts, 4);
  assert.equal(failure.acquired, 3);
  assert.equal(failure.closed, 3);
  assert.equal(failure.active, 0);
  assert.equal(failure.registered, false);
  assert.equal(failure.probes, 4);
  assert.deepEqual(failure.files, prepare.files);
  // Reopen in a third fresh worker while the failed second worker remains
  // alive: worker termination cannot explain the released file handles.
  const reopen = await run('reopen');
  assert.equal(reopen.row, 'preserved-fixture-row');
  assert.equal(reopen.integrity, 'ok');
  assert.deepEqual(reopen.files, prepare.files);
  await page.evaluate(() => globalThis.fixtureWorkers.forEach(worker => worker.terminate()));
  const receipt = { sourceSha256: SQLITE_SOURCE_SHA256, browser: browser.version(), origin, prepare, failure, reopen };
  await writeFile(resolve(artifact, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log('PASS: Chrome OPFS preserved all 4 file hashes; released 3 partially acquired handles; third worker recovered fixture row/quick_check while failed worker remained alive.');
  console.log('Receipt: ' + resolve(artifact, 'receipt.json'));
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
