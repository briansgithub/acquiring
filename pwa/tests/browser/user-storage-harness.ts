import { accountNamespace, openUserDatabase, USER_STORES, type Mutation, type UserDatabase, type UserNamespace } from '../../src/storage/user';
let db: UserDatabase;
export const storageHarness = {
  stores: USER_STORES,
  account: accountNamespace('12345678-1234-1234-1234-123456789012'),
  async open(name: string) { db?.close(); db = await openUserDatabase(name); },
  close() { db?.close(); },
  mutate(mutation: Mutation) { return db.mutate(mutation); },
  get(namespace: UserNamespace, store: typeof USER_STORES[number], id: string) { return db.get(namespace, store, id); },
  list(namespace: UserNamespace, store: typeof USER_STORES[number], includeDeleted = false) { return db.list(namespace, store, includeDeleted); },
  pending(namespace: UserNamespace, limit?: number) { return db.pending(namespace, limit); },
  acknowledge(namespace: UserNamespace, ids: string[], time: number) { return db.acknowledge(namespace, ids, time); },
  async abortNextMutation(mutation: Mutation) {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function(value, key) {
      if (this.name === 'operations') { this.transaction.abort(); throw new DOMException('Injected interrupted write', 'AbortError'); }
      return original.call(this, value, key);
    };
    try { await db.mutate(mutation); return false; } catch { return true; }
    finally { IDBObjectStore.prototype.add = original; }
  },
  async seedV1(name: string, keepOpen = false) {
    const old = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('records', { keyPath: ['namespace', 'store', 'id'] }).createIndex('byNamespaceStore', ['namespace', 'store']);
        request.result.createObjectStore('meta', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = old.transaction('records', 'readwrite');
      tx.objectStore('records').put({ namespace: 'guest', store: 'playlists', id: 'old', value: { name: 'Preserved' }, deleted: false, operationId: 'before-v2', updatedAt: 1, sequence: 0 });
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
    });
    if (keepOpen) return old;
    old.close(); return null;
  },
};
declare global { interface Window { storageHarness: typeof storageHarness } }
window.storageHarness = storageHarness;
