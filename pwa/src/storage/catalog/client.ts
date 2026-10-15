import type { SongPageRequest, SongPage } from './library-queries';
import type { CatalogManifest } from './manifest';
import { CatalogError, type CatalogCommand, type ActiveCatalog, type InstallStatus, type CatalogInfo, type CatalogInspection, type CatalogProgress, type CatalogRequest, type CatalogResponse } from './protocol';

export class CatalogWorkerClient {
  private readonly worker = new Worker(new URL('./catalog-worker.ts', import.meta.url), { type: 'module', name: 'Acquiring catalog' });
  private readonly pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer?: ReturnType<typeof setTimeout> }>();
  private stopped = false;
  private constructor(private readonly onProgress?: (progress: CatalogProgress) => void) {
    this.worker.onmessage = ({ data }: MessageEvent<CatalogResponse | CatalogProgress>) => {
      if (data.type === 'progress') { this.onProgress?.(data); return; }
      const pending = this.pending.get(data.id);
      if (!pending) return;
      this.pending.delete(data.id); clearTimeout(pending.timer);
      if (data.ok) pending.resolve(data.value);
      else pending.reject(new CatalogError(data.error.code, data.error.message));
    };
    this.worker.onerror = event => this.terminate(new CatalogError('WORKER_FAILED', event.message || 'Catalog worker stopped'));
    this.worker.onmessageerror = () => this.terminate(new CatalogError('WORKER_FAILED', 'Catalog response could not be read'));
  }
  static async open(onProgress?: (progress: CatalogProgress) => void, signal?: AbortSignal): Promise<CatalogWorkerClient> {
    if (signal?.aborted) throw new CatalogError('CLOSED', 'Catalog open cancelled');
    const client = new CatalogWorkerClient(onProgress);
    const abort = () => client.terminate(new CatalogError('CLOSED', 'Catalog open cancelled'));
    signal?.addEventListener('abort', abort, { once: true });
    try { await client.request({ kind: 'init' }, 30_000); return client; }
    catch (error) { client.terminate(); throw error; }
    finally { signal?.removeEventListener('abort', abort); }
  }
  private request<T>(command: CatalogCommand, timeoutMs?: number): Promise<T> {
    if (this.stopped) return Promise.reject(new CatalogError('CLOSED', 'Catalog worker is closed'));
    return new Promise<T>((resolve, reject) => {
      const id = crypto.randomUUID();
      const entry = { resolve: (value: unknown) => resolve(value as T), reject, timer: undefined as ReturnType<typeof setTimeout> | undefined };
      if (timeoutMs) entry.timer = setTimeout(() => this.terminate(new CatalogError('TIMEOUT', 'Catalog worker did not respond')), timeoutMs);
      this.pending.set(id, entry);
      const message: CatalogRequest = { id, command };
      this.worker.postMessage(message);
    });
  }
  songPage(query: SongPageRequest): Promise<SongPage> { return this.request({ kind: 'songPage', query }); }
  info(): Promise<CatalogInfo> { return this.request({ kind: 'info' }); }
  stage(attemptId: string, manifest: CatalogManifest, baseUrl: string): Promise<CatalogInspection> { return this.request({ kind: 'stage', attemptId, manifest, baseUrl }); }
  inspect(attemptId: string, manifest: CatalogManifest): Promise<CatalogInspection> { return this.request({ kind: 'inspect', attemptId, manifest }); }
  prepare(attemptId: string, manifest: CatalogManifest, baseUrl: string): Promise<CatalogInspection> { return this.request({ kind: 'prepare', attemptId, manifest, baseUrl }); }
  activate(attemptId: string): Promise<ActiveCatalog> { return this.request({ kind: 'activate', attemptId }); }
  active(catalogKind: CatalogManifest['kind']): Promise<ActiveCatalog | null> { return this.request({ kind: 'active', catalogKind }); }
  status(attemptId: string): Promise<InstallStatus> { return this.request({ kind: 'status', attemptId }); }
  async close(): Promise<void> {
    if (this.stopped) return;
    try { await this.request({ kind: 'close' }, 5000); }
    finally { this.terminate(); }
  }
  /** Abrupt page/worker loss releases Web Locks and OPFS handles; staged data is preserved. */
  terminate(error = new CatalogError('CLOSED', 'Catalog worker terminated')): void {
    if (this.stopped) return;
    this.stopped = true; this.worker.terminate();
    for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(error); }
    this.pending.clear();
  }
}
