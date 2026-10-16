import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationAudioContext, getApplicationAudioContextOwner, PreviewOwner, getPreviewOwner } from './index';
import type { ApplicationAudioContextOwner, PreviewOwnerOptions, PreviewReceipt, PreviewRequest } from './contracts';
import type { StaticRenderOptions } from '../synth';

function deferred<T>() {
  let resolve!:(value:T)=>void;
  let reject!:(error?:unknown)=>void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const request = ():PreviewRequest => ({freqs:[440, 660], durationMs:100, gain:0.7});
class FakeParam {
  value = 1;
  events:Array<[string, number, number?]> = [];
  cancelScheduledValues(time:number) { this.events.push(['cancel', time]); return this; }
  setValueAtTime(value:number, time:number) { this.events.push(['set', value, time]); return this; }
  linearRampToValueAtTime(value:number, time:number) { this.events.push(['ramp', value, time]); return this; }
}
class FakeSource {
  buffer:{getChannelData:(channel:number)=>Float32Array}|null = null;
  loop = true;
  onended:(()=>void)|null = null;
  started:number[] = [];
  stopped:number[] = [];
  connected = false;
  constructor(private readonly context:FakeContext) {}
  connect() { this.connected = true; this.context.events.push('source-connect'); }
  disconnect() { this.connected = false; }
  start(time:number) {
    this.context.events.push('start');
    if (this.context.startFailure) throw new Error('start failed');
    this.started.push(time);
  }
  stop(time = 0) { this.stopped.push(time); }
  end() { this.onended?.(); }
}
class FakeGain {
  gain = new FakeParam();
  connected = false;
  connect() { this.connected = true; }
  disconnect() { this.connected = false; }
}
class FakeContext extends EventTarget {
  state:AudioContextState = 'suspended';
  sampleRate = 48_000;
  currentTime = 7;
  destination = {};
  sources:FakeSource[] = [];
  gains:FakeGain[] = [];
  buffers:Float32Array[] = [];
  events:string[] = [];
  resumeGate?:ReturnType<typeof deferred<void>>;
  resumeFailure = false;
  startFailure = false;
  resumeCalls = 0;
  closeCalls = 0;
  resume() {
    this.events.push('resume');
    this.resumeCalls++;
    if (this.resumeFailure) return Promise.reject(new Error('blocked'));
    if (this.resumeGate) return this.resumeGate.promise;
    this.state = 'running';
    return Promise.resolve();
  }
  createBuffer(channels:number, length:number, rate:number) {
    expect(channels).toBe(1);
    expect(rate).toBe(this.sampleRate);
    const data = new Float32Array(length);
    this.buffers.push(data);
    return {getChannelData:() => data};
  }
  createBufferSource() { const source = new FakeSource(this); this.sources.push(source); return source; }
  createGain() { const gain = new FakeGain(); this.gains.push(gain); return gain; }
  close() { this.closeCalls++; this.state = 'closed'; return Promise.resolve(); }
  change(state:AudioContextState) { this.state = state; this.dispatchEvent(new Event('statechange')); }
}
class FakeDocument extends EventTarget { hidden = false; }
class FakeWindow extends EventTarget {}

describe('static preview output owner', () => {
  const owners:PreviewOwner[] = [];
  let context:FakeContext;
  let doc:FakeDocument;
  let win:FakeWindow;
  let receipts:PreviewReceipt[];
  const setup = (render:(options:StaticRenderOptions)=>Int16Array|null|Promise<Int16Array|null> =
    () => new Int16Array([-32768, 0, 32767])) => {
    const createContext = vi.fn(() => context as unknown as AudioContext);
    const owner = new PreviewOwner({createContext, render, onReceipt:receipt => receipts.push(receipt),
      document:doc as unknown as Document, window:win as unknown as Window});
    owners.push(owner);
    return {owner, createContext};
  };
  beforeEach(() => {
    vi.useFakeTimers();
    context = new FakeContext(); doc = new FakeDocument(); win = new FakeWindow(); receipts = [];
  });
  afterEach(async () => {
    for (const owner of owners.splice(0)) await owner.release();
    vi.useRealTimers();
  });

  it('creates lazily, resumes in the gesture stack, snapshots input and reuses the actual-rate context', async () => {
    const options:StaticRenderOptions[] = [];
    const {owner, createContext} = setup(value => { options.push(value); context.events.push('render'); return new Int16Array([1]); });
    expect(createContext).not.toHaveBeenCalled();
    const mutable = {freqs:[440], durationMs:10, gain:0.5};
    const playing = owner.play('one', mutable);
    expect(context.events).toEqual(['resume']);
    mutable.freqs[0] = 880; mutable.durationMs = 99; mutable.gain = 0;
    await playing;
    expect(options[0]).toMatchObject({freqs:[440], durationMs:10, gain:0.5, sampleRate:48_000});
    expect(context.events.indexOf('resume')).toBeLessThan(context.events.indexOf('render'));
    await owner.play('two', request());
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(context.resumeCalls).toBe(2);
    expect(context.sources.every(source => source.started.length === 1 && !source.loop)).toBe(true);
  });

  it('normalizes signed16 PCM asymmetrically without clipping or claiming clock evidence on schedule', async () => {
    const {owner} = setup();
    await owner.play('pcm', request());
    expect(Array.from(context.buffers[0])).toEqual([-1, 0, 32767 / 32768]);
    expect(receipts).toEqual([]);
    expect(owner.getSnapshot()).toMatchObject({phase:'playing', requestId:'pcm'});
  });

  it('requires running-clock progress for started, preserves order at natural end, and records PCM silence', async () => {
    const {owner} = setup(() => new Int16Array([0, 0, 0]));
    await owner.play('silent', request());
    await vi.advanceTimersByTimeAsync(400);
    expect(receipts).toEqual([]);
    context.currentTime += 0.01;
    await vi.advanceTimersByTimeAsync(20);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({kind:'render-started', requestId:'silent', nonSilent:false,
      sampleRate:48_000, frameCount:3, scheduledTime:7, contextTime:7.01});
    context.sources[0].end();
    expect(receipts.map(receipt => receipt.kind)).toEqual(['render-started', 'ended']);
    expect(owner.getSnapshot().phase).toBe('idle');
    expect(context.sources[0].connected).toBe(false);
  });

  it('uses onended clock evidence when a short sound ends before the first poll', async () => {
    const {owner} = setup();
    await owner.play('short', request());
    context.currentTime += 0.002;
    context.sources[0].end();
    expect(receipts.map(receipt => receipt.kind)).toEqual(['render-started', 'ended']);
    expect(receipts[0].nonSilent).toBe(true);
  });

  it('settles replaced work and consumes only the current out-of-order preparation once', async () => {
    const first = deferred<Int16Array|null>(), second = deferred<Int16Array|null>();
    const render = vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    const {owner} = setup(render);
    const a = owner.play('a', request()); await flush();
    const abortA = render.mock.calls[0][0].shouldAbort;
    const b = owner.play('b', request()); await a; await flush();
    expect(abortA()).toBe(true);
    second.resolve(new Int16Array([2])); await b;
    first.resolve(new Int16Array([1])); await flush();
    expect(context.sources).toHaveLength(1);
    expect(context.buffers[0][0]).toBe(2 / 32768);
    context.currentTime += 0.02;
    await vi.advanceTimersByTimeAsync(20);
    expect(receipts.map(receipt => receipt.requestId)).toEqual(['b']);
  });

  it('does not render after a stale asynchronous resume and permits a fresh gesture', async () => {
    const gate = deferred<void>(); context.resumeGate = gate;
    const render = vi.fn(() => new Int16Array([1]));
    const {owner} = setup(render);
    const first = owner.play('old', request());
    owner.stop(); await first;
    context.resumeGate = undefined;
    await owner.play('new', request());
    gate.resolve(); await flush();
    expect(render).toHaveBeenCalledTimes(1);
    expect(context.sources).toHaveLength(1);
    expect(owner.getSnapshot().requestId).toBe('new');
  });

  it('bounds blocked resume and preparation waits and ignores their late results', async () => {
    context.resumeGate = deferred<void>();
    const render = vi.fn<NonNullable<PreviewOwnerOptions['render']>>(() => new Int16Array([1]));
    const {owner} = setup(render);
    const blocked = owner.play('blocked', request());
    await vi.advanceTimersByTimeAsync(1500); await blocked;
    expect(owner.getSnapshot().phase).toBe('blocked');
    context.state = 'running'; context.resumeGate.resolve(); await flush();
    expect(render).not.toHaveBeenCalled();
    context.resumeGate = undefined;
    const never = deferred<Int16Array|null>();
    render.mockImplementation(() => never.promise);
    const preparing = owner.play('slow', request()); await flush();
    await vi.advanceTimersByTimeAsync(5000); await preparing;
    expect(owner.getSnapshot().phase).toBe('error');
    never.resolve(new Int16Array([1])); await flush();
    expect(context.sources).toHaveLength(0);
  });

  it('blocks a resume that resolves suspended and catches rejected resumes', async () => {
    const gate = deferred<void>(); context.resumeGate = gate;
    const {owner} = setup();
    const result = owner.play('suspended', request()); gate.resolve(); await result;
    expect(owner.getSnapshot().phase).toBe('blocked');
    context.resumeGate = undefined; context.resumeFailure = true;
    await owner.play('denied', request());
    expect(owner.getSnapshot().phase).toBe('blocked');
    expect(context.sources).toHaveLength(0);
  });

  it('invalidates before fading for24ms, bounds rapid replacements to two connected sources, suppresses stale events', async () => {
    const {owner} = setup();
    await owner.play('a', request());
    const staleEnded = context.sources[0].onended!;
    await owner.play('b', request());
    expect(context.gains[0].gain.events.slice(-3)).toEqual([
      ['cancel', 7], ['set', 1, 7], ['ramp', 0, 7.024],
    ]);
    expect(context.sources[0].stopped[0]).toBe(7.024);
    expect(context.sources.filter(source => source.connected)).toHaveLength(2);
    await owner.play('c', request());
    expect(context.sources[0].connected).toBe(false);
    expect(context.sources.filter(source => source.connected)).toHaveLength(2);
    context.currentTime += 0.01; staleEnded();
    expect(receipts).toEqual([]);
    expect(owner.getSnapshot().requestId).toBe('c');
    owner.stop();
    expect(context.sources.filter(source => source.connected)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(context.sources.filter(source => source.connected)).toHaveLength(0);
    expect(receipts).toEqual([]);
  });

  it('settles cancelled preparation before retiring sound and ignores late failures', async () => {
    const gate = deferred<Int16Array|null>();
    const {owner} = setup(() => gate.promise);
    let settled = false;
    const result = owner.play('pending', request()).then(() => { settled = true; });
    await flush(); owner.stop(); await result;
    expect(settled).toBe(true);
    gate.reject(new Error('late failure')); await flush();
    expect(owner.getSnapshot().phase).toBe('idle');
    expect(context.sources).toHaveLength(0);
  });

  it.each(['blur', 'pagehide', 'hidden'])('immediately retires on %s and waits for an explicit gesture after returning', async event => {
    const {owner} = setup();
    await owner.play('a', request());
    if (event === 'hidden') { doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); }
    else win.dispatchEvent(new Event(event));
    expect(context.sources[0].connected).toBe(false);
    expect(owner.getSnapshot().phase).toBe('idle');
    doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange'));
    win.dispatchEvent(new Event('focus')); await flush();
    expect(context.resumeCalls).toBe(1);
    await owner.play('b', request());
    expect(context.resumeCalls).toBe(2);
    expect(context.sources).toHaveLength(2);
  });

  it('cancels pending rendering on lifecycle leave and rejects hidden gestures without creating a context', async () => {
    const gate = deferred<Int16Array|null>();
    const {owner, createContext} = setup(() => gate.promise);
    doc.hidden = true;
    await owner.play('hidden', request());
    expect(owner.getSnapshot()).toMatchObject({phase:'blocked', requestId:'hidden'});
    expect(createContext).not.toHaveBeenCalled();
    doc.hidden = false;
    const pending = owner.play('pending', request()); await flush();
    win.dispatchEvent(new Event('blur')); await pending;
    gate.resolve(new Int16Array([1])); await flush();
    expect(context.sources).toHaveLength(0);
  });

  it('handles suspension and closure without stale receipts or automatic resume', async () => {
    const {owner} = setup();
    await owner.play('a', request());
    context.change('suspended');
    expect(owner.getSnapshot().phase).toBe('blocked');
    expect(context.sources[0].connected).toBe(false);
    context.currentTime += 1; await vi.advanceTimersByTimeAsync(20);
    expect(receipts).toEqual([]);
    context.change('running');
    expect(context.resumeCalls).toBe(1);
    await owner.play('b', request());
    context.change('closed');
    expect(owner.getSnapshot().phase).toBe('error');
    await owner.play('closed', request());
    expect(owner.getSnapshot().phase).toBe('error');
    expect(context.sources.filter(source => source.connected)).toHaveLength(0);
  });

  it('settles pending resume immediately on release and permanently removes lifecycle listeners', async () => {
    context.resumeGate = deferred<void>();
    const {owner} = setup();
    const removeDoc = vi.spyOn(doc, 'removeEventListener');
    const removeWindow = vi.spyOn(win, 'removeEventListener');
    const pending = owner.play('a', request());
    const released = owner.release(); await pending; await released;
    expect(owner.release()).toBe(released);
    expect(removeDoc).toHaveBeenCalledTimes(1);
    expect(removeWindow).toHaveBeenCalledTimes(2);
    context.state = 'running'; context.resumeGate.resolve(); await flush();
    await owner.play('never', request());
    owner.stop(); win.dispatchEvent(new Event('blur'));
    expect(owner.getSnapshot().phase).toBe('released');
    expect(context.sources).toHaveLength(0);
    expect(context.closeCalls).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases current and fading nodes immediately and contains throwing observers', async () => {
    const {owner} = setup();
    owner.subscribe(() => { throw new Error('observer'); });
    await owner.play('a', request()); await owner.play('b', request());
    await owner.release();
    expect(context.sources.every(source => !source.connected && source.onended === null && source.buffer === null)).toBe(true);
    expect(context.gains.every(gain => !gain.connected)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('contains render/start failures and supports empty PCM without a source', async () => {
    const {owner} = setup(() => { throw new Error('render failed'); });
    await owner.play('bad', request());
    expect(owner.getSnapshot().phase).toBe('error');
    const empty = setup(() => null).owner;
    await empty.play('empty', request());
    expect(empty.getSnapshot().phase).toBe('idle');
    context.startFailure = true;
    const failStart = setup().owner;
    await failStart.play('start-failure', request());
    expect(failStart.getSnapshot().phase).toBe('error');
    expect(context.sources.every(source => !source.connected)).toBe(true);
  });


  it('contains reentrant cancellation/release observers and never schedules cancelled work', async () => {
    const {owner} = setup();
    owner.subscribe(() => {
      if (owner.getSnapshot().phase === 'preparing') owner.stop();
    });
    await owner.play('cancel-in-observer', request());
    expect(owner.getSnapshot().phase).toBe('idle');
    expect(context.sources).toHaveLength(0);
    let reentrantRelease:Promise<void>|undefined;
    owner.subscribe(() => { if (owner.getSnapshot().phase === 'released') reentrantRelease = owner.release(); });
    const released = owner.release();
    expect(reentrantRelease).toBe(released);
    await released;
    expect(context.closeCalls).toBe(1);
  });


  it('rejects oversized caller frequency arrays before copying or creating a context', async () => {
    const {owner, createContext} = setup();
    const freqs = new Array<number>(33).fill(440);
    const iterator = vi.fn(() => { throw new Error('must never copy'); });
    Object.defineProperty(freqs, Symbol.iterator, {value:iterator});
    await owner.play('too-many', {freqs, durationMs:100});
    expect(iterator).not.toHaveBeenCalled();
    expect(createContext).not.toHaveBeenCalled();
    expect(owner.getSnapshot()).toMatchObject({phase:'error', requestId:'too-many'});
  });

  it('accepts32voices and the exact30second output cap at the actual rate', async () => {
    const {owner} = setup(() => new Int16Array(30 * context.sampleRate));
    await owner.play('at-limit', {freqs:new Array<number>(32).fill(440), durationMs:30_000});
    expect(context.buffers[0]).toHaveLength(30 * context.sampleRate);
  });

  it.each([
    () => new Int16Array(30 * 48_000 + 1),
    () => new Float32Array([1]) as unknown as Int16Array,
    () => undefined as unknown as Int16Array,
  ])('rejects oversized or malformed injected PCM before allocation', async render => {
    const {owner} = setup(render);
    await owner.play('invalid-pcm', request());
    expect(owner.getSnapshot()).toMatchObject({phase:'error', requestId:'invalid-pcm'});
    expect(context.buffers).toHaveLength(0);
    expect(context.sources).toHaveLength(0);
  });

  it('uses the production static renderer and a stable production singleton', async () => {
    const owner = new PreviewOwner({createContext:() => context as unknown as AudioContext,
      document:doc as unknown as Document, window:win as unknown as Window});
    owners.push(owner);
    await owner.play('production-render', request());
    expect(context.buffers[0]).toHaveLength(4800);
    expect(context.buffers[0].some(sample => sample !== 0)).toBe(true);
    expect(getPreviewOwner()).toBe(getPreviewOwner());
    await getPreviewOwner().release();
  });
});

describe('preview borrowers of application audio', () => {
  const previews:PreviewOwner[] = [], applications:ApplicationAudioContextOwner[] = [];
  let context:FakeContext, doc:FakeDocument, win:FakeWindow;
  function shared() {
    const createContext = vi.fn(() => context as unknown as AudioContext);
    const application = new ApplicationAudioContext({createContext,document:doc as unknown as Document,window:win as unknown as Window});
    applications.push(application);
    return {application,createContext};
  }
  function preview(application:ApplicationAudioContextOwner,render:NonNullable<PreviewOwnerOptions['render']> =
    () => new Int16Array([1,2])) {
    const owner = new PreviewOwner({contextOwner:application,render});
    previews.push(owner);
    return owner;
  }
  beforeEach(() => { vi.useFakeTimers(); context = new FakeContext(); doc = new FakeDocument(); win = new FakeWindow(); });
  afterEach(async () => {
    for (const owner of previews.splice(0)) await owner.release();
    for (const application of applications.splice(0)) await application.release();
    vi.unstubAllGlobals(); vi.useRealTimers();
  });

  it('rejects conflicting ownership options before borrowing or creating a context', () => {
    const {application,createContext} = shared();
    expect(() => new PreviewOwner({contextOwner:application,createContext})).toThrow(RangeError);
    expect(createContext).not.toHaveBeenCalled();
    expect(application.getSnapshot().sampleRate).toBeNull();
  });

  it('shares one actual-rate context between independent previews and never closes it on borrower release', async () => {
    const {application,createContext} = shared();
    const a = preview(application), b = preview(application);
    expect(createContext).not.toHaveBeenCalled();
    await a.play('a',request()); await b.play('b',request());
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(application.getSnapshot()).toMatchObject({sampleRate:48_000,canRender:true});
    expect(context.sources.filter(source => source.connected)).toHaveLength(2);
    await a.release();
    expect(context.closeCalls).toBe(0);
    expect(context.sources[0].connected).toBe(false);
    expect(context.sources[1].connected).toBe(true);
    await b.play('still-usable',request());
    expect(context.closeCalls).toBe(0);
    await b.release();
    expect(context.closeCalls).toBe(0);
    expect(application.getSnapshot().canRender).toBe(true);
    await application.release();
    expect(context.closeCalls).toBe(1);
  });

  it('immediately cancels pending render on application blur; returning never resumes stale preparation', async () => {
    const {application} = shared(), gate = deferred<Int16Array|null>();
    const render = vi.fn<NonNullable<PreviewOwnerOptions['render']>>()
      .mockImplementationOnce(() => gate.promise).mockReturnValue(new Int16Array([2]));
    const owner = preview(application,render);
    const pending = owner.play('stale',request()); await flush();
    win.dispatchEvent(new Event('blur')); await pending;
    expect(owner.getSnapshot().phase).toBe('idle');
    expect(application.getSnapshot().canRender).toBe(false);
    win.dispatchEvent(new Event('focus')); gate.resolve(new Int16Array([1])); await flush();
    expect(context.resumeCalls).toBe(1);
    expect(context.sources).toHaveLength(0);
    await owner.play('new-gesture',request());
    expect(context.resumeCalls).toBe(2);
    expect(context.sources).toHaveLength(1);
  });

  it('settles pagehide during shared resume and needs pageshow plus a new explicit gesture', async () => {
    const gate = deferred<void>(); context.resumeGate = gate;
    const {application} = shared(), owner = preview(application);
    const pending = owner.play('old',request());
    expect(context.resumeCalls).toBe(1);
    win.dispatchEvent(new Event('pagehide')); await pending;
    context.state = 'running'; gate.resolve(); await flush();
    expect(context.sources).toHaveLength(0);
    win.dispatchEvent(new Event('pageshow')); win.dispatchEvent(new Event('focus'));
    expect(application.getSnapshot().canRender).toBe(false);
    expect(context.resumeCalls).toBe(1);
    context.resumeGate = undefined;
    await owner.play('new',request());
    expect(context.sources).toHaveLength(1);
    expect(context.resumeCalls).toBe(2);
  });

  it('stops sounding borrowers on suspension/hidden without stale clock receipts and permits a new gesture', async () => {
    const {application} = shared();
    const receipts:PreviewReceipt[] = [];
    const owner = new PreviewOwner({contextOwner:application,render:() => new Int16Array([1]),
      onReceipt:receipt => receipts.push(receipt)});
    previews.push(owner);
    await owner.play('old',request());
    const staleEnded = context.sources[0].onended!;
    context.change('suspended');
    expect(context.sources[0].connected).toBe(false);
    expect(owner.getSnapshot().phase).toBe('blocked');
    context.change('running'); context.currentTime += 1; staleEnded(); await vi.advanceTimersByTimeAsync(20);
    expect(receipts).toEqual([]);
    expect(context.resumeCalls).toBe(1);
    await owner.play('new',request());
    context.currentTime += 0.01; await vi.advanceTimersByTimeAsync(20);
    expect(receipts.map(receipt => receipt.requestId)).toEqual(['new']);
    doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
    expect(context.sources.every(source => !source.connected)).toBe(true);
    expect(owner.getSnapshot().phase).toBe('idle');
    doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange'));
    expect(context.resumeCalls).toBe(2);
  });

  it('releasing a pending borrower leaves the application resume and other borrower usable', async () => {
    const gate = deferred<void>(); context.resumeGate = gate;
    const {application,createContext} = shared(), a = preview(application), b = preview(application);
    const pending = a.play('a',request()); await a.release(); await pending;
    expect(context.closeCalls).toBe(0);
    context.state = 'running'; gate.resolve(); await flush(); context.resumeGate = undefined;
    expect(context.sources).toHaveLength(0);
    await b.play('b',request());
    expect(context.sources).toHaveLength(1);
    expect(createContext).toHaveBeenCalledTimes(1);
  });

  it('application release permanently retires pending/current/fading borrowers and closes only once', async () => {
    const {application} = shared(), a = preview(application), b = preview(application);
    await a.play('a',request()); await a.play('replacement',request());
    const gate = deferred<Int16Array|null>();
    const c = preview(application,() => gate.promise), pending = c.play('pending',request()); await flush();
    await b.play('b',request());
    const released = application.release(); await pending; await released;
    expect(context.sources.every(source => !source.connected && source.onended === null)).toBe(true);
    expect([a,b,c].map(owner => owner.getSnapshot().phase)).toEqual(['released','released','released']);
    gate.resolve(new Int16Array([1])); await flush();
    await a.play('never',request()); await b.release();
    expect(context.closeCalls).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });


  it('isolated close rejection keeps release permanent and resolves void', async () => {
    const owner = new PreviewOwner({createContext:() => context as unknown as AudioContext,
      render:() => new Int16Array([1]),document:doc as unknown as Document,window:win as unknown as Window});
    previews.push(owner);
    await owner.play('isolated',request());
    const close = vi.spyOn(context,'close').mockRejectedValueOnce(new Error('close denied'));
    await expect(owner.release()).resolves.toBeUndefined();
    await owner.play('never',request());
    expect(owner.getSnapshot().phase).toBe('released');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('default previews borrow the production singleton and releasing them retains its context', async () => {
    const createContext = vi.fn(function () { return context; });
    vi.stubGlobal('AudioContext',createContext);
    const application = getApplicationAudioContextOwner();
    applications.push(application);
    const a = new PreviewOwner({render:() => new Int16Array([1])});
    const b = new PreviewOwner({render:() => new Int16Array([2])});
    previews.push(a,b);
    await a.play('default-a',request()); await b.play('default-b',request());
    expect(createContext).toHaveBeenCalledTimes(1);
    await a.release(); await b.release();
    expect(context.closeCalls).toBe(0);
    expect(application.getSnapshot()).toMatchObject({canRender:true,sampleRate:48_000});
    await application.release();
    expect(context.closeCalls).toBe(1);
    expect(getApplicationAudioContextOwner()).toBe(application);
  });
});