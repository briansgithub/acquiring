import {describe,expect,it,vi} from 'vitest';
import native from './fixtures/native-initializer.json';
import {initializeAuralBuiltinSession as initialize,auralBuiltinSessionInitializerApi} from './session-envelope';
import type {AuralBuiltinSessionInitialization,AuralBuiltinSessionInitializerApi} from './builtin-session-initializer-contracts';
const row=(label:string)=>native.cases.find(c=>c.label===label)!;
const matched=()=>JSON.parse(row('matching-return-1000-open-false').raw!);
const run=(value:unknown)=>initialize(JSON.stringify(value));
const projection=(r:AuralBuiltinSessionInitialization)=>({saved:JSON.parse(JSON.stringify(r.saved,(key,value)=>key==='sourcePassage'&&value!==null?'typed-source-passage-present':value)),state:r.state,warning:r.warning});
function frozen(v:unknown):boolean{return v===null||typeof v!=='object'||Object.isFrozen(v)&&Object.values(v).every(frozen);}
describe('accepted16 actual whole-native initializer projections',()=>{
 for(const c of native.cases)it(c.label,()=>{const r=initialize(c.raw);expect(projection(r)).toEqual(c.expected);expect(r.originalRaw).toBe(c.raw);expect(frozen(r)).toBe(true);expect(r.issues.some(i=>i.code==='deferred')).toBe(false);});
});
describe('whole-envelope browser recovery boundaries',()=>{
 it('uses ORIGINAL numeric lexemes and exactLong strings instead of rounded deferred current',()=>{
  const raw=row('supported-current-resumed-defaults').raw!;
  const exact=raw.replace('"seed":17','"seed":"9223372036854775807"');expect(initialize(exact).saved.current!.seed).toBe('9223372036854775807');expect(initialize(exact).originalRaw).toBe(exact);
  for(const token of ['1.0','9007199254740993']){const source=raw.replace('"seed":17','"seed":'+token),r=initialize(source);expect(r.saved.current).toBeNull();expect(r.warning).toContain('unfinished example');expect(r.originalRaw).toBe(source);expect(r.issues.some(i=>i.area==='current')).toBe(true);}
 });
 it('blocks valid current/return on browser safe-time PRIMARY normalization fresh refusal',()=>{
  const value=matched();value.progress={cells:{'dominant-return:guided':{lastAt:'9223372036854775807'}}};const raw=JSON.stringify(value),r=initialize(raw);
  expect(r.saved.current).toBeNull();expect(r.saved.playbackReturn).toBeNull();expect(r.saved.progress.attempts).toBe(0);expect(r.warning).toContain('Starting fresh');expect(r.state).toEqual({assistance:[],plays:0,attempts:0,heard:false,answered:false,guidanceVisible:false,feedback:''});expect(r.originalRaw).toBe(raw);
 });
 it('retains complete original opaque passage/default omissions/unknown values for deferred navigation only',()=>{
  const c=row('odd-but-typed-source-and-defaults'),r=initialize(c.raw),source=JSON.parse(c.raw!).playbackReturn.sourcePassage;
  expect(r.saved.playbackReturn!.sourcePassage).toEqual(source);expect(r.saved.playbackReturn!.sourcePassage).not.toHaveProperty('title');expect(frozen(r.saved.playbackReturn!.sourcePassage)).toBe(true);
  const bad=matched();bad.playbackReturn.unknown={unsafe:9007199254740992};const refused=run(bad);expect(refused.saved.playbackReturn).toBeNull();expect(refused.saved.current).not.toBeNull();expect(refused.warning).toContain('Some saved settings');expect(refused.issues.some(i=>i.code==='unsafe-json-number')).toBe(true);
 });
 it('requires complete return fields, applies declared defaults and stores all typed counter values without clamping',()=>{
  for(const key of ['exerciseId','draft','heard','answered','guidanceVisible','plays','attempts','assistance','feedback']){const value=matched();delete value.playbackReturn[key];const r=run(value);expect(r.saved.playbackReturn).toBeNull();expect(r.saved.current).not.toBeNull();expect(r.warning).toContain('Some saved settings');}
  const value=matched();delete value.playbackReturn.open;delete value.playbackReturn.fromSongs;delete value.playbackReturn.sourcePassage;const defaults=run(value);expect(defaults.saved.playbackReturn).toMatchObject({open:true,fromSongs:false,sourcePassage:null});
  for(const [plays,attempts,applied]of [[-1,0,false],[0,1001,false],[1000,1000,true],[0,0,true]] as const){const x=matched();x.playbackReturn.plays=plays;x.playbackReturn.attempts=attempts;const r=run(x);expect(r.saved.playbackReturn).toMatchObject({plays,attempts});expect(r.state.assistance).toEqual(applied?['hint','source-playback','source-playback']:['resumed-example']);expect(r.warning).toBe('');}
 });
 it('allows4096input assistance to produce4097 independent frozen output entries and isolates return resource failure',()=>{
  const value=matched();value.playbackReturn.assistance=Array(4096).fill('help');const r=run(value);expect(r.saved.playbackReturn!.assistance).toHaveLength(4096);expect(r.state.assistance).toHaveLength(4097);expect(r.state.assistance.at(-1)).toBe('source-playback');expect(r.state.assistance).not.toBe(r.saved.playbackReturn!.assistance);expect(frozen(r)).toBe(true);
  value.playbackReturn.assistance.push('overflow');const bad=run(value);expect(bad.saved.playbackReturn).toBeNull();expect(bad.saved.current).not.toBeNull();expect(bad.warning).toContain('Some saved settings');
 });
 it('keeps parsing bounded, preserves raw/fresh defaults, filters placeholders and returns independent frozen snapshots',()=>{
  const api:AuralBuiltinSessionInitializerApi=auralBuiltinSessionInitializerApi;expect(Object.isFrozen(api)).toBe(true);
  const raw=row('matching-return-1000-open-false').raw!,spy=vi.spyOn(JSON,'parse');try{const r=api.initializeAuralBuiltinSession(raw);expect(spy.mock.calls.filter(([s])=>s===raw)).toHaveLength(2);expect(r.issues.some(i=>i.code==='deferred')).toBe(false);}finally{spy.mockRestore();}
  const a=initialize(raw),b=initialize(raw);expect(a).toEqual(b);expect(a.saved.current).not.toBe(b.saved.current);expect(a.saved.playbackReturn).not.toBe(b.saved.playbackReturn);expect(frozen(a)).toBe(true);
  const oversized=' '.repeat(1048577),limit=initialize(oversized);expect(limit.saved.current).toBeNull();expect(limit.originalRaw).toBe(oversized);expect(limit.warning).toContain('Starting fresh');
  expect(initialize(null).warning).toBe('');for(const invalid of ['[]','null','{bad'])expect(initialize(invalid)).toMatchObject({originalRaw:invalid,saved:{current:null,playbackReturn:null}});
  for(const invalid of [undefined,{},1])expect(()=>initialize(invalid as unknown as string)).toThrow(TypeError);
 });
});
