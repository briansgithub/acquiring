import {captureAuralStatisticsRequest} from './aural-statistics-request';
import {readAuralStatisticsFacts} from './aural-statistics-query';
import {readAuralPopularity} from './aural-popularity-query';
import {computeAuralCatalogStatistics} from '../../domain/catalog/catalog-statistics';
import type {AuralStatisticsRequest,AuralStatisticsResponse} from './aural-statistics-runtime-contracts';
import {captureAuralTargetQuery,readAuralTargetRow} from './aural-target-query';
import {decodeAuralCatalogRun,createAuralCatalogTarget} from './aural-target-codec';
import type {AuralCatalogTargetQuery} from './aural-target-query-contracts';
import {readAuralHeader} from './aural-header';
import {songAlphabeticalGroupCounts,songBrowseBySlugs,songPage,songSongsInAlphabeticalGroup} from './catalog-song-reads';
import {songDetailQuery,songPayloadRecord,readSongComplexity,type SongPayload} from './detail-query';
import sqlite3InitModule, { type SAHPoolUtil, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { sha256 as incrementalSha256 } from '@noble/hashes/sha2.js';
import { fetchVerifiedChunk, sha256 } from './chunks';
import { validateSongCatalog } from './song-schema';
import { cachedCompressedBytes, cachedOrFetchChunk } from './chunk-cache';
import { openCatalogJournal, type CatalogJournal, type CatalogInstall } from './journal';
import { planInstallSpace, validateManifest, type CatalogManifest, type CatalogChunk, type CatalogFile } from './manifest';
import { CATALOG_OWNER_LOCK, CatalogError, stagedPath, type CatalogCommand, type ActiveCatalog, type CatalogInfo, type CatalogInspection, type CatalogProgress, type CatalogRequest, type CatalogResponse } from './protocol';

const scope = globalThis as unknown as { onmessage: ((event: MessageEvent<CatalogRequest>) => void) | null; postMessage: (value: CatalogResponse | CatalogProgress) => void };
let confirmedAuralRead: { id:string; sourceSnapshot:string } | null = null;
let confirmedSongRead: { id:string; sourceSnapshot:string } | null = null;
let pool: SAHPoolUtil | null = null;
let journal: CatalogJournal | null = null;
const sessionId = crypto.randomUUID();
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
      journal = await openCatalogJournal();
      ready.resolve();
      await release.promise;
    } catch (error) { ready.reject(error); }
    finally { confirmedAuralRead = null; confirmedSongRead = null; journal?.close(); journal = null; pool?.pauseVfs(); pool = null; sqlite = null; }
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
        Object.assign(metadata, validateSongCatalog(db));
      }
      return { name: file.name, bytes, metadata };
    } finally { db.close(); }
  });
  return { attemptId, files };
}
async function importFile(id: string, attemptId: string, file: CatalogFile, load: (chunk: CatalogChunk) => Promise<Uint8Array>, onChunk?: (chunk: CatalogChunk) => Promise<void>): Promise<void> {
  let index = 0, verifiedBytes = 0; const digest = incrementalSha256.create();
  try {
    const importedBytes = await owner().importDb(stagedPath(attemptId, file.name), async () => {
      const chunk = file.chunks[index];
      if (!chunk) {
        if (verifiedBytes !== file.byteSize || hex(digest.digest()) !== file.checksum) throw new CatalogError('INTEGRITY', 'Full catalog database checksum mismatch');
        return undefined;
      }
      const raw = await load(chunk); digest.update(raw); verifiedBytes += raw.byteLength;
      await onChunk?.(chunk);
      scope.postMessage({ type: 'progress', id, file: file.name, chunkIndex: index++, verifiedBytes });
      return raw;
    });
    if (importedBytes !== file.byteSize) throw new CatalogError('INTEGRITY', 'Imported database length mismatch');
  } finally { digest.destroy(); }
}
function normalizedBase(baseUrl: string): URL {
  const base = new URL(baseUrl);
  if (!['https:', 'http:'].includes(base.protocol) || !base.pathname.endsWith('/') || base.search || base.hash || base.username || base.password) throw new CatalogError('INVALID_REQUEST', 'Expected a trusted catalog directory URL');
  return base;
}
async function stage(id: string, attemptId: string, manifest: CatalogManifest, baseUrl: string): Promise<CatalogInspection> {
  const paths = manifest.files.map(file => stagedPath(attemptId, file.name));
  if (owner().getFileNames().some(path => paths.includes(path))) throw new CatalogError('EXISTS', 'Staging attempt already has files; inspect its outcome before retrying');
  const base = normalizedBase(baseUrl);
  for (const file of manifest.files) await importFile(id, attemptId, file, async chunk => (await fetchVerifiedChunk(base, chunk, AbortSignal.timeout(60_000))).raw);
  return inspect(attemptId, manifest);
}
async function manifestDigest(manifest: CatalogManifest): Promise<string> { return sha256(new TextEncoder().encode(JSON.stringify(manifest))); }
async function validatedInstall(attemptId: string): Promise<CatalogInstall> {
  const record = await journal!.install(attemptId);
  if (!record || record.phase !== 'validated') throw new CatalogError('INCOMPLETE', 'Catalog install has not finished validation');
  const manifest = validateManifest(record.manifest);
  if (await manifestDigest(manifest) !== record.manifestDigest) throw new CatalogError('INTEGRITY', 'Catalog intent was changed');
  return { ...record, manifest };
}
async function prepare(id: string, attemptId: string, manifest: CatalogManifest, baseUrl: string): Promise<CatalogInspection> {
  const paths = manifest.files.map(file => stagedPath(attemptId, file.name));
  const base = normalizedBase(baseUrl), digest = await manifestDigest(manifest);
  let record = await journal!.install(attemptId);
  if (record && (record.manifestDigest !== digest || record.baseUrl !== base.href || await manifestDigest(validateManifest(record.manifest)) !== digest)) throw new CatalogError('INTENT_MISMATCH', 'Install ID belongs to a different immutable manifest or source');
  if (!record && owner().getFileNames().some(path => paths.includes(path))) throw new CatalogError('ORPHANED', 'Existing staging files have no receipt; preserve them and start a new attempt');
  if (!record) {
    record = { id: attemptId, manifest, manifestDigest: digest, baseUrl: base.href, phase: 'staging', verifiedChunks: [], validatedFiles: [], createdAt: Date.now() };
    await journal!.save(record);
  }
  const pointer = await journal!.pointer(manifest.kind);
  const protectedAttempt = pointer?.activeId === attemptId || pointer?.previousId === attemptId;
  try {
    if (record.phase === 'validated') {
      try { return inspect(attemptId, manifest); }
      catch (error) { if (protectedAttempt) throw error; }
    }
    const cachedBytes = await cachedCompressedBytes(manifest);
    const space = planInstallSpace(manifest, await navigator.storage.estimate(), cachedBytes);
    if (space.enough !== true) throw new CatalogError('QUOTA', space.enough === null ? 'Browser storage capacity cannot be verified' : 'Not enough storage; the previous catalog remains available');
    record.phase = 'importing'; delete record.lastError; await journal!.save(record);
    for (const file of manifest.files) {
      if (record.validatedFiles.includes(file.name)) {
        try { inspect(attemptId, { ...manifest, files: [file] }); continue; } catch { /* Reimport only this unprotected staging target. */ }
      }
      if (protectedAttempt) throw new CatalogError('PROTECTED', 'An installed catalog cannot be overwritten; start a new attempt');
      const current = record;
      await importFile(id, attemptId, file, chunk => cachedOrFetchChunk(base, chunk, AbortSignal.timeout(60_000)), async chunk => {
        const key = file.name + ':' + chunk.index;
        if (!current.verifiedChunks.includes(key)) { current.verifiedChunks.push(key); await journal!.save(current); }
      });
      inspect(attemptId, { ...manifest, files: [file] });
      if (!record.validatedFiles.includes(file.name)) record.validatedFiles.push(file.name);
      await journal!.save(record);
    }
    const result = inspect(attemptId, manifest);
    record.phase = 'validated'; delete record.lastError; await journal!.save(record);
    return result;
  } catch (error) {
    record.lastError = error instanceof Error ? error.message : 'Catalog install interrupted';
    await journal!.save(record).catch(() => {}); throw error;
  }
}
async function activate(attemptId: string): Promise<ActiveCatalog> {
  const record = await validatedInstall(attemptId), inspection = inspect(attemptId, record.manifest);
  const pointer = await journal!.activate(record, sessionId);
  return { pointer, inspection, recovered: false };
}
async function active(kind: CatalogManifest['kind']): Promise<ActiveCatalog | null> {
  if (kind !== 'aural' && kind !== 'songs') throw new CatalogError('INVALID_REQUEST', 'Unknown catalog kind');
  const pointer = await journal!.pointer(kind);
  if (!pointer) return null;
  try {
    const record = await validatedInstall(pointer.activeId);
    if (record.manifest.kind !== kind) throw new CatalogError('INTEGRITY', 'Active catalog kind mismatch');
    const inspection = inspect(record.id, record.manifest);
    const confirmed = !pointer.confirmed && pointer.activatedBySession !== sessionId ? await journal!.updatePointer(pointer, { ...pointer, confirmed: true }) : pointer;
    return { pointer: confirmed, inspection, recovered: false };
  } catch (error) {
    if (!pointer.previousId) throw error;
    const previous = await validatedInstall(pointer.previousId);
    if (previous.manifest.kind !== kind) throw new CatalogError('INTEGRITY', 'Previous catalog kind mismatch');
    const inspection = inspect(previous.id, previous.manifest);
    const restored = await journal!.updatePointer(pointer, { kind, activeId: previous.id, previousId: pointer.activeId, confirmed: true, activatedBySession: sessionId });
    return { pointer: restored, inspection, recovered: true };
  }
}
/** Check active/cold recovery once per snapshot; never scan the full catalog per page. */
async function confirmedSongs():Promise<{id:string;sourceSnapshot:string}> {
  const pointer=await journal!.pointer('songs');
  if(!pointer)throw new CatalogError('NOT_INSTALLED','Download the song catalog before browsing');
  if(confirmedSongRead?.id!==pointer.activeId){
    const current=await active('songs');
    if(!current)throw new CatalogError('NOT_INSTALLED','Download the song catalog before browsing');
    const record=await validatedInstall(current.pointer.activeId);
    confirmedSongRead={id:record.id,sourceSnapshot:record.manifest.sourceSnapshot};
  }
  return confirmedSongRead!;
}
async function withSongs<T>(read:(db:InstanceType<Sqlite3Static['oo1']['DB']>,source:{id:string;sourceSnapshot:string})=>T):Promise<T> {
  const source=await confirmedSongs();
  let db:InstanceType<Sqlite3Static['oo1']['DB']>|undefined;
  try {
    db=new sqlite!.oo1.DB(stagedPath(source.id,'catalog.db'),'r',owner().vfsName);
    return read(db,source);
  } catch(error){confirmedSongRead=null;throw error;}
  finally {db?.close();}
}
async function songPayload(slug:string):Promise<SongPayload|null> {
  const plan=songDetailQuery(slug);
  return withSongs((db,source)=>{
    const payload=songPayloadRecord(source.sourceSnapshot,db.selectObjects(plan.sql,plan.bind)[0]);
    return payload&&{...payload,complexityRating:readSongComplexity(slug,(sql,bind)=>db.selectValue(sql,bind))};
  });
}
/** One immutable attempt/readonly handle for the entire awaited command. */
async function withAuralDatabase<T>(read:(db:InstanceType<Sqlite3Static['oo1']['DB']>,source:{id:string;sourceSnapshot:string})=>T|Promise<T>):Promise<T> {
  let db:InstanceType<Sqlite3Static['oo1']['DB']>|undefined;
  try {
    const pointer=await journal!.pointer('aural');
    if(!pointer)throw new CatalogError('NOT_INSTALLED','Download the listening catalog before browsing');
    if(confirmedAuralRead?.id!==pointer.activeId){
      const current=await active('aural');
      if(!current)throw new CatalogError('NOT_INSTALLED','Download the listening catalog before browsing');
      const record=await validatedInstall(current.pointer.activeId);
      confirmedAuralRead={id:record.id,sourceSnapshot:record.manifest.sourceSnapshot};
    }
    const source=confirmedAuralRead!;
    db=new sqlite!.oo1.DB(stagedPath(source.id,'aural-catalog.db'),'r',owner().vfsName);
    return await read(db,source);
  } catch(error){confirmedAuralRead=null;throw error;}
  finally {db?.close();}
}
function auralHeader(){return withAuralDatabase((db,source)=>readAuralHeader(db,source.sourceSnapshot));}
function auralTarget(query:AuralCatalogTargetQuery){
  const captured=captureAuralTargetQuery(query);
  return withAuralDatabase(async(db,source)=>{
    const row=readAuralTargetRow(db,source.sourceSnapshot,captured);
    const run=await decodeAuralCatalogRun(row.runInput);
    return createAuralCatalogTarget(run,row.span);
  });
}
function auralStatistics(request:AuralStatisticsRequest):Promise<AuralStatisticsResponse> {
  const captured=captureAuralStatisticsRequest(request);
  return withAuralDatabase((db,source)=>{
    const facts=readAuralStatisticsFacts(db,source.sourceSnapshot,captured.range);
    let popularityDb:InstanceType<Sqlite3Static['oo1']['DB']>|undefined;
    try {
      // Both readonly handles belong to the same immutable installation, inside one queued command.
      popularityDb=new sqlite!.oo1.DB(stagedPath(source.id,'aural-popularity.db'),'r',owner().vfsName);
      const popularity=readAuralPopularity(popularityDb,facts.validSongIds);
      let statistics:AuralStatisticsResponse['statistics'];
      try {
        statistics=computeAuralCatalogStatistics({targetLength:captured.range.length,
          occurrences:facts.occurrences,runs:facts.runs,validSongIds:facts.validSongIds,popularity,
          settings:captured.settings,recentSongIds:captured.recentSongIds,
          favoriteSongIds:captured.favoriteSongIds,minimumPopularityPercent:captured.minimumPopularityPercent});
      } catch(error) {
        if(error instanceof RangeError)throw new CatalogError('LIMIT','Aural statistics exceed the browser input limit');
        throw error;
      }
      return Object.freeze({sourceSnapshot:source.sourceSnapshot,range:captured.range,statistics});
    } finally {popularityDb?.close();}
  });
}
async function execute(id: string, command: CatalogCommand): Promise<unknown> {
  if (command.kind === 'init') { await acquire(); return info(); }
  if (command.kind === 'close') { releaseOwnership?.(); await ownershipTask; releaseOwnership = undefined; ownershipTask = undefined; return null; }
  owner();
  if (command.kind === 'info') return info();
  if (command.kind === 'auralTarget') return auralTarget(command.query);
  if (command.kind === 'auralStatistics') return auralStatistics(command.request);
  if (command.kind === 'auralHeader') return auralHeader();
  if (command.kind === 'songPage') return songPage(withSongs, command.query);
  if (command.kind === 'songBrowseBySlugs') return songBrowseBySlugs(withSongs, command.slugs);
  if (command.kind === 'songAlphabeticalGroupCounts') return songAlphabeticalGroupCounts(withSongs, command.filterText);
  if (command.kind === 'songSongsInAlphabeticalGroup') return songSongsInAlphabeticalGroup(withSongs, command.groupKey, command.filterText);
  if (command.kind === 'songPayload') return songPayload(command.slug);
  if (command.kind === 'prepare') return prepare(id, command.attemptId, validateManifest(command.manifest), command.baseUrl);
  if (command.kind === 'activate') return activate(command.attemptId);
  if (command.kind === 'active') return active(command.catalogKind);
  if (command.kind === 'status') return journal!.install(command.attemptId);
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
