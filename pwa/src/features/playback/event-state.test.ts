import {expect,it} from 'vitest';
import type {ExtractedSection,MelodyNote} from '../../contracts';
import {getKeyAtBeat} from '../../domain/data';
import {calculateNamedInterval,resolveScaleDegreePitch,SpelledPitch,type NamedInterval} from '../../domain/music';
import {PlaybackActiveEventIndex,buildMelodyPitchCards,melodyCurrentCardVerticalPosition,melodyPitchCardDisplayMode,showsRootOnlyInterval,showsRootOnlyPrevious} from './event-state';
import native from './fixtures/native-event.json';
const pitch=(value:SpelledPitch|null)=>value?{name:value.displayName,midi:value.toAudioNoteNumber()}:null;
const interval=(value:NamedInterval|null)=>value?{number:value.number,quality:value.quality,direction:value.direction,spokenName:value.spokenName}:null;
for(const row of native.cases)it('matches unchanged native event/card queries: '+row.label,()=>{
  expect(native.authority).toBe('801cf7984171d772afc4406ddb5c79c0cb7fd20a');expect(native.kotlinVersion).toBe('2.2.10');
  const section=row.section as ExtractedSection,melody=row.melody as MelodyNote[],index=new PlaybackActiveEventIndex(section,melody);
  const actual=row.beats.map(beat=>{
    const root=index.chordRootIntervalAtBeat(beat),mi=index.melodyIntervalAtBeat(beat),note=index.melodyNoteAtBeat(beat);
    const current=note&&!note.isRest?resolveScaleDegreePitch(note.sd,note.octave,getKeyAtBeat(section,note.beat)):null;
    const mode=melodyPitchCardDisplayMode(current,mi);
    return {chordIndex:index.chordAtBeat(beat)?._fixtureId??null,melodyNote:note,
      root:root?{previous:pitch(root.previous?.pitch??null),current:pitch(root.current.pitch),previousIntervalPitch:pitch(root.previousIntervalPitch),currentIntervalPitch:pitch(root.currentIntervalPitch),
        previousKey:root.previous?.sourceKey??null,currentKey:root.current.sourceKey,interval:interval(root.interval),previousDegreeLabel:root.previousDegreeLabel,currentDegreeLabel:root.currentDegreeLabel,
        showPrevious:showsRootOnlyPrevious(root.previousIntervalPitch),showInterval:showsRootOnlyInterval(root.previousIntervalPitch,root.currentIntervalPitch,root.interval)}:null,
      melody:mi?{previous:pitch(mi.previous),current:pitch(mi.current),interval:interval(mi.interval),previousDegreeLabel:mi.previousDegreeLabel,currentDegreeLabel:mi.currentDegreeLabel,contentDescription:mi.contentDescription}:null,
      melodyMode:mode,currentVertical:melodyCurrentCardVerticalPosition(mode),cards:mi?buildMelodyPitchCards(mi).map(card=>({...card,pitch:pitch(card.pitch)})):[]};
  });
  expect(actual).toEqual(row.expected);
});
it('bounds raw events/keys and rejects nonfinite queries without partial output',()=>{
  const chord={root:1,type:5,beat:1,duration:2};
  expect(()=>new PlaybackActiveEventIndex({chords:Array(4097).fill(chord)},[])).toThrow('event limit');
  expect(()=>new PlaybackActiveEventIndex({chords:[],metadata:{keys:Array(4097).fill(null)}},[])).toThrow('key limit');
  const index=new PlaybackActiveEventIndex({chords:[chord]},[]);
  for(const beat of [NaN,Infinity,-Infinity])for(const query of [()=>index.chordAtBeat(beat),()=>index.melodyNoteAtBeat(beat),()=>index.chordRootIntervalAtBeat(beat),()=>index.melodyIntervalAtBeat(beat)])expect(query).toThrow('finite');
});
it('reuses sorted timing/key snapshots and keeps source identity without mutating caller arrays',()=>{
  let reads=0;const chord={root:1,type:5,get beat(){reads++;return 1;},duration:4};
  const chords=[{root:5,type:7,beat:3,duration:1},chord],section:ExtractedSection={chords,metadata:{keys:[{tonic:'D',scale:'minor',beat:1}]}};
  const before=chords.slice(),index=new PlaybackActiveEventIndex(section,[]),captured=reads;
  for(let i=0;i<20;i++)expect(index.chordAtBeat(1+i/20)).toBe(chord);
  expect(reads).toBe(captured);expect(chords).toEqual(before);
  section.metadata!.keys=[];expect(index.chordRootIntervalAtBeat(1)?.current.sourceKey).toEqual({tonic:'D',scale:'minor'});
});
it('uses written pitch equality for unison visibility, including enharmonic same-MIDI intervals',()=>{
  const a=SpelledPitch.parse('C',4)!,copy=SpelledPitch.parse('C',4)!,b=SpelledPitch.parse('B#',3)!;
  expect(a.toAudioNoteNumber()).toBe(b.toAudioNoteNumber());
  expect(showsRootOnlyInterval(a,copy,calculateNamedInterval(a,copy))).toBe(false);
  expect(showsRootOnlyInterval(a,b,calculateNamedInterval(a,b))).toBe(true);
  expect(showsRootOnlyPrevious(null)).toBe(false);expect(showsRootOnlyInterval(null,b,null)).toBe(false);
});
