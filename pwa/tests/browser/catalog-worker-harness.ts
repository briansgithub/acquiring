import { CatalogWorkerClient } from '../../src/storage/catalog/client';
import {readSongDetails} from '../../src/features/details/reader';
import {encodeHarvestedSong} from '../../src/domain/harvest/user-harvest-ledger';
import { openUserDatabase, USER_STORES } from '../../src/storage/user';
import type { CatalogManifest } from '../../src/storage/catalog/manifest';
const clients = new Map<string, CatalogWorkerClient>();
let statisticsRead:{done:boolean;value?:unknown;code?:string}={done:false};
let targetRead:{done:boolean;value?:unknown;code?:string}={done:false};
let progress: import('../../src/storage/catalog/protocol').CatalogProgress | null = null;
let preparation: { done: boolean; error?: string } = { done: false };
export const catalogHarness = {
  auralStatistics(name:string,request:import('../../src/storage/catalog/aural-statistics-runtime-contracts').AuralStatisticsRequest){return clients.get(name)!.auralStatistics(request);},
  beginAuralStatistics(name:string,request:import('../../src/storage/catalog/aural-statistics-runtime-contracts').AuralStatisticsRequest){
    statisticsRead={done:false};void clients.get(name)!.auralStatistics(request).then(value=>{statisticsRead={done:true,value};},(error:{code?:string})=>{statisticsRead={done:true,code:error.code};});
  },
  auralStatisticsState(){return statisticsRead;},
  auralTarget(name:string,query:import('../../src/storage/catalog/aural-target-query-contracts').AuralCatalogTargetQuery){return clients.get(name)!.auralTarget(query);},
  beginAuralTarget(name:string,query:import('../../src/storage/catalog/aural-target-query-contracts').AuralCatalogTargetQuery){
    targetRead={done:false};void clients.get(name)!.auralTarget(query).then(value=>{targetRead={done:true,value};},(error:{code?:string})=>{targetRead={done:true,code:error.code};});
  },
  auralTargetState(){return targetRead;},
  beginPrepare(name: string, attempt: string, manifest: CatalogManifest, base: string) {
    preparation = { done: false };
    void clients.get(name)!.prepare(attempt, manifest, base).then(() => { preparation = { done: true }; }, error => { preparation = { done: true, error: String(error) }; });
  },
  preparation() { return preparation; },
  progress() { return progress; },
  async seedUsers() {
    const db = await openUserDatabase();
    try { for (const store of USER_STORES) await db.mutate({ namespace: 'guest', store, id: 'kept', operationId: 'seed-' + store, value: { name: 'Preserved ' + store }, createdAt: 1 }); }
    finally { db.close(); }
  },
  async seedHarvest(entry: {slug:string;artist:string|null;title:string|null;url:string;status:string;dataBlob:number[];alphaGroup:string;modes:string;harvestedAt:number}) {
    const db = await openUserDatabase();
    try {
      await db.mutate({
        namespace: 'guest', store: 'harvests', id: entry.slug, operationId: 'seed-harvest-' + entry.slug,
        value: encodeHarvestedSong({...entry, dataBlob: Uint8Array.from(entry.dataBlob)}), createdAt: entry.harvestedAt,
      });
    } finally { db.close(); }
  },
  async harvestIds() {
    const db = await openUserDatabase();
    try { return (await db.list('guest', 'harvests')).map(row => row.id); }
    finally { db.close(); }
  },
  songPayload(name:string,slug:string) { return clients.get(name)!.songPayload(slug); },
  async users() {
    const db = await openUserDatabase();
    try { return { rows: await Promise.all(USER_STORES.map(store => db.get('guest', store, 'kept'))), pending: await db.pending('guest') }; }
    finally { db.close(); }
  },
  async corruptCachedChunk(hash: string) {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('acquiring-catalog-downloads');
    const file = await root.getFileHandle(hash + '.gz'); const writer = await file.createWritable();
    await writer.write(new Uint8Array([1,2])); await writer.close();
  },
  // Test-only state mutation models a pointer whose just-activated files disappeared.
  async simulateMissingActiveTarget(fakeId: string) {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('acquiring-catalog-state', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['pointers','installs'], 'readwrite');
        const pointers = tx.objectStore('pointers'), installs = tx.objectStore('installs');
        const request = pointers.get('aural');
        request.onsuccess = () => {
          const pointer = request.result as import('../../src/storage/catalog/journal').CatalogPointer;
          const record = installs.get(pointer.activeId);
          record.onsuccess = () => { installs.put({ ...record.result as object, id: fakeId }); pointers.put({ ...pointer, activeId: fakeId }); };
        };
        tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  },
  async open(name: string) { clients.set(name, await CatalogWorkerClient.open(value => { progress = value; })); return clients.get(name)!.info(); },
  songDetails(name:string,slug:string) {return readSongDetails(clients.get(name)!,slug);},
  songPage(name:string,query:import('../../src/storage/catalog/library-queries').SongPageRequest) { return clients.get(name)!.songPage(query); },
  songBrowseBySlugs(name:string,slugs:string[]) { return clients.get(name)!.songBrowseBySlugs(slugs); },
  songBrowseGroupCounts(name:string,sortMode:import('../../src/storage/catalog/library-queries').SongBrowseSortMode,filterText='') { return clients.get(name)!.songBrowseGroupCounts(sortMode,filterText); },
  songBrowseGroupSongs(name:string,sortMode:import('../../src/storage/catalog/library-queries').SongBrowseSortMode,groupKey:string,filterText='') { return clients.get(name)!.songBrowseGroupSongs(sortMode,groupKey,filterText); },
  artistSuggestions(name:string,query:import('../../src/storage/catalog/library-queries').ArtistSuggestionsRequest) { return clients.get(name)!.artistSuggestions(query); },
  prepare(name: string, attempt: string, manifest: CatalogManifest, base: string) { return clients.get(name)!.prepare(attempt, manifest, base); },
  activate(name: string, attempt: string) { return clients.get(name)!.activate(attempt); },
  active(name: string, kind: CatalogManifest['kind']) { return clients.get(name)!.active(kind); },
  status(name: string, attempt: string) { return clients.get(name)!.status(attempt); },
  auralHeader(name: string) { return clients.get(name)!.auralHeader(); },
  info(name: string) { return clients.get(name)!.info(); },
  stage(name: string, attempt: string, manifest: CatalogManifest, base: string) { return clients.get(name)!.stage(attempt, manifest, base); },
  inspect(name: string, attempt: string, manifest: CatalogManifest) { return clients.get(name)!.inspect(attempt, manifest); },
  async close(name: string) { await clients.get(name)!.close(); clients.delete(name); },
  terminate(name: string) { clients.get(name)!.terminate(); clients.delete(name); },
};
declare global { interface Window { catalogHarness: typeof catalogHarness } }
window.catalogHarness = catalogHarness;

// This entry is a test-only production build, never a public application route.
if (import.meta.env.PROD && 'serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js');
