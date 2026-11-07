import {describe,expect,it} from 'vitest';
import {alphabeticalGroup} from '../../features/library/grouping';
import {LEGACY_ADOPTION_KEY,recordHarvest,replayHarvests} from './harvest-ledger';
import {OverlayHarvestCatalog,swapCatalogPreservingHarvests,type CatalogSwapStep} from './catalog-swap';
import {MemoryHarvestCatalog,MemoryHarvestLedger,MemoryStagedCatalog,type MemoryCatalogSong} from './memory-harvest';

const PAYLOAD = new TextEncoder().encode('{"verse":{"chords":[]}}');
function catalogSong(slug: string, title: string, extra: Partial<MemoryCatalogSong> = {}): MemoryCatalogSong {
  return {
    slug, artist: 'Harvest Artist', title,
    url: `https://www.hooktheory.com/theorytab/view/${slug}`,
    status: 'enriched', dataBlob: PAYLOAD, complexityRating: null,
    alphaGroup: alphabeticalGroup(title), modes: [], ...extra,
  };
}

describe('T22 catalog-swap adopt-before / pointer-activate / replay-after', () => {
  it('skips harvest on aural and still activates', async () => {
    const steps: CatalogSwapStep[] = [];
    const user = new MemoryHarvestLedger();
    const report = await swapCatalogPreservingHarvests({
      catalogKind: 'aural', current: new MemoryHarvestCatalog(), staged: new MemoryStagedCatalog(new Set()),
      user, persistUser: async () => { throw new Error('aural must not persist harvests'); },
      activate: async () => 'aural-pointer', installed: () => { throw new Error('aural must not replay'); },
      onStep: step => steps.push(step),
    });
    expect(report).toEqual({result: 'aural-pointer', restored: 0, adoptAttempted: false, adoptFailed: false, replayFailed: false});
    expect(steps).toEqual(['activate']);
    expect(user.count()).toBe(0);
  });

  it('adopts then persists then activates then replays, keeping catalog-omitted harvests in overlay', async () => {
    const steps: CatalogSwapStep[] = [];
    const user = new MemoryHarvestLedger();
    const current = new MemoryHarvestCatalog();
    current.songs.set('legacy-harvest', catalogSong('legacy-harvest', 'Legacy Harvest', {modes: ['ionian']}));
    current.songs.set('catalog-a', catalogSong('catalog-a', 'Song catalog-a', {complexityRating: 40}));
    const installed = new MemoryHarvestCatalog();
    installed.songs.set('catalog-a', catalogSong('catalog-a', 'Song catalog-a', {complexityRating: 40}));
    const overlay = new OverlayHarvestCatalog(installed);
    let persisted = 0, active = false;
    const report = await swapCatalogPreservingHarvests({
      catalogKind: 'songs', current, staged: new MemoryStagedCatalog(new Set(['catalog-a'])),
      user, persistUser: async () => { expect(active).toBe(false); persisted++; },
      activate: async () => { expect(persisted).toBe(1); expect(user.hasFlag(LEGACY_ADOPTION_KEY)).toBe(true); active = true; return 'new-pointer'; },
      installed: () => overlay, now: 10, onStep: step => steps.push(step),
    });
    expect(steps).toEqual(['adopt', 'persist-adopt', 'activate', 'replay']);
    expect(report.result).toBe('new-pointer');
    expect(report.restored).toBe(1);
    expect(overlay.getSongBySlug('legacy-harvest')?.title).toBe('Legacy Harvest');
    expect(installed.songExists('legacy-harvest')).toBe(false);
    expect(overlay.songExists('catalog-a')).toBe(true);
    expect(replayAgain()).toBe(0);
    function replayAgain() { return overlay.songExists('legacy-harvest') ? 0 : 1; }
  });

  it('first songs install skips adopt, replays an already-ledgered harvest, and is idempotent in overlay', async () => {
    const user = new MemoryHarvestLedger();
    const source = new MemoryHarvestCatalog();
    source.songs.set('artist__mine', catalogSong('artist__mine', 'My Harvest', {modes: ['ionian']}));
    recordHarvest(user, source.getSongBySlug('artist__mine')!, 'M', ['ionian'], 1);
    const installed = new MemoryHarvestCatalog();
    installed.songs.set('catalog-a', catalogSong('catalog-a', 'Song catalog-a', {complexityRating: 10}));
    const overlay = new OverlayHarvestCatalog(installed);
    const report = await swapCatalogPreservingHarvests({
      catalogKind: 'songs', current: null, staged: null, user, persistUser: async () => { throw new Error('no adopt persist'); },
      activate: async () => 'first', installed: () => overlay,
    });
    expect(report.adoptAttempted).toBe(false);
    expect(report.restored).toBe(1);
    expect(replayHarvests(overlay, user)).toBe(0);
  });

  it('adopt failure still activates and does not lose unrelated user records', async () => {
    const preserved = {playlists: ['favorites']};
    const user = new MemoryHarvestLedger();
    const current = new MemoryHarvestCatalog();
    current.songs.set('legacy-harvest', catalogSong('legacy-harvest', 'Legacy Harvest'));
    Object.defineProperty(current, 'getUnratedSlugsWithChords', {value: () => { throw new Error('adopt boom'); }});
    const installed = new OverlayHarvestCatalog(new MemoryHarvestCatalog());
    const report = await swapCatalogPreservingHarvests({
      catalogKind: 'songs', current, staged: new MemoryStagedCatalog(new Set()),
      user, persistUser: async () => { throw new Error('should not persist failed adopt'); },
      activate: async () => 'activated-anyway', installed: () => installed,
    });
    expect(report.adoptFailed).toBe(true);
    expect(report.result).toBe('activated-anyway');
    expect(user.count()).toBe(0);
    expect(preserved.playlists).toEqual(['favorites']);
  });

  it('activate rejection after persisted adopt leaves ledger and skips replay (cancel/restart)', async () => {
    const user = new MemoryHarvestLedger();
    const current = new MemoryHarvestCatalog();
    current.songs.set('legacy-harvest', catalogSong('legacy-harvest', 'Legacy Harvest'));
    let persisted = false, replayed = false;
    await expect(swapCatalogPreservingHarvests({
      catalogKind: 'songs', current, staged: new MemoryStagedCatalog(new Set()),
      user, persistUser: async () => { persisted = true; },
      activate: async () => { throw Object.assign(new Error('Download paused'), {code: 'PAUSED'}); },
      installed: () => { replayed = true; return new MemoryHarvestCatalog(); }, now: 4,
    })).rejects.toMatchObject({code: 'PAUSED'});
    expect(persisted).toBe(true);
    expect(replayed).toBe(false);
    expect(user.getAll().map(song => song.slug)).toEqual(['legacy-harvest']);
    const installed = new OverlayHarvestCatalog(new MemoryHarvestCatalog());
    const restarted = await swapCatalogPreservingHarvests({
      catalogKind: 'songs', current: null, staged: null, user, persistUser: async () => {},
      activate: async () => 'recovered', installed: () => installed,
    });
    expect(restarted.restored).toBe(1);
    expect(installed.getSongBySlug('legacy-harvest')?.title).toBe('Legacy Harvest');
  });

  it('replay failure after activate keeps T06 harvests for a later repair pass', async () => {
    const user = new MemoryHarvestLedger();
    const source = new MemoryHarvestCatalog();
    source.songs.set('artist__mine', catalogSong('artist__mine', 'My Harvest'));
    recordHarvest(user, source.getSongBySlug('artist__mine')!, 'M', [], 1);
    const report = await swapCatalogPreservingHarvests({
      catalogKind: 'songs', current: null, staged: null, user, persistUser: async () => {},
      activate: async () => 'swapped',
      installed: () => { throw new Error('replay boom'); },
    });
    expect(report.result).toBe('swapped');
    expect(report.replayFailed).toBe(true);
    expect(report.restored).toBe(0);
    expect(user.getAll()[0]?.slug).toBe('artist__mine');
    const repaired = new OverlayHarvestCatalog(new MemoryHarvestCatalog());
    expect((await swapCatalogPreservingHarvests({
      catalogKind: 'songs', current: null, staged: null, user, persistUser: async () => {},
      activate: async () => 'already-active', installed: () => repaired,
    })).restored).toBe(1);
  });

  it('catalog slug wins on replay including complexity; overlay does not write the inner catalog', async () => {
    const user = new MemoryHarvestLedger();
    const source = new MemoryHarvestCatalog();
    source.songs.set('shared-song', catalogSong('shared-song', 'Stale Harvest Title'));
    recordHarvest(user, source.getSongBySlug('shared-song')!, 'S', ['aeolian'], 1);
    const installed = new MemoryHarvestCatalog();
    installed.songs.set('shared-song', catalogSong('shared-song', 'Song shared-song', {complexityRating: 42}));
    const overlay = new OverlayHarvestCatalog(installed);
    const report = await swapCatalogPreservingHarvests({
      catalogKind: 'songs', current: null, staged: null, user, persistUser: async () => {},
      activate: async () => 'ok', installed: () => overlay,
    });
    expect(report.restored).toBe(0);
    expect(overlay.getSongBySlug('shared-song')?.title).toBe('Song shared-song');
    expect(installed.songs.get('shared-song')?.complexityRating).toBe(42);
    expect(installed.songs.size).toBe(1);
  });
});
