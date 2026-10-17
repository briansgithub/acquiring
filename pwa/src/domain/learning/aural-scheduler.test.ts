import {describe,expect,it} from 'vitest';
import native from './fixtures/native-scheduler.json';
import {auralFamilyUnlocked as family,auralSkillUnlocked as skill,selectAuralBuiltinTarget as select,auralBuiltinSchedulerApi} from './aural-scheduler';
import {createAuralCell,createAuralProgress} from './aural-evidence';
import type {AuralCell,AuralProgress} from './evidence-contracts';
import type {AuralBuiltinSchedulerApi} from './scheduler-contracts';
const F=['dominant-return','plagal-return','predominant-cadence','deceptive-return','relative-motion','secondary-dominant'];
const S=['guided','compare','identify','recall','complete','audiate','reproduce'];
const Q=[...F,'unknown','p_0123456789ab_1_0123456789abcdef0123456789abcdef'];
interface Row {label:string;ready:boolean;attempts:number;version:number;cells:Record<string,Partial<AuralCell>>;seed:string;now:number;microphoneEnabled:boolean;expected:{target:unknown;families:boolean[];skills:boolean[]}}
const rows=native.cases as unknown as readonly Row[],ready=native.readyCell as Partial<AuralCell>;
function progress(r:Row):AuralProgress {
 const cells:Record<string,AuralCell>={};if(r.ready)for(const f of F)for(const s of S)cells[f+':'+s]=createAuralCell(ready);
 for(const [key,patch]of Object.entries(r.cells))cells[key]=createAuralCell({...r.ready?ready:{},...patch});
 return createAuralProgress({version:r.version,attempts:r.attempts,cells});
}
describe('native24 builtin scheduler and unlock matrix',()=>{
 for(const row of rows)it(row.label,()=>{const p=progress(row),before=JSON.stringify(p);
  expect(select(p,row.seed,row.now,row.microphoneEnabled)).toEqual(row.expected.target);
  expect(Q.map(f=>family(p,f))).toEqual(row.expected.families);
  expect(Q.flatMap(f=>[...S,'unknown'].map(s=>skill(p,f,s)))).toEqual(row.expected.skills);
  expect(JSON.stringify(p)).toBe(before);
 });
});
describe('scheduler browser input boundaries',()=>{
 it('exposes frozen typed API and fresh immutable native target defaults',()=>{
  const api:AuralBuiltinSchedulerApi=auralBuiltinSchedulerApi,p=createAuralProgress(),a=api.selectAuralBuiltinTarget(p,'0',-1),b=select(p,'0',-1);
  expect(Object.isFrozen(api)).toBe(true);expect(Object.isFrozen(a)).toBe(true);expect(a).toEqual(b);expect(a).not.toBe(b);
  expect([a.variantId,a.instrumentOverride,a.octaveShift,a.pattern]).toEqual([null,null,0,null]);
  expect(()=>{(a as {support:number}).support=0;}).toThrow(TypeError);
 });
 it('keeps helper version semantics while selector resets without inspecting irrelevant data',()=>{
  const row=rows.find(r=>r.label==='version-reset-versus-unlock')!,p=progress(row);expect(family(p,'secondary-dominant')).toBe(true);
  const reset={version:99,get attempts(){throw Error('ignored attempts');},get cells(){throw Error('ignored cells');}} as unknown as AuralProgress;
  expect(select(reset,'0',0)).toEqual(select(createAuralProgress(),'0',0));
  expect(family({}as AuralProgress,'unknown')).toBe(false);expect(skill({}as AuralProgress,'unknown','guided')).toBe(false);
  expect(family({}as AuralProgress,'dominant-return')).toBe(true);
 });
 it('reads original known fields once, ignores flags/history/extras and survives nested selection',()=>{
  const plain=createAuralCell({practice:4,practiceCorrect:4}),counts:Record<string,number>={},cell:Record<string,unknown>={};
  let nested=false;for(const key of Object.keys(plain)as(keyof AuralCell)[]){if(key==='mastered'||key==='support')continue;
   Object.defineProperty(cell,key,{get:()=>{counts[key]=(counts[key]??0)+1;if(key==='practice'){nested=true;select(createAuralProgress(),'1',0);}return plain[key];}});}
  for(const key of ['mastered','support','corpus','unused'])Object.defineProperty(cell,key,{get:()=>{throw Error('ignored cell field');}});
  const cells={'dominant-return:guided':cell};Object.defineProperty(cells,'pattern:guided',{get:()=>{throw Error('ignored cell key');}});
  const reads={version:0,attempts:0,cells:0},input={get version(){reads.version++;return 1;},get attempts(){reads.attempts++;return 1;},get cells(){reads.cells++;return cells;},get recent(){throw Error('ignored recent');},get exposures(){throw Error('ignored exposures');},get corpus(){throw Error('ignored corpus');}};
  expect(()=>select(input as unknown as AuralProgress,'0',0)).not.toThrow();expect(reads).toEqual({version:1,attempts:1,cells:1});expect(nested).toBe(true);expect(Object.values(counts).every(n=>n===1)).toBe(true);
 });
 it('bounds arrays by cached length/index and ignores hostile iterators and unknown mic counters',()=>{
  const keys=Array(4096).fill('C'),recent=Array(4096).fill(true);for(const a of [keys,recent])Object.defineProperty(a,Symbol.iterator,{value:()=>{throw Error('no iterator');}});
  const mic={root:1};Object.defineProperty(mic,'unknown',{get:()=>{throw Error('ignored mic');}});
  const cell={...createAuralCell({practice:4,practiceCorrect:4,independentAttempts:8,independentCorrect:8}),keys,recentIndependent:recent,microphonePractice:mic};
  const p={...createAuralProgress(),cells:{'dominant-return:guided':cell}};
  expect(skill(p,'dominant-return','compare')).toBe(true);expect(()=>select(p,'0',0)).not.toThrow();
  for(const patch of [{keys:Array(4097).fill('C')},{recentIndependent:Array(4097).fill(true)}])expect(()=>select({...p,cells:{'dominant-return:guided':{...cell,...patch}}},'0',0)).toThrow(RangeError);
 });
 it('rejects unsafe time, seed, typed arrays and native counters before returning a target',()=>{
  const p=createAuralProgress();for(const now of [undefined,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1])expect(()=>select(p,'0',now as number)).toThrow(RangeError);
  for(const seed of ['01','-0','9223372036854775808','-9223372036854775809'])expect(()=>select(p,seed,0)).toThrow();
  expect(()=>select(p,'0',0,null as unknown as boolean)).toThrow(TypeError);
  for(const patch of [{practice:2147483648},{lastAt:Number.MAX_SAFE_INTEGER+1},{dueAt:0.5},{keys:[1]},{recentIndependent:[1]},{microphoneIndependent:{root:NaN}}]){
   const c={...createAuralCell(),...patch} as AuralCell;expect(()=>select({...p,cells:{'dominant-return:guided':c}},'0',0)).toThrow();}
 });
});
