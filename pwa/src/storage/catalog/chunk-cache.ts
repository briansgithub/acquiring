import { fetchVerifiedChunk, verifyChunk } from './chunks';
import type { CatalogChunk, CatalogManifest } from './manifest';
const CACHE_DIRECTORY = 'acquiring-catalog-downloads';
async function directory() { return (await navigator.storage.getDirectory()).getDirectoryHandle(CACHE_DIRECTORY, { create: true }); }
export async function cachedCompressedBytes(manifest: CatalogManifest): Promise<number> {
  const root = await directory(); let bytes = 0;
  for (const file of manifest.files) for (const chunk of file.chunks) {
    try { const cached = await (await root.getFileHandle(chunk.compressedChecksum + '.gz')).getFile(); if (cached.size === chunk.compressedByteSize) bytes += cached.size; }
    catch { /* Missing or unavailable cache contributes no assumed staging space. */ }
  }
  return bytes;
}
export async function cachedOrFetchChunk(base: URL, chunk: CatalogChunk, signal: AbortSignal): Promise<Uint8Array> {
  const root = await directory();
  try {
    const file = await (await root.getFileHandle(chunk.compressedChecksum + '.gz')).getFile();
    if (file.size === chunk.compressedByteSize) return await verifyChunk(new Uint8Array(await file.arrayBuffer()), chunk);
  } catch { /* Partial/corrupt staged cache is reverified, then safely replaced by downloaded immutable bytes. */ }
  const { compressed, raw } = await fetchVerifiedChunk(base, chunk, signal);
  const handle = await root.getFileHandle(chunk.compressedChecksum + '.gz', { create: true });
  const writer = await handle.createWritable();
  try { await writer.write(new Uint8Array(compressed)); await writer.close(); }
  catch (error) { await writer.abort().catch(() => {}); throw error; }
  return raw;
}
