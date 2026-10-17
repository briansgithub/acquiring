import {describe,expect,it,vi} from 'vitest';
import native from './fixtures/native-session-envelope.json';
import {repairAuralSessionEnvelope as repair,auralSessionEnvelopeApi} from './session-envelope';
import type {AuralSessionEnvelopeRepair,AuralSessionEnvelopeApi} from './session-contracts';
const rows=native.cases;
const projection=(r:AuralSessionEnvelopeRepair)=>({envelope:JSON.parse(JSON.stringify(r.envelope,(key,value)=>key==='corpus'&&value!==null?'typed-corpus-present':value)),warning:r.warning});
function frozen(value:unknown):boolean{return value===null||typeof value!=='object'||(Object.isFrozen(value)&&Object.values(value).every(frozen));}
function historyInput():Record<string,any>{return JSON.parse(rows.find(row=>row.label==='typed-corpus-and-exact-history-seed')!.raw!);}
function run(value:unknown){return repair(JSON.stringify(value));}
const savedProgress={attempts:7,cells:{'dominant-return:guided':{practice:4,practiceCorrect:4}}};
describe('native16 actual-serializer field projections',()=>{
 for(const row of rows)it(row.label,()=>{const r=repair(row.raw);expect(projection(r)).toEqual(row.expected);expect(frozen(r)).toBe(true);expect(r.deferred.originalRaw).toBe(row.raw);});
});
describe('session decoder browser safety and deferred scope',()=>{
 it('exposes typed frozen API and returns independent defaults without clocks or storage',()=>{
  const api:AuralSessionEnvelopeApi=auralSessionEnvelopeApi,a=api.repairAuralSessionEnvelope(null),b=repair(null);
  expect(Object.isFrozen(api)).toBe(true);expect(a).toEqual(b);expect(a.envelope.progress).not.toBe(b.envelope.progress);expect(a.warning).toBe('');expect(a.issues).toEqual([]);
 });
 it('retains numeric token semantics, duplicate-key last wins and exact safe native exponent forms',()=>{
  expect(repair('{"version":2.0,"exampleSettings":{"analysis":"allModes"}}').envelope.exampleSettings.analysis).toBe('relativeMajor');
  expect(repair('{"version":2e0,"exampleSettings":{"analysis":"allModes"}}').envelope.exampleSettings.analysis).toBe('allModes');
  expect(repair('{"version":3,"version":1}').warning).toBe('');expect(repair('{"version":1,"version":3}').warning).toContain('Starting fresh');
  for(const [serial,expected]of [[' 0007 ','7'],['1e2','100'],['100e-2','1'],['-0','0'],['"7"','7'],['-9223372036854775808','0'],['9223372036854775807','9223372036854775807']])expect(run({serial}).envelope.serial).toBe(expected);
  for(const raw of ['{"serial":1.0}','{"serial":9007199254740993}','{"serial":"+1"}','{"serial":"9007199254740993e0"}','{"serial":"1e-999"}']){const r=repair(raw);expect(r.envelope.serial).toBe('0');expect(r.issues.some(i=>i.field==='serial')).toBe(true);expect(r.deferred.originalRaw).toBe(raw);}
  expect(run({microphoneEnabled:'fAlSe'}).envelope.microphoneEnabled).toBe(false);
 });
 it('isolates strict progress decode but performs primary normalization last and inversion normalization inside its guard',()=>{
  const badTyped=run({serial:'7',progress:{cells:{good:{practice:1},bad:{practice:'bad'}}},inversionProgress:savedProgress});
  expect(badTyped.envelope.serial).toBe('7');expect(badTyped.envelope.progress.cells).toEqual({});expect(badTyped.envelope.inversionProgress.attempts).toBe(7);
  const late={attempts:7,cells:{'dominant-return:guided':{lastAt:'9223372036854775807'}}};
  const primary=run({serial:'7',progress:late});expect(primary.envelope.serial).toBe('0');expect(primary.warning).toContain('Starting fresh');
  const inversion=run({serial:'7',progress:savedProgress,inversionProgress:late});expect(inversion.envelope.serial).toBe('7');expect(inversion.envelope.progress.attempts).toBe(7);expect(inversion.envelope.inversionProgress.attempts).toBe(0);expect(inversion.warning).not.toContain('Starting fresh');
  const unsafeNumeric=repair('{"serial":"7","progress":{"cells":{"dominant-return:guided":{"lastAt":9007199254740993}}}}');expect(unsafeNumeric.envelope.serial).toBe('7');expect(unsafeNumeric.issues.some(i=>i.code==='unsafe-long')).toBe(true);
 });
 it('validates nested native corpus required/default/null types while preserving complete opaque values and Long representation',()=>{
  const value=historyInput(),record=value.progress.recent[0],corpus=record.corpus;
  corpus.extra={nested:[true,null,{label:'opaque'}]};corpus.settings.unknown='keep';corpus.passage.events[0].extra=[1,2];corpus.seed=7;
  const before=JSON.stringify(corpus),r=run(value),kept=r.envelope.progress.recent[0].corpus;
  expect(JSON.stringify(kept)).toBe(before);expect(r.envelope.progress.recent[0].seed).toBe('9223372036854775807');expect(frozen(kept)).toBe(true);
  expect((kept as any).passage.events[0]).not.toHaveProperty('beats');expect((kept as any).settings).toEqual({unknown:'keep'});
  for(const mutate of [
   (c:any)=>{delete c.popularityVersion;},(c:any)=>{delete c.passage.sectionId;},(c:any)=>{c.settings.popularity=null;},
   (c:any)=>{c.passage.events[0].notes=[null];},(c:any)=>{c.passage.events[0].beats=null;},(c:any)=>{c.playbackTempo='bad';},
   (c:any)=>{c.seed='9223372036854775808';},(c:any)=>{c.extra={unsafe:9007199254740992};},(c:any)=>{c.passage.tempo=1.5;},
  ]){const input=historyInput();mutate(input.progress.recent[0].corpus);const result=run(input);expect(result.envelope.progress.recent).toEqual([]);expect(result.issues.some(i=>i.field==='progress')).toBe(true);}
 });
 it('does not apply musical/source identity restoration validation to structurally valid corpus',()=>{
  const value=historyInput(),c=value.progress.recent[0].corpus;c.passage.familyId='different';c.passage.tempo=-500;c.passage.startIndex=-3;
  c.passage.events[0]={notes:[999,-1],rootMidi:999,bassMidi:4,degree:'unknown',functionLabel:'arbitrary',beats:-2};
  expect(run(value).envelope.progress.recent[0].corpus).toEqual(c);
  for(const beats of ['0x.8p1','0x'+'f'.repeat(256)+'p-1023','0x0p999999']){c.passage.events[0].beats=beats;expect(run(value).envelope.progress.recent[0].corpus).toEqual(c);}
  c.passage.events[0].beats='0x1p1024';expect(run(value).envelope.progress.recent).toEqual([]);
 });
 it('preserves nonnull current and return as independent frozen deferred JSON, even on version failure',()=>{
  const current={seed:'-9223372036854775808',provenance:{corpus:{unknown:[1,{a:true}]}}},playbackReturn={exerciseId:'x',plays:-99,opaque:'preserved'};
  const raw=JSON.stringify({version:3,current,playbackReturn}),r=repair(raw);
  expect(r.deferred).toEqual({current,playbackReturn,originalRaw:raw});expect(r.envelope.progress.recent).toEqual([]);
  expect(r.issues.filter(i=>i.code==='deferred').map(i=>i.field)).toEqual(['current','playbackReturn']);expect(frozen(r)).toBe(true);
  const a=run({current,playbackReturn}),b=run({current,playbackReturn});expect(a.warning).toBe('');expect(a.deferred.current).not.toBe(b.deferred.current);
 });
 it('refuses rounded unsafe integers in both deferred payloads while preserving raw recovery and good fields',()=>{
  const raw='{"serial":"7","progress":{"attempts":3},"current":{"seed":9007199254740993},"playbackReturn":{"plays":9007199254740993}}',r=repair(raw);
  expect(r.envelope.serial).toBe('7');expect(r.envelope.progress.attempts).toBe(3);expect(r.warning).toBe('');
  expect(r.deferred).toEqual({current:null,playbackReturn:null,originalRaw:raw});
  expect(r.issues.filter(i=>i.code==='unsafe-json-number').map(i=>i.field)).toEqual(['current','playbackReturn']);
 });
 it('enforces global byte/depth/token bounds before calling JSON.parse and retains exact refused input',()=>{
  const raws=[' '.repeat(1048577),'"'+'€'.repeat(400000)+'"','['.repeat(33)+'0'+']'.repeat(33),'['+Array(32769).fill('0').join(',')+']'];
  for(const raw of raws){const spy=vi.spyOn(JSON,'parse');let r:AuralSessionEnvelopeRepair;try{r=repair(raw);expect(spy).not.toHaveBeenCalled();}finally{spy.mockRestore();}expect(r!.warning).toContain('Starting fresh');expect(r!.deferred.originalRaw).toBe(raw);}
  expect(repair('{"unused":'+'['.repeat(31)+'0'+']'.repeat(31)+'}').warning).toBe('');
 });
 it('isolates field collection/cell/string bounds and preserves originalRaw when deferred structure is refused',()=>{
  for(const progress of [{recent:Array(4097).fill({})},{cells:Object.fromEntries(Array.from({length:1025},(_,i)=>['c'+i,{}]))},{cells:{x:{keys:Array(4097).fill('C')}}}]){const r=run({serial:'7',progress});expect(r.envelope.serial).toBe('7');expect(r.issues.some(i=>i.field==='progress'&&i.code==='collection-limit')).toBe(true);}
  const metadata=run({serial:'7',exampleSettings:{analysis:'x'.repeat(65537)}});expect(metadata.envelope.serial).toBe('7');expect(metadata.issues.some(i=>i.code==='string-limit')).toBe(true);
  const raw=JSON.stringify({serial:'7',current:{opaque:Array(4097).fill(0)}}),r=repair(raw);expect(r.envelope.serial).toBe('7');expect(r.deferred.current).toBe(null);expect(r.deferred.originalRaw).toBe(raw);expect(r.issues.some(i=>i.field==='current'&&i.code==='collection-limit')).toBe(true);
 });
 it('matches exposure last-wins order, native blank policy and history warning precedence',()=>{
  const r=run({serial:'bad',sourceExposures:[{sourceId:'a',songId:'one',at:1},{sourceId:'b',songId:'two',at:2},{sourceId:'a',songId:'three',at:3},{sourceId:'x',songId:'\u001c',at:4}]});
  expect(r.envelope.sourceExposures.map(x=>x.sourceId)).toEqual(['b','a']);expect(r.envelope.sourceHistoryReliable).toBe(false);expect(r.warning).toContain('Some listening history');
  expect(run({sourceExposures:[{sourceId:'x',songId:'\ufeff',at:0}]}).envelope.sourceExposures).toHaveLength(1);
 });
 it('rejects explicit null on nonnull typed fields, ignores unknown attributes and retains raw malformed text',()=>{
  for(const raw of ['null','[]','{"version":{}}','{bad','']){const r=repair(raw);expect(r.warning).toContain('Starting fresh');expect(r.deferred.originalRaw).toBe(raw);}
  const r=run({progress:{attempts:3,unknown:{any:true}},exampleSettings:{analysis:null},unknown:{x:1}});expect(r.envelope.progress.attempts).toBe(3);expect(r.envelope.progress).not.toHaveProperty('unknown');expect(r.issues.some(i=>i.field==='exampleSettings')).toBe(true);
 });
});
