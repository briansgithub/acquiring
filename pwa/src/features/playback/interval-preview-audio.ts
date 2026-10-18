import {DEFAULT_WAVEFORM,MAX_PLUCK_DELAY_SAMPLES,MAX_STATIC_DELAY_SAMPLES,Waveform,
  instrumentMetadata,renderStaticSamples,staticPlaybackSampleCount} from '../../audio/synth';
import type {RootIntervalAudioApi} from './interval-audio-contracts';
import {rootIntervalPreviewSteps} from './interval-preview';

/** Private two-frequency protocol: use only with renderRootIntervalPreview. */
export const rootIntervalPreviewRequest:RootIntervalAudioApi['rootIntervalPreviewRequest'] = input => {
  const {previousAudioNote,currentAudioNote,transpose,waveform}=input;
  if(!Number.isInteger(transpose)||transpose< -12||transpose>12)throw new RangeError('Transpose must be an integer from -12 through 12');
  instrumentMetadata(waveform);
  const steps=rootIntervalPreviewSteps(previousAudioNote,currentAudioNote,transpose,450);
  const frequency=(note:number):number=>{
    const hz=440*2**((note-69)/12);
    if(!Number.isFinite(hz)||hz<=0)throw new RangeError('Written pitch must produce a finite positive frequency');
    return hz;
  };
  const freqs=Object.freeze([frequency(steps[0].audioNotes[0]),frequency(steps[1].audioNotes[0])] as const);
  return Object.freeze({freqs,durationMs:450,arpeggiate:false,waveform});
};

/** Concatenate unchanged native static blocks; no clock, owner, timer or partial output. */
export const renderRootIntervalPreview:RootIntervalAudioApi['renderRootIntervalPreview'] = options => {
  const {freqs,durationMs,sampleRate,arpeggiate,stepMs,waveform=DEFAULT_WAVEFORM,gain=1,
    shouldAbort=()=>false,random=Math.random}=options;
  if(!Array.isArray(freqs))throw new RangeError('Interval frequencies must be a pair');
  const length=freqs.length;
  if(length!==2)throw new RangeError('Interval frequencies must contain exactly two entries');
  // Bounded indexed reads ignore caller iterators and never retain a mutable array.
  const pair=[freqs[0],freqs[1]] as const;
  if(durationMs!==450||arpeggiate!==false||(stepMs!==undefined&&stepMs!==80))throw new RangeError('Interval protocol requires 450ms blocks, no arpeggio and the default step');
  const frames=staticPlaybackSampleCount(450,false,2,80,sampleRate);
  instrumentMetadata(waveform);
  if(!Number.isFinite(gain))throw new RangeError('Gain must be finite');
  if(typeof shouldAbort!=='function'||typeof random!=='function')throw new TypeError('Interval callbacks must be functions');
  let totalDelay=0;
  for(const hz of pair){
    if(!Number.isFinite(hz)||hz<=0||hz>sampleRate)throw new RangeError('Frequency must be positive and no greater than output rate');
    if(waveform===Waveform.STRINGS){
      const delay=Math.max(2,Math.trunc(sampleRate/hz));
      if(delay>MAX_PLUCK_DELAY_SAMPLES)throw new RangeError('Plucked-string delay limit exceeded');
      totalDelay+=delay;
    }
  }
  if(totalDelay>MAX_STATIC_DELAY_SAMPLES)throw new RangeError('Total plucked-string delay limit exceeded');
  if(shouldAbort())return null;
  // Reuse the accepted plan on pair indices; equal frequencies represent written unison.
  const steps=rootIntervalPreviewSteps(0,pair[0]===pair[1]?0:1,0,450);
  const blocks:Int16Array[]=[];
  for(const step of steps){
    if(shouldAbort())return null;
    const pcm=renderStaticSamples({freqs:step.audioNotes.map(index=>pair[index]),durationMs:step.durationMs,
      sampleRate,arpeggiate:false,stepMs:80,waveform,gain,shouldAbort,random});
    if(pcm===null)return null;
    blocks.push(pcm);
  }
  if(shouldAbort())return null;
  const result=new Int16Array(frames*steps.length);
  let offset=0;
  for(const block of blocks){result.set(block,offset);offset+=block.length;}
  return shouldAbort()?null:result;
};
