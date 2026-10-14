/** Opt-in local production-worker proof. Retain job/profile on every outcome. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, readdir, copyFile, rename, stat } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { build, preview } from 'vite';
import { chromium } from '@playwright/test';

const [sourceArg, jobArg, expectedHash] = process.argv.slice(2);
if (!sourceArg || !jobArg || !/^[0-9a-f]{64}$/.test(expectedHash ?? '')) throw new Error('Usage: node scripts/catalog/browser-proof.mjs CHUNK_DIRECTORY JOB_DIRECTORY MANIFEST_SHA256');
const source = resolve(sourceArg), job = resolve(jobArg), artifacts = resolve('.artifacts');
if (!job.startsWith(artifacts + sep) || job === source) throw new Error('Job must be a separate contained ignored .artifacts directory');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestBytes = await readFile(resolve(source, 'manifest.json'));
assert.equal(hash(manifestBytes), expectedHash, 'Immutable manifest changed');
const manifest = JSON.parse(manifestBytes);
const snapshot = manifest.sourceSnapshot;
assert.match(snapshot, /^[0-9a-f]{64}$/);
const attempt = [snapshot.slice(0,8),snapshot.slice(8,12),snapshot.slice(12,16),snapshot.slice(16,20),snapshot.slice(20,32)].join('-');
const origin = 'http://127.0.0.1:5179', base = origin + '/catalog-fixtures/';
const intent = { version: 1, source, manifestSha256: expectedHash, snapshot, attempt, origin };
await mkdir(job, { recursive: true });
const intentPath = resolve(job, 'intent.json');
try { await writeFile(intentPath, JSON.stringify(intent, null, 2), { flag: 'wx' }); }
catch (error) { if (error.code !== 'EEXIST') throw error; assert.deepEqual(JSON.parse(await readFile(intentPath)), intent, 'Existing proof job has different immutable intent'); }
const receiptDirectory = resolve(job, 'runs', randomUUID()); await mkdir(receiptDirectory, { recursive: true });
const revision = execFileSync('git', ['rev-parse','HEAD'], { encoding: 'utf8' }).trim();
await writeFile(resolve(receiptDirectory, 'start.json'), JSON.stringify({ intent, revision, pid: process.pid, started: new Date().toISOString() }, null, 2));
async function receipt(name, value) {
  const target = resolve(receiptDirectory, name + '.json'), temporary = target + '.tmp';
  await writeFile(temporary, JSON.stringify(value, null, 2)); await rename(temporary, target);
}
async function list(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? list(resolve(directory, entry.name)) : [resolve(directory, entry.name)]))).flat();
}
const dist = resolve(job, 'dist'); let server, context;
const launch = async () => chromium.launchPersistentContext(resolve(job, 'profile'), { channel: process.env.CI ? undefined : 'chrome', headless: true });
const call = (page, method, args = []) => page.evaluate(async ({ method, args }) => window.catalogHarness[method](...args), { method, args });
try {
  // Build the same catalog client/worker/plugins as the product, from a test-only HTML entry.
  await build({ configFile: resolve('vite.config.ts'), build: { outDir: dist, emptyOutDir: false, rollupOptions: { input: resolve('tests/browser/catalog-worker.html') } } });
  await copyFile(resolve(dist, 'tests/browser/catalog-worker.html'), resolve(dist, 'index.html'));
  const paths = (await list(dist)).filter(path => !['sw.js','asset-manifest.json'].includes(relative(dist, path))).sort();
  const assets = paths.map(path => '/' + relative(dist, path).split(sep).join('/'));
  assert(assets.some(path => /catalog-worker-.*\.js$/.test(path)), 'Built worker missing');
  assert(assets.some(path => path.endsWith('.wasm')), 'Built SQLite WASM missing');
  const version = hash(Buffer.concat(await Promise.all(paths.map(path => readFile(path)))));
  const template = await readFile('scripts/shell-sw.js', 'utf8');
  await writeFile(resolve(dist, 'sw.js'), template.replace('__SHELL_VERSION__', version).replace('__SHELL_ASSETS__', JSON.stringify(assets)));
  await receipt('build', { assets, version, revision });
  server = await preview({ configFile: resolve('vite.config.ts'), build: { outDir: dist }, preview: { host: '127.0.0.1', port: 5179, strictPort: true }, plugins: [{
    name: 'local-immutable-catalog-fixture', configurePreviewServer(instance) {
      instance.middlewares.use('/catalog-fixtures/', async (request, response) => {
        try {
          const path = resolve(source, decodeURIComponent(new URL(request.url, origin).pathname).slice(1));
          if (!path.startsWith(source + sep)) throw new Error('Fixture traversal');
          const size = (await stat(path)).size;
          response.setHeader('Content-Type','application/octet-stream'); response.setHeader('Content-Length', size); response.setHeader('Cache-Control','no-store');
          const stream = createReadStream(path); stream.on('error', () => response.destroy()); response.on('close', () => stream.destroy()); stream.pipe(response);
        } catch { response.writeHead(404); response.end(); }
      });
    },
  }] });
  context = await launch(); let page = context.pages()[0] ?? await context.newPage();
  await page.goto(origin); await page.waitForFunction(() => !!window.catalogHarness);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await call(page, 'seedUsers'); const users = await call(page, 'users');
  const info = await call(page, 'open', ['proof']); assert.equal(info.preservationEnabled, true);
  await call(page, 'beginPrepare', ['proof', attempt, manifest, base]);
  let previousProgress = '';
  for (;;) {
    const state = await call(page, 'preparation');
    const progress = await call(page, 'progress');
    if (progress && JSON.stringify(progress) !== previousProgress) {
      previousProgress = JSON.stringify(progress); await receipt('progress', progress);
      if (progress.chunkIndex % 16 === 0) console.log(JSON.stringify({ event: 'verified', ...progress }));
    }
    if (state.done) { if (state.error) throw new Error(state.error); break; }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  const ready = await call(page, 'status', ['proof', attempt]); assert.equal(ready.phase, 'validated');
  await receipt('validated', ready);
  const activated = await call(page, 'activate', ['proof', attempt]); assert.equal(activated.pointer.activeId, attempt);
  assert.deepEqual(await call(page, 'users'), users);
  await receipt('activated', activated);
  await call(page, 'close', ['proof']); await context.close(); context = undefined;
  await new Promise(resolve => server.httpServer.close(resolve)); server = undefined;
  // No HTTP server exists and the new browser starts offline, using a retained profile.
  context = await launch(); await context.setOffline(true);
  page = context.pages()[0] ?? await context.newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForFunction(() => !!window.catalogHarness);
  await call(page, 'open', ['cold']);
  const cold = await call(page, 'active', ['cold', manifest.kind]);
  assert.equal(cold.pointer.activeId, attempt); assert.equal(cold.pointer.confirmed, true);
  assert.deepEqual(cold.inspection, activated.inspection); assert.deepEqual(await call(page, 'users'), users);
  await call(page, 'close', ['cold']);
  const result = { passed: true, revision, snapshot, manifestSha256: expectedHash, rawBytes: manifest.files.reduce((sum,file) => sum + file.byteSize,0), chunks: manifest.files.reduce((sum,file) => sum + file.chunks.length,0), cold, userRows: users.rows.length, outbox: users.pending.length, scope: 'desktop Chrome production-built test entry; server stopped before cold offline browser launch', completed: new Date().toISOString() };
  await receipt('result', result); console.log(JSON.stringify({ ...result, receiptDirectory }));
} catch (error) {
  await receipt('result', { passed: false, revision, error: String(error), recorded: new Date().toISOString() }); throw error;
} finally {
  await context?.close(); if (server) await new Promise(resolve => server.httpServer.close(resolve));
}
