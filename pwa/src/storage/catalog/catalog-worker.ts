import sqlite3InitModule, { type SAHPoolUtil, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { sha256 as incrementalSha256 } from '@noble/hashes/sha2.js';
import { fetchVerifiedChunk } from './chunks';
import { validateManifest, type CatalogManifest } from './manifest';
import { CATALOG_OWNER_LOCK, CatalogError, stagedPath, type CatalogCommand, type CatalogInfo, type CatalogInspection, type CatalogProgress, type CatalogRequest, type CatalogResponse } from './protocol';

const scope = globalThis as unknown as { onmessage: ((event: MessageEvent<CatalogRequest>) => void) | null; postMessage: (value: CatalogResponse | CatalogProgress) => void };
let pool: SAHPoolUtil | null = null;
let sqlite: Sqlite3Static | null = null;
let ownershipTask: Promise<void> | undefined;
let releaseOwnership: (() => void) | undefined;
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function acquire(): Promise<void> {
  if (pool) return;
  if (!navigator.locks || !navigator.storage?.getDirectory) throw new CatalogError('UNSUPPORTED', 'This browser does not provide persistent catalog ownership');
  const ready = deferred<void>(), release = deferred<void>();
  releaseOwnership = () => release.resolve();
  ownershipTask = navigator.locks.request(CATALOG_OWNER_LOCK, { mode: 'exclusive', ifAvailable: true }, async lock => {
    if (!lock) { ready.reject(new CatalogError('BUSY', 'Catalog is open in another tab; close it or wait for it to finish')); return; }
    try {
      sqlite = await sqlite3InitModule();
      if (!sqlite.installOpfsSAHPoolVfs.toString().includes('preserveOnInitFailure')) throw new CatalogError('UNSAFE_RUNTIME', 'SQLite preservation build hook is missing');
      const options = { name: 'acquiring-catalog', directory: '/acquiring-catalog', initialCapacity: 24, preserveOnInitFailure: true, clearOnInit: false };
      pool = await sqlite.installOpfsSAHPoolVfs(options);
      await pool.reserveMinimumCapacity(24);
      ready.resolve();
      await release.promise;
    } catch (error) { ready.reject(error); }
    finally { pool?.pauseVfs(); pool = null; sqlite = null; }
  }).catch(error => ready.reject(error));
  await ready.promise;
}
function owner(): SAHPoolUtil {
  if (!pool) throw new CatalogError('CLOSED', 'Catalog ownership is not initialized');
  return pool;
}
function info(): CatalogInfo { return { sqliteVersion: sqlite!.version.libVersion, capacity: owner().getCapacity(), files: owner().getFileNames(), preservationEnabled: true }; }
function hex(bytes: Uint8Array): string { return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join(''); }
function inspect(attemptId: string, manifest: CatalogManifest): CatalogInspection {
  const files = manifest.files.map(file => {
    const path = stagedPath(attemptId, file.name);
    if (!owner().getFileNames().includes(path)) throw new CatalogError('INCOMPLETE', 'Catalog staging is incomplete');
    const db = new sqlite!.oo1.DB(path, 'r', owner().vfsName);
    try {
      if (db.selectValue('PRAGMA quick_check') !== 'ok') throw new CatalogError('INTEGRITY', 'Catalog quick_check failed');
      const bytes = Number(db.selectValue('PRAGMA page_count')) * Number(db.selectValue('PRAGMA page_size'));
      if (bytes !== file.byteSize) throw new CatalogError('INTEGRITY', 'Catalog database length mismatch');
      const metadata: Record<string, string> = {};
      if (manifest.kind === 'aural') {
        for (const row of db.selectObjects('SELECT key,value FROM metadata')) metadata[String(row.key)] = String(row.value);
        if (file.name === 'aural-catalog.db' && (metadata.schema_version !== manifest.sourceSchema || metadata.snapshot_id !== manifest.sourceSnapshot)) throw new CatalogError('INTEGRITY', 'Catalog snapshot mismatch');
        if (file.name === 'aural-evidence.db' && metadata.catalog_snapshot !== manifest.sourceSnapshot) throw new CatalogError('INTEGRITY', 'Evidence snapshot mismatch');
        if (file.name === 'aural-popularity.db' && (!metadata.snapshotId || !metadata.provider)) throw new CatalogError('INTEGRITY', 'Popularity metadata missing');
      } else {
        if (db.selectValue('PRAGMA user_version') !== 3) throw new CatalogError('INTEGRITY', 'Song catalog schema mismatch');
        const columns = { songs: ['slug','artist','title','url','status','dataBlob'], song_browse_entries: ['slug','artist','title','alphaGroup','complexityRating','complexityBucket'], song_browse_modes: ['slug','mode'] };
        for (const [table, required] of Object.entries(columns)) {
          const available = db.selectObjects(`PRAGMA table_info(${table})`).map(row => String(row.name));
          if (required.some(name => !available.includes(name))) throw new CatalogError('INTEGRITY', 'Song catalog columns missing');
        }
        const count = Number(db.selectValue('SELECT COUNT(*) FROM song_browse_entries'));
        if (count < 40609) throw new CatalogError('INTEGRITY', 'Song catalog is incomplete');
        metadata.browseRowCount = String(count);
      }
      return { name: file.name, bytes, metadata };
    } finally { db.close(); }
  });
  return { attemptId, files };
}
async function stage(id: string, attemptId: string, manifest: CatalogManifest, baseUrl: string): Promise<CatalogInspection> {
  const paths = manifest.files.map(file => stagedPath(attemptId, file.name));
  if (owner().getFileNames().some(path => paths.includes(path))) throw new CatalogError('EXISTS', 'Staging attempt already has files; inspect its outcome before retrying');
  const base = new URL(baseUrl);
  for (const file of manifest.files) {
    let index = 0, verifiedBytes = 0;
    const digest = incrementalSha256.create();
    try {
      const importedBytes = await owner().importDb(stagedPath(attemptId, file.name), async () => {
        const chunk = file.chunks[index];
        if (!chunk) {
          if (verifiedBytes !== file.byteSize || hex(digest.digest()) !== file.checksum) throw new CatalogError('INTEGRITY', 'Full catalog database checksum mismatch');
          return undefined;
        }
        const { raw } = await fetchVerifiedChunk(base, chunk, AbortSignal.timeout(60_000));
        digest.update(raw); verifiedBytes += raw.byteLength;
        scope.postMessage({ type: 'progress', id, file: file.name, chunkIndex: index++, verifiedBytes });
        return raw;
      });
      if (importedBytes !== file.byteSize) throw new CatalogError('INTEGRITY', 'Imported database length mismatch');
    } finally { digest.destroy(); }
  }
  return inspect(attemptId, manifest);
}
async function execute(id: string, command: CatalogCommand): Promise<unknown> {
  if (command.kind === 'init') { await acquire(); return info(); }
  if (command.kind === 'close') { releaseOwnership?.(); await ownershipTask; releaseOwnership = undefined; ownershipTask = undefined; return null; }
  owner();
  if (command.kind === 'info') return info();
  if (command.kind === 'inspect') return inspect(command.attemptId, validateManifest(command.manifest));
  if (command.kind === 'stage') return stage(id, command.attemptId, validateManifest(command.manifest), command.baseUrl);
  throw new CatalogError('INVALID_REQUEST', 'Unknown catalog command');
}
let operations = Promise.resolve();
scope.onmessage = ({ data }) => {
  operations = operations.then(async () => {
    try {
      if (!data || typeof data.id !== 'string' || !data.command || typeof data.command.kind !== 'string') throw new CatalogError('INVALID_REQUEST', 'Invalid catalog request');
      const value = await execute(data.id, data.command);
      scope.postMessage({ type: 'result', id: data.id, ok: true, value });
    } catch (error) {
      scope.postMessage({ type: 'result', id: data?.id ?? '', ok: false, error: { code: error instanceof CatalogError ? error.code : 'IO', message: error instanceof Error ? error.message : 'Catalog operation failed' } });
    }
  });
};
