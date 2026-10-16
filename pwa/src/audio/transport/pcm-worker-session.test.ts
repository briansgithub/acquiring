import { describe, expect, it, vi } from 'vitest';
import native from '../synth/fixtures/native-stream.json';
import { PlaybackPcmRenderer, PlaybackAudioLayer as Layer, PlaybackChordMode as Mode, Waveform } from '../synth';
import type { PlaybackConfig, PlaybackTimeline } from '../synth';
import { PcmWorkerSession, createPcmWorkerHandler, snapshotWorkerOperation } from './pcm-worker-session';
import type { PlaybackWorkerOperation, PlaybackWorkerResponse, PlaybackWorkerSuccess } from './worker-contracts';

const config: PlaybackConfig = { bpm: 60, transpose: 0, waveform: Waveform.SINE, chordMode: Mode.FULL, melodyGain: 1, chordGain: 1 };
const timeline: PlaybackTimeline = { startBeat: 1, endBeat: 1.5, events: [{ id: 1, startBeat: 1, endBeat: 1.4, layer: Layer.MELODY, fullMidiNotes: [60] }] };
function setup(t = timeline, c = config, rate = 1000) {
  const session = new PcmWorkerSession(); let id = 0;
  const send = (operation: PlaybackWorkerOperation, revision = 0) => session.handle({ version: 1, requestId: ++id, revision, operation });
  expect(send({ kind: 'load', timeline: t, config: c, sampleRate: rate }).ok).toBe(true);
  return { session, send };
}
function success(value: PlaybackWorkerResponse): PlaybackWorkerSuccess {
  expect(value.ok).toBe(true);
  if (!value.ok) throw new Error(value.error.message);
  return value;
}
function reference(renderer: PlaybackPcmRenderer, count: number) {
  const samples = new Int16Array(count);
  for (let i = 0; i < count; i += 256) renderer.renderAudioInto(samples.subarray(i, Math.min(i + 256, count)));
  return samples;
}

describe('bounded PCM session', () => {
  it('reuses first two unchanged native SINE blocks at1000/48000Hz without recapture', () => {
    expect(native.authority).toBe('801cf7984171d772afc4406ddb5c79c0cb7fd20a');
    for (const fixture of native.cases.filter(c => c.waveform === 'SINE')) {
      const t = { endBeat: 1.25, events: [
        { id: 1, startBeat: 1, endBeat: 1.24, layer: Layer.CHORD, fullMidiNotes: [48,52,55], rootMidiNote: 36 },
        { id: 2, startBeat: 1.03, endBeat: 1.125, layer: Layer.MELODY, fullMidiNotes: [60] },
        { id: 3, startBeat: 1.15, endBeat: 1.22, layer: Layer.MELODY, fullMidiNotes: [0,-1,64] }] };
      const { send } = setup(t, { ...config, bpm: 600, melodyGain: .37, chordGain: .61, arpeggiateCycles: .5 }, fixture.sampleRate);
      for (const block of fixture.blocks.slice(0,2)) {
        const response = success(send({ kind: 'render', frameCount: block.frames }));
        if (response.kind !== 'pcm') throw new Error();
        const expected = Buffer.from(block.pcm16le, 'base64');
        expect([...response.pcm]).toEqual(Array.from({ length: block.frames }, (_, i) => expected.readInt16LE(i * 2)));
        expect(response.startBeat).toBe(block.startBeat);
        expect(response.position.beat).toBe(block.currentBeat);
      }
    }
  });
  it('preserves256-frame gain envelopes, final remainder and consecutive batch state', () => {
    const { send } = setup();
    const renderer = new PlaybackPcmRenderer(timeline, config, 1000);
    for (const frames of [256,257,4096]) {
      const next = { ...config, melodyGain: .15, bpm: 87 };
      success(send({ kind: 'configure', config: next }, 1)); renderer.updateConfig(next);
      const result = success(send({ kind: 'render', frameCount: frames }, 1));
      if (result.kind !== 'pcm') throw new Error();
      expect(result.pcm).toEqual(reference(renderer, frames));
      expect(result.position.beat).toBe(renderer.currentBeat);
      expect(result.position.beatsPerFrame).toBe(renderer.currentBeatsPerFrame);
    }
  });
  it('supports load reset, native seek clamp, zero tempo, looping and once terminal padding', () => {
    const { send } = setup({ ...timeline, completionKey: 'once' });
    let result = success(send({ kind: 'render', frameCount: 1000 }));
    expect(result.position.finished).toBe(true);
    if (result.kind !== 'pcm') throw new Error();
    expect([...result.pcm.slice(500)]).toEqual(Array(500).fill(0));
    success(send({ kind: 'seek', beat: -100 }, 2));
    result = success(send({ kind: 'configure', config: { ...config, bpm: 0 } }, 2));
    expect(result.position.finished).toBe(false);
    expect(success(send({ kind: 'render', frameCount: 4096 }, 2)).position.beat).toBe(1);
    success(send({ kind: 'load', timeline, config, sampleRate: 1000 }, 3));
    expect(success(send({ kind: 'render', frameCount: 1000 }, 3)).position.finished).toBe(false);
  });
  it('requires initial identity1 and preflights overlap resources without replacing state', () => {
    const session = new PcmWorkerSession();
    expect(session.handle({ version: 1, requestId: 2, revision: 0, operation: { kind: 'render', frameCount: 1 } })).toMatchObject({ error: { code: 'PROTOCOL', fatal: true } });
    const { send } = setup();
    const events = Array.from({ length: 65 }, (_, id) => ({ ...timeline.events[0], id }));
    expect(send({ kind: 'load', timeline: { ...timeline, events }, config, sampleRate: 1000 }, 1)).toMatchObject({ error: { code: 'INVALID_INPUT', fatal: false } });
    expect(success(send({ kind: 'render', frameCount: 1 })).position.sampleRate).toBe(1000);
  });
  it('consumes request identities and rejects newer render revisions without advancing', () => {
    const { session, send } = setup();
    const stale = send({ kind: 'render', frameCount: 256 }, 1);
    expect(stale).toMatchObject({ ok: false, error: { code: 'STALE_REVISION', fatal: false } });
    expect(success(send({ kind: 'render', frameCount: 1 })).kind).toBe('pcm');
    const duplicate = session.handle({ version: 1, requestId: 3, revision: 0, operation: { kind: 'render', frameCount: 256 } });
    expect(duplicate).toMatchObject({ ok: false, error: { code: 'PROTOCOL', fatal: true } });
    expect(send({ kind: 'seek', beat: 1 })).toMatchObject({ ok: false, error: { code: 'RELEASED' } });
  });
  it('bounds preflight before arrays are copied; snapshots nested input aliases', () => {
    const oversized = new Array(4097);
    Object.defineProperty(oversized, '0', { get() { throw new Error('must not traverse'); } });
    expect(() => snapshotWorkerOperation({ kind: 'load', sampleRate: 1000, config, timeline: { ...timeline, events: oversized } })).toThrow('Event limit');
    const notes = [60], events = [{ ...timeline.events[0], fullMidiNotes: notes }];
    const operation = snapshotWorkerOperation({ kind: 'load', sampleRate: 1000, config, timeline: { ...timeline, events } });
    notes[0] = 90; events[0].endBeat = 1.2;
    if (operation.kind !== 'load') throw new Error();
    expect(operation.timeline.events[0].fullMidiNotes).toEqual([60]);
    expect(operation.timeline.events[0].endBeat).toBe(1.4);
    expect(Object.isFrozen(operation.timeline.events)).toBe(true);
    for (const bad of [0,4097,NaN,1.5]) expect(() => snapshotWorkerOperation({ kind: 'render', frameCount: bad })).toThrow();
    expect(() => snapshotWorkerOperation({ kind: 'load', sampleRate: 1000, config, timeline: { ...timeline, completionKey: 'x'.repeat(513) } })).toThrow();
  });
  it('handles no-load/preflight/stale controls transactionally and release permanently', () => {
    const session = new PcmWorkerSession();
    expect(session.handle({ version: 1, requestId: 1, revision: 0, operation: { kind: 'seek', beat: 1 } })).toMatchObject({ error: { code: 'NOT_LOADED', fatal: false } });
    const { send } = setup();
    expect(send({ kind: 'load', sampleRate: 1000, timeline, config: { ...config, transpose: 100000 } }, 4)).toMatchObject({ error: { code: 'INVALID_INPUT', fatal: false } });
    expect(success(send({ kind: 'seek', beat: 1 }, 3)).revision).toBe(3);
    expect(send({ kind: 'configure', config }, 2)).toMatchObject({ error: { code: 'STALE_REVISION' } });
    session.release(); session.release();
    expect(session.handle({ version: 1, requestId: 2, revision: 0, operation: { kind: 'render', frameCount: 1 } })).toMatchObject({ error: { code: 'RELEASED', fatal: true } });
  });
  it('discards the renderer after uncertain render/configuration failure', () => {
    const { send } = setup();
    const spy = vi.spyOn(PlaybackPcmRenderer.prototype, 'renderAudioInto').mockImplementationOnce(() => { throw new Error('advanced'); });
    expect(send({ kind: 'render', frameCount: 1 })).toMatchObject({ error: { code: 'WORKER_FAILED', fatal: true } });
    spy.mockRestore();
    expect(send({ kind: 'seek', beat: 1 })).toMatchObject({ error: { code: 'RELEASED' } });
  });
  it('transfers only the exact PCM backing buffer and cannot reuse it after transfer', () => {
    const session = new PcmWorkerSession();
    const responses: PlaybackWorkerResponse[] = [];
    const handler = createPcmWorkerHandler(session, (response, transfer) => {
      expect(transfer).toEqual(response.ok && response.kind === 'pcm' ? [response.pcm.buffer] : []);
      responses.push(structuredClone(response, { transfer }));
    });
    handler({ data: { version: 1, requestId: 1, revision: 0, operation: { kind: 'load', timeline, config, sampleRate: 1000 } } } as MessageEvent);
    handler({ data: { version: 1, requestId: 2, revision: 0, operation: { kind: 'render', frameCount: 257 } } } as MessageEvent);
    const pcm = success(responses[1]);
    expect(pcm.kind === 'pcm' && pcm.pcm.buffer.byteLength).toBe(514);
    const broken = createPcmWorkerHandler(session, () => { throw new Error(); });
    expect(() => broken({ data: { version: 1, requestId: 3, revision: 0, operation: { kind: 'render', frameCount: 1 } } } as MessageEvent)).toThrow();
    expect(session.handle({ version: 1, requestId: 4, revision: 0, operation: { kind: 'seek', beat: 1 } })).toMatchObject({ error: { code: 'RELEASED' } });
  });
});
