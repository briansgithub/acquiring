import {expect,it} from 'vitest';
import {harvestedSongPayload,mergeHarvestBrowseBySlugs} from './overlay-reads';
import type {HarvestedSong} from './harvested-song';

const harvest: HarvestedSong = {
  slug: 'artist__mine', artist: 'Mine', title: 'My Harvest', url: 'https://example.test',
  status: 'enriched', dataBlob: new Uint8Array([9, 8]), alphaGroup: 'M', modes: 'ionian', harvestedAt: 1,
};

it('projects a harvest into songPayload without claiming a catalog complexity rating', () => {
  const payload = harvestedSongPayload('snap', harvest);
  expect(payload).toEqual({
    sourceSnapshot: 'snap',
    song: {slug: 'artist__mine', artist: 'Mine', title: 'My Harvest', url: 'https://example.test', status: 'enriched'},
    data: new Uint8Array([9, 8]),
    complexityRating: null,
  });
  payload.data![0] = 1;
  expect(harvest.dataBlob[0]).toBe(9);
});

it('fills browse-by-slug holes from overlay and leaves catalog rows in place', () => {
  const overlay = new Map([[harvest.slug, harvest], ['shared', {...harvest, slug: 'shared', title: 'Stale'}]]);
  const merged = mergeHarvestBrowseBySlugs(
    [{slug: 'shared', artist: 'Catalog', title: 'Catalog Title', complexityRating: 42}, {slug: 'a-alpha', artist: 'A', title: 'Alpha', complexityRating: null}],
    ['shared', 'artist__mine', 'missing'],
    overlay,
  );
  expect(merged).toEqual([
    {slug: 'shared', artist: 'Catalog', title: 'Catalog Title', complexityRating: 42},
    {slug: 'a-alpha', artist: 'A', title: 'Alpha', complexityRating: null},
    {slug: 'artist__mine', artist: 'Mine', title: 'My Harvest', complexityRating: null},
  ]);
});
