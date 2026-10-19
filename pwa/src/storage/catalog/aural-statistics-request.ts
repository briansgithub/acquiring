import {CatalogError} from './protocol';
import {captureAuralStatisticsRange} from './aural-statistics-query';
import type {AuralStatisticsRequest} from './aural-statistics-runtime-contracts';
function invalid():never {throw new CatalogError('INVALID_REQUEST','Invalid aural statistics request');}
function limit():never {throw new CatalogError('LIMIT','Aural statistics request exceeds the browser limit');}
function record(value:unknown):Record<string,unknown> {
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();return value as Record<string,unknown>;
}
/** Safe to send across IPC and use before worker journal/ownership awaits. */
export function captureAuralStatisticsRequest(input:AuralStatisticsRequest):AuralStatisticsRequest {
 const value=record(input),rawRange=captureAuralStatisticsRange(value.range as AuralStatisticsRequest['range']);
 const {sourceSnapshot,start,end,length}=rawRange;
 const range=Object.freeze({sourceSnapshot,start:start===0?0:start,end:end===0?0:end,length});
 const rawSettings=record(value.settings),{popularity,variety,favorites}=rawSettings;
 if(typeof popularity!=='boolean'||typeof variety!=='boolean'||typeof favorites!=='boolean')return invalid();
 let units=0;
 const history=(raw:unknown):readonly string[]=>{
  if(!Array.isArray(raw))return invalid();const count:unknown=raw.length;
  if(typeof count!=='number'||!Number.isInteger(count)||count<0)return invalid();
  if(count>10000)return limit();const result:string[]=[];
  for(let i=0;i<count;i++){
   const id:unknown=raw[i];if(typeof id!=='string')return invalid();
   units+=id.length;if(id.length>4096||units>8*1024*1024)return limit();result.push(id);
  }
  return Object.freeze(result);
 };
 const recentSongIds=history(value.recentSongIds),favoriteSongIds=history(value.favoriteSongIds);
 const rawPercent=value.minimumPopularityPercent;
 let minimumPopularityPercent:number|null=null;
 if(rawPercent!==undefined&&rawPercent!==null){
  if(typeof rawPercent!=='number'||!Number.isInteger(rawPercent)||rawPercent<0||rawPercent>100)return invalid();
  minimumPopularityPercent=rawPercent===0?0:rawPercent;
 }
 return Object.freeze({range,settings:Object.freeze({popularity,variety,favorites}),recentSongIds,favoriteSongIds,minimumPopularityPercent});
}
