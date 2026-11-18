import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';
import {Waveform} from './instruments';
import {PlaybackAudioLayer,PlaybackChordMode,PlaybackPcmRenderer,type PlaybackConfig,type PlaybackTimeline,type PlaybackTimelineEvent} from './playback-pcm';
import {PlaybackRootDegreeCue,SpokenRootDegreeClips,softLimitPlaybackSample,type SpokenChordSuffix} from './spoken-cues';
import native from './fixtures/native-cue-stream.json';

/** Native NativeFixtureRandom LCG (same as native-samples.json). */
function lcg(){let state=0x12345678;return ()=>{state=(1664525*state+1013904223)%4294967296;return state/4294967296;};}

function loadClips():SpokenRootDegreeClips {
  const directory=resolve('..',native.clipsDirectory),resources=new Map<string,Int16Array>();
  for(const name of readdirSync(directory)){
    if(!name.endsWith('.pcm'))continue;
    const raw=readFileSync(resolve(directory,name)),clip=new Int16Array(raw.length/2);
    for(let i=0;i<clip.length;i++)clip[i]=raw.readInt16LE(i*2);
    resources.set(name.slice(0,-4),clip);
  }
  return SpokenRootDegreeClips.fromResources(resources);
}

/** Mirror of cue-driver.kt.txt cueTimeline. */
function cueTimeline(completionKey:string|null,offset=0):PlaybackTimeline {
  const chord=(id:number,start:number,end:number,notes:number[],degree:number,alteration:number,suffix:SpokenChordSuffix|null,
    fifthsKey:number,fifthsMajor:number,scale:string,tonic:number,relative={degree,alteration}):PlaybackTimelineEvent=>({
    id,startBeat:start+offset,endBeat:end+offset,layer:PlaybackAudioLayer.CHORD,fullMidiNotes:notes,rootMidiNote:notes[0],
    rootDegree:degree,rootDegreeAlteration:alteration,fullChordRootMidiNote:notes[0]!+12,spokenChordSuffix:suffix,
    relativeMajorRootDegree:relative,fifthsFromKeyTonic:fifthsKey,fifthsFromMajorTonic:fifthsMajor,keyScale:scale,keyTonicMidi:tonic});
  const melody=(id:number,start:number,end:number,note:number,cue:string|null):PlaybackTimelineEvent=>({
    id,startBeat:start+offset,endBeat:end+offset,layer:PlaybackAudioLayer.MELODY,fullMidiNotes:[note],spokenMelodyCue:cue,melodyCueMidi:note});
  return {startBeat:1+offset,endBeat:10+offset,completionKey,events:[
    chord(1,1,3,[48,52,55],1,0,null,0,0,'major',48),
    melody(2,1,2,64,'third'),
    chord(3,3,5,[53,57,60],4,0,null,1,1,'major',48),
    melody(4,3,3.5,62,'passing'),
    chord(5,5,7,[55,59,62,65],5,0,'SEVEN',1,1,'major',48),
    chord(6,7,9,[58,62,65],7,-1,null,2,3,'mixolydian',48,{degree:4,alteration:0}),
    melody(7,7,8,65,'root'),
    chord(8,9,10,[45,48,52],6,0,'MIN',3,0,'minor',45,{degree:1,alteration:0}),
  ]};
}

const sha256=(samples:Int16Array)=>createHash('sha256').update(Buffer.from(samples.buffer,samples.byteOffset,samples.byteLength)).digest('hex');

describe('native cue rendering parity (Android 3c887223: N06 pulses, N07 speech, N11 splice)',()=>{
  const clips=loadClips();
  expect(native.authority).toBe('3c887223b2d06b4c3a1010d0f8a23ceaf8977d08');

  it('soft limiter is identity below 0.85 and saturates symmetrically above it',()=>{
    expect(softLimitPlaybackSample(0.5)).toBe(0.5);
    expect(softLimitPlaybackSample(-0.85)).toBe(-0.85);
    const loud=softLimitPlaybackSample(1.6);
    expect(loud).toBeGreaterThan(softLimitPlaybackSample(1));
    expect(loud).toBeLessThan(1);
    expect(softLimitPlaybackSample(-1.6)).toBe(-loud);
  });

  for(const scenario of native.cases){
    it(`${scenario.cue}/${scenario.mode}/${scenario.waveform}/${scenario.sampleRate}`,()=>{
      const cue=scenario.cue as PlaybackRootDegreeCue,loud=cue===PlaybackRootDegreeCue.OFF;
      let config:PlaybackConfig={bpm:240,transpose:0,waveform:scenario.waveform as Waveform,chordMode:scenario.mode as PlaybackChordMode,
        melodyGain:loud?1:0.6,chordGain:loud?1:0.4,arpeggiateCycles:0,rootDegreeCue:cue,useRelativeIonianContext:false,voiceVolume:0.5};
      const renderer=new PlaybackPcmRenderer(cueTimeline(null),config,scenario.sampleRate,lcg(),clips);
      const beatFrames=Math.trunc(scenario.sampleRate*60/240);
      const blocks=scenario.blocks;let index=0;
      const capture=(action:string,frames:number)=>{
        const expected=blocks[index++]!,samples=new Int16Array(frames),block=renderer.renderInto(samples);
        const label=`${scenario.cue}/${scenario.sampleRate}/${action}`;
        expect(expected.action,label).toBe(action);
        expect(block.startBeat,label).toBe(expected.startBeat);
        expect(renderer.currentBeat,label).toBe(expected.currentBeat);
        expect(block.startedEvents.map(event=>[event.id,event.frameOffset]),label).toEqual(expected.startedEvents);
        expect(sha256(samples),label).toBe(expected.sha256);
      };
      capture('open',beatFrames*3);
      config={...config,transpose:2,voiceVolume:1};renderer.updateConfig(config);
      capture('transpose_voice',beatFrames*2);
      renderer.seek(6.25,true);
      capture('seek',beatFrames);
      config={...config,useRelativeIonianContext:true,bpm:180};renderer.updateConfig(config);
      capture('lock_tempo',beatFrames*4);
      capture('wrap',beatFrames*2);
    },60_000);
  }

  it('Song mode splices queued sections inside the block and rotates the queue',()=>{
    const splicer=new PlaybackPcmRenderer(cueTimeline('song'),{bpm:240,transpose:0,waveform:Waveform.CLARINET,chordMode:PlaybackChordMode.FULL,
      melodyGain:0.6,chordGain:0.4,arpeggiateCycles:0,rootDegreeCue:PlaybackRootDegreeCue.SPOKEN_NUMBER,useRelativeIonianContext:false,voiceVolume:0.7},
      24_000,lcg(),clips);
    splicer.setContinuation([{timeline:cueTimeline('song',20),bpm:300,performanceId:'second'},{timeline:cueTimeline('song'),bpm:240,performanceId:'first'}]);
    splicer.seek(9.5);
    for(const expected of native.splice.blocks){
      const samples=new Int16Array(6000),block=splicer.renderInto(samples);
      expect(block.startBeat).toBe(expected.startBeat);
      expect(splicer.currentBeat).toBe(expected.currentBeat);
      expect(splicer.finished).toBe(expected.finished);
      expect(splicer.consumeSplices().map(({frame,beat,beatsPerFrame,loopStart,loopEnd,performanceId})=>
        ({frame,beat,beatsPerFrame,loopStart,loopEnd,performanceId}))).toEqual(expected.splices);
      expect(sha256(samples)).toBe(expected.sha256);
    }
  },60_000);
});
