import {DatabaseSync} from 'node:sqlite';
import {afterEach,expect,it} from 'vitest';
import {captureAuralPopularitySongIds as capture,readAuralPopularity as read,auralPopularityReadApi} from './aural-popularity-query';
import type {AuralReadDatabase} from './aural-read-contracts';

const dbs:DatabaseSync[]=[];
function fixture(collation='BINARY') {
 const sql=new DatabaseSync(':memory:');dbs.push(sql);
 sql.exec(`CREATE TABLE popularity(song_id TEXT COLLATE ${collation},score,confidence)`);
 const add=(id:string,score:unknown,confidence:unknown)=>sql.prepare('INSERT INTO popularity VALUES (?,?,?)').run(id,score as number,confidence as number);
 const reader:AuralReadDatabase={selectObjects:(text,bind=[])=>sql.prepare(text).all(...bind)};
 const readonly=()=>sql.exec('PRAGMA query_only=ON');
 return {sql,add,reader,readonly};
}
function code(action:()=>unknown,value:string) {expect(action).toThrowError(expect.objectContaining({code:value}));}
afterEach(()=>{for(const db of dbs.splice(0))db.close();});
it('uses readonly SQLite, omits missing/NULL scores and preserves input first-encounter order',()=>{
 const {add,reader,readonly}=fixture();add('A',1.2,-3);add('B',-.2,4);add('null',null,'bad confidence');readonly();
 expect(read(reader,['B','A','missing','A','null'])).toEqual([{songId:'B',score:-.2,confidence:4},{songId:'A',score:1.2,confidence:-3}]);
});
it('casts actual large SQLite INTEGERs to Double before materializing into JS',()=>{
 const {add,reader,readonly}=fixture();add('big',9007199254740993n,9223372036854775807n);add('negative',-9223372036854775808n,0n);readonly();
 expect(read(reader,['big','negative'])).toEqual([{songId:'big',score:Number(9007199254740993n),confidence:Number(9223372036854775807n)},{songId:'negative',score:Number(-9223372036854775808n),confidence:0}]);
});
it('preserves exact NUL/BOM/empty and SQL-looking IDs through bound BLOB UTF8',()=>{
 const {add,reader,readonly}=fixture();const ids=['a\0b','a','\ufeffid','',"x' OR 1=1 --"];ids.forEach((id,i)=>add(id,i,i+.5));readonly();
 expect(read(reader,ids).map(p=>p.songId)).toEqual(ids);
 expect(read(reader,['absent'])).toEqual([]);
});
it('filters NULL-score rows before duplicate or malformed-confidence checking',()=>{
 const {add,reader,readonly}=fixture();add('A',null,'not numeric');add('A',.2,.3);add('A',null,null);add('null',null,new Uint8Array([1]));readonly();
 expect(read(reader,['A','null'])).toEqual([{songId:'A',score:.2,confidence:.3}]);
});
it('refuses selected nonnull duplicates with bounded LIMIT129 even for a corrupt large duplicate set',()=>{
 const {add,reader,readonly}=fixture();for(let i=0;i<200;i++)add('A',i,1);readonly();
 const select=reader.selectObjects;let count=0,query='';reader.selectObjects=(sql,bind)=>{query=sql;const rows=select(sql,bind);count=rows.length;return rows;};
 code(()=>read(reader,['A','A']),'INTEGRITY');expect(count).toBe(129);expect(query).toContain('LIMIT 129');
});
it('batches at128, binds every ID, dedupes owned values and reorders unordered SQL results',()=>{
 const {add,reader,readonly}=fixture();const ids=Array.from({length:257},(_,i)=>'id'+i);[...ids].reverse().forEach((id,i)=>add(id,i,.1));readonly();
 const select=reader.selectObjects,batches:(string|number)[][]=[];reader.selectObjects=(sql,bind=[])=>{batches.push([...bind]);expect(sql).toContain('score IS NOT NULL LIMIT 129');expect(sql).not.toContain('id0');return select(sql,bind);};
 const out=read(reader,[...ids,ids[0]!,ids[128]!]);expect(out.map(p=>p.songId)).toEqual(ids);expect(batches.map(b=>b.length)).toEqual([128,128,1]);expect(batches.flat()).toEqual(ids);
});
it('captures length/each index once without iterator/constructor/extra getters before any SQL callback',()=>{
 const {add,reader,readonly}=fixture();add('A',1,1);add('B',2,2);readonly();
 const original=['B','A','B'],reads=new Map<string,number>();
 const input=new Proxy(original,{get(target,key){if(key===Symbol.iterator||key==='constructor'||key==='unknown')throw Error('unexpected getter');if(key==='length'||typeof key==='string'&&/^\d+$/.test(key))reads.set(String(key),(reads.get(String(key))??0)+1);return Reflect.get(target,key);}});
 const select=reader.selectObjects;reader.selectObjects=(sql,bind)=>{original.splice(0,3,'changed');expect(capture([])).toEqual([]);return select(sql,bind);};
 expect(read(reader,input).map(p=>p.songId)).toEqual(['B','A']);expect([...reads.entries()]).toEqual([['length',1],['0',1],['1',1],['2',1]]);
});
it('rejects input types and all budgets before DB and ignores no indexed entries',()=>{
 let calls=0;const reader:AuralReadDatabase={selectObjects(){calls++;return [];}};
 for(const value of [null,{},'A',new Uint8Array(1),[null],[1],new Array(1)])code(()=>read(reader,value as readonly string[]),'INVALID_REQUEST');
 const oversized=new Proxy(new Array(10001),{get(target,key){if(key==='0')throw Error('touched index');return Reflect.get(target,key);}});
 code(()=>read(reader,oversized),'LIMIT');code(()=>read(reader,['x'.repeat(4097)]),'LIMIT');
 code(()=>read(reader,Array(2049).fill('x'.repeat(4096))),'LIMIT');expect(calls).toBe(0);
 expect(capture(Array(10000).fill(''))).toHaveLength(10000);
});
it('accepts exact8Mi UTF16 including repeated IDs and exact4096-unit astral strings',()=>{
 const {add,reader,readonly}=fixture();const id='😀'.repeat(2048);add(id,.5,1);readonly();
 const ids=Array(2048).fill(id),copy=capture(ids);expect(copy).toEqual(ids);expect(copy).not.toBe(ids);expect(Object.isFrozen(copy)).toBe(true);
 expect(read(reader,ids)).toEqual([{songId:id,score:.5,confidence:1}]);
 code(()=>read(reader,[...ids,'x']),'LIMIT');
});
it('bounds source UTF8 bytes before materialization even with embedded NUL and RTRIM matching',()=>{
 for(const size of [16384,16385]) {
  const {add,reader,readonly}=fixture('RTRIM');const id='a\0x';add(id+' '.repeat(size-id.length),1,1);readonly();
  const select=reader.selectObjects;let row:Record<string,unknown>|undefined;
  reader.selectObjects=(sql,bind)=>{const rows=select(sql,bind);row=rows[0];return rows;};
  code(()=>read(reader,[id]),'LIMIT');expect(row!.songIdSize).toBe(size);
  if(size===16385)expect(row!.songId).toBeNull();else expect((row!.songId as Uint8Array).byteLength).toBe(16384);
 }
});
it('checks source UTF16 after bounded BLOB fetch and refuses unknown IDs from source collation',()=>{
 const {add,reader,readonly}=fixture('RTRIM');add('a'+' '.repeat(4096),1,1);readonly();code(()=>read(reader,['a']),'LIMIT');
 const other=fixture('NOCASE');other.add('A',1,1);other.readonly();code(()=>read(other.reader,['a']),'INTEGRITY');
});
it('refuses actual nonnumeric/nonfinite/NULL-confidence SQL values but skips SQL NULL score',()=>{
 for(const [score,confidence]of [['.5',1],[new Uint8Array([1]),1],[.5,null],[.5,'1'],[.5,new Uint8Array([1])],[Infinity,1],[.5,-Infinity]]) {
  const {add,reader,readonly}=fixture();add('A',score,confidence);readonly();code(()=>read(reader,['A']),'INTEGRITY');
 }
 const {add,reader,readonly}=fixture();add('nan',NaN,NaN);readonly();expect(read(reader,['nan'])).toEqual([]);
});
it('maps missing schema/columns to bounded INTEGRITY errors and never reveals raw SQL errors',()=>{
 const {sql,reader,readonly}=fixture();sql.exec('DROP TABLE popularity');readonly();code(()=>read(reader,['A']),'INTEGRITY');
 const another=fixture();another.sql.exec('DROP TABLE popularity;CREATE TABLE popularity(song_id TEXT,score)');another.readonly();code(()=>read(another.reader,['A']),'INTEGRITY');
});
it('captures every returned known field once and refuses malformed/unknown projections',()=>{
 const {add,reader,readonly,sql}=fixture();add('A',.5,1);readonly();
 const select=reader.selectObjects,counts=new Map<string,number>();let bytes:Uint8Array|undefined;
 reader.selectObjects=(query,bind)=>select(query,bind).map(row=>{
  bytes=row.songId as Uint8Array;const copy:Record<string,unknown>={};for(const key of Object.keys(row))Object.defineProperty(copy,key,{get(){counts.set(key,(counts.get(key)??0)+1);return row[key];}});
  Object.defineProperty(copy,'unknown',{get(){throw Error('unknown getter');}});return copy;
 });
 const out=read(reader,['A']);expect([...counts.values()]).toEqual(Array(7).fill(1));bytes!.fill(0);expect(out[0]!.songId).toBe('A');
 const raw=select('SELECT typeof(song_id) AS songIdType,length(CAST(song_id AS BLOB)) AS songIdSize,CAST(song_id AS BLOB) AS songId,typeof(score) AS scoreType,CAST(score AS REAL) AS score,typeof(confidence) AS confidenceType,CAST(confidence AS REAL) AS confidence FROM popularity')[0]!;
 const malformed=sql.prepare("SELECT x'ff' AS value").get()!.value as Uint8Array;
 for(const change of [{songId:malformed,songIdSize:1},{songIdType:'blob'},{songIdSize:2},{songId:new TextEncoder().encode('B')},{scoreType:'text'},{confidenceType:'null'},{score:NaN},{confidence:undefined}])code(()=>read({selectObjects:()=>[{...raw,...change}]},['A']),'INTEGRITY');
});
it('returns independent frozen outputs/API and fresh empty arrays without any SQL',()=>{
 let calls=0;const reader:AuralReadDatabase={selectObjects(){calls++;throw Error('not called');}};
 const a=read(reader,[]),b=read(reader,[]);expect(a).toEqual([]);expect(a).not.toBe(b);expect(Object.isFrozen(a)).toBe(true);expect(calls).toBe(0);
 const {add,reader:db,readonly}=fixture();add('A',.5,1);readonly();const x=read(db,['A']),y=read(db,['A']);expect(x).toEqual(y);expect(x).not.toBe(y);expect(x[0]).not.toBe(y[0]);expect(Object.isFrozen(x)).toBe(true);expect(Object.isFrozen(x[0])).toBe(true);expect(Object.isFrozen(auralPopularityReadApi)).toBe(true);
});

it('refuses lone/split UTF16 surrogates before any binder while retaining valid pairs',()=>{
 const high=String.fromCharCode(0xd800),low=String.fromCharCode(0xdc00);let calls=0;
 const reader:AuralReadDatabase={selectObjects(){calls++;return [];}};
 for(const ids of [[high],[low],[high,low],['x'+high+'y'],['x'+low]])code(()=>read(reader,ids),'INVALID_REQUEST');
 expect(calls).toBe(0);
 const {add,reader:db,readonly}=fixture(),valid='x'+high+low+'y';add(valid,.5,1);readonly();
 expect(read(db,[valid])).toEqual([{songId:valid,score:.5,confidence:1}]);
});
