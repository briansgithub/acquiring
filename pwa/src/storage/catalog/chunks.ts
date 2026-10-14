import { MAX_COMPRESSED_CHUNK_BYTES, MAX_CHUNK_BYTES, type CatalogChunk } from './manifest';

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function boundedBytes(stream: ReadableStream<Uint8Array>, expected: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const blocks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > expected) throw new Error('Chunk exceeds declared byte length');
      blocks.push(value);
    }
    if (total !== expected) throw new Error('Chunk is truncated');
    const output = new Uint8Array(total);
    let offset = 0;
    for (const block of blocks) { output.set(block, offset); offset += block.byteLength; }
    return output;
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
}

/** At most one bounded chunk is inflated; never allocate an entire catalog buffer. */
export async function verifyChunk(compressed: Uint8Array, chunk: CatalogChunk): Promise<Uint8Array> {
  if (!Number.isInteger(chunk.byteSize) || chunk.byteSize <= 0 || chunk.byteSize > MAX_CHUNK_BYTES || !Number.isInteger(chunk.compressedByteSize) || chunk.compressedByteSize <= 0 || chunk.compressedByteSize > MAX_COMPRESSED_CHUNK_BYTES) throw new Error('Chunk limit exceeded');
  if (compressed.byteLength !== chunk.compressedByteSize || await sha256(compressed) !== chunk.compressedChecksum) throw new Error('Compressed chunk checksum mismatch');
  const stream = new Blob([new Uint8Array(compressed)]).stream().pipeThrough(new DecompressionStream('gzip'));
  const raw = await boundedBytes(stream, chunk.byteSize);
  if (await sha256(raw) !== chunk.checksum) throw new Error('Database chunk checksum mismatch');
  return raw;
}

export async function fetchVerifiedChunk(base: URL, chunk: CatalogChunk, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<{ compressed: Uint8Array; raw: Uint8Array }> {
  if (!base.pathname.endsWith('/') || base.search || base.hash || base.username || base.password || !['https:', 'http:'].includes(base.protocol)) throw new Error('Expected a catalog directory URL');
  if (!Number.isInteger(chunk.compressedByteSize) || chunk.compressedByteSize < 1 || chunk.compressedByteSize > MAX_COMPRESSED_CHUNK_BYTES) throw new Error('Chunk limit exceeded');
  const url = new URL(chunk.path, base);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || chunk.path.includes('..') || chunk.path.startsWith('/') || url.search || url.hash) throw new Error('Chunk URL leaves catalog directory');
  const response = await fetcher(url, { signal, redirect: 'error', credentials: 'omit', cache: 'no-store' });
  if (response.status !== 200 || !response.body) throw new Error(`Chunk download failed: HTTP${response.status}`);
  const encoding = response.headers.get('content-encoding');
  const length = response.headers.get('content-length');
  if ((encoding && encoding !== 'identity') || (length !== null && Number(length) !== chunk.compressedByteSize)) {
    await response.body.cancel(); throw new Error('Chunk response must contain exact gzip bytes without Content-Encoding');
  }
  const compressed = await boundedBytes(response.body, chunk.compressedByteSize);
  return { compressed, raw: await verifyChunk(compressed, chunk) };
}
