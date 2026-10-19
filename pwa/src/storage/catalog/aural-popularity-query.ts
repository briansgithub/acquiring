import {CatalogError} from './protocol';
import type {AuralReadDatabase} from './aural-read-contracts';
import type {AuralPopularityEntries,AuralPopularityReadApi} from './aural-popularity-contracts';

const MAX_IDS=10000,MAX_UNITS=4096,MAX_TEXT=8*1024*1024,MAX_BYTES=16384,BATCH=128;
function fail(code:'INVALID_REQUEST'|'LIMIT'|'INTEGRITY',message:string):never {throw new CatalogError(code,message);}
export function captureAuralPopularitySongIds(songIds:readonly string[]):readonly string[] {
 if(!Array.isArray(songIds))return fail('INVALID_REQUEST','Expected song ID array');
 const length=songIds.length;
 if(!Number.isSafeInteger(length)||length<0||length>MAX_IDS)return fail('LIMIT','Song ID count exceeds the browser limit');
 let units=0;const captured:string[]=[];
 for(let i=0;i<length;i++) {
  const id=songIds[i];
  if(typeof id!=='string')return fail('INVALID_REQUEST','Expected song ID string');
  units+=id.length;
  if(id.length>MAX_UNITS||units>MAX_TEXT)return fail('LIMIT','Song ID text exceeds the browser limit');
  for(let j=0;j<id.length;j++) {
   const unit=id.charCodeAt(j);
   if(unit>=0xd800&&unit<=0xdbff) {
    const next=id.charCodeAt(j+1);
    if(!(next>=0xdc00&&next<=0xdfff))return fail('INVALID_REQUEST','Expected well-formed song ID UTF16');
    j++;
   } else if(unit>=0xdc00&&unit<=0xdfff)return fail('INVALID_REQUEST','Expected well-formed song ID UTF16');
  }
  captured.push(id);
 }
 return Object.freeze(captured);
}
function readRow(row:Record<string,unknown>):{songId:string;score:number;confidence:number} {
 if(!row||typeof row!=='object'||Array.isArray(row))return fail('INTEGRITY','Invalid popularity row');
 // Each known returned field is captured once before decoding or validating it.
 const {songIdType,songIdSize,songId,scoreType,score,confidenceType,confidence}=row;
 if(songIdType!=='text'||typeof songIdSize!=='number'||!Number.isSafeInteger(songIdSize)||songIdSize<0)return fail('INTEGRITY','Invalid popularity song ID type or size');
 if(songIdSize>MAX_BYTES)return fail('LIMIT','Popularity song ID bytes exceed the browser limit');
 if(!(songId instanceof Uint8Array)||songId.byteLength!==songIdSize)return fail('INTEGRITY','Missing or truncated popularity song ID');
 let id:string;
 try {id=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(songId);}
 catch {return fail('INTEGRITY','Invalid popularity song ID UTF8');}
 if(id.length>MAX_UNITS)return fail('LIMIT','Popularity song ID text exceeds the browser limit');
 if((scoreType!=='integer'&&scoreType!=='real')||(confidenceType!=='integer'&&confidenceType!=='real')||typeof score!=='number'||!Number.isFinite(score)||typeof confidence!=='number'||!Number.isFinite(confidence))return fail('INTEGRITY','Invalid popularity numeric value');
 return {songId:id,score,confidence};
}
/** Selected rows from an already-confirmed immutable readonly popularity database. */
export function readAuralPopularity(db:AuralReadDatabase,songIds:readonly string[]):AuralPopularityEntries {
 const captured=captureAuralPopularitySongIds(songIds),ids:string[]=[],seen=new Set<string>();
 for(let i=0;i<captured.length;i++)if(!seen.has(captured[i]!)){seen.add(captured[i]!);ids.push(captured[i]!);}
 const found=new Map<string,{songId:string;score:number;confidence:number}>();let units=0;
 for(let start=0;start<ids.length;start+=BATCH) {
  const batch=ids.slice(start,start+BATCH),allowed=new Set(batch);
  // BLOB length bounds the whole UTF8 value, including embedded NUL; no raw INTEGER crosses into JS.
  const sql=`SELECT typeof(song_id) AS songIdType,length(CAST(song_id AS BLOB)) AS songIdSize,
CASE WHEN typeof(song_id)='text' AND length(CAST(song_id AS BLOB))<=16384 THEN CAST(song_id AS BLOB) END AS songId,
typeof(score) AS scoreType,CAST(score AS REAL) AS score,typeof(confidence) AS confidenceType,CAST(confidence AS REAL) AS confidence
FROM popularity WHERE song_id IN (${batch.map(()=>'?').join(',')}) AND score IS NOT NULL LIMIT 129`;
  let rows:Record<string,unknown>[];
  try {rows=db.selectObjects(sql,batch);}
  catch {return fail('INTEGRITY','Popularity schema cannot be read');}
  if(!Array.isArray(rows))return fail('INTEGRITY','Invalid popularity query result');
  const count=rows.length;
  if(!Number.isSafeInteger(count)||count<0||count>batch.length)return fail('INTEGRITY','Duplicate or excessive popularity rows');
  for(let i=0;i<count;i++) {
   const row=readRow(rows[i]!);
   if(!allowed.has(row.songId)||found.has(row.songId))return fail('INTEGRITY','Unknown or duplicate popularity song ID');
   units+=row.songId.length;
   if(units>MAX_TEXT)return fail('LIMIT','Popularity output text exceeds the browser limit');
   found.set(row.songId,Object.freeze(row));
  }
 }
 const output:{songId:string;score:number;confidence:number}[]=[];
 for(const id of ids){const row=found.get(id);if(row)output.push(row);}
 return Object.freeze(output);
}
export const auralPopularityReadApi:Readonly<AuralPopularityReadApi>=Object.freeze({captureAuralPopularitySongIds,readAuralPopularity});
