import {describe,expect,it} from 'vitest';
import native from './fixtures/native-builtin-current.json';
import {restoreAuralBuiltinCurrent as restore,auralBuiltinCurrentApi} from './builtin-current';
import type {AuralBuiltinCurrentProjection,AuralBuiltinCurrentApi} from './builtin-current-contracts';
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const asInput=(v:unknown)=>v as AuralBuiltinCurrentProjection;
const row=(label='supported-false-flags-become-true')=>native.cases.find(c=>c.label===label)!;
const input=()=>asInput(clone(row().input));
function frozen(v:unknown):boolean{return v===null||typeof v!=='object'||Object.isFrozen(v)&&Object.values(v).every(frozen);}
function counted(v:Record<string,unknown>,prefix:string,counts:Record<string,number>):Record<string,unknown>{
 const result={};for(const [k,value]of Object.entries(v))Object.defineProperty(result,k,{enumerable:true,get(){counts[prefix+k]=(counts[prefix+k]??0)+1;return value;}});
 Object.defineProperty(result,'unknown',{enumerable:true,get(){throw new Error('unknown getter');}});return result;
}
describe('accepted native builtin-current oracle',()=>{
 for(const c of native.cases)it(c.label,()=>{
  const value=asInput(clone(c.input)),before=JSON.stringify(value);
  if(c.expected.current===null)expect(()=>restore(value)).toThrow();
  else{const result=restore(value);expect(result).toEqual(c.expected.current);expect(frozen(result)).toBe(true);}
  expect(JSON.stringify(value)).toBe(before);
 });
});
describe('typed regeneration boundary, not JSON eligibility',()=>{
 it('exposes frozen API and independent deeply frozen rich outputs',()=>{
  const api:AuralBuiltinCurrentApi=auralBuiltinCurrentApi,a=api.restoreAuralBuiltinCurrent(input()),b=restore(input());
  expect(Object.isFrozen(api)).toBe(true);expect(a).toEqual(b);expect(a).not.toBe(b);expect(a.events).not.toBe(b.events);expect(a.provenance.target).not.toBe(b.provenance.target);expect(frozen(a)).toBe(true);
 });
 it('reads every known top/provenance/target/settings getter once and ignores old rich identities',()=>{
  const c=row('settings-and-fallback-copied'),v=clone(c.input),counts:Record<string,number>={};
  const settings=counted(v.provenance.exampleSettings!,'settings.',counts);
  const target=counted(v.provenance.target,'target.',counts);
  const provenance=counted({...v.provenance,target,exampleSettings:settings},'provenance.',counts);
  Object.defineProperty(provenance,'seed',{get(){throw new Error('ignored provenance seed');}});
  Object.defineProperty(provenance,'generatorVersion',{get(){throw new Error('ignored provenance version');}});
  const old=counted({...v,provenance},'top.',counts);Object.defineProperty(old,'answer',{get(){throw new Error('ignored answer');}});
  expect(restore(asInput(old))).toEqual(c.expected.current);expect(Object.keys(counts)).toHaveLength(26);expect(Object.values(counts).every(n=>n===1)).toBe(true);
 });
 it('copies metadata independently and preserves unrestricted strings without inventing enums/defaults',()=>{
  const c=row('settings-and-fallback-copied'),v=clone(c.input),result=restore(asInput(v));
  expect(result.provenance.exampleSettings).not.toBe(v.provenance.exampleSettings);
  v.provenance.exampleSettings!.analysis='later';v.provenance.target.familyId='later';v.provenance.fallbackReason='later';
  expect(result).toEqual(c.expected.current);expect(frozen(result)).toBe(true);
  const old=input(),settings=clone(row('settings-and-fallback-copied').input.provenance.exampleSettings)!;
  settings.analysis='x'.repeat(65536);expect(restore({...old,provenance:{...old.provenance,exampleSettings:settings,fallbackReason:'y'.repeat(65536)}}).provenance.exampleSettings!.analysis.length).toBe(65536);
 });
 it('generates before top-version comparison and uses top seed, never ignored provenance seed/version',()=>{
  const old=input(),target={...old.provenance.target};Object.defineProperty(target,'familyId',{get(){throw new Error('target phase');}});
  expect(()=>restore({...old,generatorVersion:'mismatch',provenance:{...old.provenance,target}})).toThrow('target phase');
  expect(()=>restore({...old,generatorVersion:'mismatch'})).toThrow('generator version');
  const a=row('top-seed-wins-9007199254740992'),b=row('top-seed-wins-9007199254740993');
  expect(restore(asInput(a.input)).seed).toBe('9007199254740992');expect(restore(asInput(b.input)).seed).toBe('9007199254740993');
 });
 it('rejects noncanonical, unsafe numeric and out-of-range seeds without rounding',()=>{
  for(const seed of ['01','-0','+1','1e3','','9223372036854775808','-9223372036854775809',9007199254740992,1n])expect(()=>restore(asInput({...input(),seed}))).toThrow();
 });
 it('requires all nine typed settings fields and bounds text, preserving explicit null metadata',()=>{
  const old=input(),settings=clone(row('settings-and-fallback-copied').input.provenance.exampleSettings)!;
  for(const patch of [{popularity:'false'},{variety:null},{favorites:undefined},{analysis:null},{sortOrder:1},{analysis:'x'.repeat(65537)}])expect(()=>restore(asInput({...old,provenance:{...old.provenance,exampleSettings:{...settings,...patch}}}))).toThrow();
  for(const patch of [{exampleSettings:undefined},{fallbackReason:undefined},{fallbackReason:'x'.repeat(65537)}])expect(()=>restore(asInput({...old,provenance:{...old.provenance,...patch}}))).toThrow();
  expect(()=>restore({...old,generatorVersion:'x'.repeat(65537)})).toThrow();
  expect(restore(old).provenance.exampleSettings).toBeNull();expect(restore(old).provenance.fallbackReason).toBeNull();
 });
 it('rejects unsupported corpus/pattern and preserves accepted target reason bound',()=>{
  const old=input();
  expect(()=>restore(asInput({...old,provenance:{...old.provenance,corpus:{opaque:true}}}))).toThrow('Corpus');
  expect(()=>restore(asInput({...old,provenance:{...old.provenance,target:{...old.provenance.target,pattern:{opaque:true}}}}))).toThrow('Pattern');
  expect(()=>restore({...old,provenance:{...old.provenance,target:{...old.provenance.target,reason:'x'.repeat(1025)}}})).toThrow();
  for(const bad of [null,[],{},'saved JSON'])expect(()=>restore(asInput(bad))).toThrow();
 });
});
