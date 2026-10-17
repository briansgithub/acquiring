import {describe,expect,it} from 'vitest';
import native from './fixtures/native-interval-preview.json';
import {rootIntervalPreviewSteps} from './interval-preview';

describe('native RootIntervalPreview sequence plan',()=>{
  for(const row of native.cases)it(row.label,()=>{
    const {previousAudioNote,currentAudioNote,octaveShiftSemitones,durationMs}=row.input;
    expect(rootIntervalPreviewSteps(previousAudioNote,currentAudioNote,octaveShiftSemitones,durationMs)).toEqual(row.expected);
  });
  it('rejects non-Int browser values and returns fresh deeply frozen plans',()=>{
    for(const value of [NaN,Infinity,1.5,2147483648,-2147483649,'60',null]) {
      for(const index of [0,1,2,3]){const args=[60,67,0,450];args[index]=value as number;
        expect(()=>rootIntervalPreviewSteps(args[0],args[1],args[2],args[3])).toThrow(RangeError);}
    }
    const first=rootIntervalPreviewSteps(60,67,0,450),next=rootIntervalPreviewSteps(60,67,0,450);
    expect(first).not.toBe(next);expect(first).toEqual(next);expect(Object.isFrozen(first)).toBe(true);
    expect(first.every(step=>Object.isFrozen(step)&&Object.isFrozen(step.audioNotes))).toBe(true);
  });
});
