import { describe, expect, it } from 'vitest';
import { PlaybackIntentKernel } from './playback-intent';
import type { PlaybackIntentGuard } from './intent-contracts';

const window={ startBeat:1,endBeat:4,completionKey:'entry' };
function guard(kernel: PlaybackIntentKernel): PlaybackIntentGuard {
  const state=kernel.getSnapshot();
  return { transportRevision:state.transportRevision, completionKey:state.window?.completionKey ?? null };
}
function ready() {
  const kernel=new PlaybackIntentKernel(60); kernel.load(window,true);
  return kernel;
}
describe('pure native transport intent', () => {
  it('starts inert and freezes independent snapshots/window/completion receipts', () => {
    const kernel=new PlaybackIntentKernel(-1), initial=kernel.getSnapshot();
    expect(initial).toMatchObject({ phase:'stopped',transportRevision:0,bpm:0,beat:1,window:null,playbackRequested:false });
    const input={...window}; kernel.load(input,true); input.endBeat=8;
    expect(kernel.getSnapshot()).toMatchObject({ phase:'stopped',bpm:0,playbackRequested:true,window:{endBeat:4} });
    expect(Object.isFrozen(initial)).toBe(true); expect(Object.isFrozen(kernel.getSnapshot().window)).toBe(true);
    expect(initial.window).toBeNull();
  });
  it('matches native329/347: requested intent and scrub return precede asynchronous phase', () => {
    const kernel=new PlaybackIntentKernel(60);
    kernel.load(window,false); expect(kernel.pauseForScrub()).toBe(false);
    kernel.seek(2,false); kernel.play(); expect(kernel.getSnapshot().playbackRequested).toBe(true);
    kernel.load(window,kernel.getSnapshot().playbackRequested);
    expect(kernel.getSnapshot()).toMatchObject({ playbackRequested:true,beat:1 });
    expect(kernel.pauseForScrub()).toBe(true); expect(kernel.pauseForScrub()).toBe(false);
    kernel.load(window,kernel.getSnapshot().playbackRequested);
    expect(kernel.getSnapshot()).toMatchObject({ playbackRequested:false,phase:'stopped',transportRevision:8 });
  });
  it('matches native305/372: lifecycle cancels resume while keeping silent scrub/end target', () => {
    const kernel=ready(), old=guard(kernel);
    kernel.seek(2.25,true); kernel.pauseForLifecycle();
    expect(kernel.getSnapshot()).toMatchObject({ phase:'paused',beat:2.25,playbackRequested:false });
    expect(kernel.observePlayed(old,3)).toBe(false);
    kernel.seek(4,false); const paused=kernel.getSnapshot();
    expect(paused).toMatchObject({ phase:'paused',beat:4,renderEnded:false });
    expect(kernel.observePlayed(guard(kernel),1)).toBe(false); expect(kernel.getSnapshot()).toBe(paused);
    kernel.play(); expect(kernel.getSnapshot()).toMatchObject({ beat:1,playbackRequested:true,phase:'buffering' });
  });
  it('keeps compatible play beat/phase and reconciles a queued finished discovery only once', () => {
    const kernel=ready(); kernel.observePlayed(guard(kernel),2);
    kernel.play(); const current=guard(kernel);
    expect(kernel.getSnapshot()).toMatchObject({ phase:'playing',beat:2,transportRevision:2 });
    expect(kernel.observeRenderEnded(current)).toBe(false);
    expect(kernel.observeFinalDrained(current,4)).toBe(false);
    expect(kernel.observePlayReady(current,true)).toBe(true);
    expect(kernel.getSnapshot()).toMatchObject({ beat:1,transportRevision:2,renderEnded:false });
    expect(kernel.observePlayReady(current,true)).toBe(false);
    kernel.observePlayed(current,2.5); kernel.play();
    expect(kernel.observePlayReady(guard(kernel),false)).toBe(true);
    expect(kernel.getSnapshot().beat).toBe(2.5);
    kernel.pause(); expect(kernel.observePlayReady(current,true)).toBe(false);
  });
  it('matches native142/250: rendered end never moves played head or completes before final drain', () => {
    const kernel=ready(), current=guard(kernel);
    expect(kernel.observePlayed(current,1)).toBe(true);
    expect(kernel.observeRenderEnded(current)).toBe(true);
    expect(kernel.getSnapshot()).toMatchObject({ phase:'playing',beat:1,renderEnded:true,completion:null,playbackRequested:true });
    expect(kernel.observeFinalDrained(current,3.5)).toBe(false);
    expect(kernel.observeFinalDrained(current,4)).toBe(true);
    const completed=kernel.getSnapshot();
    expect(completed).toMatchObject({ phase:'completed',beat:4,playbackRequested:false,completion:current });
    expect(Object.isFrozen(completed.completion)).toBe(true);
    expect(kernel.isCurrentCompletion(completed.completion!)).toBe(true);
    expect(kernel.observeFinalDrained(current,4)).toBe(false);
    expect(kernel.observeRenderEnded(current)).toBe(false); expect(kernel.getSnapshot()).toBe(completed);
    kernel.pause(); expect(kernel.isCurrentCompletion(current)).toBe(false);
  });
  it('accepts final proof ordering independently and restarts known finished/completed play', () => {
    const kernel=ready(), current=guard(kernel);
    expect(kernel.observeFinalDrained(current,4)).toBe(true); expect(kernel.getSnapshot().phase).toBe('playing');
    expect(kernel.observeRenderEnded(current)).toBe(true); expect(kernel.getSnapshot().phase).toBe('completed');
    kernel.play(); expect(kernel.getSnapshot()).toMatchObject({ beat:1,phase:'buffering',completion:null,renderEnded:false });
    kernel.observePlayReady(guard(kernel),false); kernel.observeRenderEnded(guard(kernel));
    kernel.play(); expect(kernel.getSnapshot().beat).toBe(1);
  });
  it('never completes loops and does not restart a paused loop-end seek', () => {
    const kernel=new PlaybackIntentKernel(60); kernel.load({endBeat:4},true);
    const current=guard(kernel);
    expect(kernel.observeRenderEnded(current)).toBe(false); expect(kernel.observeFinalDrained(current,4)).toBe(false);
    kernel.seek(4,false); kernel.play(); expect(kernel.getSnapshot().beat).toBe(4);
    kernel.reset(); expect(kernel.getSnapshot()).toMatchObject({ beat:1,phase:'stopped',playbackRequested:false });
  });
  it('updates zero/positive tempo without a command revision or requested change', () => {
    const kernel=ready(), current=guard(kernel);
    kernel.observePlayed(current,2); kernel.observeRenderEnded(current);
    kernel.updateTempo(0);
    expect(kernel.getSnapshot()).toMatchObject({ transportRevision:1,bpm:0,beat:2,phase:'paused',playbackRequested:true,renderEnded:false });
    expect(kernel.observePlayed(current,3)).toBe(false); expect(kernel.observeFinalDrained(current,4)).toBe(false);
    kernel.updateTempo(90);
    expect(kernel.getSnapshot()).toMatchObject({ transportRevision:1,bpm:90,phase:'buffering',playbackRequested:true });
    kernel.observePlayed(current,2.5); kernel.updateTempo(80); expect(kernel.getSnapshot().phase).toBe('playing');
    kernel.observeRenderEnded(current); kernel.observeFinalDrained(current,4); kernel.updateTempo(0);
    expect(kernel.getSnapshot().phase).toBe('completed'); expect(kernel.isCurrentCompletion(current)).toBe(true);
  });
  it('rejects stale revisions/keys and errors without overwriting a newer target', () => {
    const kernel=ready(), old=guard(kernel); kernel.seek(3,false);
    const state=kernel.getSnapshot();
    expect(kernel.observePlayed(old,2)).toBe(false); expect(kernel.observeError(old,'old')).toBe(false);
    expect(kernel.observeRenderEnded({...guard(kernel),completionKey:'other'})).toBe(false);
    expect(kernel.getSnapshot()).toBe(state);
    expect(kernel.observeError(guard(kernel),'current')).toBe(true);
    expect(kernel.getSnapshot()).toMatchObject({ phase:'error',playbackRequested:false,error:'current',completion:null });
    kernel.updateTempo(0); expect(kernel.getSnapshot().phase).toBe('error');
    kernel.reset(); expect(kernel.getSnapshot()).toMatchObject({ phase:'stopped',error:null,beat:1 });
  });
  it('validates domains transactionally, clamps seek and bounds raw targets when unloaded', () => {
    const kernel=ready(), state=kernel.getSnapshot();
    for (const bpm of [NaN,Infinity,1001]) expect(() => kernel.updateTempo(bpm)).toThrow(RangeError);
    for (const input of [{endBeat:1},{endBeat:Infinity},{endBeat:1000001},{...window,completionKey:'x'.repeat(513)}])
      expect(() => kernel.load(input,true)).toThrow(RangeError);
    expect(() => kernel.seek(NaN,true)).toThrow(RangeError);
    expect(() => kernel.load(window,'true' as unknown as boolean)).toThrow(RangeError);
    expect(() => kernel.observePlayed(guard(kernel),5)).toThrow(RangeError);
    expect(() => kernel.observeError(guard(kernel),'x'.repeat(1025))).toThrow(RangeError);
    expect(() => kernel.observeRenderEnded({transportRevision:Number.MAX_SAFE_INTEGER+1,completionKey:'entry'})).toThrow(RangeError);
    expect(kernel.getSnapshot()).toBe(state);
    kernel.seek(-100,true); expect(kernel.getSnapshot().beat).toBe(1);
    kernel.seek(100,false); expect(kernel.getSnapshot().beat).toBe(4);
    const empty=new PlaybackIntentKernel(60); empty.seek(-10,false); expect(empty.getSnapshot().beat).toBe(-10);
    expect(() => empty.seek(-1000001,false)).toThrow(RangeError);
  });
  it('reads known window/guard getters once and preserves nested newer commands', () => {
    const kernel=ready(), counts: Record<string,number>={};
    const input=Object.fromEntries(Object.entries(window).map(([name,value]) => [name,value]));
    for (const [name,value] of Object.entries(window)) Object.defineProperty(input,name,{get() {counts[name]=(counts[name]??0)+1; return value;}});
    kernel.load(input as unknown as typeof window,true); expect(Object.values(counts)).toEqual([1,1,1]);
    const current=guard(kernel), guardReads: Record<string,number>={};
    const observed={} as PlaybackIntentGuard;
    for (const [name,value] of Object.entries(current)) Object.defineProperty(observed,name,{get() {guardReads[name]=(guardReads[name]??0)+1; return value;}});
    expect(kernel.observePlayed(observed,2)).toBe(true); expect(Object.values(guardReads)).toEqual([1,1]);
    const nested={...window,get endBeat() {kernel.seek(3,false); return 4;}};
    expect(() => kernel.load(nested,true)).toThrow(Error); expect(kernel.getSnapshot()).toMatchObject({beat:3,phase:'paused'});
    const stale={...guard(kernel),get completionKey() {kernel.reset(); return 'entry';}};
    expect(kernel.observeError(stale,'outer')).toBe(false); expect(kernel.getSnapshot().phase).toBe('stopped');
  });
  it('releases permanently even during snapshot and ignores all later observations', () => {
    const kernel=ready();
    const input={...window,get endBeat() {kernel.release();return 4;}};
    expect(() => kernel.load(input,true)).toThrow(Error);
    const released=kernel.getSnapshot(); kernel.release();
    expect(kernel.observePlayed(guard(kernel),2)).toBe(false); expect(kernel.observePlayReady(guard(kernel),true)).toBe(false);
    expect(kernel.observeRenderEnded(guard(kernel))).toBe(false); expect(kernel.observeFinalDrained(guard(kernel),4)).toBe(false);
    expect(kernel.observeError(guard(kernel),'late')).toBe(false); expect(kernel.isCurrentCompletion(guard(kernel))).toBe(false);
    expect(() => kernel.play()).toThrow(Error); expect(() => kernel.updateTempo(60)).toThrow(Error);
    expect(kernel.getSnapshot()).toBe(released);
  });
});
