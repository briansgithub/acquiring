import {expect,it,vi} from 'vitest';
import type {ExtractedSection} from '../../contracts';
import {PlaybackIntentKernel,type AudioPlaybackTransport} from '../../audio/transport';
import {PlaybackChordMode,Waveform,type PlaybackConfig} from '../../audio/synth';
import {SectionPlaybackController} from './controller';
const section=(bpm=90,duration=3):ExtractedSection=>({chords:[{root:1,type:5,beat:1,duration}],metadata:{tempos:[{bpm}]}});
function setup(){
  const kernel=new PlaybackIntentKernel(90),listeners=new Set<()=>void>(),configs:PlaybackConfig[]=[];
  const emit=()=>{for(const listener of listeners)listener();};
  const engine={getSnapshot:()=>({...kernel.getSnapshot(),clock:null}),subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},
    load:vi.fn((timeline,resume)=>{kernel.load(timeline,resume);emit();}),playFromGesture:vi.fn(()=>{kernel.play();emit();}),
    pause:vi.fn(()=>{kernel.pause();emit();}),pauseForScrub:vi.fn(()=>{const resume=kernel.pauseForScrub();emit();return resume;}),
    seek:vi.fn((beat,resume)=>{kernel.seek(beat,resume);emit();}),reset:vi.fn(()=>{kernel.reset();emit();}),
    updateConfig:vi.fn((config:PlaybackConfig)=>{configs.push(config);kernel.updateTempo(config.bpm);emit();}),
    isCurrentCompletion:guard=>kernel.isCurrentCompletion(guard),release:vi.fn(()=>{kernel.release();emit();}),
  } satisfies AudioPlaybackTransport;
  const factory=vi.fn((config:PlaybackConfig)=>{configs.push(config);return engine;});
  return {controller:new SectionPlaybackController(section(),factory),engine,factory,kernel,configs,invalidate(){kernel.pauseForLifecycle();emit();},listeners};
}
it('is pure until start, creates one borrowed transport and invokes explicit play synchronously',()=>{
  const s=setup();expect(s.factory).not.toHaveBeenCalled();s.controller.start();s.controller.start();
  expect(s.factory).toHaveBeenCalledTimes(1);expect(s.engine.load).toHaveBeenCalledWith(expect.objectContaining({endBeat:4,completionKey:null}),false);
  expect(s.configs[0]).toMatchObject({bpm:90,waveform:Waveform.CLARINET,melodyGain:.5,chordGain:.5});
  s.controller.play();expect(s.engine.playFromGesture).toHaveBeenCalledTimes(1);expect(s.controller.getSnapshot().transport.playbackRequested).toBe(true);s.controller.dispose();
});
it('keeps requested intent at zero tempo and uses native Float configuration and accepted modes',()=>{
  const s=setup();s.controller.play();s.controller.updateSettings({tempoPercent:0});
  expect(s.controller.getSnapshot().transport).toMatchObject({bpm:0,phase:'paused',playbackRequested:true});
  s.controller.updateSettings({tempoPercent:75,transpose:-12,melodyPercent:30,rootOnly:true,waveform:Waveform.SINE,arpeggioIndex:1});
  expect(s.configs.at(-1)).toMatchObject({bpm:67.5,transpose:-12,chordMode:PlaybackChordMode.ROOT_ONLY,arpeggiateCycles:1/3,melodyGain:Math.fround(.3),chordGain:Math.fround(1-Math.fround(.3))});
  expect(s.controller.getSnapshot().transport.playbackRequested).toBe(true);s.controller.dispose();
});
it('scrubs silently, resumes only prior intent and suppresses late resume after lifecycle revision',()=>{
  const s=setup();s.controller.play();s.controller.beginScrub();s.controller.scrubTo(2.5);
  expect(s.engine.seek).toHaveBeenLastCalledWith(2.5,false);expect(s.controller.getSnapshot().transport.playbackRequested).toBe(false);
  s.controller.finishScrub();expect(s.engine.seek).toHaveBeenLastCalledWith(2.5,true);
  s.controller.beginScrub();s.controller.scrubTo(3);s.invalidate();const calls=s.engine.seek.mock.calls.length;s.controller.finishScrub();
  expect(s.engine.seek).toHaveBeenCalledTimes(calls);expect(s.controller.getSnapshot().transport.playbackRequested).toBe(false);s.controller.dispose();
});
it('keeps paused and exact-end scrubs silent, cancellation never starts audio',()=>{
  const s=setup();s.controller.start();s.controller.scrubTo(999);s.controller.finishScrub();
  expect(s.engine.seek).toHaveBeenLastCalledWith(4,false);s.controller.play();s.controller.scrubTo(2);s.controller.cancelScrub();
  expect(s.engine.seek).toHaveBeenLastCalledWith(2,false);expect(s.controller.getSnapshot().scrubbing).toBe(false);
  s.controller.reset();expect(s.controller.getSnapshot().transport).toMatchObject({beat:1,phase:'stopped',playbackRequested:false});s.controller.dispose();
});
it('replaces section at start with current settings and requested intent using the same transport',()=>{
  const s=setup();s.controller.play();s.controller.updateSettings({tempoPercent:75,rootOnly:true});s.controller.loadSection(section(120,7));
  expect(s.factory).toHaveBeenCalledTimes(1);expect(s.engine.load).toHaveBeenLastCalledWith(expect.objectContaining({endBeat:8}),true);
  expect(s.configs.at(-1)).toMatchObject({bpm:90,chordMode:PlaybackChordMode.ROOT_ONLY});expect(s.controller.getSnapshot().baseBpm).toBe(120);
  expect(s.controller.getSnapshot().transport.beat).toBe(1);s.controller.dispose();
});
it('rejects invalid controls without mutation, isolates observers and permanently releases once',()=>{
  const s=setup();s.controller.start();const before=s.controller.getSnapshot();
  for(const patch of [{tempoPercent:201},{transpose:13},{melodyPercent:NaN},{arpeggioIndex:8},{waveform:'bad' as Waveform}])expect(()=>s.controller.updateSettings(patch)).toThrow();
  expect(s.controller.getSnapshot()).toBe(before);expect(Object.isFrozen(before)).toBe(true);expect(Object.isFrozen(before.settings)).toBe(true);
  s.controller.subscribe(()=>{throw new Error('observer');});s.controller.pause();s.controller.dispose();s.controller.dispose();s.controller.play();
  expect(s.engine.release).toHaveBeenCalledTimes(1);expect(s.listeners.size).toBe(0);expect(s.controller.getSnapshot().transport.phase).toBe('released');
});
