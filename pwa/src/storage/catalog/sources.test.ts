import { describe, expect, it } from 'vitest';
import { loadCatalogManifest, loadCatalogSources, SOURCE_SCHEMA, validateCatalogSources } from './sources';
const origin = new URL('https://acquiring.example');
const source = { kind: 'aural', manifestUrl: '/catalogs/aural/manifest.json', manifestSha256: 'a'.repeat(64) };
describe('controlled public catalog sources', () => {
  it('normalizes bounded allowlisted immutable source descriptors', () => {
    expect(validateCatalogSources({ schemaVersion: SOURCE_SCHEMA, catalogs: [source] }, origin)[0]!.manifestUrl).toBe('https://acquiring.example/catalogs/aural/manifest.json');
    expect(validateCatalogSources({ schemaVersion: SOURCE_SCHEMA, catalogs: [] }, origin)).toEqual([]);
  });
  it.each(['http://remote.example/manifest.json','https://user:password@example.test/manifest.json','https://example.test/manifest.json?token=secret','https://example.test/manifest.json#fragment','file:///manifest.json','https://example.test/not-a-manifest'])('rejects unsafe or mutable source URL %s', manifestUrl => {
    expect(() => validateCatalogSources({ schemaVersion: SOURCE_SCHEMA, catalogs: [{ ...source, manifestUrl }] }, origin)).toThrow();
  });
  it('rejects duplicate kinds, unbounded descriptors and missing hashes', () => {
    for (const catalogs of [[source,source],[source,source,source],[{...source,manifestSha256:''}]]) expect(() => validateCatalogSources({schemaVersion:SOURCE_SCHEMA,catalogs},origin)).toThrow();
  });
  it('allows localhost fixtures and never sends cookies or follows redirects', async () => {
    let options: RequestInit | undefined;
    const fetcher: typeof fetch = async (_request, init) => { options=init; return new Response(JSON.stringify({schemaVersion:SOURCE_SCHEMA,catalogs:[{...source,manifestUrl:'http://127.0.0.1:4173/catalogs/manifest.json'}]})); };
    expect((await loadCatalogSources(new URL('http://127.0.0.1:4173'),fetcher))[0]!.kind).toBe('aural');
    expect(options).toMatchObject({credentials:'omit',redirect:'error',cache:'no-store'});
  });
  it('rejects oversized configuration and manifest corruption before parsing/installation', async () => {
    await expect(loadCatalogSources(origin,async () => new Response('x'.repeat(16385)))).rejects.toThrow('size limit');
    await expect(loadCatalogManifest({...source,kind:'aural'},origin,async () => new Response('{}'))).rejects.toThrow('verified');
  });
});
