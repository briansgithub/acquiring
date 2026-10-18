import type { AuralCatalogIdentityApi } from './identity-contracts';

const MULTIPLIERS = [16777619, 2246822519, 3266489917, 668265263];
const MAX_TOKEN_BYTES = 8_388_608;
function string(value: unknown, limit: number): string {
  if (typeof value !== 'string') throw new TypeError('Expected string');
  if (value.length > limit) throw new RangeError('String limit');
  // JVM UTF8 replacement differs from TextEncoder; refuse malformed surrogate sequences.
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new RangeError('Ill-formed UTF16');
    } else if (unit >= 0xdc00 && unit <= 0xdfff) throw new RangeError('Ill-formed UTF16');
  }
  return value;
}

/** Frozen AuralCatalog38..47; all caller bytes captured synchronously before digest awaits. */
export async function auralPatternId(tokens: readonly string[], view: string): Promise<string> {
  if (!Array.isArray(tokens)) throw new TypeError('Expected tokens array');
  const count: unknown = tokens.length;
  if (typeof count !== 'number') throw new TypeError('Expected array length');
  if (!Number.isSafeInteger(count) || count < 0 || count > 10000) throw new RangeError('Token limit');
  const encoder = new TextEncoder(), bytes: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    const encoded = encoder.encode(string(tokens[i], 65536));
    total += encoded.byteLength;
    if (total > MAX_TOKEN_BYTES) throw new RangeError('UTF8 byte limit');
    bytes.push(encoded);
  }
  const namespaceBytes = encoder.encode('aural-normalizer-1\u0000' + string(view, 4096));
  const subtle = globalThis.crypto.subtle, hashes = [0, 0, 0, 0];
  for (let token = 0; token < bytes.length; token++) {
    const digest = new DataView(await subtle.digest('SHA-256', bytes[token]));
    for (let lane = 0; lane < 4; lane++) hashes[lane] = (Math.imul(hashes[lane], MULTIPLIERS[lane]) + digest.getInt32(lane * 4, true)) | 0;
  }
  const namespaceHash = new Uint8Array(await subtle.digest('SHA-256', namespaceBytes));
  let namespace = '', suffix = '';
  for (let i = 0; i < 6; i++) namespace += namespaceHash[i].toString(16).padStart(2, '0');
  for (let i = 0; i < 4; i++) suffix += (hashes[i] >>> 0).toString(16).padStart(8, '0');
  return 'p_' + namespace + '_' + count + '_' + suffix;
}
export const auralCatalogIdentityApi: AuralCatalogIdentityApi = Object.freeze({ auralPatternId });
