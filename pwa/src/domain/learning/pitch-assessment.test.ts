import {describe,expect,it} from 'vitest';
import native from './fixtures/native-assessment.json';
import {ASSESSMENT_LIMITS,assessAuralPitch,AuralPitchStatus,type AuralPitchFrame} from './pitch-assessment';
const voice=(midi:number|null,start=0,count=12,confidence=.98,isHeld=false):AuralPitchFrame[]=>
  Array.from({length:count},(_,i)=>({timeMs:start+i*40,midi,confidence,isHeld}));
describe('independent frozen native pitch assessments',()=>{
  it('matches every full native status/reason/cents result, including threshold and seeded sequence cases',()=>{
    expect(native.authority).toBe('801cf7984171d772afc4406ddb5c79c0cb7fd20a');expect(native.cases.length).toBeGreaterThan(100);
    for(const c of native.cases){
      const frames=c.frames.map(frame=>({...frame,midi:frame.midi===null?null:Number(frame.midi),confidence:Number(frame.confidence??0)}));
      expect(assessAuralPitch(frames,c.targets,c.options),c.label).toEqual(c.expected);
    }
  });
});
describe('technical uncertainty cannot create musical mistakes',()=>{
  it('does not grade held, missing, short or low-confidence data as incorrect',()=>{
    for(const frames of [[],voice(null),voice(60,0,3),voice(61,0,12,.4),voice(61,0,12,.98,true),voice(NaN),voice(Infinity)]){
      const result=assessAuralPitch(frames,[60]);expect(result.status).toBe(AuralPitchStatus.UNCERTAIN);expect(result.cents).toEqual([]);
    }
  });
  it('preserves original-order device errors including empty text, before filtering negative times',()=>{
    expect(assessAuralPitch([...voice(61),{timeMs:-1,midi:null,error:''}],[60])).toEqual({status:'UNCERTAIN',reason:'',cents:[]});
    expect(assessAuralPitch([{timeMs:900,midi:null,error:'first'},{timeMs:0,midi:null,error:'second'}],[60]).reason).toBe('first');
    expect(assessAuralPitch([{timeMs:0,midi:null,error:'device'}],[0]).reason).toBe('The exercise pitch target is unavailable.');
  });
  it('requires a stable note boundary for repetitions and retains explicit octave/order policies',()=>{
    expect(assessAuralPitch(voice(60,0,30),[60,60]).status).toBe(AuralPitchStatus.UNCERTAIN);
    expect(assessAuralPitch([...voice(60),...voice(null,480,4),...voice(60,640)],[60,60]).status).toBe(AuralPitchStatus.CORRECT);
    expect(assessAuralPitch(voice(72),[60]).status).toBe(AuralPitchStatus.CORRECT);
    expect(assessAuralPitch(voice(72),[60],{octaveEquivalent:false})).toMatchObject({status:'INCORRECT',cents:[1200]});
    expect(assessAuralPitch([...voice(60),...voice(65,480),...voice(67,960)],[48,55,53]).status).toBe(AuralPitchStatus.INCORRECT);
  });
  it('copies sorting/median work and exposes immutable assessments',()=>{
    const frames=Object.freeze(voice(60).reverse().map(frame=>Object.freeze(frame))),before=[...frames];
    const result=assessAuralPitch(frames,Object.freeze([60]));
    expect(result.status).toBe(AuralPitchStatus.CORRECT);expect(frames).toEqual(before);
    expect(Object.isFrozen(result)).toBe(true);expect(Object.isFrozen(result.cents)).toBe(true);
  });
});
describe('bounded browser inputs',()=>{
  it('rejects unsafe sizes/timestamps/settings without producing a learning outcome',()=>{
    expect(()=>assessAuralPitch(Array(ASSESSMENT_LIMITS.frames+1).fill({timeMs:0,midi:null}),[60])).toThrow(RangeError);
    expect(()=>assessAuralPitch([],Array(ASSESSMENT_LIMITS.targets+1).fill(60))).toThrow(RangeError);
    for(const timeMs of [NaN,Infinity,.5,Number.MAX_SAFE_INTEGER+1])expect(()=>assessAuralPitch([{timeMs,midi:60}],[60])).toThrow(RangeError);
    for(const toleranceCents of [NaN,Infinity,-1,12801])expect(()=>assessAuralPitch(voice(60),[60],{toleranceCents})).toThrow(RangeError);
    for(const value of [NaN,Infinity,-1,1.1]){
      expect(()=>assessAuralPitch(voice(60),[60],{minConfidence:value})).toThrow(RangeError);
      expect(()=>assessAuralPitch(voice(60),[60],{minCoverage:value})).toThrow(RangeError);
    }
    for(const minStableMs of [0,.5,NaN,30001])expect(()=>assessAuralPitch(voice(60),[60],{minStableMs})).toThrow(RangeError);
    for(const targets of [[],[0],[128],[60.5],[NaN]])expect(assessAuralPitch(voice(60),targets).status).toBe(AuralPitchStatus.UNCERTAIN);
  });
});
