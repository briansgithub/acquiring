/** Pure supported-field repair projection of Android801cf798 AuralSession.
 * Scalar rules verified against serialization1.8.1 TreeJsonDecoder/JsonElement/AbstractJsonLexer.
 * No current/return restoration, storage writes, musical corpus validation or saved-session class.
 */
import type {JsonValue,JsonObject} from '../../contracts';
import type {AuralProgress} from './evidence-contracts';
import type {AuralExampleSettings,AuralSourceExposure,AuralRepairedEnvelope,AuralRepairIssue,AuralRepairArea,AuralSessionEnvelopeRepair,AuralSessionEnvelopeApi} from './session-contracts';
import {createAuralProgress,normalizeAuralProgress} from './aural-evidence';
import {createAuralBuiltinTarget} from './aural-generator';
import {restoreAuralBuiltinCurrent} from './builtin-current';
import type {AuralBuiltinSessionInitialization,AuralInitialLessonState,AuralPlaybackReturnProjection,AuralBuiltinSessionInitializerApi} from './builtin-session-initializer-contracts';
import type {AuralBuiltinCurrentProjection} from './builtin-current-contracts';
import type {AuralBuiltinCurrentJsonResult,AuralBuiltinCurrentJsonApi} from './builtin-current-json-contracts';
const LIMIT={bytes:1048576,depth:32,tokens:65536,collection:4096,cells:1024,string:65536};
const MIN=-9223372036854775808n,MAX=9223372036854775807n,SAFE=9007199254740991n;
const FRESH='Saved progress could not be read. Starting fresh for this session.';
const METADATA='Some saved settings or history could not be read. Valid learning progress has been kept.';
const HISTORY='Some listening history could not be restored. Your progress has been kept; song examples count as supported practice.';
class DecodeError extends Error {constructor(readonly code:string){super(code);}}
function fail(code='invalid'):never {throw new DecodeError(code);}
interface Token {kind:string;text:string}
interface Meta {number?:string;fields?:Map<string,Meta>;items?:Meta[]}
const EMPTY:Meta=Object.freeze({});
interface Item {value:JsonValue;meta:Meta}
const item=(value:JsonValue,meta:Meta=EMPTY):Item=>({value,meta});
/** All allocation/parse grammar work follows this bounded lexical pass. */
function preflight(raw:string):Token[] {
 if(raw.length>LIMIT.bytes||new TextEncoder().encode(raw).length>LIMIT.bytes)fail('raw-limit');
 const tokens:Token[]=[],stack:string[]=[];
 const push=(kind:string,start:number,end:number)=>{if(tokens.length>=LIMIT.tokens)fail('token-limit');tokens.push({kind,text:raw.slice(start,end)});};
 for(let i=0;i<raw.length;){const start=i,c=raw[i];
  if(c===' '||c==='\t'||c==='\n'||c==='\r'){i++;continue;}
  if(c==='"'){i++;while(i<raw.length&&raw[i]!=='"'){if(raw[i]==='\\')i++;i++;}if(i>=raw.length)fail('json');push('string',start,++i);continue;}
  if(c==='{'||c==='['){stack.push(c);if(stack.length>LIMIT.depth)fail('depth-limit');push(c,start,++i);continue;}
  if(c==='}'||c===']'){if(stack.pop()!==(c==='}'?'{':'['))fail('json');push(c,start,++i);continue;}
  if(c===','||c===':'){push(c,start,++i);continue;}
  while(i<raw.length&&!/[\s{}\[\],:"]/.test(raw[i]))i++;
  if(i===start)fail('json');push(/[-0-9]/.test(c)?'number':'literal',start,i);
 }
 if(stack.length)fail('json');return tokens;
}
/** JSON.parse validates grammar; metadata retains numeric lexemes, including duplicate-key last wins. */
function parse(raw:string):Item {
 const tokens=preflight(raw),value=JSON.parse(raw) as JsonValue;let position=0;
 const meta=():Meta=>{const token=tokens[position++];
  if(token.kind==='{'){const fields=new Map<string,Meta>();while(tokens[position].kind!=='}'){
    const key=JSON.parse(tokens[position++].text) as string;position++;fields.set(key,meta());if(tokens[position].kind!==',')break;position++;
   }position++;return {fields};}
  if(token.kind==='['){const items:Meta[]=[];while(tokens[position].kind!==']'){items.push(meta());if(tokens[position].kind!==',')break;position++;}position++;return {items};}
  return token.kind==='number'?{number:token.text}:EMPTY;
 };
 const evidence=meta();if(position!==tokens.length)fail('json');return item(value,evidence);
}
function object(input:Item):JsonObject {const v=input.value;if(v===null||typeof v!=='object'||Array.isArray(v))fail();return v as JsonObject;}
function text(input:Item):string {if(typeof input.value!=='string')fail();if(input.value.length>LIMIT.string)fail('string-limit');return input.value;}
function content(input:Item):string {
 const v=input.value;if(v!==null&&typeof v==='object')fail();
 if(typeof v==='string')return text(input);return input.meta.number??String(v);
}
function bool(input:Item):boolean {const v=content(input).toLowerCase();if(v==='true')return true;if(v==='false')return false;return fail();}
/** Native decimal/exponent Long lexemes; unsafe/inexact exponent arithmetic is refused explicitly. */
function long(input:Item):bigint {
 if(typeof input.value==='number'&&!Number.isSafeInteger(input.value))fail('unsafe-long');
 let s=content(input).replace(/^[ \t\r\n]+|[ \t\r\n]+$/g,'');
 if(s.startsWith('"')){if(!s.endsWith('"'))fail();s=s.slice(1,-1);}
 if(!s.length||s==='-')fail();
 let magnitude=0n,exponent=0,negative=false,hasExponent=false,positiveExponent=true;
 for(let index=0;index<s.length;index++){const c=s[index];
  if((c==='e'||c==='E')&&!hasExponent){if(index===0)fail();hasExponent=true;continue;}
  if(hasExponent&&(c==='-'||c==='+')){positiveExponent=c==='+';continue;}
  if(c==='-'&&!hasExponent){if(index!==0)fail();negative=true;continue;}
  if(c<'0'||c>'9')fail();const digit=c.charCodeAt(0)-48;
  if(hasExponent)exponent=Math.min(1000000,exponent*10+digit);
  else {magnitude=magnitude*10n+BigInt(digit);if(magnitude>-MIN)fail('long-range');}
 }
 let result=magnitude;
 if(hasExponent){
  if(magnitude>SAFE)fail('unsafe-exponent');
  if(positiveExponent){if(exponent>308||magnitude!==0n&&exponent>19)fail('long-range');if(magnitude!==0n)result=magnitude*10n**BigInt(exponent);}
  else if(magnitude!==0n){if(exponent>19)fail('inexact-exponent');const denominator=10n**BigInt(exponent);if(magnitude%denominator!==0n)fail('inexact-exponent');result=magnitude/denominator;}
  if(result>SAFE)fail('unsafe-exponent');
  const native=Number(magnitude)*10**(positiveExponent?exponent:-exponent);
  if(!Number.isSafeInteger(native)||BigInt(native)!==result)fail('inexact-exponent');
 }
 const signed=negative?-result:result;if(signed<MIN||signed>MAX)fail('long-range');return signed;
}
function int(input:Item):number {const value=long(input);if(value<-2147483648n||value>2147483647n)fail('int-range');return Number(value);}
/** A valid native string Long outside browser time range reaches normalization as an invalid sentinel.
 * No rounding occurs; primary normalization remains outermost, inversion remains field-local. */
function time(input:Item):number {const value=long(input);return value<-SAFE||value>SAFE?NaN:Number(value);}
/** Corpus Double fields are validated, not rewritten into the retained opaque value. */
function double(input:Item):JsonValue {
 const s=content(input).replace(/^[\x00-\x20]+|[\x00-\x20]+$/g,'');if(!s.length)fail();
 const hex=/^[+-]?0[xX](?:([0-9a-fA-F]+)(?:\.([0-9a-fA-F]*))?|\.([0-9a-fA-F]+))[pP]([+-]?[0-9]+)[fFdD]?$/.exec(s);
 if(hex){
  const fraction=hex[2]??hex[3]??'',digits=((hex[1]??'')+fraction).replace(/^0+/,'');
  if(!digits.length)return input.value;
  const significand=BigInt('0x'+digits),power=Number(hex[4])-4*fraction.length;
  const top=significand.toString(2).length-1+power;
  if(top>1023)fail('nonfinite');
  if(top===1023){
   // IEEE double rounds to infinity at maxFinite + half an ulp (ties to even).
   const edge=(1n<<54n)-1n;
   if(power>=970?significand<<BigInt(power-970)>=edge:significand>=edge<<BigInt(970-power))fail('nonfinite');
  }
  return input.value;
 }
 if(!/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?[fFdD]?$/.test(s))fail();
 if(!Number.isFinite(Number(s.replace(/[fFdD]$/,''))))fail('nonfinite');return input.value;
}
type Decoder=(input:Item)=>unknown;
interface Field {decode:Decoder;fallback?:()=>unknown}
const req=(decode:Decoder):Field=>({decode});
const def=(decode:Decoder,fallback:()=>unknown):Field=>({decode,fallback});
const nullable=(decode:Decoder):Decoder=>input=>input.value===null?null:decode(input);
const member=(input:Item,key:string):Item=>item(object(input)[key],input.meta.fields?.get(key)??EMPTY);
function struct(fields:Record<string,Field>):Decoder {return input=>{const raw=object(input),result:Record<string,unknown>={};
 for(const [key,field]of Object.entries(fields)){if(Object.hasOwn(raw,key))result[key]=field.decode(member(input,key));else if(field.fallback)result[key]=field.fallback();else fail('required');}return result;};}
function list(decode:Decoder):Decoder {return input=>{if(!Array.isArray(input.value))fail();if(input.value.length>LIMIT.collection)fail('collection-limit');return input.value.map((value,index)=>decode(item(value,input.meta.items?.[index])));};}
function map(decode:Decoder,limit=LIMIT.collection):Decoder {return input=>{const raw=object(input),keys=Object.keys(raw);if(keys.length>limit)fail('collection-limit');const result:Record<string,unknown>=Object.create(null);for(const key of keys){text(item(key));result[key]=decode(member(input,key));}return result;};}
function opaque(input:Item,unsafeIntegers:boolean):void {
 const v=input.value;if(typeof v==='string'){text(input);return;}
 if(typeof v==='number'){if(!Number.isFinite(v)||unsafeIntegers&&Number.isInteger(v)&&!Number.isSafeInteger(v))fail('unsafe-json-number');return;}
 if(v!==null&&typeof v==='object'){const keys=Object.keys(v);if(keys.length>LIMIT.collection)fail('collection-limit');for(const key of keys){if(!Array.isArray(v))text(item(key));opaque(Array.isArray(v)?item(v[Number(key)],input.meta.items?.[Number(key)]):member(input,key),unsafeIntegers);}}
}
const no=()=>null,empty=()=>[],zero=()=>0,yes=()=>true;
const settingsDecoder=struct({popularity:def(bool,yes),variety:def(bool,yes),favorites:def(bool,()=>false),distinguishInversions:def(bool,()=>false),flatList:def(bool,()=>false),analysis:def(text,()=>'relativeMajor'),modeFilter:def(text,()=>'major'),groupingPriority:def(text,()=>'none'),sortOrder:def(text,()=>'mostSongs')});
const settings=():AuralExampleSettings=>settingsDecoder(item({})) as AuralExampleSettings;
const eventDecoder=struct({notes:req(list(int)),rootMidi:req(int),bassMidi:req(int),degree:req(text),functionLabel:req(text),beats:def(double,()=>2)});
const passageDecoder=struct({occurrenceId:req(text),patternId:req(text),songId:req(text),title:def(text,()=>''),artist:def(text,()=>''),sectionId:req(text),sectionName:def(text,()=>''),sourceRevision:req(text),startIndex:req(int),endIndex:req(int),view:req(text),familyId:req(text),variantId:req(text),keyTonic:req(text),keyScale:req(text),tempo:req(int),events:req(list(eventDecoder)),context:req(list(eventDecoder)),degreeLabels:req(list(text)),startBeat:def(double,zero),endBeat:def(double,zero),sourceKeyTonic:def(nullable(text),no),sourceKeyScale:def(nullable(text),no)});
const corpusShape=struct({snapshotId:req(text),popularityVersion:req(nullable(text)),familyMappingVersion:req(text),passage:req(passageDecoder),settings:req(settingsDecoder),selectorVersion:def(text,()=>'aural-selector-2'),seed:req(long),semitoneShift:req(int),recentSongIds:def(list(text),empty),favoriteSongIds:def(list(text),empty),heardSourceIds:def(list(text),empty),familiar:def(bool,()=>false),assessment:def(bool,()=>false),supportedOccurrenceId:def(nullable(text),no),playbackTempo:def(nullable(int),no),sourceHistoryReliable:def(bool,yes)});
function corpus(input:Item):JsonValue {corpusShape(input);opaque(input,true);return input.value;}
const cellDecoder=struct({practice:def(int,zero),practiceCorrect:def(int,zero),independentAttempts:def(int,zero),independentCorrect:def(int,zero),transferCorrect:def(int,zero),keys:def(list(text),empty),mastered:def(bool,()=>false),support:def(int,()=>2),lastAt:def(time,zero),dueAt:def(time,zero),lastCorrect:def(nullable(bool),no),streak:def(int,zero),recentIndependent:def(list(bool),empty),microphonePractice:def(map(int),()=>({})),microphoneIndependent:def(map(int),()=>({}))});
const attemptDecoder=struct({id:req(text),familyId:req(text),skillId:req(text),correct:req(bool),independent:req(bool),technicalUncertainty:req(bool),at:req(time),seed:req(input=>long(input).toString()),generatorVersion:req(text),fingerprint:req(text),key:req(text),variantId:req(text),support:req(int),transfer:req(bool),assistance:req(list(text)),plays:req(int),attempt:req(int),microphoneKind:def(nullable(text),no),requestedVariantId:def(nullable(text),no),instrumentOverride:def(nullable(text),no),octaveShift:def(int,zero),corpus:def(nullable(corpus),no)});
const exposureDecoder=struct({fingerprint:req(text),id:req(text),at:req(time)});
const progressDecoder=struct({version:def(int,()=>1),cells:def(map(cellDecoder,LIMIT.cells),()=>({})),attempts:def(int,zero),recent:def(list(attemptDecoder),empty),exposures:def(list(exposureDecoder),empty)});
const progress=(input:Item):AuralProgress=>progressDecoder(input) as AuralProgress;
const sourceExposureDecoder=struct({sourceId:req(text),songId:req(text),at:req(time)});
function freshEnvelope():AuralRepairedEnvelope {return {version:2,progress:createAuralProgress(),inversionProgress:createAuralProgress(),serial:'0',microphoneEnabled:true,exampleSettings:settings(),sourceExposures:[],sourceHistoryReliable:true};}
function freeze<T>(value:T):T {if(value!==null&&typeof value==='object'){for(const member of Object.values(value))freeze(member);Object.freeze(value);}return value;}
function code(error:unknown):string {return error instanceof DecodeError?error.code:error instanceof RangeError?'normalization':'invalid';}

export function repairAuralSessionEnvelope(raw:string|null):AuralSessionEnvelopeRepair {
 if(raw!==null&&typeof raw!=='string')throw new TypeError('Expected saved JSON text or null');
 const issues:AuralRepairIssue[]=[];
 const deferred:{current:JsonValue|null;playbackReturn:JsonValue|null;originalRaw:string|null}={current:null,playbackReturn:null,originalRaw:raw};
 const issue=(area:AuralRepairArea,field:string,reason:string)=>issues.push({area,field,code:reason});
 const finish=(envelope:AuralRepairedEnvelope,warning:string):AuralSessionEnvelopeRepair=>freeze({envelope,issues,warning,deferred});
 if(raw===null)return finish(freshEnvelope(),'');
 let phase='raw';
 try {
  const input=parse(raw),envelope=object(input);
  // Deferred values are bounded and retained, never interpreted as exercises/return state.
  for(const key of ['current','playbackReturn'] as const)if(Object.hasOwn(envelope,key)&&envelope[key]!==null){
   issue('current',key,'deferred');try{opaque(member(input,key),true);deferred[key]=envelope[key];}catch(error){issue('current',key,code(error));}
  }
  phase='version';let savedVersion=1;
  if(Object.hasOwn(envelope,'version')){
   const value=member(input,'version');if(value.value!==null&&typeof value.value==='object')fail('version');
   try{savedVersion=int(value);}catch{savedVersion=1;}
  }
  if(savedVersion<1||savedVersion>2)fail('version');
  let recoveredMetadata=false,damagedHistory=false;
  function read<T>(field:string,area:AuralRepairArea,fallback:()=>T,decode:(input:Item)=>T,onFailure=()=>{}):T {
   if(!Object.hasOwn(envelope,field))return fallback();
   try{return decode(member(input,field));}catch(error){recoveredMetadata=true;onFailure();issue(area,field,code(error));return fallback();}
  }
  const reliability=read('sourceHistoryReliable','history',yes,bool,()=>{damagedHistory=true;});
  const exposures=read<AuralSourceExposure[]>('sourceExposures','history',()=>[],input=>{
   if(!Array.isArray(input.value))fail();if(input.value.length>LIMIT.collection)fail('collection-limit');
   const decoded:AuralSourceExposure[]=[];
   for(let index=0;index<input.value.length;index++)try{
    const row=sourceExposureDecoder(item(input.value[index],input.meta.items?.[index])) as AuralSourceExposure;
    if(!Number.isSafeInteger(row.at)||row.at<0||row.sourceId.length<1||row.sourceId.length>1000||/^[\u0009-\u000d\u001c-\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]*$/.test(row.songId))fail('exposure');
    decoded.push(row);
   }catch(error){recoveredMetadata=true;damagedHistory=true;issue('history','sourceExposures['+index+']',code(error));}
   const seen=new Set<string>(),kept:AuralSourceExposure[]=[];for(let index=decoded.length-1;index>=0;index--){const row=decoded[index];if(!seen.has(row.sourceId)){seen.add(row.sourceId);kept.push(row);}}return kept.reverse();
  },()=>{damagedHistory=true;});
  let decodedSettings=read('exampleSettings','metadata',settings,input=>settingsDecoder(input) as AuralExampleSettings);
  if(savedVersion===1&&decodedSettings.analysis==='allModes')decodedSettings={...decodedSettings,analysis:'relativeMajor'};
  const originalSettings=envelope.exampleSettings;
  if(originalSettings===null||typeof originalSettings!=='object'||Array.isArray(originalSettings)||!Object.hasOwn(originalSettings,'sortOrder'))decodedSettings={...decodedSettings,groupingPriority:'none',sortOrder:'mostSongs'};
  const decodedProgress=read('progress','progress',createAuralProgress,progress);
  const serial=read('serial','metadata',()=>'0',input=>{const value=long(input);return value<0n?'0':value.toString();});
  const microphoneEnabled=read('microphoneEnabled','metadata',yes,bool);
  const inversionProgress=read('inversionProgress','inversionProgress',createAuralProgress,input=>normalizeAuralProgress(progress(input)));
  const sourceHistoryReliable=reliability&&!damagedHistory;
  let warning=recoveredMetadata?METADATA:'';if(!sourceHistoryReliable)warning=HISTORY;
  // This operation intentionally remains outside read('progress') just as native line139.
  phase='progress';const normalizedProgress=normalizeAuralProgress(decodedProgress);
  return finish({version:2,progress:normalizedProgress,inversionProgress,serial,microphoneEnabled,exampleSettings:decodedSettings,sourceExposures:exposures,sourceHistoryReliable},warning);
 }catch(error){issue('envelope',phase,code(error));return finish(freshEnvelope(),FRESH);}
}
export const auralSessionEnvelopeApi:AuralSessionEnvelopeApi=Object.freeze({repairAuralSessionEnvelope});

// Additive builtin-current fragment eligibility; existing envelope repair remains unchanged.
class UnsupportedBuiltinCurrent extends DecodeError {
 constructor(domain:string){super('unsupported-'+domain);}
}
const builtinNull=(domain:string):Decoder=>input=>{
 if(input.value!==null)throw new UnsupportedBuiltinCurrent(domain);return null;
};
const builtinCurrentOption=struct({id:req(text),label:req(text),degrees:req(list(text))});
const builtinCurrentAnswer=struct({degrees:req(list(text)),optionId:def(nullable(text),no),targetMidis:def(list(int),empty)});
const builtinCurrentTask=struct({kind:req(text),label:req(text),eventIndices:req(list(int)),targetMidis:req(list(int)),scaleDegree:def(nullable(int),no)});
const builtinCurrentTarget=struct({familyId:req(text),skillId:req(text),support:def(int,()=>2),transfer:def(bool,()=>false),reason:def(text,()=>''),microphoneKind:def(nullable(text),no),variantId:def(nullable(text),no),instrumentOverride:def(nullable(text),no),octaveShift:def(int,zero),pattern:def(builtinNull('pattern'),no)});
const builtinCurrentProvenance=struct({generatorVersion:req(text),seed:req(input=>long(input).toString()),target:req(builtinCurrentTarget),variantId:req(text),keyTonic:req(text),tempo:req(int),instrument:req(text),inversions:req(list(int)),register:req(int),spreads:req(list(bool)),contextDegrees:req(list(text)),corpus:def(builtinNull('corpus'),no),exampleSettings:def(nullable(settingsDecoder),no),fallbackReason:def(nullable(text),no)});
const builtinCurrentExercise=struct({id:req(text),familyId:req(text),variantId:req(text),skillId:req(text),support:req(int),transfer:req(bool),seed:req(input=>long(input).toString()),generatorVersion:req(text),keyTonic:req(text),tempo:req(int),instrument:req(text),events:req(list(eventDecoder)),context:req(list(eventDecoder)),fullDegrees:req(list(text)),gapIndex:req(nullable(int)),options:req(list(builtinCurrentOption)),answer:req(builtinCurrentAnswer),responseType:req(text),microphoneTask:req(nullable(builtinCurrentTask)),fingerprint:req(text),prompt:req(text),referenceRequired:req(bool),guidance:req(text),provenance:req(builtinCurrentProvenance),previouslyExposed:def(bool,()=>false),exposureRegistered:def(bool,()=>false)});

/** Complete native typed shape first, then the accepted factory narrows the builtin target.
 * Private Item entry retains numeric lexemes for a FUTURE original-envelope caller. */
function decodeBuiltinCurrentItem(input:Item):AuralBuiltinCurrentProjection {
 opaque(input,true);
 // The temporary schema result is not returned as a narrowed projection until target validation.
 const decoded=builtinCurrentExercise(input) as AuralBuiltinCurrentProjection;
 const rawTarget=decoded.provenance.target;
 let target:AuralBuiltinCurrentProjection['provenance']['target'];
 try{target=createAuralBuiltinTarget(rawTarget.familyId,rawTarget.skillId,rawTarget);}catch{fail('target-domain');}
 return freeze({seed:decoded.seed,generatorVersion:decoded.generatorVersion,
  provenance:{target,corpus:null,exampleSettings:decoded.provenance.exampleSettings,fallbackReason:decoded.provenance.fallbackReason}});
}

/** JSON CURRENT FRAGMENT only; never stringify rounded deferred data or activate a session. */
export function decodeAuralBuiltinCurrentJson(currentRaw:string|null):AuralBuiltinCurrentJsonResult {
 if(currentRaw!==null&&typeof currentRaw!=='string')throw new TypeError('Expected current JSON fragment text or null');
 if(currentRaw===null)return freeze({status:'absent',originalRaw:currentRaw});
 try{
  const input=parse(currentRaw);
  if(input.value===null)return freeze({status:'absent',originalRaw:currentRaw});
  return freeze({status:'eligible',projection:decodeBuiltinCurrentItem(input),originalRaw:currentRaw});
 }catch(error){
  return freeze({status:'refused',reason:error instanceof UnsupportedBuiltinCurrent?'unsupported':'invalid',code:code(error),originalRaw:currentRaw});
 }
}
export const auralBuiltinCurrentJsonApi:AuralBuiltinCurrentJsonApi=Object.freeze({decodeAuralBuiltinCurrentJson});

// Additive pure initialization from ORIGINAL envelope bytes; no writes/actions/navigation.
function initializerSourcePassage(input:Item):JsonValue {passageDecoder(input);opaque(input,true);return input.value;}
const initializerReturn=struct({exerciseId:req(text),draft:req(list(text)),heard:req(bool),answered:req(bool),guidanceVisible:req(bool),plays:req(int),attempts:req(int),assistance:req(list(text)),feedback:req(text),open:def(bool,yes),sourcePassage:def(nullable(initializerSourcePassage),no),fromSongs:def(bool,()=>false)});
const initialLessonState=():AuralInitialLessonState=>({assistance:[],plays:0,attempts:0,heard:false,answered:false,guidanceVisible:false,feedback:''});

export function initializeAuralBuiltinSession(raw:string|null):AuralBuiltinSessionInitialization {
 const base=repairAuralSessionEnvelope(raw);
 const issues=base.issues.filter(issue=>issue.code!=='deferred');
 let current:AuralBuiltinSessionInitialization['saved']['current']=null;
 let playbackReturn:AuralPlaybackReturnProjection|null=null;
 let state=initialLessonState(),warning=base.warning;
 const issue=(area:AuralRepairArea,field:string,reason:string)=>{
  if(!issues.some(i=>i.area===area&&i.field===field&&i.code===reason))issues.push({area,field,code:reason});
 };
 const finish=():AuralBuiltinSessionInitialization=>freeze({saved:{...base.envelope,current,playbackReturn},state,warning,issues,originalRaw:raw});
 // Pure dependency composition may skip intermediate regeneration when native final guard wins.
 if(raw===null||base.issues.some(issue=>issue.area==='envelope'))return finish();
 try{
  const input=parse(raw),envelope=object(input);
  if(Object.hasOwn(envelope,'playbackReturn')&&envelope.playbackReturn!==null)try{
   const value=member(input,'playbackReturn');opaque(value,true);
   playbackReturn=initializerReturn(value) as AuralPlaybackReturnProjection;
  }catch(error){issue('metadata','playbackReturn',code(error));if(!warning)warning=METADATA;}
  if(Object.hasOwn(envelope,'current')&&envelope.current!==null)try{
   current=restoreAuralBuiltinCurrent(decodeBuiltinCurrentItem(member(input,'current')));
  }catch(error){
   issue('current','current',error instanceof DecodeError?error.code:'regeneration');
   warning='The unfinished example could not be restored. Your learning progress has been kept.';
  }
  if(current){
   state={...initialLessonState(),assistance:['resumed-example'],guidanceVisible:current.support===2,
    feedback:'Resumed example. Listen again; this counts as supported practice.'};
   if(playbackReturn&&playbackReturn.exerciseId===current.id&&playbackReturn.plays>=0&&playbackReturn.plays<=1000&&playbackReturn.attempts>=0&&playbackReturn.attempts<=1000){
    state={assistance:[...playbackReturn.assistance,'source-playback'],plays:playbackReturn.plays,attempts:playbackReturn.attempts,
     heard:playbackReturn.heard,answered:playbackReturn.answered,guidanceVisible:playbackReturn.guidanceVisible,feedback:playbackReturn.feedback};
   }
  }
  return finish();
 }catch(error){
  issue('envelope','raw',code(error));
  return freeze({saved:{...freshEnvelope(),current:null,playbackReturn:null},state:initialLessonState(),warning:FRESH,issues,originalRaw:raw});
 }
}
export const auralBuiltinSessionInitializerApi:AuralBuiltinSessionInitializerApi=Object.freeze({initializeAuralBuiltinSession});
