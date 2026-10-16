import {describe,expect,it} from 'vitest';
import type {ExtractedSection,MelodyNote} from '../../contracts';
import {STREAM_LIMITS,type PlaybackTimeline} from '../synth';
import {buildPlaybackTimeline} from './timeline-builder';
import native from './fixtures/native-timeline.json';

function freeze<T>(value:T):T {
  if (value!==null && typeof value==='object' && !Object.isFrozen(value)) {
    for(const child of Object.values(value))freeze(child);
    Object.freeze(value);
  }
  return value;
}
interface NativeCase {label:string;section:ExtractedSection;melody:MelodyNote[];endBeat:number;expected:PlaybackTimeline}

describe('frozen native section-to-playback timeline',()=>{
  it('matches every complete native timeline without mutating source payloads',()=>{
    expect(native.authority).toBe('801cf7984171d772afc4406ddb5c79c0cb7fd20a');
    expect(native.builderSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(native.cases.length).toBe(22);
    for(const row of native.cases as unknown as NativeCase[]){
      freeze(row.section);freeze(row.melody);
      const before=JSON.stringify([row.section,row.melody]);
      const result=buildPlaybackTimeline(row.section,row.melody,row.endBeat);
      expect(result,row.label).toEqual(row.expected);
      expect(JSON.stringify([row.section,row.melody]),row.label+' input mutation').toBe(before);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.events)).toBe(true);
      for(const event of result.events)expect(Object.isFrozen(event.fullMidiNotes)).toBe(true);
    }
  });

  it('uses written simple-mode root independently of sounding inversion and keeps melody before a tied chord',()=>{
    const result=buildPlaybackTimeline({chords:[{root:1,type:5,inversion:1}]},
      [{sd:'1',beat:1,duration:1,octave:0,isRest:false}],4);
    expect(result.events).toEqual([
      {id:1,startBeat:1,endBeat:2,layer:'MELODY',fullMidiNotes:[60],rootMidiNote:null},
      {id:2,startBeat:1,endBeat:2,layer:'CHORD',fullMidiNotes:[52,55,60],rootMidiNote:48},
    ]);
    expect(result.completionKey).toBeNull();
  });

  it('uses original melody key lookup but normalized zero chord beat and snapshots generated notes',()=>{
    const section:ExtractedSection={chords:[{root:1,type:5,beat:0}],metadata:{keys:[
      {tonic:'C',scale:'major',beat:0},{tonic:'D',scale:'major',beat:1}]}};
    const melody=[{sd:'1',beat:0,duration:2,octave:0,isRest:false}];
    const result=buildPlaybackTimeline(section,melody,4);
    expect(result.events[0]).toMatchObject({startBeat:1,fullMidiNotes:[60]});
    expect(result.events[1]).toMatchObject({startBeat:1,rootMidiNote:50});
    section.chords[0].root=5;melody[0].sd='7';
    expect(result.events[0].fullMidiNotes).toEqual([60]);
    expect(result.events[1].rootMidiNote).toBe(50);
  });

  it('rejects unusable end/resource domains before invoking unbounded theory work',()=>{
    for(const end of [0,1,NaN,Infinity,STREAM_LIMITS.absoluteBeat+1]){
      expect(()=>buildPlaybackTimeline({chords:[]},[],end)).toThrow(RangeError);
    }
    expect(()=>buildPlaybackTimeline({chords:Array(STREAM_LIMITS.events+1).fill({})},[],4)).toThrow(RangeError);
    expect(()=>buildPlaybackTimeline({chords:[],metadata:{keys:Array(STREAM_LIMITS.events+1).fill({})}},[],4)).toThrow(RangeError);
    expect(()=>buildPlaybackTimeline({chords:[]},[{sd:'1',beat:1,duration:1,octave:.5,isRest:false}],4)).toThrow(RangeError);
  });
});
