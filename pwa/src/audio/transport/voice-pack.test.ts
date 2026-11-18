import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { PlaybackAudioLayer, PlaybackChordMode, PlaybackRootDegreeCue, Waveform } from '../synth';
import { PcmWorkerSession } from './pcm-worker-session';
import type { PlaybackWorkerOperation, PlaybackWorkerResponse } from './worker-contracts';
import { decodePcm16le, ensureVoicePack, getVoicePackSnapshot, parseVoiceManifest, resetVoicePackForTests } from './voice-pack';

afterEach(() => resetVoicePackForTests());

/** Synthetic pitched clip: 24 pitches x 600 frames of a stepped tone, little-endian. */
function pitchedClip(seed: number): Int16Array {
  const clip = new Int16Array(24 * 600);
  for (let i = 0; i < clip.length; i++) clip[i] = ((i * (seed + 3)) % 200 - 100) * 90;
  return clip;
}
const bytesOf = (samples: Int16Array) => Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

describe('N07 voice pack loader', () => {
  const stems = ['root_degree_one', 'root_degree_five'];
  const files = new Map(stems.map((stem, index) => [stem, bytesOf(pitchedClip(index))]));
  const manifest = { schemaVersion: 1, files: stems.map((stem) => ({ stem, bytes: files.get(stem)!.length, sha256: sha(files.get(stem)!) })) };
  const fetcher = (tamper = false) => async (url: string) => {
    if (url.endsWith('manifest.json')) return new Response(JSON.stringify(manifest));
    const stem = url.split('/').pop()!.replace('.pcm', '');
    const bytes = Buffer.from(files.get(stem)!);
    if (tamper) bytes[0] ^= 1;
    return new Response(bytes);
  };

  it('downloads once, verifies SHA-256 and decodes little-endian int16', async () => {
    const pack = await ensureVoicePack(fetcher(), '/voice/');
    expect(pack?.resources.map(([stem]) => stem)).toEqual(stems);
    expect([...pack!.resources[0]![1].slice(0, 3)]).toEqual([...pitchedClip(0).slice(0, 3)]);
    expect(getVoicePackSnapshot()).toMatchObject({ status: 'ready', loadedBytes: manifest.files.reduce((n, f) => n + f.bytes, 0) });
    expect(await ensureVoicePack(() => { throw new Error('no second download'); })).toBe(pack);
  });

  it('rejects a tampered clip and reports failure without a pack', async () => {
    expect(await ensureVoicePack(fetcher(true), '/voice/')).toBeNull();
    expect(getVoicePackSnapshot()).toMatchObject({ status: 'failed', pack: null });
  });

  it('validates manifests and decodes independent of platform endianness', () => {
    expect(() => parseVoiceManifest({ schemaVersion: 1, files: [{ stem: '../x', bytes: 2, sha256: 'a'.repeat(64) }] })).toThrow();
    expect(() => parseVoiceManifest({ schemaVersion: 2, files: [] })).toThrow();
    expect([...decodePcm16le(new Uint8Array([0x01, 0x80, 0xff, 0x7f]).buffer)]).toEqual([-32767, 32767]);
  });
});

describe('N07 worker voices operation', () => {
  const timeline = { endBeat: 3, events: [
    { id: 1, startBeat: 1, endBeat: 3, layer: PlaybackAudioLayer.CHORD, fullMidiNotes: [48, 52, 55], rootMidiNote: 48, rootDegree: 1,
      fullChordRootMidiNote: 48, keyScale: 'major', keyTonicMidi: 48 },
  ] };
  const base = { bpm: 120, transpose: 0, waveform: Waveform.SINE, chordMode: PlaybackChordMode.FULL, melodyGain: 0.5, chordGain: 0.5, arpeggiateCycles: 0 };
  let requestId = 0;
  const send = (session: PcmWorkerSession, operation: PlaybackWorkerOperation, revision = 1): PlaybackWorkerResponse =>
    session.handle({ version: 1, requestId: ++requestId, revision, operation });
  function render(withVoices: boolean): Int16Array {
    requestId = 0;
    const session = new PcmWorkerSession();
    expect(send(session, { kind: 'load', sampleRate: 24000, timeline, config: { ...base, rootDegreeCue: PlaybackRootDegreeCue.SPOKEN_NUMBER, voiceVolume: 1 } }).ok).toBe(true);
    if (withVoices) {
      const reply = send(session, { kind: 'voices', resources: [['root_degree_one', pitchedClip(0)]] });
      expect(reply.ok).toBe(true);
    }
    const reply = send(session, { kind: 'render', frameCount: 4096 });
    if (!reply.ok || reply.kind !== 'pcm') throw new Error('render failed');
    return reply.pcm;
  }

  it('preserves cue fields through the worker snapshot and speaks once clips arrive', () => {
    const silent = render(false), spoken = render(true);
    expect(spoken.some((sample, index) => sample !== silent[index])).toBe(true);
  });

  it('rejects malformed or oversized voice packs without losing the renderer', () => {
    requestId = 0;
    const session = new PcmWorkerSession();
    send(session, { kind: 'load', sampleRate: 24000, timeline, config: base });
    const bad = send(session, { kind: 'voices', resources: [['../evil', new Int16Array(4)]] });
    expect(bad.ok).toBe(false);
    expect(send(session, { kind: 'render', frameCount: 256 }).ok).toBe(true);
  });
});
