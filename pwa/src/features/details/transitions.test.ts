import {expect,it} from 'vitest';
import type {ExtractedSection} from '../../contracts';
import native from './fixtures/native-transitions.json';
import {chordTransitions,transitionIdentity} from './transitions';
it('matches32 independent native cases/78 ranked rows including source order,rest filtering,root mode and Double ties',()=>{
  expect(native.authority).toBe('801cf7984171d772afc4406ddb5c79c0cb7fd20a');expect(native.cases).toHaveLength(32);
  for(const fixture of native.cases){
    const section=fixture.section as unknown as ExtractedSection,before=JSON.stringify(section);
    const actual=chordTransitions(section,fixture.rootOnly).map(row=>({...row,firstBeat:Number.isFinite(row.firstBeat)?row.firstBeat:String(row.firstBeat)}));
    expect(actual,fixture.label+'/'+fixture.rootOnly).toEqual(fixture.expected);expect(JSON.stringify(section)).toBe(before);
  }
});
it('retains native first representative references and target-zero normalization without mutating inputs',()=>{
  const chords=[{root:1,beat:9},{root:5,beat:0},{root:1,beat:5},{root:5,beat:-3}];
  const result=chordTransitions({chords},false);
  expect(result[0]).toMatchObject({id:'I → V',count:2,firstBeat:1});
  expect(result[0].from).toBe(chords[0]);expect(result[0].to).toBe(chords[1]);
  expect(chords[1].beat).toBe(0);expect(Object.isFrozen(result)).toBe(true);expect(Object.isFrozen(result[0])).toBe(true);
});
it('uses raw native Int root identity and rejects excessive section work before traversal',()=>{
  expect(transitionIdentity({root:'4'}, {tonic:'C',scale:'major'},true)).toBe('4');
  expect(transitionIdentity({root:'4.0'}, {tonic:'C',scale:'major'},true)).toBe('0');
  const chords=new Array(4097);Object.defineProperty(chords,0,{get(){throw new Error('must not traverse');}});
  expect(()=>chordTransitions({chords},false)).toThrow('browser limit');
});
