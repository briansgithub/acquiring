import {describe,expect,it} from 'vitest';
import {alphabeticalGroup} from '../../features/library/grouping';
import {adoptLegacyHarvests,LEGACY_ADOPTION_KEY,LEGACY_ADOPTION_LIMIT,recordHarvest,replayHarvests} from './harvest-ledger';
import {harvestSlugFromUrl} from './harvest-url';
import {decodeModes,encodeModes} from './harvested-song';
import {MemoryHarvestCatalog,MemoryHarvestLedger,MemoryStagedCatalog,type MemoryCatalogSong} from './memory-harvest';

const PAYLOAD = new TextEncoder().encode('{"verse":{"sectionName":"Verse","sectionIndex":0,"chords":[]}}');

function catalogSong(slug: string, title: string, extra: Partial<MemoryCatalogSong> = {}): MemoryCatalogSong {
  return {
    slug, artist: 'Harvest Artist', title,
    url: `https://www.hooktheory.com/theorytab/view/${slug}`,
    status: 'enriched', dataBlob: PAYLOAD, complexityRating: null,
    alphaGroup: alphabeticalGroup(title), modes: [], ...extra,
  };
}

function harvest(user: MemoryHarvestLedger, catalog: MemoryHarvestCatalog, slug: string, title: string, modes: Set<string>, at = 1) {
  const song = catalogSong(slug, title, {modes: [...modes]});
  catalog.songs.set(slug, song);
  recordHarvest(user, song, song.alphaGroup, modes, at);
}

describe('native HarvestService slug', () => {
  it('replaces theorytab path slashes after trim', () => {
    expect(harvestSlugFromUrl('https://www.hooktheory.com/theorytab/view/fun/we-are-young/'))
      .toBe('fun__we-are-young');
    expect(harvestSlugFromUrl('  https://www.hooktheory.com/theorytab/view/the-proclaimers/500-miles  '))
      .toBe('the-proclaimers__500-miles');
    expect(harvestSlugFromUrl('https://www.hooktheory.com/theorytab/view/invalid/url-slug-test-12345'))
      .toBe('invalid__url-slug-test-12345');
  });
});

describe('native HarvestedSong modes encoding', () => {
  it('sorts unique modes as a newline set', () => {
    expect(encodeModes(['aeolian', 'ionian', 'ionian'])).toBe('aeolian\nionian');
    expect([...decodeModes('ionian\naeolian')].sort()).toEqual(['aeolian', 'ionian']);
    expect([...decodeModes('')]).toEqual([]);
  });
});

describe('native HarvestLedgerTest.kt', () => {
  it('harvestSurvivesAnInstallWhoseCatalogOmitsIt', () => {
    const user = new MemoryHarvestLedger();
    const catalog = new MemoryHarvestCatalog();
    harvest(user, catalog, 'artist__mine', 'My Harvest', new Set(['ionian']));
    catalog.songs.clear();
    catalog.songs.set('catalog-a', catalogSong('catalog-a', 'Song catalog-a', {artist: 'Catalog Artist', complexityRating: null}));
    catalog.songs.set('catalog-b', catalogSong('catalog-b', 'Song catalog-b', {artist: 'Catalog Artist'}));
    expect(replayHarvests(catalog, user)).toBe(1);
    const restored = catalog.getSongBySlug('artist__mine');
    expect(restored?.title).toBe('My Harvest');
    expect([...restored!.dataBlob!]).toEqual([...PAYLOAD]);
    expect(catalog.songs.size).toBe(3);
    expect(catalog.songs.get('artist__mine')?.alphaGroup).toBe('M');
    expect(catalog.songs.get('artist__mine')?.modes).toEqual(['ionian']);
  });

  it('newCatalogWinsWhenItCarriesTheSameSlug', () => {
    const user = new MemoryHarvestLedger();
    const catalog = new MemoryHarvestCatalog();
    harvest(user, catalog, 'shared-song', 'Stale Harvest Title', new Set(['aeolian']));
    catalog.songs.clear();
    catalog.songs.set('shared-song', catalogSong('shared-song', 'Song shared-song', {
      artist: 'Catalog Artist', complexityRating: 42,
    }));
    expect(replayHarvests(catalog, user)).toBe(0);
    expect(catalog.getSongBySlug('shared-song')?.title).toBe('Song shared-song');
    expect(catalog.songs.get('shared-song')?.complexityRating).toBe(42);
    expect(catalog.songs.size).toBe(1);
  });

  it('songsHarvestedBeforeTheLedgerExistedAreAdoptedOnceAndOnlyOnce', () => {
    const user = new MemoryHarvestLedger();
    const catalog = new MemoryHarvestCatalog();
    catalog.songs.set('legacy-harvest', catalogSong('legacy-harvest', 'Legacy Harvest'));
    catalog.songs.set('catalog-a', catalogSong('catalog-a', 'Song catalog-a'));
    catalog.songs.set('catalog-b', catalogSong('catalog-b', 'Song catalog-b'));
    adoptLegacyHarvests(catalog, new MemoryStagedCatalog(new Set(['catalog-a', 'catalog-b'])), user, alphabeticalGroup, 10);
    catalog.songs.clear();
    catalog.songs.set('catalog-a', catalogSong('catalog-a', 'Song catalog-a'));
    catalog.songs.set('catalog-b', catalogSong('catalog-b', 'Song catalog-b'));
    replayHarvests(catalog, user);
    expect(catalog.getSongBySlug('legacy-harvest')?.title).toBe('Legacy Harvest');
    expect(user.hasFlag(LEGACY_ADOPTION_KEY)).toBe(true);

    adoptLegacyHarvests(catalog, new MemoryStagedCatalog(new Set(['catalog-a'])), user, alphabeticalGroup, 20);
    catalog.songs.clear();
    catalog.songs.set('catalog-a', catalogSong('catalog-a', 'Song catalog-a'));
    replayHarvests(catalog, user);
    expect(catalog.getSongBySlug('catalog-b')).toBeNull();
    expect(catalog.getSongBySlug('legacy-harvest')?.title).toBe('Legacy Harvest');
  });

  it('theSweepDeclinesACatalogThatMerelyLostItsRatings', () => {
    const user = new MemoryHarvestLedger();
    const catalog = new MemoryHarvestCatalog();
    for (let index = 0; index <= LEGACY_ADOPTION_LIMIT; index++) {
      catalog.songs.set(`bulk-${index}`, catalogSong(`bulk-${index}`, `Bulk ${index}`));
    }
    adoptLegacyHarvests(catalog, new MemoryStagedCatalog(new Set(['catalog-a'])), user, alphabeticalGroup, 1);
    expect(user.count()).toBe(0);
    expect(user.hasFlag(LEGACY_ADOPTION_KEY)).toBe(false);
  });

  it('replayIsIdempotent', () => {
    const user = new MemoryHarvestLedger();
    const catalog = new MemoryHarvestCatalog();
    harvest(user, catalog, 'artist__mine', 'My Harvest', new Set(['ionian']));
    catalog.songs.clear();
    catalog.songs.set('catalog-a', catalogSong('catalog-a', 'Song catalog-a'));
    expect(replayHarvests(catalog, user)).toBe(1);
    expect(replayHarvests(catalog, user)).toBe(0);
    expect(catalog.songs.size).toBe(2);
  });

  it('record skips a missing blob and adopt does not displace a user harvest', () => {
    const user = new MemoryHarvestLedger();
    const song = catalogSong('artist__mine', 'Mine', {modes: ['ionian']});
    recordHarvest(user, {...song, dataBlob: null}, 'M', ['ionian'], 1);
    expect(user.count()).toBe(0);
    recordHarvest(user, song, 'M', ['ionian'], 1);
    user.adopt([{...song, dataBlob: PAYLOAD, modes: encodeModes(['dorian']), harvestedAt: 2}]);
    expect(decodeModes(user.getAll()[0]!.modes).has('ionian')).toBe(true);
  });
});
