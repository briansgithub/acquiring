import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { fetchVerifiedChunk, sha256, verifyChunk } from './chunks';
import { planInstallSpace, validateManifest, type CatalogChunk, type CatalogManifest } from './manifest';
const digest = 'a'.repeat(64);
async function fixture() {
  const raw = new TextEncoder().encode('SQLite format 3\0' + 'data'.repeat(300));
  const compressed = new Uint8Array(gzipSync(raw));
  const compressedChecksum = await sha256(compressed);
  const chunk: CatalogChunk = { index: 0, path: `chunks/catalog.db/000000-${compressedChecksum}.gz`, byteSize: raw.length, compressedByteSize: compressed.length, checksum: await sha256(raw), compressedChecksum };
  const manifest: CatalogManifest = { schemaVersion: 'acquiring-pwa-catalog-1', kind: 'songs', sourceSchema: 3, sourceSnapshot: digest, sourceManifestSha256: digest, chunkSizeBytes: 8192, files: [{ name: 'catalog.db', byteSize: raw.length, checksum: chunk.checksum, sourceArchiveChecksum: digest, compressedByteSize: compressed.length, chunks: [chunk] }] };
  return { raw, compressed, chunk, manifest };
}
describe('catalog contract and bounded integrity', () => {
  it('accepts the exact producer manifest and rejects unsupported/incomplete bundles', async () => {
    const { manifest } = await fixture();
    expect(validateManifest(manifest)).toEqual(manifest);
    expect(() => validateManifest({ ...manifest, sourceSchema: 4 })).toThrow();
    expect(() => validateManifest({ ...manifest, kind: 'aural' })).toThrow();
    expect(() => validateManifest({ ...manifest, sourceSnapshot: 'bad' })).toThrow();
  });
  it('rejects traversal, duplicates, reordering and unbounded sizes', async () => {
    const { manifest } = await fixture();
    for (const change of [{ path: '../catalog.gz' }, { index: 1 }, { byteSize: 99_999_999 }, { compressedByteSize: 99_999_999 }]) {
      const bad = structuredClone(manifest); Object.assign(bad.files[0]!.chunks[0]!, change);
      expect(() => validateManifest(bad)).toThrow();
    }
    expect(() => validateManifest({ ...manifest, files: [...manifest.files, ...manifest.files] })).toThrow();
  });
  it('verifies compressed and raw hashes while rejecting corrupt/truncated data', async () => {
    const { raw, compressed, chunk } = await fixture();
    expect(await verifyChunk(compressed, chunk)).toEqual(raw);
    await expect(verifyChunk(compressed.subarray(1), chunk)).rejects.toThrow();
    await expect(verifyChunk(compressed, { ...chunk, checksum: digest })).rejects.toThrow();
    await expect(verifyChunk(compressed, { ...chunk, byteSize: raw.length - 1 })).rejects.toThrow('exceeds');
    await expect(verifyChunk(compressed, { ...chunk, byteSize: raw.length + 1 })).rejects.toThrow('truncated');
  });
  it('fetches exact immutable bytes without cookies, redirects or unbounded response buffering', async () => {
    const { raw, compressed, chunk } = await fixture();
    const fetcher: typeof fetch = async (_url, options) => {
      expect(options!.redirect).toBe('error'); expect(options!.credentials).toBe('omit');
      return new Response(compressed, { headers: { 'Content-Length': String(compressed.length) } });
    };
    expect((await fetchVerifiedChunk(new URL('https://catalog.example/bundle/'), chunk, undefined, fetcher)).raw).toEqual(raw);
    await expect(fetchVerifiedChunk(new URL('https://catalog.example/bundle/'), { ...chunk, path: '../bad.gz' }, undefined, fetcher)).rejects.toThrow();
    const tooLong: typeof fetch = async () => new Response(new Uint8Array(compressed.length + 1));
    await expect(fetchVerifiedChunk(new URL('https://catalog.example/'), chunk, undefined, tooLong)).rejects.toThrow('exceeds');
    const encoded: typeof fetch = async () => new Response(compressed, { headers: { 'Content-Encoding': 'gzip' } });
    await expect(fetchVerifiedChunk(new URL('https://catalog.example/'), chunk, undefined, encoded)).rejects.toThrow('Content-Encoding');
  });
  it('budgets remaining compressed staging plus raw install while retaining existing origin data', async () => {
    const { manifest, compressed } = await fixture();
    const unknown = planInstallSpace(manifest, {});
    expect(unknown.enough).toBeNull();
    expect(planInstallSpace(manifest, { usage: 1000, quota: 1001 }).enough).toBe(false);
    const plan = planInstallSpace(manifest, { usage: 10_000, quota: 1_000_000_000 }, compressed.length);
    expect(plan.additionalBytes).toBe(plan.rawBytes + plan.safetyBytes);
    expect(plan.enough).toBe(true);
  });
});
