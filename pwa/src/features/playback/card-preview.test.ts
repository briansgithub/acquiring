import {describe,expect,it} from 'vitest';
import {renderStaticSamples,Waveform} from '../../audio/synth';
import {cardIntervalPreviewRequest,renderCardPreview} from './card-preview';
import {renderRootIntervalPreview} from './interval-preview-audio';

describe('immutable card renderer dispatch',()=>{
 for(const sampleRate of [44100,48000])it('distinguishes interval from a simultaneous static pair at '+sampleRate,()=>{
  const request=cardIntervalPreviewRequest({previousAudioNote:62,currentAudioNote:60,transpose:12,waveform:Waveform.SINE});
  expect(Object.isFrozen(request)).toBe(true);expect(Object.isFrozen(request.freqs)).toBe(true);expect(request.cardPreviewKind).toBe('interval');
  const options={...request,sampleRate},actual=renderCardPreview(options)!;
  expect(actual).toEqual(renderRootIntervalPreview(options));expect(actual.length).toBe(Math.trunc(sampleRate*.45)*3);
  const {cardPreviewKind,...staticOptions}=options;expect(cardPreviewKind).toBe('interval');const ordinary=renderCardPreview(staticOptions)!;
  expect(ordinary).toEqual(renderStaticSamples(staticOptions));expect(ordinary.length).toBe(Math.trunc(sampleRate*.45));
 });
 it('keeps unison deduplication and cancellation inside the interval renderer',()=>{
  const request=cardIntervalPreviewRequest({previousAudioNote:60,currentAudioNote:60,transpose:0,waveform:Waveform.SINE});
  expect(renderCardPreview({...request,sampleRate:48000,shouldAbort:()=>true})).toBeNull();
  const pcm=renderCardPreview({...request,sampleRate:48000})!;expect(pcm.slice(0,21600)).toEqual(pcm.slice(43200));
 });
 it('refuses unknown tags rather than playing a different preview',()=>{
  expect(()=>renderCardPreview(Object.assign({freqs:[440],durationMs:450,sampleRate:48000},{cardPreviewKind:'invalid'}))).toThrow(RangeError);
 });
});
