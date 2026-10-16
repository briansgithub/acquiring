import {describe,expect,it} from 'vitest';
import type {JsonObject,JsonValue} from '../../contracts';
import {interpret,resolveChordRoot} from './index';
import {nativeBooleanOrNull} from './native-json';
import native from './fixtures/native-flags.json';

describe('native nullable JSON booleans',()=>{
  it('matches112 independent native flag cases across all chord result channels',()=>{
    expect(native.authority).toBe('801cf7984171d772afc4406ddb5c79c0cb7fd20a');
    expect(native.cases).toHaveLength(112);
    for(const row of native.cases){
      const chord=row.chord as unknown as JsonObject, key={tonic:'C',scale:'major'};
      const before=JSON.stringify(chord),result=interpret(chord,key);
      expect({...result,pcs:[...new Set(result.midi.map(n=>((n%12)+12)%12))].sort((a,b)=>a-b),
        parsed:nativeBooleanOrNull(row.value),simpleRoot:resolveChordRoot(chord,key)?.simpleModePitch.toAudioNoteNumber() ?? null},row.label).toEqual(row.expected);
      expect(JSON.stringify(chord)).toBe(before);
    }
  });
  it('distinguishes false from unknown without truthiness, whitespace or container coercion',()=>{
    expect(nativeBooleanOrNull('FaLsE')).toBe(false);
    for(const invalid of [undefined,null,1,0,' true','false ','yes',[],{}] as (JsonValue|undefined)[]){
      expect(nativeBooleanOrNull(invalid)).toBeNull();
    }
  });
});
