import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlaybackAudioLayer, PlaybackChordMode, Waveform } from '../synth';
import { PcmWorkerClient } from './pcm-worker-client';
import { PcmWorkerSession } from './pcm-worker-session';
import { PlaybackWorkerError } from './worker-contracts';
import type { PlaybackWorkerPort, PlaybackWorkerRequest, PlaybackWorkerOperation } from './worker-contracts';

class FakePort implements PlaybackWorkerPort {
  onmessage: PlaybackWorkerPort['onmessage'] = null;
  onerror: PlaybackWorkerPort['onerror'] = null;
  onmessageerror: PlaybackWorkerPort['onmessageerror'] = null;
  posted: PlaybackWorkerRequest[] = [];
  terminated = 0;
  session = new PcmWorkerSession();
  postMessage(request: PlaybackWorkerRequest) { this.posted.push(request); }
  terminate() { this.terminated++; }
  reply(data: unknown = this.session.handle(this.posted[this.posted.length - 1])) { this.onmessage?.({ data } as MessageEvent); }
}
function load(): Extract<PlaybackWorkerOperation, { kind: 'load' }> {
  return { kind: 'load', sampleRate: 1000, config: { bpm: 60, transpose: 0, waveform: Waveform.SINE,
    chordMode: PlaybackChordMode.FULL, melodyGain: 1, chordGain: 1 }, timeline: { endBeat: 2, events: [
      { id: 1, startBeat: 1, endBeat: 2, layer: PlaybackAudioLayer.MELODY, fullMidiNotes: [60] }] } };
}
function setup() { const port = new FakePort(); return { port, client: new PcmWorkerClient({ createWorker: () => port }) }; }
async function loaded() { const state = setup(); const promise = state.client.execute(load(), 2); state.port.reply(); await promise; return state; }
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('single-command PCM client', () => {
  it('keeps first identity1 after a factory aborts before any post', async () => {
    const port = new FakePort(), abort = new AbortController();
    const client = new PcmWorkerClient({ createWorker: () => { abort.abort(); return port; } });
    await expect(client.execute(load(), 0, { signal: abort.signal })).rejects.toMatchObject({ code: 'ABORTED', fatal: false });
    expect(port.posted).toHaveLength(0); expect(port.terminated).toBe(0);
    const pending = client.execute(load(), 0);
    expect(port.posted[0].requestId).toBe(1);
    port.reply();
    expect(await pending).toMatchObject({ ok: true, kind: 'ack', requestId: 1 });
    client.release();
  });
  it('rejects release during caller snapshot without creating an unresolved command', async () => {
    const factory = vi.fn(() => new FakePort());
    const client = new PcmWorkerClient({ createWorker: factory });
    const operation = load();
    Object.defineProperty(operation, 'config', { get() { client.release(); return load().config; } });
    await expect(client.execute(operation, 0)).rejects.toMatchObject({ code: 'RELEASED', fatal: true });
    expect(factory).not.toHaveBeenCalled();
    await expect(client.execute(load(), 0)).rejects.toMatchObject({ code: 'RELEASED' });
  });
  it('retains a nested snapshot command and rejects the outer command BUSY', async () => {
    const { client, port } = setup();
    let nested: Promise<unknown> | undefined;
    const operation = load();
    Object.defineProperty(operation, 'config', { get() {
      nested ??= client.execute(load(), 0);
      return load().config;
    } });
    await expect(client.execute(operation, 0)).rejects.toMatchObject({ code: 'BUSY', fatal: false });
    expect(port.posted).toHaveLength(1); expect(port.posted[0].requestId).toBe(1);
    port.reply(); expect(await nested).toMatchObject({ ok: true, kind: 'ack', requestId: 1 });
    const pending = client.execute({ kind: 'render', frameCount: 1 }, 0);
    expect(port.posted[1].requestId).toBe(2);
    port.reply(); await pending; client.release();
  });

  it('uses one lazy worker, snapshots arrays/config before posting and rejects BUSY without queue', async () => {
    const port = new FakePort(), factory = vi.fn(() => port);
    const client = new PcmWorkerClient({ createWorker: factory });
    expect(factory).not.toHaveBeenCalled();
    const operation = load();
    const promise = client.execute(operation, 2);
    (operation.timeline.events[0].fullMidiNotes as number[])[0] = 90;
    (operation.config as { bpm: number }).bpm = 900;
    expect(port.posted[0].operation).toMatchObject({ config: { bpm: 60 }, timeline: { events: [{ fullMidiNotes: [60] }] } });
    await expect(client.execute(load(), 2)).rejects.toMatchObject({ code: 'BUSY', requestId: null, fatal: false });
    expect(port.posted).toHaveLength(1);
    port.reply(); expect(await promise).toMatchObject({ kind: 'ack', requestId: 1, revision: 2 });
    const pcm = client.execute({ kind: 'render', frameCount: 257 }, 2);
    port.reply(); expect(await pcm).toMatchObject({ kind: 'pcm', requestId: 2, pcm: expect.any(Int16Array) });
    expect(factory).toHaveBeenCalledTimes(1); client.release();
  });
  it('rejects invalid/no-load/stale/preaborted commands without posting', async () => {
    const { client, port } = setup();
    await expect(client.execute({ kind: 'render', frameCount: 1 }, 0)).rejects.toMatchObject({ code: 'NOT_LOADED' });
    const aborted = new AbortController(); aborted.abort();
    await expect(client.execute(load(), 0, { signal: aborted.signal })).rejects.toMatchObject({ code: 'ABORTED', fatal: false });
    await expect(client.execute({ kind: 'render', frameCount: 4097 }, 0)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(client.execute(load(), -1)).rejects.toBeInstanceOf(PlaybackWorkerError);
    expect(port.posted).toHaveLength(0);
    const pending = client.execute(load(), 2); port.reply(); await pending;
    await expect(client.execute({ kind: 'render', frameCount: 1 }, 3)).rejects.toMatchObject({ code: 'STALE_REVISION' });
    await expect(client.execute({ kind: 'seek', beat: 1 }, 1)).rejects.toMatchObject({ code: 'STALE_REVISION' });
    expect(port.posted).toHaveLength(1); client.release();
  });
  it('aborting a posted command permanently terminates and ignores late replies', async () => {
    const { client, port } = await loaded();
    const abort = new AbortController();
    const pending = client.execute({ kind: 'render', frameCount: 4096 }, 2, { signal: abort.signal });
    const oldHandler = port.onmessage;
    abort.abort();
    await expect(pending).rejects.toMatchObject({ code: 'ABORTED', fatal: true, requestId: 2, revision: 2 });
    oldHandler?.({ data: port.session.handle(port.posted[1]) } as MessageEvent);
    await expect(client.execute(load(), 3)).rejects.toMatchObject({ code: 'RELEASED' });
    client.release(); expect(port.terminated).toBe(1);
    expect(port.onmessage).toBeNull();
  });
  it('bounds frozen-worker waiting at5000ms and clears its timer on successful replies', async () => {
    vi.useFakeTimers();
    const { client, port } = await loaded();
    expect(vi.getTimerCount()).toBe(0);
    const pending = client.execute({ kind: 'render', frameCount: 1 }, 2);
    const rejected = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT', fatal: true });
    vi.advanceTimersByTime(4999); expect(port.terminated).toBe(0);
    vi.advanceTimersByTime(1); await rejected;
    expect(port.terminated).toBe(1); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['error','messageerror','post'] as const)('permanently handles uncertain%s failure', async kind => {
    const { client, port } = await loaded();
    if (kind === 'post') vi.spyOn(port, 'postMessage').mockImplementationOnce(() => { throw new Error(); });
    const pending = client.execute({ kind: 'render', frameCount: 1 }, 2);
    if (kind === 'error') port.onerror?.({} as ErrorEvent);
    if (kind === 'messageerror') port.onmessageerror?.({} as MessageEvent);
    await expect(pending).rejects.toMatchObject({ code: 'WORKER_FAILED', fatal: true });
    expect(port.terminated).toBe(1);
    await expect(client.execute(load(), 3)).rejects.toMatchObject({ code: 'RELEASED' });
  });
  it.each(['identity','kind','length','backing','position','failure'] as const)('terminates malformed%s response', async kind => {
    const { client, port } = await loaded();
    const pending = client.execute({ kind: 'render', frameCount: 1 }, 2);
    let data: unknown = { version: 1, requestId: 2, revision: 2, ok: true, kind: 'pcm', startBeat: 1,
      position: { sampleRate: 1000, beat: 1, beatsPerFrame: .001, finished: false }, pcm: new Int16Array(1) };
    const mutable = data as Record<string, unknown>;
    if (kind === 'identity') mutable.requestId = 1;
    if (kind === 'kind') mutable.kind = 'ack';
    if (kind === 'length') mutable.pcm = new Int16Array(2);
    if (kind === 'backing') mutable.pcm = new Int16Array(new ArrayBuffer(4), 0, 1);
    if (kind === 'position') mutable.position = { sampleRate: 48000, beat: 1, beatsPerFrame: .001, finished: false };
    if (kind === 'failure') data = { version: 1, requestId: 2, revision: 2, ok: false, error: { code: 'invented', message: 'bad', fatal: false } };
    port.reply(data);
    await expect(pending).rejects.toMatchObject({ code: 'PROTOCOL', fatal: true }); expect(port.terminated).toBe(1);
  });
  it('rejects nonfatal preflight failures without applying their revision; fatal failures release', async () => {
    const { client, port } = await loaded();
    const operation = load();
    const pending = client.execute(operation, 3);
    port.reply({ version: 1, requestId: 2, revision: 3, ok: false, error: { code: 'INVALID_INPUT', message: 'resource bound', fatal: false } });
    await expect(pending).rejects.toMatchObject({ code: 'INVALID_INPUT', fatal: false });
    expect(port.terminated).toBe(0);
    const render = client.execute({ kind: 'render', frameCount: 1 }, 2);
    port.reply({ version: 1, requestId: 3, revision: 2, ok: false, error: { code: 'WORKER_FAILED', message: 'uncertain', fatal: true } });
    await expect(render).rejects.toMatchObject({ code: 'WORKER_FAILED', fatal: true }); expect(port.terminated).toBe(1);
  });
  it('release is permanent, idempotent and safe during worker-factory reentrancy', async () => {
    const port = new FakePort(); let client: PcmWorkerClient;
    client = new PcmWorkerClient({ createWorker: () => { client.release(); return port; } });
    await expect(client.execute(load(), 0)).rejects.toMatchObject({ code: 'RELEASED', fatal: true });
    expect(port.posted).toHaveLength(0); expect(port.terminated).toBe(1); client.release();
    const state = await loaded();
    const pending = state.client.execute({ kind: 'render', frameCount: 1 }, 2);
    state.client.release(); state.client.release();
    await expect(pending).rejects.toMatchObject({ code: 'RELEASED', requestId: 2 });
    expect(state.port.terminated).toBe(1);
  });
  it('cleans the abort listener after success and snapshots response metadata', async () => {
    const { client, port } = await loaded();
    const abort = new AbortController(), remove = vi.spyOn(abort.signal, 'removeEventListener');
    const pending = client.execute({ kind: 'render', frameCount: 1 }, 2, { signal: abort.signal });
    const result = port.session.handle(port.posted[1]);
    port.reply(result); const response = await pending;
    expect(Object.isFrozen(response.position)).toBe(true);
    expect(remove).toHaveBeenCalledTimes(1);
    abort.abort(); expect(port.terminated).toBe(0); client.release();
  });
});
