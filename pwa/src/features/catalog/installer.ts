import { CatalogWorkerClient } from '../../storage/catalog/client';
import { CatalogError, type ActiveCatalog, type CatalogProgress } from '../../storage/catalog/protocol';
import { loadCatalogManifest, loadCatalogSources, SOURCE_SCHEMA, validateCatalogSources, type CatalogSource } from '../../storage/catalog/sources';
type Kind = CatalogSource['kind'];
type Phase = 'idle' | 'checking' | 'downloading' | 'activating' | 'paused' | 'error';
export interface CatalogCardState {
  kind: Kind; source?: CatalogSource; installed?: { snapshot: string; confirmed: boolean; recovered: boolean };
  phase: Phase; bytes: number; total: number; message?: string;
}
interface Snapshot { loading: boolean; busy: boolean; sourceMessage?: string; catalogs: CatalogCardState[] }
const SOURCE_CACHE = 'acquiring.catalog.sources.v1';
const attemptKey = (kind: Kind) => 'acquiring.catalog.attempt.v1.' + kind;
function errorMessage(error: unknown): string {
  if (error instanceof CatalogError) {
    if (error.code === 'BUSY') return 'A catalog is open in another tab. Close that tab, then try again.';
    if (error.code === 'QUOTA') return 'There is not enough space for this download. Your installed catalog is unchanged.';
    if (error.code === 'UNSUPPORTED') return 'This browser cannot store the offline catalogs. Try a supported browser.';
  }
  if (error instanceof Error && /verified|checksum|snapshot|schema|column|index|integrity|incomplete/i.test(error.message)) return 'The download could not be verified. Your installed catalog is unchanged.';
  return 'The download was interrupted. Your installed catalog is unchanged; you can retry safely.';
}
export class CatalogInstaller {
  private snapshot: Snapshot = { loading: true, busy: false, catalogs: ['songs','aural'].map(kind => ({ kind: kind as Kind, phase: 'idle', bytes: 0, total: 0 })) };
  private listeners = new Set<() => void>();
  private client?: CatalogWorkerClient;
  private opening?: Promise<CatalogWorkerClient>;
  private refreshing?: Promise<void>;
  private generation = 0;
  private currentKind?: Kind;
  private fileProgress = new Map<string, number>();
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  private publish(patch: Partial<Snapshot>) { this.snapshot = { ...this.snapshot, ...patch }; for (const listener of this.listeners) listener(); }
  private update(kind: Kind, patch: Partial<CatalogCardState>) { this.publish({ catalogs: this.snapshot.catalogs.map(card => card.kind === kind ? { ...card, ...patch } : card) }); }
  private progress = (event: CatalogProgress) => {
    if (!this.currentKind) return;
    this.fileProgress.set(event.file, event.verifiedBytes);
    this.update(this.currentKind, { bytes: [...this.fileProgress.values()].reduce((sum, bytes) => sum + bytes, 0) });
  };
  private open(): Promise<CatalogWorkerClient> {
    if (!this.opening) {
      const generation = this.generation;
      this.opening = CatalogWorkerClient.open(this.progress).then(client => {
        if (generation !== this.generation) { client.terminate(); throw new CatalogError('PAUSED', 'Download paused'); }
        this.client = client; return client;
      }).catch(error => { this.opening = undefined; throw error; });
    }
    return this.opening;
  }
  private async installed(client: CatalogWorkerClient, active: ActiveCatalog | null): Promise<CatalogCardState['installed']> {
    if (!active) return undefined;
    const record = await client.status(active.pointer.activeId);
    if (!record) throw new CatalogError('INCOMPLETE', 'Catalog receipt is missing');
    return { snapshot: record.manifest.sourceSnapshot, confirmed: active.pointer.confirmed, recovered: active.recovered };
  }
  refresh(): Promise<void> {
    if (this.snapshot.busy) return Promise.resolve();
    if (!this.refreshing) this.refreshing = this.refreshImpl().finally(() => { this.refreshing = undefined; });
    return this.refreshing;
  }
  private async refreshImpl(): Promise<void> {
    this.publish({ loading: true }); const origin = new URL(location.origin);
    let sources: CatalogSource[] = [], sourceMessage: string | undefined;
    try {
      sources = await loadCatalogSources(origin);
      try { localStorage.setItem(SOURCE_CACHE, JSON.stringify({ schemaVersion: SOURCE_SCHEMA, catalogs: sources })); } catch { /* Discovery cache is advisory, not user data. */ }
      if (!sources.length) sourceMessage = 'Catalog downloads are being prepared.';
    } catch {
      try { sources = validateCatalogSources(JSON.parse(localStorage.getItem(SOURCE_CACHE) ?? 'null'), origin); } catch { /* No trusted cached discovery. */ }
      sourceMessage = 'Connect to the internet to check for catalog downloads.';
    }
    this.publish({ sourceMessage });
    for (const card of this.snapshot.catalogs) this.update(card.kind, { source: sources.find(source => source.kind === card.kind) });
    try {
      const client = await this.open();
      for (const kind of ['songs','aural'] as const) {
        try {
          const active = await client.active(kind);
          const installed = await this.installed(client, active);
          let pending = false;
          try {
            const attempt = JSON.parse(localStorage.getItem(attemptKey(kind)) ?? 'null') as { id: string; manifestSha256: string } | null;
            const source = sources.find(source => source.kind === kind);
            if (attempt && source?.manifestSha256 === attempt.manifestSha256 && attempt.id !== active?.pointer.activeId) pending = !!(await client.status(attempt.id));
          } catch { /* A missing advisory pointer never invalidates the installed catalog. */ }
          this.update(kind, { installed, phase: pending ? 'paused' : 'idle', message: active?.recovered ? 'Your previous catalog was recovered.' : pending ? 'An unfinished download is saved. Resume when ready.' : undefined });
        } catch (error) { this.update(kind, { message: errorMessage(error), phase: 'error' }); }
      }
    } catch (error) { for (const card of this.snapshot.catalogs) this.update(card.kind, { message: errorMessage(error), phase: 'error' }); }
    finally { this.publish({ loading: false }); }
  }
  async install(kind: Kind): Promise<void> {
    if (this.snapshot.busy || this.snapshot.loading) return;
    const card = this.snapshot.catalogs.find(card => card.kind === kind)!;
    if (!card.source) return;
    const generation = this.generation;
    this.currentKind = kind; this.fileProgress.clear(); this.publish({ busy: true });
    this.update(kind, { phase: 'checking', message: undefined, bytes: 0, total: 0 });
    const stillActive = () => { if (generation !== this.generation) throw new CatalogError('PAUSED', 'Download paused'); };
    try {
      const { manifest, baseUrl } = await loadCatalogManifest(card.source, new URL(location.origin)); stillActive();
      let attempt: { id: string; manifestSha256: string; baseUrl: string } | undefined;
      try { attempt = JSON.parse(localStorage.getItem(attemptKey(kind)) ?? 'null') as typeof attempt; } catch { /* Corrupt advisory pointer is not an install receipt. */ }
      if (!attempt || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(attempt.id) || attempt.manifestSha256 !== card.source.manifestSha256 || attempt.baseUrl !== baseUrl) attempt = { id: crypto.randomUUID(), manifestSha256: card.source.manifestSha256, baseUrl };
      // Persist the same retry ID before any worker import or pointer activation.
      try { localStorage.setItem(attemptKey(kind), JSON.stringify(attempt)); }
      catch { throw new Error('The download cannot save its recovery intent'); }
      const client = await this.open(); stillActive();
      const total = manifest.files.reduce((sum,file) => sum + file.byteSize,0);
      this.update(kind, { phase: 'downloading', total });
      await client.prepare(attempt.id, manifest, baseUrl); stillActive();
      this.update(kind, { phase: 'activating', bytes: total });
      const active = await client.activate(attempt.id); stillActive();
      const kept = kind === 'songs' ? active.harvestedRestored ?? 0 : 0;
      this.update(kind, {
        phase: 'idle', installed: await this.installed(client, active),
        message: kept > 0 ? `Database Refreshed! (${kept} harvested song${kept === 1 ? '' : 's'} kept)` : undefined,
      });
    } catch (error) {
      const paused = generation !== this.generation;
      this.update(kind, { phase: paused ? 'paused' : 'error', message: paused ? 'Download paused. You can resume it here.' : errorMessage(error) });
    } finally { this.currentKind = undefined; this.publish({ busy: false }); }
  }
  pause(): void {
    this.generation++; this.client?.terminate(); this.client = undefined; this.opening = undefined;
    if (this.currentKind) this.update(this.currentKind, { phase: 'paused', message: 'Download paused. You can resume it here.' });
  }
}
export const catalogInstaller = new CatalogInstaller();
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => catalogInstaller.pause());
