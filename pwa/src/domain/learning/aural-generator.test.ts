import {describe,expect,it} from 'vitest';
import native from './fixtures/native-generator.json';
import {createAuralBuiltinTarget as target,generateAuralBuiltinExercise as generate,auralBuiltinGeneratorApi} from './aural-generator';
import {beginAuralExercise,createAuralProgress} from './aural-evidence';
import {Waveform} from '../../audio/synth/instruments';
import type {AuralBuiltinExercise,AuralBuiltinTarget,AuralBuiltinGeneratorApi} from './generator-contracts';
type Options=Parameters<typeof target>[2];
interface Row {label:string;seed:string;target:{familyId:string;skillId:string}&NonNullable<Options>;expected:AuralBuiltinExercise}
const rows=native.cases as unknown as readonly Row[];
const fromRow=(row:Row)=>{const {familyId,skillId,...options}=row.target;return target(familyId,skillId,options);};
function frozen(value:unknown):boolean {return value===null||typeof value!=='object'||(Object.isFrozen(value)&&Object.values(value).every(frozen));}
describe('builtin generator native32',()=>{
 for(const row of rows) it(row.label,()=>{const value=generate(fromRow(row),row.seed);expect(value).toEqual(row.expected);expect(frozen(value)).toBe(true);});
 it('reconstructs exact signedLong provenance with independent nested snapshots',()=>{
  for(const row of rows){const a=generate(fromRow(row),row.seed),b=generate(a.provenance.target,a.provenance.seed);
   expect(b).toEqual(a);expect(b.events).not.toBe(a.events);expect(b.events[0].notes).not.toBe(a.events[0].notes);
   expect(b.fullDegrees).not.toBe(a.fullDegrees);expect(b.provenance.target).not.toBe(a.provenance.target);expect(a.seed).toBe(row.seed);}
 });
 it('keeps choices/gaps/resource bounds and cleans provenance intent',()=>{
  expect(new Set(rows.map(r=>r.expected.familyId)).size).toBe(6);expect(new Set(rows.map(r=>r.expected.skillId)).size).toBe(7);
  for(const row of rows){const e=generate(fromRow(row),row.seed);expect(e.events.length).toBeGreaterThanOrEqual(2);expect(e.events.length).toBeLessThanOrEqual(4);
   expect(e.context.length).toBeLessThanOrEqual(4);expect(e.options.length).toBeLessThanOrEqual(4);expect(e.provenance.target.reason).toBe('');
   expect(e.provenance.target.transfer).toBe(e.support===0&&!!row.target.transfer);
   expect([e.provenance.corpus,e.provenance.exampleSettings,e.provenance.fallbackReason]).toEqual([null,null,null]);
   if(e.responseType==='choice'){expect(e.options.filter(o=>o.id===e.answer.optionId)).toHaveLength(1);
    expect(new Set(e.options.map(o=>o.degrees.join('|'))).size).toBe(e.options.length);expect(e.options.every(o=>o.degrees.length===e.fullDegrees.length)).toBe(true);expect(e.prompt).not.toContain(' → ');}
   if(e.gapIndex!==null){expect(e.answer.degrees).toEqual([e.fullDegrees[e.gapIndex]]);expect(e.referenceRequired).toBe(true);}
  }
 });
});
describe('builtin boundary and purity',()=>{
 it('applies native defaults through the typed frozen API',()=>{
  const api:AuralBuiltinGeneratorApi=auralBuiltinGeneratorApi;expect(Object.isFrozen(api)).toBe(true);
  const t=target('dominant-return','guided');expect(t).toEqual({familyId:'dominant-return',skillId:'guided',support:2,transfer:false,reason:'',microphoneKind:null,variantId:null,instrumentOverride:null,octaveShift:0,pattern:null});
  expect(frozen(t)).toBe(true);expect(api.generateAuralBuiltinExercise(t,'0')).toEqual(rows[0].expected);
 });
 it('rejects invalid targets/seeds and bounds reason text',()=>{
  const t=target('dominant-return','guided');expect(()=>target('missing','guided')).toThrow();expect(()=>target(t.familyId,'missing')).toThrow();
  for(const patch of [{support:-1},{support:3},{support:1.5},{transfer:1},{reason:'x'.repeat(1025)},{reason:null},{microphoneKind:'bad'},{variantId:'prepared'},{instrumentOverride:'sine'},{octaveShift:2},{pattern:{}},{familyId:'__proto__'},{skillId:'bad'}])expect(()=>generate({...t,...patch} as AuralBuiltinTarget,'0')).toThrow();
  expect(()=>generate({...t,pattern:undefined} as unknown as AuralBuiltinTarget,'0')).toThrow();
  expect(()=>target(t.familyId,t.skillId,{pattern:{}} as unknown as Options)).toThrow();expect(()=>target(t.familyId,t.skillId,null as unknown as Options)).toThrow();
  expect(()=>generate(null as unknown as AuralBuiltinTarget,'0')).toThrow();
  for(const seed of ['01','-0','9223372036854775808','-9223372036854775809'])expect(()=>generate(t,seed)).toThrow();
  expect(target(t.familyId,t.skillId,{reason:'x'.repeat(1024)}).reason).toHaveLength(1024);
 });
 it('reads known getters once despite nested calls and ignores hostile extras',()=>{
  const plain=target('secondary-dominant','reproduce',{support:0,transfer:true,microphoneKind:'scaleDegree',instrumentOverride:Waveform.CLARINET,octaveShift:1,variantId:'departure',reason:'caller'});
  const counts:Record<string,number>={},input:Record<string,unknown>={};let nested:AuralBuiltinExercise|undefined;
  for(const key of Object.keys(plain) as (keyof AuralBuiltinTarget)[])Object.defineProperty(input,key,{get:()=>{counts[key]=(counts[key]??0)+1;if(key==='familyId')nested=generate(target('plagal-return','compare'),'-1');return plain[key];}});
  Object.defineProperty(input,'unused',{get:()=>{throw Error('must not traverse extras');}});
  expect(generate(input as unknown as AuralBuiltinTarget,'811')).toEqual(generate(plain,'811'));expect(nested?.familyId).toBe('plagal-return');expect(Object.values(counts)).toEqual(Array(10).fill(1));
  const options:Record<string,unknown>={},optionCounts:Record<string,number>={};
  for(const key of ['support','transfer','reason','microphoneKind','variantId','instrumentOverride','octaveShift','pattern'] as const)Object.defineProperty(options,key,{get:()=>{optionCounts[key]=(optionCounts[key]??0)+1;return plain[key];}});
  expect(target(plain.familyId,plain.skillId,options as Options)).toEqual(plain);expect(Object.values(optionCounts)).toEqual(Array(8).fill(1));
 });
 it('isolates caller mutation and freezes every generated value',()=>{
  const options={support:0 as const,reason:'caller',variantId:'departure'},t=target('dominant-return','identify',options);options.reason='changed';
  const input={...t},e=generate(input,'432');input.variantId='direct';input.reason='later';expect(t.reason).toBe('caller');expect(e.variantId).toBe('departure');expect(e.provenance.target.reason).toBe('');
  expect(()=>(e.events[0].notes as number[]).push(99)).toThrow(TypeError);expect(()=>(e.provenance.target as {support:number}).support=2).toThrow(TypeError);expect(frozen(e)).toBe(true);
 });
 it('retains draw order/question across instrument aliases and octave lifts',()=>{
  const alias=rows.find(r=>r.label==='legacy-sine-alias')!.expected;expect(alias.fingerprint).toBe(rows[0].expected.fingerprint);expect(alias.id).not.toBe(rows[0].expected.id);
  const a=rows.find(r=>r.label==='settings-instrument-base')!.expected,b=rows.find(r=>r.label==='settings-instrument-octave')!.expected;
  expect(b.fullDegrees).toEqual(a.fullDegrees);expect(b.options).toEqual(a.options);expect(b.provenance.inversions).toEqual(a.provenance.inversions);expect(b.events.map(e=>e.notes)).toEqual(a.events.map(e=>e.notes.map(n=>n+12)));
  for(const kind of ['root','bass','scaleDegree','rootSequence'] as const){const t=target('secondary-dominant','reproduce',{support:0,microphoneKind:kind}),a=generate(t,'811'),b=generate({...t,octaveShift:1},'811');expect(b.answer.degrees).toEqual(a.answer.degrees);expect(b.answer.targetMidis).toEqual(a.answer.targetMidis.map(n=>n+12));}
 });
 it('preserves rich generated fields through existing generic evidence begin',()=>{
  const e=generate(target('relative-motion','complete',{support:0}),'432'),before=JSON.stringify(e),begun=beginAuralExercise(createAuralProgress(),e,1000);
  expect(begun.exercise.events).toEqual(e.events);expect(begun.exercise.prompt).toBe(e.prompt);expect(begun.exercise.provenance).toEqual(e.provenance);expect(begun.exercise.exposureRegistered).toBe(true);expect(JSON.stringify(e)).toBe(before);expect(e.exposureRegistered).toBe(false);
 });
});
