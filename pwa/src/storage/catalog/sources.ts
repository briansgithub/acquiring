import { sha256 } from './chunks';
import { validateManifest, type CatalogManifest } from './manifest';
export interface CatalogSource { kind: CatalogManifest['kind']; manifestUrl: string; manifestSha256: string }
export const SOURCE_SCHEMA = 'acquiring-pwa-catalog-sources-1';
export function validateCatalogSources(input: unknown, origin: URL): CatalogSource[] {
  if (!input || typeof input !== 'object') throw new Error('Invalid catalog source configuration');
  const value = input as Record<string, unknown>;
  if (value.schemaVersion !== SOURCE_SCHEMA || !Array.isArray(value.catalogs) || value.catalogs.length > 2) throw new Error('Unsupported catalog source configuration');
  const kinds = new Set<string>();
  return value.catalogs.map(raw => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid catalog source');
    const source = raw as Record<string, unknown>;
    if ((source.kind !== 'songs' && source.kind !== 'aural') || kinds.has(source.kind)) throw new Error('Duplicate or unknown catalog kind');
    if (typeof source.manifestUrl !== 'string' || typeof source.manifestSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(source.manifestSha256)) throw new Error('Catalog source requires an immutable manifest hash');
    const url = new URL(source.manifestUrl, origin);
    const localHttp = url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !localHttp) || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/manifest.json')) throw new Error('Expected a public immutable catalog manifest URL');
    kinds.add(source.kind);
    return { kind: source.kind, manifestUrl: url.href, manifestSha256: source.manifestSha256 };
  });
}
async function documentBytes(url: string, max: number, fetcher: typeof fetch): Promise<Uint8Array> {
  const response = await fetcher(url, { credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(60_000) });
  if (response.status !== 200 || !response.body) throw new Error('Catalog information is unavailable');
  const reader = response.body.getReader(), blocks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > max) throw new Error('Catalog information exceeds its size limit'); blocks.push(value);
    }
    if (!size) throw new Error('Catalog information is empty');
    const result = new Uint8Array(size); let offset = 0;
    for (const block of blocks) { result.set(block, offset); offset += block.byteLength; }
    return result;
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
}
export async function loadCatalogSources(origin: URL, fetcher: typeof fetch = fetch): Promise<CatalogSource[]> {
  const bytes = await documentBytes(new URL('/catalog-sources.json', origin).href, 16 * 1024, fetcher);
  return validateCatalogSources(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), origin);
}
export async function loadCatalogManifest(source: CatalogSource, origin: URL, fetcher: typeof fetch = fetch) {
  const trusted = validateCatalogSources({ schemaVersion: SOURCE_SCHEMA, catalogs: [source] }, origin)[0]!;
  const bytes = await documentBytes(trusted.manifestUrl, 512 * 1024, fetcher);
  if (await sha256(bytes) !== trusted.manifestSha256) throw new Error('Catalog information could not be verified; your installed catalog is unchanged');
  const manifest = validateManifest(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  if (manifest.kind !== trusted.kind) throw new Error('Catalog source kind mismatch');
  return { manifest, baseUrl: new URL('.', trusted.manifestUrl).href };
}
