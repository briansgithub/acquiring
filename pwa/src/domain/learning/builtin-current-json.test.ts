import {describe,expect,it,vi} from 'vitest';
import native from './fixtures/native-builtin-current.json';
import {decodeAuralBuiltinCurrentJson as decode,auralBuiltinCurrentJsonApi} from './session-envelope';
import {restoreAuralBuiltinCurrent} from './builtin-current';
import type {AuralBuiltinCurrentJsonApi} from './builtin-current-json-contracts';
const find=(label:string)=>native.cases.find(c=>c.label===label)!;
const safeRaw=find('supported-false-flags-become-true').oldRaw;
// Fixtures contain decimal integer seed tokens. Quote lexemes without parsing/rounding/stringifying them.
const quoteSeeds=(raw:string)=>raw.replace(/("seed"\s*:\s*)(-?\d+)(?=\s*[,}])/g,(_all,prefix,digits)=>prefix+'"'+digits+'"');
const hasUnsafeSeed=(raw:string)=>[...raw.matchAll(/"seed"\s*:\s*(-?\d+)(?=\s*[,}])/g)].some(m=>{const n=BigInt(m[1]);return n>9007199254740991n||n< -9007199254740991n;});
// Only safe baseline fixture JSON is parsed/stringified in mutation tests. Long precision tests use raw lexemes.
const base=():Record<string,any>=>JSON.parse(safeRaw);
const run=(value:unknown)=>decode(JSON.stringify(value));
function frozen(v:unknown):boolean{return v===null||typeof v!=='object'||Object.isFrozen(v)&&Object.values(v).every(frozen);}
function expectInvalid(value:unknown){const r=run(value);expect(r.status).toBe('refused');if(r.status==='refused')expect(r.reason).toBe('invalid');return r;}

describe('existing14 actual-serializer oldRaw cases, no native recapture',()=>{
 for(const c of native.cases)it(c.label,()=>{
  const nativeRaw=c.oldRaw,rawResult=decode(nativeRaw),quoted=quoteSeeds(nativeRaw),result=decode(quoted);
  expect(rawResult.originalRaw).toBe(nativeRaw);expect(result.originalRaw).toBe(quoted);expect(frozen(result)).toBe(true);
  if(hasUnsafeSeed(nativeRaw)){expect(rawResult.status).toBe('refused');if(rawResult.status==='refused')expect(rawResult.code).toBe('unsafe-json-number');}
  if(c.label.startsWith('invalid-target')){expect(result).toMatchObject({status:'refused',reason:'invalid',code:'target-domain'});return;}
  expect(result.status).toBe('eligible');
  if(result.status==='eligible'){
   expect(result.projection).toEqual(c.input);
   if(c.expected.current===null)expect(()=>restoreAuralBuiltinCurrent(result.projection)).toThrow();
   else expect(restoreAuralBuiltinCurrent(result.projection)).toEqual(c.expected.current);
  }
 });
});

describe('complete native shape before builtin target narrowing',()=>{
 it('requires EVERY one of24 required old exercise fields, including nullable fields and ignored rich data',()=>{
  const required=Object.keys(base()).filter(k=>!['previouslyExposed','exposureRegistered'].includes(k));expect(required).toHaveLength(24);
  for(const key of required){const value=base();delete value[key];expectInvalid(value);}
  expect(run({...base(),gapIndex:null,microphoneTask:null}).status).toBe('eligible');
 });
 it('requires EVERY nested native field, even ignored old provenance/event/answer/task/option fields',()=>{
  const checks:[string,string[]][]=[['provenance',['generatorVersion','seed','target','variantId','keyTonic','tempo','instrument','inversions','register','spreads','contextDegrees']],
   ['provenance.target',['familyId','skillId']],['events.0',['notes','rootMidi','bassMidi','degree','functionLabel']],['context.0',['notes','rootMidi','bassMidi','degree','functionLabel']],['answer',['degrees']]];
  for(const [path,fields]of checks)for(const field of fields){const value=base();let target:any=value;for(const step of path.split('.'))target=target[step];delete target[field];expectInvalid(value);}
  for(const field of ['id','label','degrees']){const value=JSON.parse(find('already-true-flags-stay-true').oldRaw);delete value.options[0][field];expectInvalid(value);}
  for(const field of ['kind','label','eventIndices','targetMidis']){const value=JSON.parse(find('microphone-and-selection-overrides').oldRaw);delete value.microphoneTask[field];expectInvalid(value);}
 });
 it('applies ONLY native declared defaults and honors required nullable versus optional-nullable fields',()=>{
  const value=base();delete value.previouslyExposed;delete value.exposureRegistered;delete value.events[0].beats;
  delete value.answer.optionId;delete value.answer.targetMidis;
  for(const key of ['support','transfer','reason','microphoneKind','variantId','instrumentOverride','octaveShift','pattern'])delete value.provenance.target[key];
  delete value.provenance.corpus;delete value.provenance.exampleSettings;delete value.provenance.fallbackReason;
  const result=run(value);expect(result.status).toBe('eligible');if(result.status==='eligible')expect(result.projection.provenance.target).toEqual({familyId:'dominant-return',skillId:'guided',support:2,transfer:false,reason:'',microphoneKind:null,variantId:null,instrumentOverride:null,octaveShift:0,pattern:null});
  const settings=base();settings.provenance.exampleSettings={};const r=run(settings);expect(r.status).toBe('eligible');
  if(r.status==='eligible')expect(r.projection.provenance.exampleSettings).toEqual({popularity:true,variety:true,favorites:false,distinguishInversions:false,flatList:false,analysis:'relativeMajor',modeFilter:'major',groupingPriority:'none',sortOrder:'mostSongs'});
  const task=JSON.parse(find('microphone-and-selection-overrides').oldRaw);delete task.microphoneTask.scaleDegree;expect(run(task).status).toBe('eligible');
  for(const mutate of [(v:any)=>v.previouslyExposed=null,(v:any)=>v.events[0].beats=null,(v:any)=>v.answer.targetMidis=null,(v:any)=>v.provenance.target.support=null,(v:any)=>v.provenance.exampleSettings={analysis:null}]){const v=base();mutate(v);expectInvalid(v);}
 });
 it('validates nested scalars/collections without inventing ignored musical enum or realization restrictions',()=>{
  const bad=[(v:any)=>v.events[0].notes=[null],(v:any)=>v.events[0].rootMidi=1.5,(v:any)=>v.events[0].bassMidi=2147483648,
   (v:any)=>v.provenance.seed='bad',(v:any)=>v.provenance.generatorVersion=1,(v:any)=>v.provenance.inversions=[null],
   (v:any)=>v.provenance.spreads=[0],(v:any)=>v.provenance.contextDegrees=[null],(v:any)=>v.options={},(v:any)=>v.answer.optionId=3,
   (v:any)=>v.provenance.exampleSettings={favorites:1},(v:any)=>v.microphoneTask={kind:'x',label:'x',eventIndices:[null],targetMidis:[]}];
  for(const mutate of bad){const value=base();mutate(value);expectInvalid(value);}
  const value=base();value.familyId='obsolete';value.skillId='obsolete';value.instrument='not an enum';value.support=-99;value.tempo=-99;
  value.events[0].notes=[999,-1];value.events[0].degree='arbitrary';value.events[0].beats=-2;value.microphoneTask={kind:'arbitrary',label:'arbitrary',eventIndices:[-3],targetMidis:[999],scaleDegree:-8};expect(run(value).status).toBe('eligible');
 });
 it('uses native scalar lexemes, safe exact Long string input and finite Double rules',()=>{
  for(const [token,wanted]of [['1e2','100'],['" 0007 "','7'],['"-9223372036854775808"','-9223372036854775808'],['"9223372036854775807"','9223372036854775807']]){
   const r=decode(safeRaw.replace('"seed":17','"seed":'+token));expect(r.status).toBe('eligible');if(r.status==='eligible')expect(r.projection.seed).toBe(wanted);
  }
  for(const token of ['1.0','9007199254740993','"9223372036854775808"','"9007199254740993e0"','"1e-999"'])expect(decode(safeRaw.replace('"seed":17','"seed":'+token)).status).toBe('refused');
  const value=base();value.transfer='TrUe';value.provenance.target.support='2';value.events[0].beats='0x.8p1';expect(run(value).status).toBe('eligible');
  value.events[0].beats='Infinity';expectInvalid(value);value.events[0].beats='0x1p1024';expectInvalid(value);
  value.events[0].beats=2;value.id=123;expectInvalid(value);
  const raw=safeRaw.replace('"seed":17','"seed":17').replace('"generatorVersion":"android-aural-1","seed":17','"generatorVersion":"android-aural-1","seed":9007199254740993');
  expect(decode(raw).status).toBe('refused');expect(decode(raw).originalRaw).toBe(raw);
 });
 it('keeps unknown native generator version eligible and refuses only invalid target domain after full shape',()=>{
  const value=base();value.generatorVersion='future-generator';expect(run(value).status).toBe('eligible');
  value.provenance.target.reason='x'.repeat(1025);expect(run(value)).toMatchObject({status:'refused',reason:'invalid',code:'target-domain'});
  value.provenance.target.familyId='missing';delete value.id;const r=run(value);expect(r).toMatchObject({status:'refused',reason:'invalid',code:'required'});
 });
 it('refuses unsupported corpus/pattern while preserving their exact raw payload without claiming decode',()=>{
  for(const domain of ['corpus','pattern']){const value=base();if(domain==='corpus')value.provenance.corpus={opaque:'kept'};else value.provenance.target.pattern={opaque:'kept'};
   const raw=JSON.stringify(value);expect(decode(raw)).toEqual({status:'refused',reason:'unsupported',code:'unsupported-'+domain,originalRaw:raw});
  }
 });
});

describe('fragment raw recovery and browser safety, unchanged private parser',()=>{
 it('returns absent only for null/literal-null, rejects nonstring inputs and retains malformed text',()=>{
  const api:AuralBuiltinCurrentJsonApi=auralBuiltinCurrentJsonApi;expect(Object.isFrozen(api)).toBe(true);
  for(const raw of [null,'null',' \nnull\t'])expect(api.decodeAuralBuiltinCurrentJson(raw)).toEqual({status:'absent',originalRaw:raw});
  for(const raw of ['', '{bad', '[]','1','true'])expect(decode(raw)).toMatchObject({status:'refused',reason:'invalid',originalRaw:raw});
  for(const value of [undefined,{},[],1])expect(()=>decode(value as unknown as string)).toThrow(TypeError);
 });
 it('ignores bounded unknown fields, honors duplicate last-wins and freezes independent small projections',()=>{
  const raw='{ "id":false,'+safeRaw.slice(1),a=decode(raw),b=decode(raw);expect(a.status).toBe('eligible');expect(a).toEqual(b);expect(frozen(a)).toBe(true);
  if(a.status==='eligible'&&b.status==='eligible'){expect(a.projection).not.toBe(b.projection);expect(a.projection.provenance.target).not.toBe(b.projection.provenance.target);expect(a.projection).not.toHaveProperty('id');}
  expect(decode(safeRaw.slice(0,-1)+',"id":false}').status).toBe('refused');
  const value=base();value.unknown={nested:[true,null,{arbitrary:'ignored'}]};expect(run(value).status).toBe('eligible');
  const unsafe=safeRaw.slice(0,-1)+',"unknown":{"value":9007199254740993}}';expect(decode(unsafe)).toMatchObject({status:'refused',code:'unsafe-json-number',originalRaw:unsafe});
 });
 it('checks global UTF8/depth/token bounds BEFORE JSON.parse and keeps original bytes',()=>{
  const raws=[' '.repeat(1048577),'"'+'€'.repeat(400000)+'"','['.repeat(33)+'0'+']'.repeat(33),'['+Array(32769).fill('0').join(',')+']'];
  for(const raw of raws){const spy=vi.spyOn(JSON,'parse');try{expect(decode(raw)).toMatchObject({status:'refused',reason:'invalid',originalRaw:raw});expect(spy).not.toHaveBeenCalled();}finally{spy.mockRestore();}}
 });
 it('uses4096 field collections/65536 strings+keys without generated-event/voice limits',()=>{
  const value=base();value.events=Array(5).fill(value.events[0]);value.events[0].notes=Array(4096).fill(60);expect(run(value).status).toBe('eligible');
  value.events[0].notes.push(60);expect(run(value)).toMatchObject({status:'refused',code:'collection-limit'});
  const v=base();v.id='x'.repeat(65536);expect(run(v).status).toBe('eligible');v.id+='x';expect(run(v)).toMatchObject({status:'refused',code:'string-limit'});
  for(const unknown of [Array(4097).fill(0),{['x'.repeat(65537)]:true},{text:'x'.repeat(65537)}]){const x=base();x.unknown=unknown;expect(run(x).status).toBe('refused');}
 });
});
