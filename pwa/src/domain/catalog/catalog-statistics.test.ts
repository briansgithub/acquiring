import { describe, expect, it } from 'vitest';
import native from './fixtures/native-statistics.json';
import { auralCatalogStatisticsApi, computeAuralCatalogStatistics as compute, compareAuralCatalogRows as compare } from './catalog-statistics';
import type { AuralCatalogStatistics, AuralCatalogStatisticsRow, AuralStatisticsInput } from './statistics-contracts';

type StatsProbe=AuralStatisticsInput & {name:string;statsWrapper?:boolean;expected:AuralCatalogStatistics|null|{failure:string}};
type CompareProbe={name:string;rows:AuralCatalogStatisticsRow[];expected:{order:string|null;sortedIndices:number[];signs:number[][]}[]};
type Group={name:string;kind:'stats';probes:StatsProbe[]}|{name:string;kind:'compare';probes:CompareProbe[]};
const groups=native.cases as unknown as Group[];
function base():AuralStatisticsInput {
 return {targetLength:3,occurrences:[{runId:0,offset:0}],runs:[{id:0,songId:'A',sectionId:'section'}],validSongIds:['A'],popularity:[{songId:'A',score:.5,confidence:1}],settings:{popularity:true,variety:true,favorites:false},recentSongIds:[],favoriteSongIds:[]};
}
function row():AuralCatalogStatisticsRow {
 return {id:'row',length:3,songs:1,occurrences:1,sections:1,effective:1,score:2,globalSongs:1,globalOccurrences:1};
}
function run(value:unknown) { return compute(value as AuralStatisticsInput); }
function freeze<T>(value:T):T {
 if(value!==null && typeof value==='object') { for(const child of Object.values(value)) freeze(child);Object.freeze(value); }
 return value;
}
describe('actual frozen JVM statistics and comparator reference',()=>{
 for(const group of groups) it(group.name,()=>{
  if(group.kind==='stats') for(const probe of group.probes) {
   const input=freeze(structuredClone(probe)),before=JSON.stringify(input),actual=compute(input);
   if(probe.statsWrapper) {
    // Extra native stats() wrapper evidence; public API is nullable statsMatching.
    expect(probe.expected).toEqual({failure:'java.lang.IllegalArgumentException'});
    expect(actual).toBeNull();
   } else if(probe.expected===null) expect(actual).toBeNull();
   else {
    const expected=probe.expected as AuralCatalogStatistics;
    expect(actual).not.toBeNull();
    const {score,...counts}=actual!,{score:expectedScore,...expectedCounts}=expected;
    expect(counts).toEqual(expectedCounts);
    expect(Math.abs(score-expectedScore)).toBeLessThanOrEqual(Math.max(1e-12,Math.abs(expectedScore)*2e-14));
   }
   expect(JSON.stringify(input)).toBe(before);
  } else for(const probe of group.probes) for(const order of probe.expected) {
   const rows=freeze(structuredClone(probe.rows)),sort=order.order??undefined;
   expect(rows.map(a=>rows.map(b=>compare(a,b,sort)))).toEqual(order.signs);
   expect(rows.map((_,i)=>i).sort((a,b)=>compare(rows[a],rows[b],sort))).toEqual(order.sortedIndices);
  }
 });
});
describe('browser request boundary and independent immutable results',()=>{
 it('checks all known unused fields before empty or invalid-song early returns',()=>{
  for(const input of [null,[],{}, {...base(),targetLength:'3'}, {...base(),settings:{popularity:true,variety:0,favorites:false}}, {...base(),occurrences:null}, {...base(),runs:[{id:0,songId:4,sectionId:'s'}]}])expect(()=>run(input)).toThrow(TypeError);
  for(const input of [
   {...base(),occurrences:[],targetLength:1}, {...base(),occurrences:[],minimumPopularityPercent:101},
   {...base(),validSongIds:[],minimumPopularityPercent:-1}, {...base(),occurrences:[],popularity:[{songId:'A',score:NaN,confidence:1}]},
   {...base(),occurrences:[],popularity:[{songId:'A',score:null,confidence:Infinity}]}, {...base(),targetLength:2.5},
   {...base(),occurrences:[{runId:0,offset:-1}]}, {...base(),occurrences:[{runId:0,offset:2147483647}]},
   {...base(),occurrences:[{runId:1,offset:0}]}, {...base(),runs:[...base().runs,...base().runs]},
   {...base(),popularity:[...base().popularity,...base().popularity]},
  ])expect(()=>run(input)).toThrow(RangeError);
  expect(compute({...base(),minimumPopularityPercent:null})).toEqual(compute(base()));
 });
 it('bounds every collection length before touching its elements and accepts exact10000',()=>{
  const tooLong=new Proxy(new Array(10001),{get(target,key){if(key==='0')throw Error('element touched');return Reflect.get(target,key);}});
  for(const key of ['occurrences','runs','validSongIds','popularity','recentSongIds','favoriteSongIds'])expect(()=>run({...base(),[key]:tooLong})).toThrow(RangeError);
  const empty={...base(),occurrences:[]};
  for(const [key,value]of Object.entries({
   occurrences:Array.from({length:10000},()=>({runId:0,offset:0})),runs:Array.from({length:10000},(_,id)=>({id,songId:'',sectionId:''})),
   popularity:Array.from({length:10000},(_,id)=>({songId:String(id),score:0,confidence:0})),validSongIds:Array(10000).fill(''),recentSongIds:Array(10000).fill(''),favoriteSongIds:Array(10000).fill(''),
  }))expect(()=>run({...empty,[key]:value})).not.toThrow();
 });
 it('uses UTF16 unit budgets with exact string and aggregate boundaries',()=>{
  const id='x'.repeat(4096);
  expect(compute({...base(),runs:[{id:0,songId:id,sectionId:''}],validSongIds:[id],popularity:[]})).not.toBeNull();
  expect(()=>compute({...base(),favoriteSongIds:['x'.repeat(4097)]})).toThrow(RangeError);
  const input={...base(),occurrences:[],runs:[],validSongIds:[],popularity:[],recentSongIds:Array(2048).fill('😀'.repeat(2048)),favoriteSongIds:[]};
  expect(compute(input)).toBeNull();
  expect(()=>compute({...input,favoriteSongIds:['x']})).toThrow(RangeError);
 });
 it('snapshots every known getter/index/length once, ignores iterators/unknown fields and isolates reentry',()=>{
  const reads=new Map<string,number>();let unknown=0;
  const watch=(value:unknown,path='input'):unknown=>{
   if(value===null || typeof value!=='object')return value;
   if(Array.isArray(value)) {
    const items=value.map((v,i)=>watch(v,path+'.'+i));
    return new Proxy(items,{get(target,key){
     if(key===Symbol.iterator)throw Error('iterator');
     if(key==='length' || typeof key==='string' && /^\d+$/.test(key)){const id=path+'.'+String(key);reads.set(id,(reads.get(id)??0)+1);}
     return Reflect.get(target,key);
    }});
   }
   const copy:Record<string,unknown>={};
   for(const [key,v]of Object.entries(value)) {const child=watch(v,path+'.'+key);Object.defineProperty(copy,key,{get(){const id=path+'.'+key;reads.set(id,(reads.get(id)??0)+1);return child;}});}
   Object.defineProperty(copy,'unknown',{get(){unknown++;throw Error('unknown getter');}});return copy;
  };
  const input=watch({...base(),minimumPopularityPercent:null});expect(run(input)).toEqual(compute(base()));
  expect([...reads.values()].every(n=>n===1)).toBe(true);expect(unknown).toBe(0);
  let nested:AuralCatalogStatistics|null=null;
  const outer={...base(),get targetLength(){nested=compute({...base(),recentSongIds:['A']});return 3;}};
  expect(compute(outer)).toEqual(compute(base()));expect(nested).toEqual(compute({...base(),recentSongIds:['A']}));
 });
 it('owns copied occurrences before later getters mutate originals; propagates getter failures',()=>{
  const input=base(),occurrences=[{runId:0,offset:0}];
  const mutated={...input,occurrences,runs:[{id:0,get songId(){occurrences[0].offset=2147483647;return 'A';},sectionId:'section'}]};
  expect(compute(mutated)).toEqual(compute(base()));expect(occurrences[0].offset).toBe(2147483647);
  const error=new Error('caller getter');expect(()=>compute({...base(),get settings():AuralStatisticsInput['settings']{throw error;}})).toThrow(error);
  const a=compute(freeze(base())),b=compute(base());expect(a).toEqual(b);expect(a).not.toBe(b);expect(Object.isFrozen(a)).toBe(true);expect(Object.isFrozen(auralCatalogStatisticsApi)).toBe(true);
 });
 it('validates comparator unused fields, strict shapes and all limits without inventing count relationships',()=>{
  for(const [key,value]of Object.entries({id:0,length:'3',songs:null,occurrences:false,sections:undefined,effective:[],score:'2',globalSongs:{},globalOccurrences:1n}))expect(()=>compare({...row(),[key]:value} as AuralCatalogStatisticsRow,row(),'mostSongs')).toThrow(TypeError);
  for(const [key,value]of Object.entries({id:'x'.repeat(4097),length:10001,songs:-1,occurrences:2147483648,sections:.5,effective:NaN,score:Infinity,globalSongs:-1,globalOccurrences:2147483648}))expect(()=>compare({...row(),[key]:value},row(),'mostSongs')).toThrow(RangeError);
  expect(()=>compare(row(),{...row(),score:NaN},'shortest')).toThrow(RangeError);
  expect(()=>compare(row(),row(),null as unknown as string)).toThrow(TypeError);
  expect(()=>compare(row(),row(),'x'.repeat(4097))).toThrow(RangeError);
  expect(compare({...row(),songs:100,occurrences:0,effective:2147483647,sections:99},row(),'mostSongs')).toBe(0);
  for(const key of ['songs','occurrences','sections','effective','globalSongs','globalOccurrences']) for(const order of ['recommended','mostSongs','longest','shortest','unknown']) expect(compare({...row(),[key]:-0},{...row(),[key]:0},order)).toBe(0);
  expect(compare({...row(),score:0},{...row(),score:-0})).toBe(-1);
  expect(compare({...row(),id:'😀'},{...row(),id:'\ue000'})).toBe(-1);
 });
 it('reads each comparator known getter once, ignores extras, keeps reentrant budgets local',()=>{
  const counts=new Map<string,number>();const wrapped=(value:AuralCatalogStatisticsRow,prefix:string)=>{
   const result={} as AuralCatalogStatisticsRow;
   for(const [key,v]of Object.entries(value))Object.defineProperty(result,key,{get(){counts.set(prefix+key,(counts.get(prefix+key)??0)+1);if(key==='id')expect(compute(base())).not.toBeNull();return v;}});
   Object.defineProperty(result,'unknown',{get(){throw Error('unknown');}});return result;
  };
  expect(compare(wrapped(row(),'a'),wrapped(row(),'b'),'mostSongs')).toBe(0);
  expect([...counts.values()]).toEqual(Array(18).fill(1));
 });
});
