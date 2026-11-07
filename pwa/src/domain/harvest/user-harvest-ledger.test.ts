import {describe,expect,it} from 'vitest';
import type {JsonValue} from '../../contracts';
import type {Mutation,UserNamespace,UserRecord} from '../../storage/user';
import {LEGACY_ADOPTION_KEY} from './harvest-ledger';
import {bytesToBase64,encodeHarvestedSong,harvestFlagId,loadUserHarvestLedger,parseHarvestedSong} from './user-harvest-ledger';
import type {HarvestedSong} from './harvested-song';

class MemoryUserHarvests {
  rows = new Map<string, UserRecord>();
  mutations: Mutation[] = [];
  async mutate(mutation: Mutation) {
    this.mutations.push(mutation);
    this.rows.set(mutation.id, {
      namespace: mutation.namespace, store: mutation.store, id: mutation.id, value: mutation.value,
      deleted: !!mutation.deleted, operationId: mutation.operationId, updatedAt: mutation.createdAt, sequence: this.mutations.length,
    });
    return {applied: true};
  }
  async list(namespace: UserNamespace, store: 'harvests') {
    return [...this.rows.values()].filter(row => row.namespace === namespace && row.store === store && !row.deleted);
  }
}

const song: HarvestedSong = {
  slug: 'artist__mine', artist: null, title: 'My Harvest', url: 'https://example.test',
  status: 'enriched', dataBlob: new Uint8Array([0, 255, 10]), alphaGroup: 'M', modes: 'ionian', harvestedAt: 44,
};

describe('T06 harvests codec and persist', () => {
  it('round-trips blobs as JSON-safe base64 and refuses unparseable kept rows', () => {
    const value = encodeHarvestedSong(song);
    expect(typeof (value as {dataBlob: string}).dataBlob).toBe('string');
    expect(parseHarvestedSong('artist__mine', value)).toEqual(song);
    expect(parseHarvestedSong('kept', {name: 'Preserved harvests'})).toBeNull();
    expect(parseHarvestedSong(harvestFlagId(LEGACY_ADOPTION_KEY), {value: '10'})).toBeNull();
    expect(bytesToBase64(new Uint8Array([1, 2]))).toBe(btoa('\u0001\u0002'));
  });

  it('persists adopt IGNORE and record REPLACE without deleting unrelated harvests rows', async () => {
    const db = new MemoryUserHarvests();
    await db.mutate({
      namespace: 'guest', store: 'harvests', id: 'kept', operationId: 'seed-harvests',
      value: {name: 'Preserved harvests'}, createdAt: 1,
    });
    const first = await loadUserHarvestLedger(db, 'guest', () => 10, () => 'op-1');
    first.store.record(song);
    first.store.adopt([{...song, title: 'Adopted Stale', harvestedAt: 2}]);
    first.store.setFlag(LEGACY_ADOPTION_KEY, '10');
    await first.persist();
    expect(first.store.getAll()[0]!.title).toBe('My Harvest');
    expect((db.rows.get('kept')!.value as {name: string}).name).toBe('Preserved harvests');
    expect(db.rows.get('artist__mine')!.value).toEqual(encodeHarvestedSong(song));
    expect(db.rows.get(harvestFlagId(LEGACY_ADOPTION_KEY))!.value).toEqual({value: '10'});

    const reloaded = await loadUserHarvestLedger(db, 'guest', () => 11, () => 'op-2');
    expect(reloaded.store.getAll()).toEqual([song]);
    expect(reloaded.store.hasFlag(LEGACY_ADOPTION_KEY)).toBe(true);
    await reloaded.persist();
    expect(db.mutations.filter(mutation => mutation.operationId === 'op-2')).toEqual([]);
    reloaded.store.record({...song, title: 'Replaced'});
    await reloaded.persist();
    expect(parseHarvestedSong('artist__mine', db.rows.get('artist__mine')!.value as JsonValue)?.title).toBe('Replaced');
    expect(db.rows.get('kept')!.value).toEqual({name: 'Preserved harvests'});
  });
});
