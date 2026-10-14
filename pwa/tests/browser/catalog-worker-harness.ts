import { CatalogWorkerClient } from '../../src/storage/catalog/client';
import type { CatalogManifest } from '../../src/storage/catalog/manifest';
const clients = new Map<string, CatalogWorkerClient>();
export const catalogHarness = {
  async open(name: string) { clients.set(name, await CatalogWorkerClient.open()); return clients.get(name)!.info(); },
  info(name: string) { return clients.get(name)!.info(); },
  stage(name: string, attempt: string, manifest: CatalogManifest, base: string) { return clients.get(name)!.stage(attempt, manifest, base); },
  inspect(name: string, attempt: string, manifest: CatalogManifest) { return clients.get(name)!.inspect(attempt, manifest); },
  async close(name: string) { await clients.get(name)!.close(); clients.delete(name); },
  terminate(name: string) { clients.get(name)!.terminate(); clients.delete(name); },
};
declare global { interface Window { catalogHarness: typeof catalogHarness } }
window.catalogHarness = catalogHarness;
