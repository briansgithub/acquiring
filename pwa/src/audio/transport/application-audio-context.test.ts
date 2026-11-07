import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationAudioContext, getApplicationAudioContextOwner } from './index';
import type { ApplicationAudioContextOwner, AudioContextInvalidationReason } from './contracts';

function deferred() {
  let resolve!:()=>void, reject!:(reason?:unknown)=>void;
  const promise = new Promise<void>((yes,no) => { resolve = yes; reject = no; });
  return {promise,resolve,reject};
}
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
class Context extends EventTarget {
  state:AudioContextState = 'suspended';
  sampleRate = 32_000;
  currentTime = 0;
  gates:Array<ReturnType<typeof deferred>> = [];
  resume = vi.fn(() => {
    const gate = this.gates.shift();
    if (gate) return gate.promise;
    this.state = 'running';
    return Promise.resolve();
  });
  close = vi.fn(() => { this.state = 'closed'; return Promise.resolve(); });
  change(state:AudioContextState) { this.state = state; this.dispatchEvent(new Event('statechange')); }
}
class Doc extends EventTarget { hidden = false; focused = true; hasFocus() { return this.focused; } }
class Win extends EventTarget {}

describe('application audio context lifetime', () => {
  const owners:ApplicationAudioContextOwner[] = [];
  let context:Context, doc:Doc, win:Win;
  function setup() {
    const createContext = vi.fn(() => context as unknown as AudioContext);
    const owner = new ApplicationAudioContext({createContext,document:doc as unknown as Document,window:win as unknown as Window});
    owners.push(owner);
    return {owner,createContext};
  }
  beforeEach(() => {
    vi.useFakeTimers(); context = new Context(); doc = new Doc(); win = new Win();
  });
  afterEach(async () => {
    for (const owner of owners.splice(0)) await owner.release();
    vi.useRealTimers();
  });

  it('creates lazily at the actual rate without granting permission, and invokes resume synchronously', async () => {
    const {owner,createContext} = setup();
    expect(owner.getSnapshot()).toEqual({epoch:0,phase:'idle',sampleRate:null,canRender:false});
    expect(createContext).not.toHaveBeenCalled();
    expect(owner.getContext()).toBe(context);
    expect(owner.getContext()).toBe(context);
    expect(createContext).toHaveBeenCalledExactlyOnceWith();
    expect(context.resume).not.toHaveBeenCalled();
    expect(owner.getSnapshot()).toMatchObject({sampleRate:32_000,canRender:false});
    const result = owner.resumeFromGesture();
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(owner.getSnapshot().canRender).toBe(false);
    expect(await result).toBe(context);
    expect(owner.getSnapshot()).toEqual({epoch:0,phase:'ready',sampleRate:32_000,canRender:true});
    expect(Object.isFrozen(owner.getSnapshot())).toBe(true);
    await owner.resumeFromGesture();
    expect(createContext).toHaveBeenCalledTimes(1);
  });

  it('coalesces a bounded pending promise while newest native gesture attempt supersedes stale rejection', async () => {
    const a = deferred(), b = deferred(); context.gates.push(a,b);
    const {owner} = setup();
    const first = owner.resumeFromGesture(), second = owner.resumeFromGesture();
    expect(first).toBe(second);
    expect(context.resume).toHaveBeenCalledTimes(2);
    a.reject(new Error('old native attempt')); await flush();
    expect(owner.getSnapshot().canRender).toBe(false);
    context.state = 'running'; b.resolve();
    await expect(first).resolves.toBe(context);
    expect(owner.getSnapshot().canRender).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('settles a blocked native resume within1500ms and never accepts its later resolution', async () => {
    const gate = deferred(); context.gates.push(gate);
    const {owner} = setup();
    const pending = owner.resumeFromGesture();
    const rejected = expect(pending).rejects.toThrow('invalidated');
    await vi.advanceTimersByTimeAsync(1500); await rejected;
    expect(owner.getSnapshot()).toMatchObject({epoch:1,phase:'blocked',canRender:false});
    expect(vi.getTimerCount()).toBe(0);
    context.change('running'); gate.resolve(); await flush();
    expect(owner.getSnapshot().canRender).toBe(false);
    await owner.resumeFromGesture();
    expect(owner.getSnapshot()).toMatchObject({epoch:1,phase:'ready',canRender:true});
  });

  it.each(['blur','pagehide','hidden'])('invalidates pending permission before %s observers and requires a fresh gesture', async event => {
    const {owner} = setup(); await owner.resumeFromGesture();
    const snapshots:Array<{epoch:number;canRender:boolean;reason:AudioContextInvalidationReason}> = [];
    owner.subscribeInvalidation(reason => {
      const state = owner.getSnapshot();
      snapshots.push({epoch:state.epoch,canRender:state.canRender,reason});
    });
    const gate = deferred(); context.gates.push(gate);
    const pending = owner.resumeFromGesture(), rejected = expect(pending).rejects.toThrow('invalidated');
    if (event === 'hidden') { doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); }
    else win.dispatchEvent(new Event(event));
    await rejected;
    expect(snapshots).toEqual([{epoch:1,canRender:false,reason:'lifecycle'}]);
    if (event === 'hidden') { doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange')); }
    else win.dispatchEvent(new Event(event === 'blur' ? 'focus' : 'pageshow'));
    gate.resolve(); await flush();
    expect(owner.getSnapshot().canRender).toBe(false);
    expect(context.resume).toHaveBeenCalledTimes(2);
    await owner.resumeFromGesture();
    expect(owner.getSnapshot().canRender).toBe(true);
    expect(context.resume).toHaveBeenCalledTimes(3);
  });

  it('rejects initially hidden or unfocused gestures without creating a context', async () => {
    doc.hidden = true;
    const {owner,createContext} = setup();
    await expect(owner.resumeFromGesture()).rejects.toThrow('foreground');
    expect(createContext).not.toHaveBeenCalled();
    doc.hidden = false; win.dispatchEvent(new Event('blur'));
    await expect(owner.resumeFromGesture()).rejects.toThrow('foreground');
    expect(createContext).not.toHaveBeenCalled();
    win.dispatchEvent(new Event('focus'));
    await owner.resumeFromGesture();
    expect(createContext).toHaveBeenCalledTimes(1);
  });

  it('requires both page return and window focus without automatically resuming', async () => {
    const {owner} = setup(); await owner.resumeFromGesture();
    win.dispatchEvent(new Event('blur')); win.dispatchEvent(new Event('pagehide'));
    win.dispatchEvent(new Event('focus'));
    await expect(owner.resumeFromGesture()).rejects.toThrow('foreground');
    win.dispatchEvent(new Event('pageshow'));
    expect(owner.getSnapshot().canRender).toBe(false);
    expect(context.resume).toHaveBeenCalledTimes(1);
    await owner.resumeFromGesture();
    expect(owner.getSnapshot().canRender).toBe(true);
  });

  it('revokes permission on suspension/closure before observers; external resume cannot restore it', async () => {
    const {owner,createContext} = setup(); await owner.resumeFromGesture();
    const observed:string[] = [];
    owner.subscribeInvalidation(reason => observed.push(reason+':'+owner.getSnapshot().canRender));
    context.change('suspended');
    expect(owner.getSnapshot()).toMatchObject({epoch:1,phase:'suspended',canRender:false});
    context.change('running');
    expect(owner.getSnapshot().canRender).toBe(false);
    await owner.resumeFromGesture();
    context.change('closed');
    expect(owner.getSnapshot()).toMatchObject({epoch:2,phase:'closed',canRender:false});
    expect(observed).toEqual(['suspended:false','closed:false']);
    expect(() => owner.getContext()).toThrow('closed');
    await expect(owner.resumeFromGesture()).rejects.toThrow('unavailable');
    expect(createContext).toHaveBeenCalledTimes(1);
  });

  it('revokes a published grant when native state is already non-running before statechange', async () => {
    const {owner} = setup(); await owner.resumeFromGesture();
    const observed:string[] = [];
    owner.subscribeInvalidation(reason => observed.push(reason+':'+owner.getSnapshot().canRender));
    context.state = 'suspended';
    const revoked = owner.getSnapshot();
    expect(revoked).toMatchObject({epoch:1,phase:'suspended',canRender:false});
    expect(owner.getSnapshot()).toBe(revoked);
    expect(observed).toEqual(['suspended:false']);
    context.change('suspended');
    expect(owner.getSnapshot()).toBe(revoked);
    expect(observed).toEqual(['suspended:false']);
    context.change('running');
    expect(owner.getSnapshot().canRender).toBe(false);
    await owner.resumeFromGesture();
    expect(owner.getSnapshot()).toMatchObject({epoch:1,phase:'ready',canRender:true});
  });

  it('contains rejected/thrown/nonrunning native resume and allows a new explicit attempt', async () => {
    const {owner} = setup();
    context.resume.mockRejectedValueOnce(new Error('native denied'));
    await expect(owner.resumeFromGesture()).rejects.toThrow('invalidated');
    expect(owner.getSnapshot()).toMatchObject({phase:'blocked',canRender:false});
    context.resume.mockImplementationOnce(() => { throw new Error('native threw'); });
    await expect(owner.resumeFromGesture()).rejects.toThrow('invalidated');
    context.resume.mockResolvedValueOnce();
    await expect(owner.resumeFromGesture()).rejects.toThrow('invalidated');
    expect(owner.getSnapshot().canRender).toBe(false);
    await owner.resumeFromGesture();
    expect(owner.getSnapshot().canRender).toBe(true);
  });

  it('contains initial factory failure without claiming a context, and never replaces an externally closed context', async () => {
    let attempts = 0;
    const owner = new ApplicationAudioContext({createContext:() => {
      if (++attempts === 1) throw new Error('factory');
      return context as unknown as AudioContext;
    },document:doc as unknown as Document,window:win as unknown as Window});
    owners.push(owner);
    await expect(owner.resumeFromGesture()).rejects.toThrow('factory');
    expect(owner.getSnapshot()).toMatchObject({phase:'blocked',sampleRate:null,canRender:false});
    await owner.resumeFromGesture();
    context.change('closed');
    expect(() => owner.getContext()).toThrow('closed');
    expect(attempts).toBe(2);
  });

  it('latches release before observers, closes once, cleans resources and permanently rejects new work', async () => {
    const {owner,createContext} = setup();
    const removeDoc = vi.spyOn(doc,'removeEventListener'), removeWin = vi.spyOn(win,'removeEventListener');
    const removeContext = vi.spyOn(context,'removeEventListener');
    const gate = deferred(); context.gates.push(gate);
    const pending = owner.resumeFromGesture(), rejected = expect(pending).rejects.toThrow('invalidated');
    let reentrant:Promise<void>|undefined;
    owner.subscribeInvalidation(reason => {
      expect(reason).toBe('released');
      expect(owner.getSnapshot()).toMatchObject({phase:'released',canRender:false,epoch:1});
      reentrant = owner.release();
    });
    const released = owner.release();
    expect(reentrant).toBe(released);
    await rejected; await released;
    expect(owner.release()).toBe(released);
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(removeDoc).toHaveBeenCalledTimes(1);
    expect(removeWin).toHaveBeenCalledTimes(4);
    expect(removeContext).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    gate.resolve(); await flush();
    const snapshot = owner.getSnapshot();
    win.dispatchEvent(new Event('focus')); win.dispatchEvent(new Event('blur'));
    doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
    expect(owner.getSnapshot()).toBe(snapshot);
    expect(() => owner.getContext()).toThrow('released');
    await expect(owner.resumeFromGesture()).rejects.toThrow('unavailable');
    expect(createContext).toHaveBeenCalledTimes(1);
  });

  it('protects notifications from throws and reentrant release supersedes older invalidation delivery', async () => {
    const {owner} = setup(); await owner.resumeFromGesture();
    const reasons:string[] = [];
    owner.subscribeInvalidation(reason => { reasons.push('first:'+reason); if (reason === 'lifecycle') void owner.release(); });
    owner.subscribeInvalidation(reason => { reasons.push('throws:'+reason); throw new Error('observer'); });
    owner.subscribeInvalidation(reason => reasons.push('last:'+reason));
    win.dispatchEvent(new Event('blur'));
    await owner.release();
    expect(reasons).toEqual(['first:lifecycle','first:released','throws:released','last:released']);
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it('does not create on release and contains close rejection/throw while remaining permanent', async () => {
    const {owner,createContext} = setup(); await owner.release();
    expect(createContext).not.toHaveBeenCalled();
    const second = setup().owner; second.getContext();
    context.close.mockRejectedValueOnce(new Error('close denied'));
    await expect(second.release()).resolves.toBeUndefined();
    expect(second.getSnapshot().phase).toBe('released');
    const thirdContext = new Context();
    thirdContext.close.mockImplementationOnce(() => { throw new Error('close threw'); });
    const third = new ApplicationAudioContext({createContext:() => thirdContext as unknown as AudioContext});
    owners.push(third); third.getContext();
    await expect(third.release()).resolves.toBeUndefined();
    expect(thirdContext.close).toHaveBeenCalledTimes(1);
  });


  it('keeps reentrant release terminal when the initial factory returns an already closed context', async () => {
    context.state = 'closed';
    const {owner,createContext} = setup();
    owner.subscribeInvalidation(reason => { if (reason === 'closed') void owner.release(); });
    expect(() => owner.getContext()).toThrow('closed');
    expect(owner.getSnapshot()).toMatchObject({phase:'released',canRender:false});
    await owner.release();
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(context.close).not.toHaveBeenCalled();
  });

  it('exports a stable production singleton without implicitly creating its context', async () => {
    const singleton = getApplicationAudioContextOwner();
    expect(singleton).toBe(getApplicationAudioContextOwner());
    expect(singleton.getSnapshot().sampleRate).toBeNull();
    await singleton.release();
    expect(getApplicationAudioContextOwner()).toBe(singleton);
    expect(() => singleton.getContext()).toThrow('released');
  });
});