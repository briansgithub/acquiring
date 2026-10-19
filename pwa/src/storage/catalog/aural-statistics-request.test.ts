import {expect,it} from 'vitest';
import {captureAuralStatisticsRequest as capture} from './aural-statistics-request';
import type {AuralStatisticsRequest} from './aural-statistics-runtime-contracts';
const S='d'.repeat(64);
function input(){return {range:{sourceSnapshot:S,start:0,end:1,length:3},settings:{popularity:true,variety:true,favorites:false},recentSongIds:['A'],favoriteSongIds:['B']};}
function run(value:unknown){return capture(value as AuralStatisticsRequest);}
it('owns an independent frozen request before IPC/worker awaits, with nullable threshold',()=>{
 const value=input(),request=capture(value);value.range.end=99;value.settings.popularity=false;value.recentSongIds.push('C');
 expect(request).toEqual({...input(),minimumPopularityPercent:null});
 for(const item of [request,request.range,request.settings,request.recentSongIds,request.favoriteSongIds])expect(Object.isFrozen(item)).toBe(true);
 expect(capture({...input(),minimumPopularityPercent:100}).minimumPopularityPercent).toBe(100);
 const zero=capture({...input(),range:{...input().range,start:-0,end:-0},minimumPopularityPercent:-0});
 expect(Object.is(zero.range.start,0)).toBe(true);expect(Object.is(zero.range.end,0)).toBe(true);expect(Object.is(zero.minimumPopularityPercent,0)).toBe(true);
});
it('refuses malformed known shapes/scalars without coercion even for empty ranges',()=>{
 for(const value of [null,[],{}, {...input(),range:null}, {...input(),settings:null}, {...input(),settings:{popularity:true,variety:0,favorites:false}}, {...input(),recentSongIds:'A'}, {...input(),favoriteSongIds:[1]}, {...input(),minimumPopularityPercent:'50'}, {...input(),minimumPopularityPercent:NaN}, {...input(),minimumPopularityPercent:101}, {...input(),minimumPopularityPercent:.5}])
  expect(()=>run(value)).toThrowError(expect.objectContaining({code:'INVALID_REQUEST'}));
 expect(capture({...input(),range:{sourceSnapshot:S,start:0,end:-99,length:2},minimumPopularityPercent:null}).range.end).toBe(-99);
});
it('caps collection sizes before elements and accepts exact10000indices without iterators',()=>{
 const many=new Proxy(new Array(10001),{get(target,key){if(key==='0')throw new Error('element touched');return Reflect.get(target,key);}});
 for(const name of ['recentSongIds','favoriteSongIds'])expect(()=>run({...input(),[name]:many})).toThrowError(expect.objectContaining({code:'LIMIT'}));
 expect(capture({...input(),recentSongIds:Array(10000).fill('')}).recentSongIds).toHaveLength(10000);
 expect(()=>capture({...input(),range:{sourceSnapshot:S,start:0,end:10000,length:2}})).toThrowError(expect.objectContaining({code:'LIMIT'}));
});
it('applies exact UTF16 string and shared history aggregate boundaries',()=>{
 const max='😀'.repeat(2048);expect(capture({...input(),recentSongIds:[max]}).recentSongIds[0]).toBe(max);
 expect(()=>capture({...input(),favoriteSongIds:[max+'x']})).toThrowError(expect.objectContaining({code:'LIMIT'}));
 const exact={...input(),recentSongIds:Array(2048).fill(max),favoriteSongIds:[]};expect(capture(exact).recentSongIds).toHaveLength(2048);
 expect(()=>capture({...exact,favoriteSongIds:['x']})).toThrowError(expect.objectContaining({code:'LIMIT'}));
});
it('snapshots all known getters/array indices once and ignores unknown getters/iterators',()=>{
 const counts=new Map<string,number>();
 function watch(value:unknown,path:string):unknown {
  if(!value||typeof value!=='object')return value;
  if(Array.isArray(value))return new Proxy(value.map((v,i)=>watch(v,path+'.'+i)),{get(target,key){
   if(key===Symbol.iterator)throw new Error('iterator');
   if(key==='length'||typeof key==='string'&&/^\d+$/.test(key)){const id=path+'.'+String(key);counts.set(id,(counts.get(id)??0)+1);}return Reflect.get(target,key);
  }});
  const result={};for(const [key,v]of Object.entries(value)){const child=watch(v,path+'.'+key);Object.defineProperty(result,key,{get(){const id=path+'.'+key;counts.set(id,(counts.get(id)??0)+1);return child;}});}
  Object.defineProperty(result,'unknown',{get(){throw new Error('unknown');}});return result;
 }
 const request=run(watch({...input(),minimumPopularityPercent:50},'input'));
 expect(request.minimumPopularityPercent).toBe(50);expect([...counts.values()].every(v=>v===1)).toBe(true);
});
it('keeps nested calls local, retains NUL/BOM IDs and propagates original getter errors',()=>{
 let nested:AuralStatisticsRequest|undefined;
 const source={...input(),get settings(){nested=capture({...input(),recentSongIds:['\0\ufeffA']});return input().settings;}};
 expect(capture(source).recentSongIds).toEqual(['A']);expect(nested!.recentSongIds).toEqual(['\0\ufeffA']);
 const error=new Error('caller');expect(()=>capture({...input(),get settings():AuralStatisticsRequest['settings']{throw error;}})).toThrow(error);
});
