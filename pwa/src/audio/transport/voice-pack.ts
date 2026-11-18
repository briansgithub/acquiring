/** N07 speech clip pack (owner decision 2026-11-18): the exact Android clips, downloaded only when a spoken cue is
 * first enabled, verified against public/voice/manifest.json SHA-256 and kept for the page lifetime (the service
 * worker keeps them offline). Pulse cues need no clips.
 */
export interface VoicePackFile { readonly stem: string; readonly bytes: number; readonly sha256: string }
export interface VoicePack { readonly resources: readonly (readonly [string, Int16Array])[] }
export type VoicePackStatus = 'idle' | 'loading' | 'ready' | 'failed';
export interface VoicePackSnapshot { readonly status: VoicePackStatus; readonly pack: VoicePack | null; readonly loadedBytes: number; readonly totalBytes: number }

const MAX_FILES = 96;
const MAX_TOTAL_BYTES = 64_000_000;
type Fetcher = (url: string) => Promise<Response>;

let snapshot: VoicePackSnapshot = Object.freeze({ status: 'idle', pack: null, loadedBytes: 0, totalBytes: 0 });
let loading: Promise<VoicePack | null> | null = null;
const listeners = new Set<() => void>();
function publish(next: Partial<VoicePackSnapshot>): void {
  snapshot = Object.freeze({ ...snapshot, ...next });
  for (const listener of [...listeners]) listener();
}

export const subscribeVoicePack = (listener: () => void): (() => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getVoicePackSnapshot = (): VoicePackSnapshot => snapshot;
export const currentVoicePack = (): VoicePack | null => snapshot.pack;

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function parseVoiceManifest(value: unknown): VoicePackFile[] {
  const files = (value as { files?: unknown } | null)?.files;
  if ((value as { schemaVersion?: unknown })?.schemaVersion !== 1 || !Array.isArray(files) || files.length > MAX_FILES) throw new Error('Invalid voice manifest');
  let total = 0;
  return files.map((file: unknown) => {
    const { stem, bytes, sha256 } = (file ?? {}) as Record<string, unknown>;
    if (typeof stem !== 'string' || !/^[a-z_]+$/.test(stem) || !Number.isInteger(bytes) || (bytes as number) <= 0 || (bytes as number) % 2 !== 0
      || typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) throw new Error('Invalid voice manifest entry');
    total += bytes as number;
    if (total > MAX_TOTAL_BYTES) throw new Error('Voice manifest exceeds size limit');
    return { stem, bytes: bytes as number, sha256 };
  });
}

/** Decode little-endian int16 regardless of platform endianness. */
export function decodePcm16le(buffer: ArrayBuffer): Int16Array {
  const view = new DataView(buffer), samples = new Int16Array(buffer.byteLength / 2);
  for (let index = 0; index < samples.length; index++) samples[index] = view.getInt16(index * 2, true);
  return samples;
}

export async function loadVoicePack(fetcher: Fetcher = (url) => fetch(url), base = '/voice/'): Promise<VoicePack> {
  const manifestResponse = await fetcher(base + 'manifest.json');
  if (!manifestResponse.ok) throw new Error('Voice manifest unavailable');
  const files = parseVoiceManifest(await manifestResponse.json());
  publish({ status: 'loading', loadedBytes: 0, totalBytes: files.reduce((sum, file) => sum + file.bytes, 0) });
  const resources: (readonly [string, Int16Array])[] = [];
  let loadedBytes = 0;
  for (const file of files) {
    const response = await fetcher(`${base}${file.stem}.pcm`);
    if (!response.ok) throw new Error(`Voice clip ${file.stem} unavailable`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== file.bytes || await sha256Hex(bytes) !== file.sha256) throw new Error(`Voice clip ${file.stem} failed verification`);
    resources.push(Object.freeze([file.stem, decodePcm16le(bytes)] as const));
    loadedBytes += bytes.byteLength;
    publish({ loadedBytes });
  }
  return Object.freeze({ resources: Object.freeze(resources) });
}

/** Start (or join) the one download for this page. Resolves null on failure; a later call retries. */
export function ensureVoicePack(fetcher?: Fetcher, base?: string): Promise<VoicePack | null> {
  if (snapshot.pack) return Promise.resolve(snapshot.pack);
  if (loading) return loading;
  publish({ status: 'loading' });
  loading = loadVoicePack(fetcher, base).then((pack) => { publish({ status: 'ready', pack }); return pack; },
    () => { publish({ status: 'failed', pack: null }); return null; }).finally(() => { loading = null; });
  return loading;
}

export function resetVoicePackForTests(): void {
  loading = null; listeners.clear();
  snapshot = Object.freeze({ status: 'idle', pack: null, loadedBytes: 0, totalBytes: 0 });
}
