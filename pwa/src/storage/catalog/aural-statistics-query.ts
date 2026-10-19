import {CatalogError} from './protocol';
import {readAuralHeader} from './aural-header';
import type {AuralReadDatabase} from './aural-read-contracts';
import type {AuralCatalogTargetQuery} from './aural-target-query-contracts';
import type {AuralStatisticsFacts,AuralStatisticsFactsApi} from './aural-statistics-query-contracts';

const HASH=/^[0-9a-f]{64}$/;
const int=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=-2147483648&&v<=2147483647;
function integrity():never {throw new CatalogError('INTEGRITY','Invalid aural statistics input data');}
function limit():never {throw new CatalogError('LIMIT','Aural statistics facts exceed the browser limit');}
function select(db:AuralReadDatabase,sql:string,bind:(string|number)[]=[]):Record<string,unknown>[] {
 try {return db.selectObjects(sql,bind);}catch {return integrity();}
}
export function captureAuralStatisticsRange(query:AuralCatalogTargetQuery):AuralCatalogTargetQuery {
 if(!query||typeof query!=='object'||Array.isArray(query))throw new CatalogError('INVALID_REQUEST','Invalid statistics range');
 const {sourceSnapshot,start,end,length}=query;
 if(typeof sourceSnapshot!=='string'||!HASH.test(sourceSnapshot)||!int(start)||start<0||!int(end)||!int(length)||length<2||length>10000)throw new CatalogError('INVALID_REQUEST','Invalid statistics range');
 if(end>=start&&end-start+1>10000)return limit();
 return Object.freeze({sourceSnapshot,start,end,length});
}
function text(row:Record<string,unknown>,name:string):string {
 const kind=row[name+'Type'],size=row[name+'Size'],raw=row[name];
 if(kind!=='text'||typeof size!=='number'||!Number.isSafeInteger(size)||size<0)return integrity();
 if(size>16384)return limit();
 if(!(raw instanceof Uint8Array)||raw.byteLength!==size)return integrity();
 let value:string;
 try {value=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw);}catch {return integrity();}
 if(value.length>4096)return limit();return value;
}
export function readAuralStatisticsFacts(db:AuralReadDatabase,expectedSnapshot:string,query:AuralCatalogTargetQuery):AuralStatisticsFacts {
 if(typeof expectedSnapshot!=='string'||!HASH.test(expectedSnapshot))throw new CatalogError('INVALID_REQUEST','Expected statistics snapshot SHA256');
 const {sourceSnapshot,start,end,length}=captureAuralStatisticsRange(query);
 if(sourceSnapshot!==expectedSnapshot)throw new CatalogError('STALE_SNAPSHOT','Aural catalog snapshot changed');
 const header=readAuralHeader(db,expectedSnapshot);
 const occurrences:{runId:number;offset:number}[]=[],runs:{id:number;songId:string;sectionId:string}[]=[],valid=new Set<string>();
 if(end>=start){
  if(end>=header.suffixCount)throw new CatalogError('INVALID_REQUEST','Invalid statistics suffix range');
  const count=end-start+1,rows=select(db,"SELECT substr(data,?,?) AS locations FROM catalog_array WHERE name='suffix_locations' AND typeof(data)='blob' LIMIT 2",[start*8+1,count*8]);
  const bytes=rows[0]?.locations;
  if(rows.length!==1||!(bytes instanceof Uint8Array)||bytes.byteLength!==count*8)return integrity();
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),ids=new Set<number>();
  for(let i=0;i<count;i++){
   const runId=view.getInt32(i*8,true),offset=view.getInt32(i*8+4,true);
   if(runId<0||offset<0)return integrity();if(offset+length-1>2147483647)return limit();
   occurrences.push(Object.freeze({runId,offset}));ids.add(runId);
  }
  const unique=[...ids];let units=0;
  for(let at=0;at<unique.length;at+=128){
   const batch=unique.slice(at,at+128),expected=new Set(batch),seen=new Set<number>();
   const fields=['song_id','section_id'].map((column,i)=>{const name=i===0?'song':'section',size=`length(CAST(${column} AS BLOB))`;return `typeof(${column}) AS ${name}Type,${size} AS ${name}Size,CASE WHEN typeof(${column})='text' AND ${size}<=16384 THEN CAST(${column} AS BLOB) END AS ${name}`;});
   const found=select(db,`SELECT id,${fields.join(',')},EXISTS(SELECT 1 FROM catalog_song s WHERE s.id=r.song_id) AS valid FROM catalog_run r WHERE id IN (${batch.map(()=>'?').join(',')}) LIMIT 129`,batch);
   if(found.length!==batch.length)return integrity();
   const byId=new Map<number,{id:number;songId:string;sectionId:string;valid:boolean}>();
   for(const row of found){
    const id=row.id,flag=row.valid;
    if(!int(id)||!expected.has(id)||seen.has(id)||(flag!==0&&flag!==1))return integrity();seen.add(id);
    const songId=text(row,'song'),sectionId=text(row,'section');units+=songId.length+sectionId.length;
    if(flag===1&&!valid.has(songId)){valid.add(songId);units+=songId.length;}
    if(units>8*1024*1024)return limit();byId.set(id,{id,songId,sectionId,valid:flag===1});
   }
   for(const id of batch){const row=byId.get(id)!;runs.push(Object.freeze({id:row.id,songId:row.songId,sectionId:row.sectionId}));}
  }
 }
 return Object.freeze({sourceSnapshot,occurrences:Object.freeze(occurrences),runs:Object.freeze(runs),validSongIds:Object.freeze([...valid])});
}
export const auralStatisticsFactsApi:AuralStatisticsFactsApi=Object.freeze({captureAuralStatisticsRange,readAuralStatisticsFacts});
