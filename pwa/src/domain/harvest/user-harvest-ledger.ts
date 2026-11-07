/** T06 harvests adapter. Flags live beside songs as `__meta:` ids. Unparseable rows (including test `kept`) stay. */
import type {JsonValue} from '../../contracts';
import type {Mutation,UserDatabase,UserNamespace,UserRecord} from '../../storage/user';
import {LEGACY_ADOPTION_KEY,type HarvestLedgerStore} from './harvest-ledger';
import type {HarvestedSong} from './harvested-song';
import {MemoryHarvestLedger} from './memory-harvest';

export const HARVEST_META_PREFIX = '__meta:';
export function harvestFlagId(key: string): string { return HARVEST_META_PREFIX + key; }

export interface HarvestRecordStore {
  mutate(mutation: Mutation): Promise<unknown>;
  list(namespace: UserNamespace, store: 'harvests', includeDeleted?: boolean): Promise<UserRecord[]>;
}

const CHUNK = 0x8000;
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}
export function base64ToBytes(encoded: string): Uint8Array | null {
  try {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch { return null; }
}

export function encodeHarvestedSong(song: HarvestedSong): JsonValue {
  return {
    slug: song.slug, artist: song.artist, title: song.title, url: song.url, status: song.status,
    dataBlob: bytesToBase64(song.dataBlob), alphaGroup: song.alphaGroup, modes: song.modes, harvestedAt: song.harvestedAt,
  };
}

export function parseHarvestedSong(id: string, value: JsonValue): HarvestedSong | null {
  if (id.startsWith(HARVEST_META_PREFIX) || !value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, JsonValue>;
  if (typeof row.slug !== 'string' || row.slug !== id || typeof row.url !== 'string' || typeof row.status !== 'string'
    || typeof row.alphaGroup !== 'string' || typeof row.modes !== 'string' || typeof row.dataBlob !== 'string'
    || typeof row.harvestedAt !== 'number' || !Number.isInteger(row.harvestedAt)) return null;
  if (row.artist !== null && typeof row.artist !== 'string') return null;
  if (row.title !== null && typeof row.title !== 'string') return null;
  const dataBlob = base64ToBytes(row.dataBlob);
  if (!dataBlob) return null;
  return {
    slug: row.slug, artist: typeof row.artist === 'string' ? row.artist : null,
    title: typeof row.title === 'string' ? row.title : null, url: row.url, status: row.status,
    dataBlob, alphaGroup: row.alphaGroup, modes: row.modes, harvestedAt: row.harvestedAt,
  };
}

export function parseHarvestFlag(id: string, value: JsonValue): {key: string; value: string} | null {
  if (!id.startsWith(HARVEST_META_PREFIX) || !value || typeof value !== 'object' || Array.isArray(value)) return null;
  const flag = (value as Record<string, JsonValue>).value;
  return typeof flag === 'string' ? {key: id.slice(HARVEST_META_PREFIX.length), value: flag} : null;
}

function sameHarvest(left: HarvestedSong, right: HarvestedSong): boolean {
  return left.slug === right.slug && left.artist === right.artist && left.title === right.title
    && left.url === right.url && left.status === right.status && left.alphaGroup === right.alphaGroup
    && left.modes === right.modes && left.harvestedAt === right.harvestedAt
    && left.dataBlob.byteLength === right.dataBlob.byteLength
    && left.dataBlob.every((byte, index) => byte === right.dataBlob[index]);
}

export async function loadUserHarvestLedger(
  db: HarvestRecordStore,
  namespace: UserNamespace = 'guest',
  now: () => number = Date.now,
  operationId: () => string = () => crypto.randomUUID(),
): Promise<{store: MemoryHarvestLedger & HarvestLedgerStore; persist: () => Promise<void>}> {
  const store = new MemoryHarvestLedger();
  const snapshotSongs = new Map<string, HarvestedSong>();
  const snapshotFlags = new Map<string, string>();
  for (const row of await db.list(namespace, 'harvests')) {
    const song = parseHarvestedSong(row.id, row.value);
    if (song) { store.record(song); snapshotSongs.set(song.slug, song); continue; }
    const flag = parseHarvestFlag(row.id, row.value);
    if (flag) { store.setFlag(flag.key, flag.value); snapshotFlags.set(flag.key, flag.value); }
  }
  return {
    store,
    async persist() {
      const createdAt = now();
      for (const song of store.getAll()) {
        const previous = snapshotSongs.get(song.slug);
        if (previous && sameHarvest(previous, song)) continue;
        await db.mutate({
          namespace, store: 'harvests', id: song.slug, operationId: operationId(),
          value: encodeHarvestedSong(song), createdAt,
        });
        snapshotSongs.set(song.slug, song);
      }
      for (const [key, value] of store.flags) {
        if (snapshotFlags.get(key) === value) continue;
        await db.mutate({
          namespace, store: 'harvests', id: harvestFlagId(key), operationId: operationId(),
          value: {value}, createdAt,
        });
        snapshotFlags.set(key, value);
      }
    },
  };
}

export function adoptionFlagId(): string { return harvestFlagId(LEGACY_ADOPTION_KEY); }
export type {UserDatabase};
