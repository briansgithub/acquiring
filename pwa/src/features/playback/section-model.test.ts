import {expect,it} from 'vitest';
import type {ExtractedSection} from '../../contracts';
import fixture from './fixtures/native-section.json';
import {preparePlaybackSection} from './section-model';

it('matches independent frozen native melody, exact audible end and Float base tempo',()=>{
  expect(fixture.authority).toBe('801cf7984171d772afc4406ddb5c79c0cb7fd20a');
  for(const row of fixture.cases){
    const model=preparePlaybackSection(row.section as ExtractedSection);
    expect({melody:model.melody,endBeat:model.timeline.endBeat,baseBpm:model.baseBpm},row.label).toEqual(row.expected);
    expect(model.timeline.completionKey).toBeNull();
  }
});
it('snapshots timeline/melody and rejects browser resource/tempo limits without audio',()=>{
  const section:ExtractedSection={chords:[{root:1,type:5,beat:1,duration:2}],notes:[{sd:'1',beat:1,duration:1}]};
  const model=preparePlaybackSection(section);section.chords[0].duration=10;
  expect(model.timeline.endBeat).toBe(3);expect(Object.isFrozen(model)).toBe(true);
  expect(Object.isFrozen(model.melody)).toBe(true);expect(Object.isFrozen(model.melody[0])).toBe(true);
  expect(Object.isFrozen(model.timeline)).toBe(true);
  expect(()=>preparePlaybackSection({chords:[],notes:Array.from({length:4097},()=>null)})).toThrow('event limit');
  expect(()=>preparePlaybackSection({chords:[],metadata:{tempos:[{bpm:'NaN'}]}})).toThrow('tempo');
  expect(()=>preparePlaybackSection({chords:[],metadata:{endBeat:1000001}})).toThrow('timeline limit');
});
