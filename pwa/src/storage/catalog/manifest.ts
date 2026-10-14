export interface CatalogChunk { index: number; path: string; byteSize: number; checksum: string; compressedByteSize: number; compressedChecksum: string }
export interface CatalogFile { name: string; byteSize: number; checksum: string; sourceArchiveChecksum: string; compressedByteSize: number; chunks: CatalogChunk[] }
export interface CatalogManifest {
  schemaVersion: 'acquiring-pwa-catalog-1'; kind: 'aural' | 'songs'; sourceSnapshot: string;
  sourceSchema: 3 | 'aural-catalog-3'; sourceManifestSha256: string; chunkSizeBytes: number; files: CatalogFile[];
}
export const MAX_CHUNK_BYTES = 8 * 1024 * 1024;
export const MAX_COMPRESSED_CHUNK_BYTES = MAX_CHUNK_BYTES + 64 * 1024;
const SHA256 = /^[0-9a-f]{64}$/;
const NAMES = { aural: ['aural-catalog.db', 'aural-evidence.db', 'aural-popularity.db'], songs: ['catalog.db'] };
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected catalog object');
  return value as Record<string, unknown>;
}
function integer(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > max) throw new Error('Invalid catalog byte count');
  return value;
}
function hash(value: unknown): string {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new Error('Invalid catalog SHA256');
  return value;
}

/** Accept exactly the producer format; no unbounded chunk, path, snapshot or bundle inference. */
export function validateManifest(input: unknown): CatalogManifest {
  const value = object(input);
  if (value.schemaVersion !== 'acquiring-pwa-catalog-1' || (value.kind !== 'aural' && value.kind !== 'songs')) throw new Error('Unsupported PWA catalog');
  if ((value.kind === 'aural' && value.sourceSchema !== 'aural-catalog-3') || (value.kind === 'songs' && value.sourceSchema !== 3)) throw new Error('Unsupported source schema');
  const chunkSizeBytes = integer(value.chunkSizeBytes, MAX_CHUNK_BYTES);
  if (chunkSizeBytes < 1024) throw new Error('Invalid chunk size');
  const requiredNames = NAMES[value.kind];
  if (!Array.isArray(value.files) || value.files.length !== requiredNames.length) throw new Error('Incomplete catalog bundle');
  const seen = new Set<string>();
  const files: CatalogFile[] = value.files.map(raw => {
    const file = object(raw);
    if (typeof file.name !== 'string' || !requiredNames.includes(file.name) || seen.has(file.name)) throw new Error('Unexpected or duplicate catalog file');
    seen.add(file.name);
    const name = file.name, byteSize = integer(file.byteSize), compressedByteSize = integer(file.compressedByteSize);
    // SQLite32-bit browser build is deliberately limited to files below2GiB.
    if (byteSize >= 2 ** 31 || !Array.isArray(file.chunks) || file.chunks.length !== Math.ceil(byteSize / chunkSizeBytes)) throw new Error('Invalid catalog file size/chunk count');
    let compressedSum = 0;
    const chunks = file.chunks.map((raw, index): CatalogChunk => {
      const chunk = object(raw);
      const expectedRaw = Math.min(chunkSizeBytes, byteSize - index * chunkSizeBytes);
      if (chunk.index !== index || chunk.byteSize !== expectedRaw) throw new Error('Invalid ordered chunk length');
      const checksum = hash(chunk.checksum), compressedChecksum = hash(chunk.compressedChecksum);
      const compressed = integer(chunk.compressedByteSize, MAX_COMPRESSED_CHUNK_BYTES);
      const expectedPath = `chunks/${name}/${String(index).padStart(6, '0')}-${compressedChecksum}.gz`;
      if (chunk.path !== expectedPath) throw new Error('Invalid immutable chunk path');
      compressedSum += compressed;
      return { index, path: expectedPath, byteSize: expectedRaw, checksum, compressedByteSize: compressed, compressedChecksum };
    });
    if (compressedSum !== compressedByteSize) throw new Error('Compressed catalog length mismatch');
    return { name, byteSize, compressedByteSize, checksum: hash(file.checksum), sourceArchiveChecksum: hash(file.sourceArchiveChecksum), chunks };
  });
  return { schemaVersion: 'acquiring-pwa-catalog-1', kind: value.kind, sourceSchema: value.kind === 'aural' ? 'aural-catalog-3' : 3, sourceSnapshot: hash(value.sourceSnapshot), sourceManifestSha256: hash(value.sourceManifestSha256), chunkSizeBytes, files };
}

export function planInstallSpace(manifest: CatalogManifest, estimate: { usage?: number; quota?: number }, verifiedStagedBytes = 0) {
  const rawBytes = manifest.files.reduce((sum, file) => sum + file.byteSize, 0);
  const compressedBytes = manifest.files.reduce((sum, file) => sum + file.compressedByteSize, 0);
  if (!Number.isSafeInteger(verifiedStagedBytes) || verifiedStagedBytes < 0 || verifiedStagedBytes > compressedBytes) throw new Error('Invalid verified staging size');
  const safetyBytes = Math.max(64 * 1024 * 1024, Math.ceil(rawBytes * .05));
  // Existing retained catalog and staged chunks are already included in origin usage; never double count them.
  const additionalBytes = rawBytes + compressedBytes - verifiedStagedBytes + safetyBytes;
  const known = Number.isFinite(estimate.usage) && Number.isFinite(estimate.quota) && estimate.usage! >= 0 && estimate.quota! >= estimate.usage!;
  const availableBytes = known ? estimate.quota! - estimate.usage! : null;
  return { rawBytes, compressedBytes, safetyBytes, additionalBytes, availableBytes, enough: availableBytes === null ? null : availableBytes >= additionalBytes };
}
