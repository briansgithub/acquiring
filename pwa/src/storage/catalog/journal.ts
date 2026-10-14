import type { CatalogManifest } from './manifest';
import { CatalogError } from './protocol';
export const CATALOG_STATE_DATABASE = 'acquiring-catalog-state';
export interface CatalogInstall {
  id: string; manifest: CatalogManifest; manifestDigest: string; baseUrl: string;
  phase: 'staging' | 'importing' | 'validated'; verifiedChunks: string[]; validatedFiles: string[];
  createdAt: number; lastError?: string;
}
export interface CatalogPointer { kind: CatalogManifest['kind']; activeId: string; previousId: string | null; confirmed: boolean; activatedBySession: string }
export class CatalogJournal {
  constructor(private readonly db: IDBDatabase) { db.onversionchange = () => this.close(); }
  close() { this.db.close(); }
  private transaction<T>(stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction, result: (value: T) => void) => void): Promise<T> {
    return new Promise((resolve, reject) => {
      let tx: IDBTransaction;
      try { tx = this.db.transaction(stores, mode); } catch (error) { reject(error); return; }
      let result: T;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error ?? new CatalogError('JOURNAL_ABORT', 'Catalog state transaction aborted'));
      try { work(tx, value => { result = value; }); }
      catch (error) { try { tx.abort(); } catch { /* already aborted */ } reject(error); }
    });
  }
  install(id: string): Promise<CatalogInstall | null> {
    return this.transaction(['installs'], 'readonly', (tx, result) => {
      const request = tx.objectStore('installs').get(id);
      request.onsuccess = () => result((request.result as CatalogInstall | undefined) ?? null);
    });
  }
  save(install: CatalogInstall): Promise<void> {
    return this.transaction(['installs'], 'readwrite', (tx, result) => { tx.objectStore('installs').put(install); result(undefined); });
  }
  pointer(kind: CatalogManifest['kind']): Promise<CatalogPointer | null> {
    return this.transaction(['pointers'], 'readonly', (tx, result) => {
      const request = tx.objectStore('pointers').get(kind);
      request.onsuccess = () => result((request.result as CatalogPointer | undefined) ?? null);
    });
  }
  activate(install: CatalogInstall, session: string): Promise<CatalogPointer> {
    return this.transaction(['installs','pointers'], 'readwrite', (tx, result) => {
      const store = tx.objectStore('pointers');
      const request = store.get(install.manifest.kind);
      request.onsuccess = () => {
        const previous = request.result as CatalogPointer | undefined;
        if (previous?.activeId === install.id) { result(previous); return; }
        const pointer: CatalogPointer = { kind: install.manifest.kind, activeId: install.id, previousId: previous?.activeId ?? null, confirmed: false, activatedBySession: session };
        tx.objectStore('installs').put(install); store.put(pointer); result(pointer);
      };
    });
  }
  updatePointer(expected: CatalogPointer, pointer: CatalogPointer): Promise<CatalogPointer> {
    return this.transaction(['pointers'], 'readwrite', (tx, result) => {
      const store = tx.objectStore('pointers'); const request = store.get(expected.kind);
      request.onsuccess = () => {
        const current = request.result as CatalogPointer | undefined;
        if (!current || current.activeId !== expected.activeId) { tx.abort(); return; }
        store.put(pointer); result(pointer);
      };
    });
  }
}
export function openCatalogJournal(): Promise<CatalogJournal> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CATALOG_STATE_DATABASE, 1); let settled = false;
    request.onupgradeneeded = () => {
      request.result.createObjectStore('installs', { keyPath: 'id' });
      request.result.createObjectStore('pointers', { keyPath: 'kind' });
    };
    request.onblocked = () => { settled = true; reject(new CatalogError('BUSY', 'Close other tabs to update catalog state')); };
    request.onerror = () => { settled = true; reject(request.error); };
    request.onsuccess = () => { if (settled) request.result.close(); else { settled = true; resolve(new CatalogJournal(request.result)); } };
  });
}
