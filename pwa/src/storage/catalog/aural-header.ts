import {CatalogError} from './protocol';
import type {AuralCatalogHeader,AuralCatalogSchema,AuralHeaderReadApi,AuralReadDatabase,AuralSuffixLocation} from './aural-read-contracts';

const SNAPSHOT=/^[0-9a-f]{64}$/;
const KEYS=new Set(['schema_version','snapshot_id','sequence_reduction_version']);
const SCHEMAS=new Set(['aural-catalog-1','aural-catalog-2','aural-catalog-3']);
function integrity(message:string):never {throw new CatalogError('INTEGRITY',message);}
function rows(db:AuralReadDatabase,sql:string,bind?:(string|number)[]):Record<string,unknown>[] {
  try {return db.selectObjects(sql,bind);}
  catch {return integrity('Aural catalog lookup schema cannot be read');}
}

/** Frozen native capability flags, with explicit browser bounds before BLOB materialization. */
export function readAuralHeader(db:AuralReadDatabase,expectedSnapshot:string):AuralCatalogHeader {
  if(typeof expectedSnapshot!=='string'||!SNAPSHOT.test(expectedSnapshot))throw new CatalogError('INVALID_REQUEST','Expected catalog snapshot SHA256');
  const metadata=rows(db,"SELECT key,typeof(value) AS valueType,length(CAST(value AS BLOB)) AS valueBytes,CASE WHEN typeof(value)='text' AND length(CAST(value AS BLOB))<=16384 THEN CAST(value AS BLOB) END AS value FROM metadata WHERE key IN ('schema_version','snapshot_id','sequence_reduction_version') LIMIT 4");
  const values=new Map<string,string>();
  for(const row of metadata){
    const {key,value,valueType,valueBytes}=row;
    if(typeof key!=='string'||!KEYS.has(key)||values.has(key)||valueType!=='text'||typeof valueBytes!=='number'||!Number.isSafeInteger(valueBytes)||valueBytes<0||valueBytes>16384||!(value instanceof Uint8Array)||value.byteLength!==valueBytes)integrity('Invalid aural catalog metadata');
    let decoded:string;
    try {decoded=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(value);}
    catch {return integrity('Invalid aural metadata UTF8');}
    if(decoded.length>4096)integrity('Invalid aural catalog metadata');
    values.set(key,decoded);
  }
  const schema=values.get('schema_version'),snapshot=values.get('snapshot_id');
  if(!schema||!SCHEMAS.has(schema)||!snapshot||!SNAPSHOT.test(snapshot))integrity('Unsupported aural catalog header');
  if(snapshot!==expectedSnapshot)throw new CatalogError('STALE_SNAPSHOT','Aural catalog snapshot changed');
  const array=rows(db,"SELECT typeof(data) AS dataType,length(data) AS bytes FROM catalog_array WHERE name='suffix_locations' LIMIT 2");
  if(array.length!==1)integrity('Missing or duplicate aural suffix array');
  const {dataType,bytes}=array[0]!;
  if(dataType!=='blob'||typeof bytes!=='number'||!Number.isSafeInteger(bytes)||bytes<0||bytes>=2**31||bytes%8!==0)integrity('Invalid aural suffix array length or type');
  return Object.freeze({sourceSnapshot:snapshot,schemaVersion:schema as AuralCatalogSchema,
    supportsModeAnalysis:schema!=='aural-catalog-1',supportsStartGrouping:schema==='aural-catalog-3',
    reducedRanges:values.get('sequence_reduction_version')==='unique-transitions-1',suffixCount:bytes/8});
}

/** Read one location, preserving native signed little-endian values without allocating the array. */
export function readAuralSuffixLocation(db:AuralReadDatabase,header:AuralCatalogHeader,rank:number):AuralSuffixLocation {
  const count=header.suffixCount;
  if(!Number.isSafeInteger(count)||count<0||count>=2**28||!Number.isSafeInteger(rank)||rank<0||rank>=count)throw new CatalogError('INVALID_REQUEST','Invalid aural suffix rank');
  const selected=rows(db,"SELECT substr(data,?,8) AS location FROM catalog_array WHERE name='suffix_locations' AND typeof(data)='blob' LIMIT 2",[rank*8+1]);
  if(selected.length!==1)integrity('Missing or duplicate aural suffix location');
  const value=selected[0]!.location;
  if(!(value instanceof Uint8Array)||value.byteLength!==8)integrity('Truncated aural suffix location');
  const view=new DataView(value.buffer,value.byteOffset,8),runId=view.getInt32(0,true),offset=view.getInt32(4,true);
  if(runId<0||offset<0)integrity('Negative aural suffix location');
  return Object.freeze({runId,offset});
}

export const auralHeaderReadApi:AuralHeaderReadApi=Object.freeze({readAuralHeader,readAuralSuffixLocation});
