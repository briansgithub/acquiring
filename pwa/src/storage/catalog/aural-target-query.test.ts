import {DatabaseSync} from 'node:sqlite';
import {afterEach,expect,it,vi} from 'vitest';
import native from '../../domain/catalog/fixtures/native-target.json';
import {readAuralTargetRow} from './aural-target-query';
import type {AuralCatalogTargetQuery} from './aural-target-query-contracts';
import type {AuralReadDatabase} from './aural-read-contracts';

const SNAPSHOT='d'.repeat(64),dbs:DatabaseSync[]=[];
const probe=native.cases[0]!.probes[0]!;
const request:AuralCatalogTargetQuery={sourceSnapshot:SNAPSHOT,start:0,end:77,length:1};
function fixture(legacy=false){
  const sql=new DatabaseSync(':memory:');dbs.push(sql);
  sql.exec(`CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE catalog_array(name TEXT PRIMARY KEY,data BLOB);
    CREATE TABLE catalog_run(id INTEGER PRIMARY KEY,stable_id TEXT,view TEXT,song_id TEXT,section_id TEXT,revision TEXT,tokens BLOB,positions BLOB,key_json TEXT${legacy?'':',source_key_json TEXT'});`);
  for(const [key,value]of [['schema_version',legacy?'aural-catalog-1':'aural-catalog-3'],['snapshot_id',SNAPSHOT]])sql.prepare('INSERT INTO metadata VALUES (?,?)').run(key!,value!);
  sql.prepare('INSERT INTO catalog_array VALUES (?,?)').run('suffix_locations',new Uint8Array(8));
  sql.prepare(`INSERT INTO catalog_run VALUES (${Array(legacy?9:10).fill('?').join(',')})`).run(0,probe.stableId,probe.view,probe.song,probe.section,probe.revision,Buffer.from(probe.tokensGzip,'base64'),Buffer.from(probe.positionsGzip,'base64'),probe.keyRaw,...legacy?[]:[probe.sourceKeyRaw]);
  const reader:AuralReadDatabase={selectObjects:(text,bind=[])=>sql.prepare(text).all(...bind)};return {sql,reader};
}
afterEach(()=>{for(const db of dbs.splice(0))db.close();});
it('loads actual native fixture bytes through readonly SQLite without decoding/coercing',()=>{
  const {sql,reader}=fixture();sql.exec('PRAGMA query_only=ON');const row=readAuralTargetRow(reader,SNAPSHOT,request);
  expect(row.runInput).toMatchObject({id:0,stableId:probe.stableId,view:probe.view,keyJson:probe.keyRaw,sourceKeyJson:probe.sourceKeyRaw,supportsModeAnalysis:true});
  expect([...row.runInput.tokens]).toEqual([...Buffer.from(probe.tokensGzip,'base64')]);expect([...row.runInput.positions]).toEqual([...Buffer.from(probe.positionsGzip,'base64')]);
  expect(row.span).toEqual({offset:0,length:1,start:0,end:77,snapshotId:SNAPSHOT});expect(Object.isFrozen(row)).toBe(true);expect(Object.isFrozen(row.runInput)).toBe(true);expect(Object.isFrozen(row.span)).toBe(true);
});
it('schema1 reads key_json twice even when source_key_json column is absent',()=>{
  const {reader}=fixture(true),row=readAuralTargetRow(reader,SNAPSHOT,request);
  expect(row.runInput.supportsModeAnalysis).toBe(false);expect(row.runInput.sourceKeyJson).toBe(probe.keyRaw);
});
it('copies signed end exactly and permits zero length for the native slice stage',()=>{
  const {reader}=fixture();expect(readAuralTargetRow(reader,SNAPSHOT,{...request,end:-99,length:0}).span).toMatchObject({end:-99,length:0});
});
it('rejects stale request and malformed scalar fields before any SQL',()=>{
  const reader={selectObjects:vi.fn()};
  expect(()=>readAuralTargetRow(reader,SNAPSHOT,{...request,sourceSnapshot:'e'.repeat(64)})).toThrowError(expect.objectContaining({code:'STALE_SNAPSHOT'}));
  for(const query of [null,[],{...request,start:-1},{...request,start:1.5},{...request,end:2147483648},{...request,length:-1},{...request,length:10001},{...request,sourceSnapshot:'x'}])expect(()=>readAuralTargetRow(reader,SNAPSHOT,query as AuralCatalogTargetQuery)).toThrowError(expect.objectContaining({code:'INVALID_REQUEST'}));
  expect(reader.selectObjects).not.toHaveBeenCalled();
});
it('captures each request field once before SQL callbacks can mutate its source',()=>{
  const {reader}=fixture();const state={...request},reads={sourceSnapshot:0,start:0,end:0,length:0};
  const query=Object.fromEntries(Object.keys(state).map(key=>[key,{get(){reads[key as keyof typeof reads]++;return state[key as keyof typeof state];},enumerable:true}]));
  const input=Object.defineProperties({},query) as AuralCatalogTargetQuery;
  const select=reader.selectObjects;reader.selectObjects=(sql,bind)=>{state.end=-123;state.length=999;return select(sql,bind);};
  const row=readAuralTargetRow(reader,SNAPSHOT,input);expect(row.span).toMatchObject({end:77,length:1});expect(reads).toEqual({sourceSnapshot:1,start:1,end:1,length:1});
});
it('does not rebind old ranks to a changed database snapshot',()=>{
  const {sql,reader}=fixture();sql.prepare('UPDATE metadata SET value=? WHERE key=?').run('e'.repeat(64),'snapshot_id');
  expect(()=>readAuralTargetRow(reader,SNAPSHOT,request)).toThrowError(expect.objectContaining({code:'STALE_SNAPSHOT'}));
});
it('refuses nonexistent suffix ranks and missing runs',()=>{
  const {sql,reader}=fixture();expect(()=>readAuralTargetRow(reader,SNAPSHOT,{...request,start:1})).toThrowError(expect.objectContaining({code:'INVALID_REQUEST'}));
  sql.exec('DELETE FROM catalog_run');expect(()=>readAuralTargetRow(reader,SNAPSHOT,request)).toThrowError(expect.objectContaining({code:'INTEGRITY'}));
});
it('keeps raw JSON validation for the native decoder rather than inventing SQL eligibility',()=>{
  const {sql,reader}=fixture();sql.exec("UPDATE catalog_run SET key_json='not json',source_key_json='also not json'");
  expect(readAuralTargetRow(reader,SNAPSHOT,request).runInput.keyJson).toBe('not json');
});
it('refuses metadata/key/blob type mismatches and missing modern key columns',()=>{
  for(const change of ["UPDATE catalog_run SET view=NULL","UPDATE catalog_run SET key_json=x'00'","UPDATE catalog_run SET tokens='text'"]){const {sql,reader}=fixture();sql.exec(change);expect(()=>readAuralTargetRow(reader,SNAPSHOT,request)).toThrowError(expect.objectContaining({code:'INTEGRITY'}));}
  const {sql,reader}=fixture(true);sql.exec("UPDATE metadata SET value='aural-catalog-3' WHERE key='schema_version'");expect(()=>readAuralTargetRow(reader,SNAPSHOT,request)).toThrowError(expect.objectContaining({code:'INTEGRITY'}));
});
it('measures key limits as UTF8 bytes and refuses oversized metadata before value materialization',()=>{
  for(const [column,text]of [['key_json','é'.repeat(32769)],['view','x'.repeat(4097)]]){const {sql,reader}=fixture();sql.prepare(`UPDATE catalog_run SET ${column}=?`).run(text!);expect(()=>readAuralTargetRow(reader,SNAPSHOT,request)).toThrowError(expect.objectContaining({code:'LIMIT'}));}
});
it('does not select an over-limit compressed BLOB into JS',()=>{
  const {sql,reader}=fixture();sql.prepare('UPDATE catalog_run SET tokens=?').run(new Uint8Array(8*1024*1024+1));
  const select=reader.selectObjects;let captured:Record<string,unknown>|undefined;
  reader.selectObjects=(query,bind)=>{const rows=select(query,bind);if(query.includes('FROM catalog_run'))captured=rows[0];return rows;};
  expect(()=>readAuralTargetRow(reader,SNAPSHOT,request)).toThrowError(expect.objectContaining({code:'LIMIT'}));expect(captured!.tokens).toBeNull();expect(captured!.tokensSize).toBe(8*1024*1024+1);
});
