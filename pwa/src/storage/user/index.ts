import type { JsonValue } from '../../contracts';

export const USER_DATABASE_NAME = 'acquiring-user';
export const USER_SCHEMA_VERSION = 2;
export const USER_STORES = ['preferences', 'playlists', 'playlistEntries', 'history', 'harvests', 'songOctaveOffsets', 'learningEvidence', 'learningSummaries', 'quizPreferences', 'learningProfiles'] as const;
export type UserStore = typeof USER_STORES[number];
export type UserNamespace = 'guest' | `account:${string}`;
export interface Mutation {
  namespace: UserNamespace; store: UserStore; id: string; operationId: string;
  value: JsonValue; deleted?: boolean; createdAt: number;
}
export interface UserRecord {
  namespace: UserNamespace; store: UserStore; id: string; value: JsonValue;
  deleted: boolean; operationId: string; updatedAt: number; sequence: number;
}
export interface OperationReceipt {
  namespace: UserNamespace; operationId: string; mutation: Mutation;
  fingerprint: string; sequence: number; state: 'pending' | 'acknowledged'; acknowledgedAt?: number;
}
export interface MutationResult { applied: boolean; receipt: OperationReceipt }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function accountNamespace(accountId: string): UserNamespace {
  if (!UUID.test(accountId.toLowerCase())) throw new Error('Expected an account UUID');
  return `account:${accountId.toLowerCase()}`;
}
function assertNamespace(namespace: UserNamespace): void {
  if (namespace !== 'guest' && !(namespace.startsWith('account:') && UUID.test(namespace.slice(8)))) throw new Error('Invalid user namespace');
}
function assertId(id: string, label: string, max = 512): void {
  if (typeof id !== 'string' || !id.trim() || id.length > max || id.includes('\0')) throw new Error(`Invalid ${label}`);
}
function assertTime(time: number): void {
  if (!Number.isSafeInteger(time) || time < 0) throw new Error('Expected a nonnegative integer timestamp');
}
/** Deterministic JSON binds an operation ID to one immutable command, including its timestamp. */
export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('JSON numbers must be finite');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) if (!(i in value)) throw new Error('Sparse arrays are not JSON');
    return '[' + value.map(canonicalJson).join(',') + ']';
  }
  if (typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Expected a JSON value');
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(value[key]!)).join(',') + '}';
}
function normalizedMutation(mutation: Mutation): Mutation {
  assertNamespace(mutation.namespace); assertId(mutation.id, 'record ID'); assertId(mutation.operationId, 'operation ID', 128); assertTime(mutation.createdAt);
  if (!USER_STORES.includes(mutation.store)) throw new Error('Unknown user store');
  if (mutation.deleted !== undefined && typeof mutation.deleted !== 'boolean') throw new Error('Invalid tombstone');
  return { namespace: mutation.namespace, store: mutation.store, id: mutation.id, operationId: mutation.operationId,
    value: mutation.deleted ? null : JSON.parse(canonicalJson(mutation.value)) as JsonValue, deleted: mutation.deleted ?? false, createdAt: mutation.createdAt };
}

function abortTransaction(tx: IDBTransaction): void {
  try { tx.abort(); }
  catch (error) {
    // An underlying quota/failure may already have aborted it; preserve that original abort.
    if (!(error instanceof DOMException) || error.name !== 'InvalidStateError') throw error;
  }
}

export class UserDatabase {
  private closed = false;
  constructor(private readonly db: IDBDatabase) {
    db.onversionchange = () => this.close();
  }
  close(): void { this.closed = true; this.db.close(); }
  private transaction<T>(stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction, result: (value: T) => void) => void): Promise<T> {
    if (this.closed) return Promise.reject(new Error('User database connection is closed; reopen it'));
    return new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction;
      try { tx = this.db.transaction(stores, mode); } catch (error) { reject(error); return; }
      let value: T;
      let failure: unknown;
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(failure ?? tx.error ?? new DOMException('User transaction aborted', 'AbortError'));
      try { work(tx, result => { value = result; }); }
      catch (error) { failure = error; abortTransaction(tx); }
    });
  }
  async mutate(input: Mutation): Promise<MutationResult> {
    const mutation = normalizedMutation(input);
    const fingerprint = canonicalJson(mutation as unknown as JsonValue);
    return this.transaction<MutationResult>(['records', 'operations', 'meta'], 'readwrite', (tx, result) => {
      const operations = tx.objectStore('operations');
      const existing = operations.get([mutation.namespace, mutation.operationId]);
      existing.onsuccess = () => {
        if (existing.result) {
          const receipt = existing.result as OperationReceipt;
          if (receipt.fingerprint !== fingerprint) { abortTransaction(tx); return; }
          result({ applied: false, receipt }); return;
        }
        const meta = tx.objectStore('meta');
        const key = `sequence:${mutation.namespace}`;
        const counter = meta.get(key);
        counter.onsuccess = () => {
          const previous = (counter.result as { value: number } | undefined)?.value ?? 0;
          if (!Number.isSafeInteger(previous) || previous < 0 || previous >= Number.MAX_SAFE_INTEGER) { abortTransaction(tx); return; }
          const sequence = previous + 1;
          const receipt: OperationReceipt = { namespace: mutation.namespace, operationId: mutation.operationId, mutation, fingerprint, sequence, state: 'pending' };
          const record: UserRecord = { namespace: mutation.namespace, store: mutation.store, id: mutation.id, value: mutation.value, deleted: !!mutation.deleted, operationId: mutation.operationId, updatedAt: mutation.createdAt, sequence };
          // No awaited work inside a transaction: record, outbox receipt and sequence commit together.
          try {
            tx.objectStore('records').put(record); operations.add(receipt); meta.put({ key, value: sequence });
            result({ applied: true, receipt });
          } catch { abortTransaction(tx); }
        };
      };
    });
  }
  get(namespace: UserNamespace, store: UserStore, id: string): Promise<UserRecord | null> {
    assertNamespace(namespace); assertId(id, 'record ID');
    return this.transaction(['records'], 'readonly', (tx, result) => {
      const request = tx.objectStore('records').get([namespace, store, id]);
      request.onsuccess = () => result((request.result as UserRecord | undefined) ?? null);
    });
  }
  list(namespace: UserNamespace, store: UserStore, includeDeleted = false): Promise<UserRecord[]> {
    assertNamespace(namespace);
    return this.transaction(['records'], 'readonly', (tx, result) => {
      const request = tx.objectStore('records').index('byNamespaceStore').getAll(IDBKeyRange.only([namespace, store]));
      request.onsuccess = () => result((request.result as UserRecord[]).filter(row => includeDeleted || !row.deleted));
    });
  }
  pending(namespace: UserNamespace, limit = 100): Promise<OperationReceipt[]> {
    assertNamespace(namespace);
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Outbox limit must be1..1000');
    return this.transaction(['operations'], 'readonly', (tx, result) => {
      const request = tx.objectStore('operations').index('byNamespaceStateSequence').getAll(IDBKeyRange.bound([namespace, 'pending', 0], [namespace, 'pending', Number.MAX_SAFE_INTEGER]), limit);
      request.onsuccess = () => result(request.result as OperationReceipt[]);
    });
  }
  acknowledge(namespace: UserNamespace, operationIds: string[], acknowledgedAt: number): Promise<void> {
    assertNamespace(namespace); assertTime(acknowledgedAt);
    for (const id of operationIds) assertId(id, 'operation ID', 128);
    return this.transaction(['operations'], 'readwrite', (tx, result) => {
      result(undefined);
      const store = tx.objectStore('operations');
      for (const id of new Set(operationIds)) {
        const request = store.get([namespace, id]);
        request.onsuccess = () => {
          const receipt = request.result as OperationReceipt | undefined;
          if (!receipt) { abortTransaction(tx); return; }
          if (receipt.state === 'pending') store.put({ ...receipt, state: 'acknowledged', acknowledgedAt });
        };
      }
    });
  }
}

/** Catalog files/pointers are deliberately absent from this database and lifecycle. */
export function openUserDatabase(name = USER_DATABASE_NAME): Promise<UserDatabase> {
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('Persistent user storage is unavailable'));
  assertId(name, 'database name');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, USER_SCHEMA_VERSION);
    let settled = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      // v1 records stay intact; v2 adds only durable operation receipts. Upgrade itself is atomic.
      if (!db.objectStoreNames.contains('records')) {
        const records = db.createObjectStore('records', { keyPath: ['namespace', 'store', 'id'] });
        records.createIndex('byNamespaceStore', ['namespace', 'store']);
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('operations')) {
        const operations = db.createObjectStore('operations', { keyPath: ['namespace', 'operationId'] });
        operations.createIndex('byNamespaceStateSequence', ['namespace', 'state', 'sequence']);
      }
    };
    request.onblocked = () => { settled = true; reject(new Error('Close other Acquiring tabs to upgrade user storage; existing data is preserved')); };
    request.onerror = () => { settled = true; reject(request.error ?? new Error('Cannot open user storage')); };
    request.onsuccess = () => { if (settled) request.result.close(); else { settled = true; resolve(new UserDatabase(request.result)); } };
  });
}
