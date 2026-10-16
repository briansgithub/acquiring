import { describe, expect, it } from 'vitest';
import { PcmQueueSink } from './pcm-queue-sink';
import type { ApplicationAudioContextOwner, ApplicationAudioState, AudioContextInvalidationReason } from './contracts';
import type { PcmSinkPcm } from './sink-contracts';

function setup(output = false) {
  const nodes: { start: number; stopped: boolean; disconnected: boolean; onended: (() => void)|null }[] = [];
  const buffers: Float32Array[] = [];
  const clock = { currentTime: 0, outputTime: 0, sampleRate: 1000, state: 'running', destination: {} };
  const context = Object.assign(clock, {
    createBuffer(_channels: number, length: number) {
      const data = new Float32Array(length); buffers.push(data);
      return { length, getChannelData: () => data };
    },
    createBufferSource() {
      const record = { start: -1, stopped: false, disconnected: false, onended: null as (() => void)|null };
      nodes.push(record);
      return { buffer: null, get onended() { return record.onended; }, set onended(value: (() => void)|null) { record.onended = value; },
        connect() {}, start(time: number) { record.start = time; },
        stop() { record.stopped = true; }, disconnect() { record.disconnected = true; } };
    },
    ...(output ? { getOutputTimestamp: () => ({ contextTime: clock.outputTime, performanceTime: 0 }) } : {}),
  });
  let state: ApplicationAudioState = { epoch: 0, phase: 'ready', canRender: true, sampleRate: 1000 };
  let invalidation: ((reason: AudioContextInvalidationReason) => void)|undefined;
  const owner = { getSnapshot: () => state, getContext: () => context as unknown as AudioContext,
    subscribeInvalidation(listener: (reason: AudioContextInvalidationReason) => void) { invalidation = listener; return () => { invalidation = undefined; }; },
    resumeFromGesture() { throw new Error('sink must never resume'); }, release() { throw new Error('sink must never close owner'); },
  } as ApplicationAudioContextOwner;
  const sink = new PcmQueueSink({ contextOwner: owner });
  return { sink, clock, nodes, buffers, invalidate() {
    state = { ...state, epoch: 1, canRender: false }; invalidation?.('lifecycle');
  } };
}
const timeline = { startBeat: 1, endBeat: 5, completionKey: null };
function pcm(requestId: number, count: number, startBeat = 1): PcmSinkPcm {
  return { version: 1, ok: true, kind: 'pcm', requestId, revision: 0, startBeat,
    position: { sampleRate: 1000, beat: startBeat + count / 1000, beatsPerFrame: .001, finished: false },
    pcm: new Int16Array(count) };
}
describe('PCM queue sink initial bounded scaffold', () => {
  it('primes80frames at20ms lead and snapshots signed PCM at actual rate', () => {
    const { sink, nodes, buffers } = setup();
    const run = sink.begin(0, timeline), first = pcm(1,40);
    first.pcm[0] = -32768;
    sink.enqueue(run, first); first.pcm[0] = 32767;
    expect(nodes).toHaveLength(0); expect(sink.read().phase).toBe('priming');
    sink.enqueue(run, pcm(2,40,1.04));
    expect(nodes.map(node => node.start)).toEqual([.02,.06]);
    expect(buffers[0][0]).toBe(-1);
    expect(sink.read()).toMatchObject({ phase: 'scheduled', queuedFrames: 100, mappings: 2, queueDrained: false });
  });
  it('holds selected output head independently of ended events and drains only at tail', () => {
    const { sink, clock, nodes } = setup(true), run = sink.begin(0,timeline);
    sink.enqueue(run,pcm(1,10),true);
    clock.currentTime = 1; nodes[0].onended?.();
    expect(sink.read()).toMatchObject({ playedFrame: 0, beat: 1, queueDrained: false, sources: 0 });
    clock.outputTime = .03;
    expect(sink.read()).toMatchObject({ queueDrained: true, mappings: 0 });
    clock.outputTime = .02;
    expect(() => sink.read()).toThrow();
    expect(sink.read().phase).toBe('idle');
  });
  it('requires exact run identity, rejects invalid replacement and preserves revisions across flush', () => {
    const { sink } = setup(), run = sink.begin(2,timeline);
    expect(() => sink.begin(1,timeline)).toThrow();
    expect(sink.read().run).toBe(run);
    expect(() => sink.enqueue({ ...run },pcm(1,80))).toThrow();
    sink.flush();
    expect(() => sink.begin(1,timeline)).toThrow();
    expect(sink.begin(2,timeline)).not.toBe(run);
  });
  it('flushes lifecycle nodes immediately and permanently releases only the borrower', () => {
    const { sink, nodes, invalidate } = setup(), run = sink.begin(0,timeline);
    sink.enqueue(run,pcm(1,80));
    const late = nodes[0].onended;
    invalidate(); late?.();
    expect(nodes[0]).toMatchObject({ stopped: true, disconnected: true });
    expect(sink.read().phase).toBe('idle');
    sink.release(); sink.release();
    expect(sink.read().phase).toBe('released');
    expect(() => sink.begin(0,timeline)).toThrow();
  });
});
