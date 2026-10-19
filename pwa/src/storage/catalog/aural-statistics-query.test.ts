import {DatabaseSync} from 'node:sqlite';
import {afterEach,expect,it,vi} from 'vitest';
import {captureAuralStatisticsRange,readAuralStatisticsFacts} from './aural-statistics-query';
import type {AuralReadDatabase} from './aural-read-contracts';
import type {AuralCatalogTargetQuery} from './aural-target-query-contracts';
const S='d'.repeat(64),dbs:DatabaseSync[]=[],query={sourceSnapshot:S,start:0,end:3,length:3};
function pairs(entries:[number,number][]):Uint8Array {const b=new Uint8Array(entries.length*8),v=new DataView(b.buffer);entries.forEach(([r,o],i)=>{v.setInt32(i*8,r,true);v.setInt32(i*8+4,o,true);});return b;}
function fixture(schema='aural-catalog-3'){
 const sql=new DatabaseSync(':memory:');dbs.push(sql);sql.exec('CREATE TABLE metadata(key TEXT,value TEXT);CREATE TABLE catalog_array(name TEXT,data BLOB);CREATE TABLE catalog_run(id INTEGER,song_id,section_id);CREATE TABLE catalog_song(id TEXT)');
 for(const [k,v]of [['schema_version',schema],['snapshot_id',S]])sql.prepare('INSERT INTO metadata VALUES (?,?)').run(k!,v!);
 sql.prepare('INSERT INTO catalog_array VALUES (?,?)').run('suffix_locations',pairs([[2,5],[0,0],[2,8],[1,3]]));
 for(const row of [[0,'A\0suffix','s0'],[1,'B','shared'],[2,'A\0suffix','shared']] as const)sql.prepare('INSERT INTO catalog_run VALUES (?,?,?)').run(...row);
 for(const song of ['A\0suffix','A\0suffix'])sql.prepare('INSERT INTO catalog_song VALUES (?)').run(song);
 const reader:AuralReadDatabase={selectObjects:(text,bind=[])=>sql.prepare(text).all(...bind)};return {sql,reader};
}
afterEach(()=>{for(const db of dbs.splice(0))db.close();});
it.each(['aural-catalog-1','aural-catalog-2','aural-catalog-3'])('reads readonly ordered scalar facts for %s without gzip or popularity',schema=>{
 const {sql,reader}=fixture(schema);sql.exec('PRAGMA query_only=ON');const facts=readAuralStatisticsFacts(reader,S,query);
 expect(facts).toEqual({sourceSnapshot:S,occurrences:[{runId:2,offset:5},{runId:0,offset:0},{runId:2,offset:8},{runId:1,offset:3}],runs:[{id:2,songId:'A\0suffix',sectionId:'shared'},{id:0,songId:'A\0suffix',sectionId:'s0'},{id:1,songId:'B',sectionId:'shared'}],validSongIds:['A\0suffix']});
 expect(Object.isFrozen(facts)).toBe(true);for(const array of [facts.runs,facts.occurrences,facts.validSongIds])expect(Object.isFrozen(array)).toBe(true);
 expect(facts.runs.every(Object.isFrozen)).toBe(true);expect(facts.occurrences.every(Object.isFrozen)).toBe(true);
});
it('bounds substr to requested pairs and returns empty reversed range without run lookup',()=>{
 const {sql,reader}=fixture(),select=reader.selectObjects;let bounds:(string|number)[]=[];
 reader.selectObjects=(text,bind)=>{if(text.includes('AS locations'))bounds=bind!;return select(text,bind);};
 expect(readAuralStatisticsFacts(reader,S,{...query,start:1,end:2}).occurrences).toEqual([{runId:0,offset:0},{runId:2,offset:8}]);expect(bounds).toEqual([9,16]);
 sql.exec('DROP TABLE catalog_run');expect(readAuralStatisticsFacts(reader,S,{...query,start:2,end:1}).occurrences).toEqual([]);
});
it('captures each scalar once before SQL callbacks and never rebinds stale snapshots',()=>{
 const {reader}=fixture(),input={...query},counts=new Map<string,number>();const wrapped={} as AuralCatalogTargetQuery;
 for(const key of Object.keys(input) as (keyof typeof input)[])Object.defineProperty(wrapped,key,{get(){counts.set(key,(counts.get(key)??0)+1);return input[key];}});
 const select=reader.selectObjects;reader.selectObjects=(sql,bind)=>{input.end=-99;input.length=9999;return select(sql,bind);};
 expect(readAuralStatisticsFacts(reader,S,wrapped).occurrences).toHaveLength(4);expect([...counts.values()]).toEqual([1,1,1,1]);
 const unused={selectObjects:vi.fn()};expect(()=>readAuralStatisticsFacts(unused,S,{...query,sourceSnapshot:'e'.repeat(64)})).toThrowError(expect.objectContaining({code:'STALE_SNAPSHOT'}));expect(unused.selectObjects).not.toHaveBeenCalled();
});
it('refuses malformed/too-wide ranges before SQL and missing ranks after header',()=>{
 const reader={selectObjects:vi.fn()};for(const q of [null,[],{...query,start:-1},{...query,length:1},{...query,length:10001},{...query,end:2147483648},{...query,sourceSnapshot:'x'}])expect(()=>readAuralStatisticsFacts(reader,S,q as AuralCatalogTargetQuery)).toThrowError(expect.objectContaining({code:'INVALID_REQUEST'}));
 expect(()=>readAuralStatisticsFacts(reader,S,{...query,end:10000})).toThrowError(expect.objectContaining({code:'LIMIT'}));expect(reader.selectObjects).not.toHaveBeenCalled();
 expect(()=>readAuralStatisticsFacts(fixture().reader,S,{...query,end:4})).toThrowError(expect.objectContaining({code:'INVALID_REQUEST'}));expect(Object.isFrozen(captureAuralStatisticsRange(query))).toBe(true);
});
it('requires each referenced run exactly once but duplicate song rows only affect membership',()=>{
 const missing=fixture();missing.sql.exec('DELETE FROM catalog_run WHERE id=2');expect(()=>readAuralStatisticsFacts(missing.reader,S,query)).toThrowError(expect.objectContaining({code:'INTEGRITY'}));
 const duplicate=fixture();duplicate.sql.exec("INSERT INTO catalog_run VALUES (2,'A','other')");expect(()=>readAuralStatisticsFacts(duplicate.reader,S,query)).toThrowError(expect.objectContaining({code:'INTEGRITY'}));
});
it('refuses bad column types/UTF8 and SQL schema without writes/fallback',()=>{
 for(const statement of ["UPDATE catalog_run SET song_id=x'00' WHERE id=2","UPDATE catalog_run SET section_id=NULL WHERE id=2","UPDATE catalog_run SET song_id=CAST(x'ff' AS TEXT) WHERE id=2",'DROP TABLE catalog_song']){const {sql,reader}=fixture();sql.exec(statement);expect(()=>readAuralStatisticsFacts(reader,S,query)).toThrowError(expect.objectContaining({code:'INTEGRITY'}));}
});
it('bounds exact UTF8 bytes before materialization even after NUL, then UTF16',()=>{
 const {sql,reader}=fixture(),select=reader.selectObjects;let found:Record<string,unknown>[]=[];
 reader.selectObjects=(text,bind)=>{const rows=select(text,bind);if(text.includes('FROM catalog_run'))found=rows;return rows;};
 sql.prepare('UPDATE catalog_run SET song_id=? WHERE id=2').run('\0'+'x'.repeat(20000));expect(()=>readAuralStatisticsFacts(reader,S,query)).toThrowError(expect.objectContaining({code:'LIMIT'}));expect(found.find(r=>r.id===2)!.song).toBeNull();
 sql.prepare('UPDATE catalog_run SET song_id=? WHERE id=2').run('😀'.repeat(2048));expect(readAuralStatisticsFacts(reader,S,query).runs[0]!.songId).toHaveLength(4096);
 sql.prepare('UPDATE catalog_run SET song_id=? WHERE id=2').run('😀'.repeat(2049));expect(()=>readAuralStatisticsFacts(reader,S,query)).toThrowError(expect.objectContaining({code:'LIMIT'}));
});
it('binds distinct run IDs in batches<=128 and refuses aggregate text beyond8Mi units',()=>{
 const {sql,reader}=fixture();sql.exec('DELETE FROM catalog_run');const add=sql.prepare('INSERT INTO catalog_run VALUES (?,?,?)');
 for(let i=0;i<300;i++)add.run(i,'song','s'+i);sql.prepare('UPDATE catalog_array SET data=?').run(pairs(Array.from({length:300},(_,i)=>[i,0])));
 const select=reader.selectObjects,batches:number[]=[];reader.selectObjects=(text,bind)=>{if(text.includes('FROM catalog_run')){batches.push(bind!.length);expect(text).not.toContain('tokens');expect(text).not.toContain('positions');}return select(text,bind);};
 expect(readAuralStatisticsFacts(reader,S,{...query,end:299}).runs).toHaveLength(300);expect(batches).toEqual([128,128,44]);
 sql.exec('DELETE FROM catalog_run');for(let i=0;i<1100;i++)add.run(i,'x'.repeat(4096),'y'.repeat(4096));sql.prepare('UPDATE catalog_array SET data=?').run(pairs(Array.from({length:1100},(_,i)=>[i,0])));
 expect(()=>readAuralStatisticsFacts(reader,S,{...query,end:1099})).toThrowError(expect.objectContaining({code:'LIMIT'}));
});
it('refuses negative/truncated selected pairs and browser-unsafe end arithmetic',()=>{
 for(const pair of [[-1,0],[0,-1],[0,2147483647]] as [number,number][]){const {sql,reader}=fixture();sql.prepare('UPDATE catalog_array SET data=?').run(pairs([pair]));expect(()=>readAuralStatisticsFacts(reader,S,{...query,end:0})).toThrowError(expect.objectContaining({code:pair[1]===2147483647?'LIMIT':'INTEGRITY'}));}
 const {reader}=fixture(),select=reader.selectObjects;reader.selectObjects=(text,bind)=>text.includes('AS locations')?[{locations:new Uint8Array(31)}]:select(text,bind);expect(()=>readAuralStatisticsFacts(reader,S,query)).toThrowError(expect.objectContaining({code:'INTEGRITY'}));
});
