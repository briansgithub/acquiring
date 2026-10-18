import {describe,expect,it,vi} from 'vitest';
import {Waveform,renderStaticSamples,staticPlaybackSampleCount} from '../../audio/synth';
import type {StaticRenderOptions} from '../../audio/synth';
import type {RootIntervalAudioApi,RootIntervalAudioInput} from './interval-audio-contracts';
import {rootIntervalPreviewRequest,renderRootIntervalPreview as render} from './interval-preview-audio';

const hz=(midi:number)=>440*2**((midi-69)/12);
const input=(patch:Partial<RootIntervalAudioInput>={})=>({previousAudioNote:60,currentAudioNote:67,transpose:0,waveform:Waveform.CLARINET,...patch});
const options=(patch:Partial<StaticRenderOptions>={}):StaticRenderOptions=>({...rootIntervalPreviewRequest(input()),sampleRate:44100,...patch});
function seeded(){let state=123456789;return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}
function reference(o:StaticRenderOptions):{pcm:Int16Array;blocks:Int16Array[]}{
 const [a,b]=o.freqs,notes=[[a],[b],a===b?[a]:[a,b]];
 const blocks=notes.map(freqs=>renderStaticSamples({...o,freqs,shouldAbort:()=>false})!);
 const pcm=new Int16Array(blocks.reduce((n,b)=>n+b.length,0));let offset=0;
 for(const block of blocks){pcm.set(block,offset);offset+=block.length;}return {pcm,blocks};
}

describe('pure root interval request',()=>{
 it('agrees with frozen API and keeps raw registers, transpose once and immutable unison pair',()=>{
  const api:RootIntervalAudioApi={rootIntervalPreviewRequest,renderRootIntervalPreview:render};
  const r=api.rootIntervalPreviewRequest(input({previousAudioNote:60,currentAudioNote:72,transpose:12}));
  expect(r).toEqual({freqs:[hz(72),hz(84)],durationMs:450,arpeggiate:false,waveform:Waveform.CLARINET});
  expect(Object.isFrozen(r)).toBe(true);expect(Object.isFrozen(r.freqs)).toBe(true);
  expect(rootIntervalPreviewRequest(input({currentAudioNote:60})).freqs).toEqual([hz(60),hz(60)]);
  expect(rootIntervalPreviewRequest(input({transpose:-12})).freqs).toEqual([hz(48),hz(55)]);
 });
 it('refuses actual adjacent-pitch frequency collapse but retains same-note boundary unison',()=>{
  const a=hz(-12830),b=hz(-12829);
  expect(Number.isFinite(a)).toBe(true);expect(a).toBeGreaterThan(0);expect(a).toBe(b);
  expect(()=>rootIntervalPreviewRequest(input({previousAudioNote:-12830,currentAudioNote:-12829}))).toThrow(RangeError);
  expect(rootIntervalPreviewRequest(input({previousAudioNote:-12830,currentAudioNote:-12830})).freqs).toEqual([a,a]);
 });
 it('reads each of four known getters once and never enumerates unknown properties',()=>{
  const counts:Record<string,number>={},values=input(),source={} as RootIntervalAudioInput;
  for(const key of Object.keys(values) as (keyof RootIntervalAudioInput)[])Object.defineProperty(source,key,{get(){counts[key]=(counts[key]??0)+1;return values[key];}});
  Object.defineProperty(source,'extra',{enumerable:true,get(){throw new Error('unknown');}});
  const r=rootIntervalPreviewRequest(source);values.previousAudioNote=48;
  expect(r.freqs[0]).toBe(hz(60));expect(counts).toEqual({previousAudioNote:1,currentAudioNote:1,transpose:1,waveform:1});
 });
 it('rejects invalid Int/preset/transpose and nonpositive or infinite wrapped-note frequencies',()=>{
  const patches=[{previousAudioNote:1.5},{currentAudioNote:NaN},{previousAudioNote:2147483648},{transpose:13},{transpose:-13},{transpose:0.5},{waveform:'bad'},
   {previousAudioNote:2147483647,transpose:1},{currentAudioNote:-2147483648,transpose:-1},{previousAudioNote:-20000},{currentAudioNote:20000}];
  for(const patch of patches)expect(()=>rootIntervalPreviewRequest(input(patch as Partial<RootIntervalAudioInput>))).toThrow(RangeError);
 });
});

describe('one complete previous/current/both PCM buffer',()=>{
 for(const sampleRate of [44100,48000])for(const waveform of [Waveform.CLARINET,Waveform.STRINGS])it(`matches exact static PCM and offsets at ${sampleRate}Hz/${waveform}`,()=>{
  const o=options({sampleRate,waveform,gain:0.37,random:seeded()}),actual=render(o)!;
  const expected=reference({...o,random:seeded()}),frames=sampleRate===44100?19845:21600;
  expect(actual.length).toBe(sampleRate===44100?59535:64800);expect(actual).toEqual(expected.pcm);
  for(let stage=0;stage<3;stage++){expect(expected.blocks[stage].length).toBe(frames);expect(actual.slice(stage*frames,(stage+1)*frames)).toEqual(expected.blocks[stage]);expect(expected.blocks[stage].some(n=>n!==0)).toBe(true);}
 });
 it('deduplicates written unison only in the third block and retains octave voices',()=>{
  for(const pair of [[hz(60),hz(60)],[hz(60),hz(72)]]){
   const o=options({freqs:pair,sampleRate:8000,waveform:Waveform.SINE}),actual=render(o)!,frames=3600;
   expect(actual).toEqual(reference(o).pcm);
   const expectedBoth=renderStaticSamples({...o,freqs:pair[0]===pair[1]?[pair[0]]:pair})!;
   expect(actual.slice(frames*2)).toEqual(expectedBoth);
  }
 });
 it('snapshots known options and bounded indexed pair once, ignores iterators and later mutation',()=>{
  const values:Record<string,unknown>={...options({waveform:Waveform.STRINGS,gain:0.37})},counts:Record<string,number>={},reads=[0,0],frequencies=[hz(60),hz(67)],pair:number[]=[];
  pair.length=2;for(let i=0;i<2;i++)Object.defineProperty(pair,i,{get(){reads[i]++;return frequencies[i];}});
  Object.defineProperty(pair,Symbol.iterator,{value(){throw new Error('iterator must be ignored');}});
  values.freqs=pair;const rng=seeded();values.random=()=>{frequencies[0]=1;values.gain=0;values.waveform=Waveform.SINE;return rng();};
  const source={} as StaticRenderOptions;
  for(const key of ['freqs','durationMs','sampleRate','arpeggiate','stepMs','waveform','gain','shouldAbort','random'])Object.defineProperty(source,key,{get(){counts[key]=(counts[key]??0)+1;return values[key];}});
  Object.defineProperty(source,'extra',{enumerable:true,get(){throw new Error('unknown');}});
  const actual=render(source)!;
  expect(actual).toEqual(reference(options({waveform:Waveform.STRINGS,gain:0.37,random:seeded()})).pcm);
  expect(reads).toEqual([1,1]);expect(Object.values(counts)).toEqual(Array(9).fill(1));
 });
 it('preserves static gain rounding/clamping and default preset without altering DSP',()=>{
  for(const gain of [-1,0.3700000001,2]){const o=options({sampleRate:8000,gain});expect(render(o)).toEqual(reference(o).pcm);}
  const o=options({sampleRate:8000,waveform:undefined});expect(render(o)).toEqual(reference(o).pcm);
 });
 it('validates the entire protocol before random/audio work and ignores overlong-array iterators',()=>{
  const random=vi.fn(()=>0.5),base=options({waveform:Waveform.STRINGS,random});
  const bad:Record<string,unknown>[]=[{freqs:null},{freqs:[]},{freqs:[440]},{freqs:[440,550,660]},{durationMs:449},{arpeggiate:true},{arpeggiate:undefined},{stepMs:81},
   {sampleRate:7999},{sampleRate:384001},{sampleRate:44100.5},{sampleRate:NaN},{waveform:'bad'},{gain:Infinity},{shouldAbort:1},{random:1},
   {freqs:[440,0]},{freqs:[440,-1]},{freqs:[440,Infinity]},{freqs:[440,44101]},{freqs:[440,1e-20]}];
  for(const patch of bad)expect(()=>render({...base,...patch} as StaticRenderOptions)).toThrow();
  expect(random).not.toHaveBeenCalled();
  const large=Array(1000000);Object.defineProperty(large,Symbol.iterator,{value(){throw new Error('iterator');}});
  expect(()=>render({...base,freqs:large})).toThrow(RangeError);expect(random).not.toHaveBeenCalled();
 });
 it('retains accepted rate/frequency and exact per-string delay boundaries',()=>{
  for(const sampleRate of [8000,384000]){
   const o=options({sampleRate,waveform:Waveform.STRINGS,freqs:[sampleRate/65536,sampleRate],random:()=>0.5});
   expect(render(o)!.length).toBe(3*staticPlaybackSampleCount(450,false,2,80,sampleRate));
   expect(()=>render({...o,freqs:[sampleRate/65537,sampleRate]})).toThrow(RangeError);
  }
  expect(render(options({sampleRate:8001,freqs:[8001,4000],waveform:Waveform.SINE}))!.length).toBe(10800);
 });
 it('cancels before work, inside a stage, between stages, before concatenation and before return',()=>{
  const o=options({sampleRate:8000,waveform:Waveform.SINE});let polls=0;
  expect(render({...o,shouldAbort:()=>{polls++;return false;}})).not.toBeNull();
  // At8000Hz each accepted static block polls twice; outer stage/allocation/return polls remain observable.
  for(const abortAt of [1,4,5,8,polls-1,polls]){let calls=0;expect(render({...o,shouldAbort:()=>++calls===abortAt})).toBeNull();expect(calls).toBe(abortAt);}
  const random=vi.fn(()=>0.5);expect(render({...o,waveform:Waveform.STRINGS,random,shouldAbort:()=>true})).toBeNull();expect(random).not.toHaveBeenCalled();
  expect(()=>render({...o,shouldAbort:()=>{throw new Error('cancel failed');}})).toThrow('cancel failed');
 });
});
