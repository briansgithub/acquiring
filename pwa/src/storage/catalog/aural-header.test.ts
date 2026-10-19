import {DatabaseSync} from 'node:sqlite';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {readAuralHeader,readAuralSuffixLocation} from './aural-header';
import type {AuralCatalogHeader,AuralReadDatabase} from './aural-read-contracts';

const SNAPSHOT='d'.repeat(64),databases:DatabaseSync[]=[];
function pairs(...entries:[number,number][]):Uint8Array {
  const bytes=new Uint8Array(entries.length*8),view=new DataView(bytes.buffer);
  entries.forEach(([run,offset],index)=>{view.setInt32(index*8,run,true);view.setInt32(index*8+4,offset,true);});return bytes;
}
function fixture(options:{schema?:string;snapshot?:string;reduction?:string;data?:unknown;metadata?:[string,unknown][];omitArray?:boolean}={}):{sql:DatabaseSync;reader:AuralReadDatabase} {
  const sql=new DatabaseSync(':memory:');databases.push(sql);
  sql.exec('CREATE TABLE metadata(key TEXT,value);CREATE TABLE catalog_array(name TEXT,data)');
  const add=sql.prepare('INSERT INTO metadata VALUES (?,?)');
  for(const [key,value]of options.metadata??[['schema_version',options.schema??'aural-catalog-3'],['snapshot_id',options.snapshot??SNAPSHOT],['sequence_reduction_version',options.reduction??'unique-transitions-1']])add.run(key,value as string);
  if(!options.omitArray)sql.prepare('INSERT INTO catalog_array VALUES (?,?)').run('suffix_locations',(options.data??pairs([0,3],[513,65537])) as Uint8Array);
  return {sql,reader:{selectObjects:(text,bind=[])=>sql.prepare(text).all(...bind)}};
}
afterEach(()=>{for(const sql of databases.splice(0))sql.close();});
describe('actual SQLite aural header and bounded suffix lookup',()=>{
  it.each(['aural-catalog-1','aural-catalog-2','aural-catalog-3'])('uses native flags for %s and keeps the handle readonly',schema=>{
    const {sql,reader}=fixture({schema});sql.exec('PRAGMA query_only=ON');
    expect(readAuralHeader(reader,SNAPSHOT)).toEqual({sourceSnapshot:SNAPSHOT,schemaVersion:schema,supportsModeAnalysis:schema!=='aural-catalog-1',supportsStartGrouping:schema==='aural-catalog-3',reducedRanges:true,suffixCount:2});
    const header=readAuralHeader(reader,SNAPSHOT);
    expect(readAuralSuffixLocation(reader,header,0)).toEqual({runId:0,offset:3});
    expect(readAuralSuffixLocation(reader,header,1)).toEqual({runId:513,offset:65537});
    expect(Object.isFrozen(header)).toBe(true);expect(Object.isFrozen(readAuralSuffixLocation(reader,header,1))).toBe(true);
  });
  it('ignores unrelated metadata; only exact reduction version opts in',()=>{
    const {sql,reader}=fixture({reduction:'unique-transitions-2'});sql.prepare('INSERT INTO metadata VALUES (?,?)').run('ignored','x'.repeat(9000));
    expect(readAuralHeader(reader,SNAPSHOT).reducedRanges).toBe(false);
  });
  it('accepts an empty array but has no valid rank',()=>{
    const {reader}=fixture({data:new Uint8Array()});const header=readAuralHeader(reader,SNAPSHOT);expect(header.suffixCount).toBe(0);
    expect(()=>readAuralSuffixLocation(reader,header,0)).toThrowError(expect.objectContaining({code:'INVALID_REQUEST'}));
  });
  it('rejects stale snapshot before reading array data',()=>{
    const {sql,reader}=fixture();sql.exec('DROP TABLE catalog_array');
    expect(()=>readAuralHeader(reader,'e'.repeat(64))).toThrowError(expect.objectContaining({code:'STALE_SNAPSHOT'}));
  });
  it.each(['aural-catalog-4','aural-catalog-3 '])('refuses unsupported schema %s',schema=>{
    expect(()=>readAuralHeader(fixture({schema}).reader,SNAPSHOT)).toThrowError(expect.objectContaining({code:'INTEGRITY'}));
  });
  it('refuses missing/duplicate/nontext/oversized known metadata',()=>{
    for(const metadata of [
      [['schema_version','aural-catalog-3']],
      [['schema_version','aural-catalog-3'],['snapshot_id',SNAPSHOT],['snapshot_id',SNAPSHOT]],
      [['schema_version',3],['snapshot_id',SNAPSHOT]],
      [['schema_version','aural-catalog-3'],['snapshot_id','x'.repeat(4097)]],
    ] as [string,unknown][][])expect(()=>readAuralHeader(fixture({metadata}).reader,SNAPSHOT)).toThrowError(expect.objectContaining({code:'INTEGRITY'}));
  });
  it('rejects unknown snapshot shape and caller rank without database access',()=>{
    const reader={selectObjects:vi.fn()};
    for(const raw of ['',SNAPSHOT.toUpperCase(),'d'.repeat(63),null,{}])expect(()=>readAuralHeader(reader,raw as string)).toThrowError(expect.objectContaining({code:'INVALID_REQUEST'}));
    const header={suffixCount:2} as AuralCatalogHeader;
    for(const rank of [-1,2,.5,NaN,Infinity,Number.MAX_SAFE_INTEGER])expect(()=>readAuralSuffixLocation(reader,header,rank)).toThrowError(expect.objectContaining({code:'INVALID_REQUEST'}));
    expect(reader.selectObjects).not.toHaveBeenCalled();
  });
  it('refuses text, incomplete pairs, missing and duplicate suffix arrays',()=>{
    for(const data of ['not-a-blob',new Uint8Array(7),new Uint8Array(12)])expect(()=>readAuralHeader(fixture({data}).reader,SNAPSHOT)).toThrowError(expect.objectContaining({code:'INTEGRITY'}));
    expect(()=>readAuralHeader(fixture({omitArray:true}).reader,SNAPSHOT)).toThrowError(expect.objectContaining({code:'INTEGRITY'}));
    const {sql,reader}=fixture();sql.prepare('INSERT INTO catalog_array VALUES (?,?)').run('suffix_locations',pairs([1,2]));
    expect(()=>readAuralHeader(reader,SNAPSHOT)).toThrowError(expect.objectContaining({code:'INTEGRITY'}));
  });
  it('uses length metadata to reject the2GiB boundary without allocating a huge fixture',()=>{
    const {reader}=fixture();const original=reader.selectObjects;
    reader.selectObjects=(sql,bind)=>sql.startsWith('SELECT typeof')?[{dataType:'blob',bytes:2**31}]:original(sql,bind);
    expect(()=>readAuralHeader(reader,SNAPSHOT)).toThrowError(expect.objectContaining({code:'INTEGRITY'}));
  });
  it('refuses negative signed locations and truncated bytes independently of native byte order',()=>{
    for(const data of [pairs([-1,0]),pairs([0,-2147483648])]){const {reader}=fixture({data});expect(()=>readAuralSuffixLocation(reader,readAuralHeader(reader,SNAPSHOT),0)).toThrowError(expect.objectContaining({code:'INTEGRITY'}));}
    const {sql,reader}=fixture();const header=readAuralHeader(reader,SNAPSHOT);sql.prepare('UPDATE catalog_array SET data=?').run(new Uint8Array(9));
    expect(()=>readAuralSuffixLocation(reader,header,1)).toThrowError(expect.objectContaining({code:'INTEGRITY'}));
  });
  it('copies header count before callbacks and bounds SQL materialization to8bytes',()=>{
    const {reader}=fixture();let reads=0;
    const header={get suffixCount(){reads++;return 2;}} as AuralCatalogHeader;
    const original=reader.selectObjects;let observed='';let bounds:(string|number)[]=[];
    reader.selectObjects=(sql,bind)=>{observed=sql;bounds=bind!;return original(sql,bind);};
    expect(readAuralSuffixLocation(reader,header,1)).toEqual({runId:513,offset:65537});expect(reads).toBe(1);
    expect(observed).toContain('substr(data,?,8)');expect(bounds).toEqual([9]);
  });
  it('preserves exact NUL/BOM text through bounded BLOB reads instead of binding truncation',()=>{
    const {sql,reader}=fixture();
    sql.prepare('UPDATE metadata SET value=? WHERE key=?').run('unique-transitions-1\0junk','sequence_reduction_version');
    expect(readAuralHeader(reader,SNAPSHOT).reducedRanges).toBe(false);
    sql.prepare('UPDATE metadata SET value=? WHERE key=?').run(SNAPSHOT+'\0junk','snapshot_id');
    expect(()=>readAuralHeader(reader,SNAPSHOT)).toThrowError(expect.objectContaining({code:'INTEGRITY'}));
    sql.prepare('UPDATE metadata SET value=? WHERE key=?').run('\ufeff'+SNAPSHOT,'snapshot_id');
    expect(()=>readAuralHeader(reader,SNAPSHOT)).toThrowError(expect.objectContaining({code:'INTEGRITY'}));
  });
  it('SQL bounds metadata bytes before materialization even after NUL and rejects invalid UTF8',()=>{
    const {sql,reader}=fixture();const original=reader.selectObjects;let observed:Record<string,unknown>|undefined;
    reader.selectObjects=(text,bind)=>{const rows=original(text,bind);if(text.includes('FROM metadata'))observed=rows.find(r=>r.key==='sequence_reduction_version');return rows;};
    sql.prepare('UPDATE metadata SET value=? WHERE key=?').run('\0'+'x'.repeat(20000),'sequence_reduction_version');
    expect(()=>readAuralHeader(reader,SNAPSHOT)).toThrowError(expect.objectContaining({code:'INTEGRITY'}));
    expect(observed!.value).toBeNull();expect(observed!.valueBytes).toBe(20001);
    sql.exec("UPDATE metadata SET value=CAST(x'ff' AS TEXT) WHERE key='sequence_reduction_version'");
    expect(()=>readAuralHeader(reader,SNAPSHOT)).toThrowError(expect.objectContaining({code:'INTEGRITY'}));
  });
  it('keeps the UTF16 boundary after byte-bounded astral text decode',()=>{
    const {sql,reader}=fixture();
    sql.prepare('UPDATE metadata SET value=? WHERE key=?').run('😀'.repeat(2048),'sequence_reduction_version');
    expect(readAuralHeader(reader,SNAPSHOT).reducedRanges).toBe(false);
    sql.prepare('UPDATE metadata SET value=? WHERE key=?').run('😀'.repeat(2049),'sequence_reduction_version');
    expect(()=>readAuralHeader(reader,SNAPSHOT)).toThrowError(expect.objectContaining({code:'INTEGRITY'}));
  });
  it('reports missing lookup schema as integrity failure without a write or fallback query',()=>{
    const {sql,reader}=fixture();sql.exec('DROP TABLE metadata');
    expect(()=>readAuralHeader(reader,SNAPSHOT)).toThrowError(expect.objectContaining({code:'INTEGRITY'}));
  });
});
