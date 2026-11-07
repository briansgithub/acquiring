/** Native DatabaseDownloader adopt-then-swap + MainActivity replay-after. T05 pointer is the swap. */
import {alphabeticalGroup} from '../../features/library/grouping';
import {adoptLegacyHarvests,replayHarvests,type HarvestCatalog,type HarvestLedgerStore,type StagedCatalog} from './harvest-ledger';
import {decodeModes,type HarvestedSong,type HarvestSongInput} from './harvested-song';

export type CatalogSwapKind = 'songs' | 'aural';
export type CatalogSwapStep = 'adopt' | 'persist-adopt' | 'activate' | 'replay';

export interface CatalogSwapPorts<T> {
  catalogKind: CatalogSwapKind;
  current: HarvestCatalog | null;
  staged: StagedCatalog | null;
  user: HarvestLedgerStore;
  persistUser: () => Promise<void>;
  activate: () => Promise<T>;
  installed: () => HarvestCatalog;
  alphabeticalGroup?: (title: string | null) => string;
  now?: number;
  onStep?: (step: CatalogSwapStep) => void;
}

export interface CatalogSwapReport<T> {
  result: T;
  restored: number;
  adoptAttempted: boolean;
  adoptFailed: boolean;
  replayFailed: boolean;
}

/** Catalog-file replay target: insert into overlay, never into immutable catalog.db. */
export class OverlayHarvestCatalog implements HarvestCatalog {
  readonly restored = new Map<string, HarvestedSong>();
  constructor(private readonly inner: HarvestCatalog) {}
  songExists(slug: string): boolean { return this.inner.songExists(slug) || this.restored.has(slug); }
  getSongBySlug(slug: string): HarvestSongInput | null { return this.restored.get(slug) ?? this.inner.getSongBySlug(slug); }
  getUnratedSlugsWithChords(limit: number): string[] { return this.inner.getUnratedSlugsWithChords(limit); }
  getModesForSlug(slug: string): string[] {
    const restored = this.restored.get(slug);
    return restored ? [...decodeModes(restored.modes)] : this.inner.getModesForSlug(slug);
  }
  insertRestored(entry: HarvestedSong): void { this.restored.set(entry.slug, entry); }
}

/**
 * Adopt never aborts install. Pointer activate is the T05 transaction.
 * Replay failure delays restore; ledger stays. Aural skips harvest entirely.
 */
export async function swapCatalogPreservingHarvests<T>(ports: CatalogSwapPorts<T>): Promise<CatalogSwapReport<T>> {
  if (ports.catalogKind !== 'songs') {
    ports.onStep?.('activate');
    return {result: await ports.activate(), restored: 0, adoptAttempted: false, adoptFailed: false, replayFailed: false};
  }
  let adoptAttempted = false, adoptFailed = false, replayFailed = false;
  if (ports.current && ports.staged) {
    adoptAttempted = true;
    try {
      ports.onStep?.('adopt');
      adoptLegacyHarvests(ports.current, ports.staged, ports.user, ports.alphabeticalGroup ?? alphabeticalGroup, ports.now ?? 0);
      ports.onStep?.('persist-adopt');
      await ports.persistUser();
    } catch { adoptFailed = true; }
  }
  ports.onStep?.('activate');
  const result = await ports.activate();
  let restored = 0;
  try {
    ports.onStep?.('replay');
    restored = replayHarvests(ports.installed(), ports.user);
  } catch { replayFailed = true; }
  return {result, restored, adoptAttempted, adoptFailed, replayFailed};
}
