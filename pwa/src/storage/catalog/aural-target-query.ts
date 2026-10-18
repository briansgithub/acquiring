import {CatalogError} from './protocol';
import {readAuralHeader,readAuralSuffixLocation} from './aural-header';
import type {AuralReadDatabase} from './aural-read-contracts';
import type {AuralCatalogTargetQuery,AuralTargetRow,AuralTargetQueryApi} from './aural-target-query-contracts';

const HASH=/^[0-9a-f]{64}$/;
const COMPRESSED=8*1024*1024,KEY_BYTES=65536,METADATA=4096;
function bad(message:string):never {throw new CatalogError('INTEGRITY',message);}
function int(value:unknown):value is number {return typeof value==='number'&&Number.isInteger(value)&&value>=-2147483648&&value<=2147483647;}
type Field=readonly[column:string,alias:string,type:'text'|'blob',limit:number,utf8?:boolean];
function columns(field:Field):string {
  const [column,alias,type,limit,utf8]=field,size=`length(${utf8?`CAST(${column} AS BLOB)`:column})`;
  return `typeof(${column}) AS ${alias}Type,${size} AS ${alias}Size,CASE WHEN typeof(${column})='${type}' AND ${size}<=${limit} THEN ${column} END AS ${alias}`;
}
function value(row:Record<string,unknown>,field:Field):string|Uint8Array {
  const [,alias,type,limit]=field,kind=row[alias+'Type'],size=row[alias+'Size'],data=row[alias];
  if(kind!==type||typeof size!=='number'||!Number.isSafeInteger(size)||size<0)bad('Invalid aural run column type or length');
  if(size>limit)throw new CatalogError('LIMIT','Aural run value exceeds the browser limit');
  if(type==='text'){
    if(typeof data!=='string')bad('Missing aural run text');return data;
  }
  if(!(data instanceof Uint8Array)||data.byteLength!==size)bad('Missing or truncated aural run blob');return data;
}

/** One native suffix location and run, SQL-bounded before async typed decoding. */
export function captureAuralTargetQuery(query:AuralCatalogTargetQuery):AuralCatalogTargetQuery {
  if(!query||typeof query!=='object'||Array.isArray(query))throw new CatalogError('INVALID_REQUEST','Invalid aural target request');
  const {sourceSnapshot,start,end,length}=query;
  if(typeof sourceSnapshot!=='string'||!HASH.test(sourceSnapshot)||!int(start)||start<0||!int(end)||!int(length)||length<0||length>10000)throw new CatalogError('INVALID_REQUEST','Invalid aural target span');
  return Object.freeze({sourceSnapshot,start,end,length});
}
export function readAuralTargetRow(db:AuralReadDatabase,expectedSnapshot:string,query:AuralCatalogTargetQuery):AuralTargetRow {
  if(typeof expectedSnapshot!=='string'||!HASH.test(expectedSnapshot))throw new CatalogError('INVALID_REQUEST','Invalid aural target snapshot');
  const {sourceSnapshot,start,end,length}=captureAuralTargetQuery(query);
  if(sourceSnapshot!==expectedSnapshot)throw new CatalogError('STALE_SNAPSHOT','Aural catalog snapshot changed');
  const header=readAuralHeader(db,expectedSnapshot),location=readAuralSuffixLocation(db,header,start);
  // These identifiers are constants; request values are always bound parameters.
  const fields:Field[]=[['stable_id','stableId','text',METADATA],['view','view','text',METADATA],['song_id','song','text',METADATA],['section_id','section','text',METADATA],['revision','revision','text',METADATA],
    ['tokens','tokens','blob',COMPRESSED],['positions','positions','blob',COMPRESSED],['key_json','keyJson','text',KEY_BYTES,true],
    [header.supportsModeAnalysis?'source_key_json':'key_json','sourceKeyJson','text',KEY_BYTES,true]];
  let selected:Record<string,unknown>[];
  try {selected=db.selectObjects(`SELECT ${fields.map(columns).join(',')} FROM catalog_run WHERE id=? LIMIT 2`,[location.runId]);}
  catch {return bad('Aural run lookup schema cannot be read');}
  if(selected.length!==1)bad('Missing or duplicate aural run');
  const row=selected[0]!,captured=fields.map(field=>value(row,field));
  const runInput=Object.freeze({id:location.runId,stableId:captured[0] as string,view:captured[1] as string,song:captured[2] as string,section:captured[3] as string,revision:captured[4] as string,
    supportsModeAnalysis:header.supportsModeAnalysis,tokens:captured[5] as Uint8Array,positions:captured[6] as Uint8Array,keyJson:captured[7] as string,sourceKeyJson:captured[8] as string});
  return Object.freeze({runInput,span:Object.freeze({offset:location.offset,length,start,end,snapshotId:header.sourceSnapshot})});
}
export const auralTargetQueryApi:AuralTargetQueryApi=Object.freeze({captureAuralTargetQuery,readAuralTargetRow});
