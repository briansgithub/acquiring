import { describe, expect, it, vi } from 'vitest';
import { PcmQueueSink } from './pcm-queue-sink';
import type { ApplicationAudioContextOwner, ApplicationAudioState, AudioContextInvalidationReason } from './contracts';
import type { PcmSinkPcm } from './sink-contracts';

type Hooks = Partial<Record<'snapshot'|'timestamp'|'createBuffer'|'channel'|'createSource'|'connect'|'start'|'stop'|'disconnect', () => void>>;
function setup(output = false, rate = 1000) {
  const hooks: Hooks = {};
  const nodes: { start: number; stopped: boolean; disconnected: boolean; onended: (() => void)|null }[] = [];
  const buffers: Float32Array[] = [];
  const clock = { currentTime: 0, outputTime: 0, sampleRate: rate, state: 'running', destination: {} };
  const context = Object.assign(clock, {
    createBuffer(_channels: number, length: number) {
      hooks.createBuffer?.();
      const data = new Float32Array(length); buffers.push(data);
      return { length, getChannelData: () => { hooks.channel?.(); return data; } };
    },
    createBufferSource() {
      hooks.createSource?.();
      const record = { start: -1, stopped: false, disconnected: false, onended: null as (() => void)|null };
      nodes.push(record);
      return { buffer: null, get onended() { return record.onended; }, set onended(value: (() => void)|null) { record.onended = value; },
        connect() { hooks.connect?.(); }, start(time: number) { record.start = time; hooks.start?.(); },
        stop() { record.stopped = true; hooks.stop?.(); }, disconnect() { record.disconnected = true; hooks.disconnect?.(); } };
    },
    ...(output ? { getOutputTimestamp: () => { hooks.timestamp?.(); return { contextTime: clock.outputTime, performanceTime: 0 }; } } : {}),
  });
  let state: ApplicationAudioState = { epoch: 0, phase: 'ready', canRender: true, sampleRate: rate };
  let invalidation: ((reason: AudioContextInvalidationReason) => void)|undefined;
  const owner = { getSnapshot: () => { hooks.snapshot?.(); return state; }, getContext: () => context as unknown as AudioContext,
    subscribeInvalidation(listener: (reason: AudioContextInvalidationReason) => void) { invalidation = listener; return () => { invalidation = undefined; }; },
    resumeFromGesture() { throw new Error('sink must never resume'); }, release() { throw new Error('sink must never close owner'); },
  } as ApplicationAudioContextOwner;
  const sink = new PcmQueueSink({ contextOwner: owner });
  return { sink, clock, context, nodes, buffers, hooks, deny() { state = { ...state, canRender: false }; }, invalidate() {
    state = { ...state, epoch: 1, canRender: false }; invalidation?.('lifecycle');
  } };
}
const timeline = { startBeat: 1, endBeat: 5, completionKey: null };
function pcm(requestId: number, count: number, startBeat = 1, rate = 1000): PcmSinkPcm {
  return { version: 1, ok: true, kind: 'pcm', requestId, revision: 0, startBeat,
    position: { sampleRate: rate, beat: startBeat + count / rate, beatsPerFrame: 1 / rate, finished: false },
    pcm: new Int16Array(count) };
}
describe('bounded PCM queue sink', () => {
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

  it.each([44100,48000])('uses actual%sHz, ceil frame lead, and explicit short final without auto-resume', rate => {
    const { sink, clock, nodes, buffers } = setup(false, rate);
    clock.currentTime = .00001;
    const run = sink.begin(0,timeline), batch = pcm(1,2,1,rate);
    batch.pcm.set([-32768,32767]); sink.enqueue(run,batch,true);
    expect(nodes[0].start).toBe((Math.ceil(.00001 * rate) + Math.ceil(.02 * rate)) / rate);
    expect([...buffers[0]]).toEqual([-1,32767/32768]);
    expect(sink.read().clock).toBe('context-render');
    expect(() => sink.enqueue(run,pcm(2,1,1,rate))).toThrow();
  });
  it('bounds queued horizon before allocation including one4096-frame rounding batch', () => {
    const { sink, buffers } = setup(), run = sink.begin(0,timeline);
    sink.enqueue(run,pcm(1,4096)); sink.enqueue(run,pcm(2,180));
    expect(sink.read().queuedFrames).toBe(4296);
    expect(() => sink.enqueue(run,pcm(3,1))).toThrowError(expect.objectContaining({ code: 'QUEUE_FULL' }));
    expect(buffers).toHaveLength(2); expect(sink.read().queuedFrames).toBe(4296);
  });
  it('bounds staging, retained mappings and live sources independently at512', () => {
    const staging = setup(false,384000), stagedRun = staging.sink.begin(0,timeline);
    for (let id=1; id<=512; id++) staging.sink.enqueue(stagedRun,pcm(id,1,1,384000));
    expect(staging.nodes).toHaveLength(0);
    expect(() => staging.sink.enqueue(stagedRun,pcm(513,1,1,384000))).toThrowError(expect.objectContaining({ code: 'QUEUE_FULL' }));
    const mapping = setup(), mappedRun = mapping.sink.begin(0,timeline);
    for (let id=1; id<=512; id++) mapping.sink.enqueue(mappedRun,pcm(id,1));
    mapping.nodes.forEach(node => node.onended?.());
    expect(mapping.sink.read()).toMatchObject({ sources: 0, mappings: 512 });
    expect(() => mapping.sink.enqueue(mappedRun,pcm(513,1))).toThrowError(expect.objectContaining({ code: 'QUEUE_FULL' }));
    const source = setup(), sourceRun = source.sink.begin(0,timeline);
    source.sink.enqueue(sourceRun,pcm(1,80));
    for (let id=2; id<=512; id++) {
      source.clock.currentTime += .1; source.sink.enqueue(sourceRun,pcm(id,1));
    }
    source.clock.currentTime += .1;
    expect(source.sink.read()).toMatchObject({ sources: 512, mappings: 0 });
    expect(() => source.sink.enqueue(sourceRun,pcm(513,1))).toThrowError(expect.objectContaining({ code: 'QUEUE_FULL' }));
  });
  it.each([
    { requestId: 0 }, { requestId: 1.5 }, { requestId: Number.MAX_SAFE_INTEGER+1 },
    { revision: 1 }, { version: 2 }, { ok: false }, { kind: 'ack' },
    { pcm: new Int16Array(0) }, { pcm: new Int16Array(4097) }, { pcm: new Float32Array(80) },
    { startBeat: NaN }, { position: { sampleRate: 48000, beat: 1, beatsPerFrame: .001, finished: false } },
    { position: { sampleRate: 1000, beat: 1, beatsPerFrame: -.001, finished: false } },
    { position: { sampleRate: 1000, beat: 1, beatsPerFrame: 1, finished: false } },
    { position: { sampleRate: 1000, beat: NaN, beatsPerFrame: .001, finished: false } },
    { position: { sampleRate: 1000, beat: 1, beatsPerFrame: .001, finished: 'false' } },
    { position: null },
  ])('rejects malformed metadata before host allocation %#', overrides => {
    const { sink, buffers } = setup(), run = sink.begin(0,timeline);
    expect(() => sink.enqueue(run,{ ...pcm(1,80), ...overrides } as unknown as PcmSinkPcm)).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(buffers).toHaveLength(0); expect(sink.read().run).toBe(run);
  });
  it('rejects repeated/stale IDs without allocation and snapshots each known getter exactly once', () => {
    const { sink, buffers } = setup(), run = sink.begin(0,timeline), original = pcm(1,80);
    const reads: Record<string,number> = {};
    const packet = Object.fromEntries(Object.keys(original).map(key => [key,undefined])) as unknown as PcmSinkPcm;
    for (const [key,value] of Object.entries(original)) Object.defineProperty(packet,key,{ get() {
      reads[key]=(reads[key]??0)+1; return value;
    } });
    sink.enqueue(run,packet);
    expect(Object.values(reads).every(count => count === 1)).toBe(true);
    expect(() => sink.enqueue(run,pcm(1,80))).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(buffers).toHaveLength(1);
    const next = sink.begin(1,timeline);
    expect(() => sink.enqueue(run,pcm(2,80))).toThrowError(expect.objectContaining({ code: 'STALE_RUN' }));
    expect(sink.read().run).toBe(next);
  });
  it('rechecks permission without an invalidation callback and keeps idle/released reads inert', () => {
    const state = setup(), run = state.sink.begin(0,timeline);
    state.sink.enqueue(run,pcm(1,80)); state.deny();
    expect(() => state.sink.read()).toThrowError(expect.objectContaining({ code: 'BLOCKED' }));
    expect(state.nodes[0].stopped).toBe(true);
    state.hooks.snapshot = () => { throw new Error('idle read must not consult owner'); };
    expect(state.sink.read().phase).toBe('idle');
    state.sink.release(); expect(state.sink.read().phase).toBe('released');
  });
  it('holds beat through underrun gaps and preserves drain after pruning all mappings', () => {
    const { sink, clock, nodes } = setup(), run = sink.begin(0,timeline);
    sink.enqueue(run,pcm(1,80)); clock.currentTime = .2;
    expect(sink.read()).toMatchObject({ queueDrained: true, beat: 1.08, mappings: 0 });
    sink.enqueue(run,pcm(2,10,1.08));
    expect(nodes[1].start).toBe(.22);
    expect(sink.read()).toMatchObject({ queueDrained: false, beat: 1.08 });
    clock.currentTime = .215; expect(sink.read().beat).toBe(1.08);
    clock.currentTime = .23; expect(sink.read()).toMatchObject({ queueDrained: true, beat: 1.09, mappings: 0 });
  });
  it.each(['createBuffer','channel','createSource','connect','start'] as const)('flushes all owned nodes on%s failure', hook => {
    const { sink, hooks, nodes } = setup(), run = sink.begin(0,timeline);
    sink.enqueue(run,pcm(1,80));
    hooks[hook] = () => { throw new Error('host failure'); };
    expect(() => sink.enqueue(run,pcm(2,80))).toThrowError(expect.objectContaining({ code: 'AUDIO_FAILED' }));
    expect(sink.read().phase).toBe('idle');
    expect(nodes.every(node => node.stopped && node.disconnected)).toBe(true);
  });
  it('copies samples before createBuffer callbacks can mutate caller PCM', () => {
    const { sink, hooks, buffers } = setup(), run = sink.begin(0,timeline), batch = pcm(1,80);
    batch.pcm[0] = -32768;
    hooks.createBuffer = () => { batch.pcm[0] = 32767; };
    sink.enqueue(run,batch); expect(buffers[0][0]).toBe(-1);
  });
  it.each(['createBuffer','channel','createSource','connect','start'] as const)('preserves a replacement created inside%s', hook => {
    const { sink, hooks, nodes } = setup(), run = sink.begin(0,timeline);
    let next: ReturnType<PcmQueueSink['begin']>|undefined;
    hooks[hook] = vi.fn().mockImplementationOnce(() => { next = sink.begin(1,timeline); });
    expect(() => sink.enqueue(run,pcm(1,80))).toThrowError(expect.objectContaining({ code: 'STALE_RUN' }));
    expect(sink.read().run).toBe(next);
    expect(nodes.every(node => node.stopped && node.disconnected)).toBe(true);
  });
  it('preserves a new run started by old stop cleanup and rejects nested snapshot enqueue', () => {
    const { sink, hooks, nodes } = setup(), run = sink.begin(0,timeline);
    sink.enqueue(run,pcm(1,80)); const late = nodes[0].onended;
    let next: ReturnType<PcmQueueSink['begin']>|undefined;
    hooks.stop = vi.fn().mockImplementationOnce(() => { next = sink.begin(1,timeline); });
    sink.flush(); late?.(); expect(sink.read().run).toBe(next);
    const batch = { ...pcm(2,80), revision: 1 };
    Object.defineProperty(batch,'startBeat',{ get() {
      expect(() => sink.enqueue(next!,{ ...pcm(1,1), revision: 1 })).toThrowError(expect.objectContaining({ code: 'STALE_RUN' }));
      return 1;
    } });
    sink.enqueue(next!,batch);
    expect(sink.read().sources).toBe(1);
  });
  it.each(['snapshot','timestamp'] as const)('cannot overwrite replacement from%s hook while observing', hook => {
    const state = setup(true), run = state.sink.begin(0,timeline);
    let next: ReturnType<PcmQueueSink['begin']>|undefined;
    state.hooks[hook] = vi.fn().mockImplementationOnce(() => { next = state.sink.begin(1,timeline); });
    expect(() => state.sink.enqueue(run,pcm(1,80))).toThrowError(expect.objectContaining({ code: 'STALE_RUN' }));
    expect(state.sink.read().run).toBe(next);
  });
  it('rejects begin timeline getter replacement without retiring the newer run', () => {
    const { sink } = setup(); const old = sink.begin(0,timeline);
    let next: ReturnType<PcmQueueSink['begin']>|undefined;
    const input = { ...timeline, get endBeat() { next = sink.begin(1,timeline); return 5; } };
    expect(() => sink.begin(0,input)).toThrowError(expect.objectContaining({ code: 'STALE_RUN' }));
    expect(sink.read().run).toBe(next); expect(next).not.toBe(old);
  });
  it('bounds selected/scheduling clock failures and permanent release inside host hooks', () => {
    const state = setup(true), run = state.sink.begin(0,timeline);
    state.clock.outputTime = NaN;
    expect(() => state.sink.enqueue(run,pcm(1,80))).toThrowError(expect.objectContaining({ code: 'CLOCK_FAILED' }));
    expect(state.sink.read().phase).toBe('idle');
    const other = setup(), next = other.sink.begin(0,timeline);
    other.hooks.createSource = () => other.sink.release();
    expect(() => other.sink.enqueue(next,pcm(1,80))).toThrowError(expect.objectContaining({ code: 'RELEASED' }));
    expect(other.nodes.every(node => node.stopped && node.disconnected)).toBe(true);
    expect(other.sink.read().phase).toBe('released');
  });


  it('snapshots each nested position getter once and handles release during packet snapshot', () => {
    const state = setup(), run = state.sink.begin(0,timeline), batch = pcm(1,80);
    const reads: Record<string,number> = {};
    for (const [key,value] of Object.entries(batch.position)) Object.defineProperty(batch.position,key,{ get() {
      reads[key]=(reads[key]??0)+1; return value;
    } });
    state.sink.enqueue(run,batch); expect(Object.values(reads)).toEqual([1,1,1,1]);
    const replacement = pcm(2,80);
    Object.defineProperty(replacement,'requestId',{ get() { state.sink.release(); return 2; } });
    expect(() => state.sink.enqueue(run,replacement)).toThrowError(expect.objectContaining({ code: 'RELEASED' }));
    expect(state.buffers).toHaveLength(1); expect(state.nodes[0].stopped).toBe(true);
    expect(state.sink.read().phase).toBe('released');
  });
  it('cannot overwrite replacement from a currentTime getter or old stop exception', () => {
    const state = setup(), run = state.sink.begin(0,timeline);
    let next: ReturnType<PcmQueueSink['begin']>|undefined;
    const time = vi.fn(() => 0).mockImplementationOnce(() => { next = state.sink.begin(1,timeline); return 0; });
    Object.defineProperty(state.context,'currentTime',{ get: time });
    expect(() => state.sink.enqueue(run,pcm(1,80))).toThrowError(expect.objectContaining({ code: 'STALE_RUN' }));
    expect(state.sink.read().run).toBe(next);
    state.sink.enqueue(next!,{ ...pcm(1,80), revision: 1 });
    const newer: ReturnType<PcmQueueSink['begin']>[] = [];
    state.hooks.stop = vi.fn().mockImplementationOnce(() => {
      newer.push(state.sink.begin(2,timeline)); throw new Error('old stop threw after replacement');
    });
    state.sink.flush(); expect(state.sink.read().run).toBe(newer[0]);
    expect(state.nodes[0].disconnected).toBe(true);
  });
  it.each(['snapshot','timestamp','render-time'] as const)('flushes a throwing active%s observation', hook => {
    const state = setup(true), run = state.sink.begin(0,timeline);
    state.sink.enqueue(run,pcm(1,80));
    if (hook === 'render-time') Object.defineProperty(state.context,'currentTime',{ get() { throw new Error(); } });
    else state.hooks[hook] = () => { throw new Error(); };
    expect(() => state.sink.enqueue(run,pcm(2,80))).toThrowError(expect.objectContaining({
      code: hook === 'snapshot' ? 'BLOCKED' : 'CLOCK_FAILED' }));
    expect(state.sink.read().phase).toBe('idle');
    expect(state.nodes[0]).toMatchObject({ stopped: true, disconnected: true });
  });
  it('flushes permission lost during start and deadlines missed during source construction', () => {
    const state = setup(), run = state.sink.begin(0,timeline);
    state.hooks.start = () => state.deny();
    expect(() => state.sink.enqueue(run,pcm(1,80))).toThrowError(expect.objectContaining({ code: 'BLOCKED' }));
    expect(state.sink.read().phase).toBe('idle'); expect(state.nodes[0].stopped).toBe(true);
    const late = setup(), lateRun = late.sink.begin(0,timeline);
    late.hooks.connect = () => { late.clock.currentTime = 1; };
    expect(() => late.sink.enqueue(lateRun,pcm(1,80))).toThrowError(expect.objectContaining({ code: 'AUDIO_FAILED' }));
    expect(late.nodes[0]).toMatchObject({ start: -1, stopped: true, disconnected: true });
  });
  it('validates begin clock/window before replacing sound and keeps final snapshots immutable', () => {
    const state = setup(true), run = state.sink.begin(0,timeline);
    state.sink.enqueue(run,pcm(1,80));
    expect(() => state.sink.begin(1,{ startBeat: 1, endBeat: 1 })).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    state.hooks.timestamp = vi.fn().mockImplementationOnce(() => { throw new Error(); });
    expect(() => state.sink.begin(1,timeline)).toThrowError(expect.objectContaining({ code: 'CLOCK_FAILED' }));
    expect(state.sink.read().run).toBe(run); expect(state.nodes[0].stopped).toBe(false);
    expect(Object.isFrozen(run)).toBe(true); expect(Object.isFrozen(state.sink.read())).toBe(true);
  });

});
