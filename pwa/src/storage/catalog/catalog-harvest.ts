/** Songs activate hook: T06 adopt before T05 pointer, overlay replay after. Aural never enters. */
import {alphabeticalGroup} from '../../features/library/grouping';
import {OverlayHarvestCatalog,swapCatalogPreservingHarvests} from '../../domain/harvest/catalog-swap';
import {replayHarvests} from '../../domain/harvest/harvest-ledger';
import {sqliteHarvestCatalog,sqliteStagedCatalog,type HarvestSqlite} from '../../domain/harvest/sqlite-harvest-catalog';
import {loadUserHarvestLedger} from '../../domain/harvest/user-harvest-ledger';
import {MemoryHarvestLedger} from '../../domain/harvest/memory-harvest';
import type {HarvestedSong} from '../../domain/harvest/harvested-song';
import {openUserDatabase} from '../user';
import type {CatalogInspection,ActiveCatalog} from './protocol';
import type {CatalogPointer} from './journal';

export interface SongsCatalogHandle { db: HarvestSqlite; close: () => void }
export interface SongsActivatePorts {
  currentAttemptId: string | null;
  stagedAttemptId: string;
  openCatalog: (attemptId: string) => SongsCatalogHandle;
  activate: () => Promise<CatalogPointer>;
  inspection: CatalogInspection;
  now?: number;
}

let overlayCache: Map<string, HarvestedSong> | null = null;
export function invalidateHarvestOverlay(): void { overlayCache = null; }

async function withUserLedger<T>(work: (ledger: Awaited<ReturnType<typeof loadUserHarvestLedger>> | null) => Promise<T>): Promise<T> {
  let db: Awaited<ReturnType<typeof openUserDatabase>> | null = null;
  let ledger: Awaited<ReturnType<typeof loadUserHarvestLedger>> | null = null;
  try {
    try {
      db = await openUserDatabase();
      ledger = await loadUserHarvestLedger(db);
    } catch { ledger = null; }
    return await work(ledger);
  } finally { db?.close(); }
}

export async function harvestOverlaySongs(): Promise<Map<string, HarvestedSong>> {
  if (overlayCache) return overlayCache;
  overlayCache = await withUserLedger(async ledger => new Map((ledger?.store.getAll() ?? []).map(song => [song.slug, song])));
  return overlayCache;
}

export async function activateSongsCatalog(ports: SongsActivatePorts): Promise<ActiveCatalog> {
  invalidateHarvestOverlay();
  return withUserLedger(async ledger => {
    const user = ledger?.store ?? new MemoryHarvestLedger();
    const persistUser = async () => { await ledger?.persist(); };
    const opened: SongsCatalogHandle[] = [];
    const open = (attemptId: string) => { const handle = ports.openCatalog(attemptId); opened.push(handle); return handle.db; };
    try {
      let current = null as ReturnType<typeof sqliteHarvestCatalog> | null;
      let staged = null as ReturnType<typeof sqliteStagedCatalog> | null;
      if (ports.currentAttemptId) {
        try {
          current = sqliteHarvestCatalog(open(ports.currentAttemptId));
          staged = sqliteStagedCatalog(open(ports.stagedAttemptId));
        } catch { current = null; staged = null; }
      }
      const report = await swapCatalogPreservingHarvests({
        catalogKind: 'songs', current, staged, user, persistUser,
        activate: ports.activate,
        installed: () => new OverlayHarvestCatalog(sqliteHarvestCatalog(open(ports.stagedAttemptId))),
        alphabeticalGroup, now: ports.now,
      });
      overlayCache = new Map(user.getAll().map(song => [song.slug, song]));
      return {
        pointer: report.result, inspection: ports.inspection, recovered: false,
        harvestedRestored: report.restored,
      };
    } finally { for (const handle of opened) handle.close(); }
  });
}

/** Launch-time replay: insert-if-absent into overlay. Failure delays restore, never loses T06. */
export async function repairSongsHarvests(openCatalog: () => SongsCatalogHandle): Promise<number> {
  try {
    return await withUserLedger(async ledger => {
      if (!ledger) return 0;
      const handle = openCatalog();
      try {
        return replayHarvests(new OverlayHarvestCatalog(sqliteHarvestCatalog(handle.db)), ledger.store);
      } finally { handle.close(); }
    });
  } catch { return 0; }
}
