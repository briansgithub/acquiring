/** Pure builtin scheduler, Android801cf798 AuralCurriculum105..147. */
import type {AuralCell,AuralProgress,AuralSeed} from './evidence-contracts';
import type {AuralBuiltinTarget,AuralBuiltinFamilyId,AuralBuiltinSkillId,AuralMicrophoneKind} from './generator-contracts';
import type {AuralBuiltinSchedulerApi} from './scheduler-contracts';
import {auralCell,createAuralCell,createAuralProgress,normalizeAuralProgress} from './aural-evidence';
import {createAuralBuiltinTarget} from './aural-generator';
import {KotlinRandom,parseKotlinLongSeed} from './kotlin-random';
const FAMILIES:readonly {id:AuralBuiltinFamilyId;prerequisites:readonly AuralBuiltinFamilyId[]}[]=[
 {id:'dominant-return',prerequisites:[]},{id:'plagal-return',prerequisites:['dominant-return']},
 {id:'predominant-cadence',prerequisites:['dominant-return','plagal-return']},{id:'deceptive-return',prerequisites:['dominant-return']},
 {id:'relative-motion',prerequisites:['plagal-return','deceptive-return']},{id:'secondary-dominant',prerequisites:['predominant-cadence','relative-motion']},
];
const SKILLS:readonly AuralBuiltinSkillId[]=['guided','compare','identify','recall','complete','audiate','reproduce'];
const MIC:readonly AuralMicrophoneKind[]=['root','bass','scaleDegree','rootSequence'];
type Reader=(family:string,skill:string)=>AuralCell;
function object(value:unknown):asserts value is Record<string,unknown> {
 if(value===null||typeof value!=='object'||Array.isArray(value))throw new TypeError('Expected typed aural progress/cell data');
}
function array<T>(value:readonly T[],kind:'string'|'boolean'):T[] {
 if(!Array.isArray(value))throw new TypeError('Expected a cell array');
 const length=value.length;
 if(length>4096)throw new RangeError('Cell arrays exceed4096');
 const result:T[]=[];
 for(let i=0;i<length;i++){const item=value[i];if(typeof item!==kind)throw new TypeError('Invalid typed cell array member');result.push(item);}
 return result;
}
function counters(value:Readonly<Record<string,number>>):Record<string,number> {
 object(value);const result:Record<string,number>={};
 for(const kind of MIC)if(Object.hasOwn(value,kind))result[kind]=value[kind];
 return result;
}
function snapshotCell(input:AuralCell):AuralCell {
 object(input);
 // Stored mastery/support are deliberately not queried; accepted evidence derives both.
 const {practice,practiceCorrect,independentAttempts,independentCorrect,transferCorrect,keys,lastAt,dueAt,lastCorrect,streak,recentIndependent,microphonePractice,microphoneIndependent}=input;
 return createAuralCell({practice,practiceCorrect,independentAttempts,independentCorrect,transferCorrect,
  keys:array(keys,'string'),lastAt,dueAt,lastCorrect,streak,recentIndependent:array(recentIndependent,'boolean'),
  microphonePractice:counters(microphonePractice),microphoneIndependent:counters(microphoneIndependent)});
}
/** Lazily reads only queried builtin keys; repeated prerequisites reuse the first clean snapshot. */
function reader(progress:AuralProgress):Reader {
 let cells:Readonly<Record<string,AuralCell>>|undefined;
 const cache=new Map<string,AuralCell>();
 return (family,skill)=>{
  const key=family+':'+skill,previous=cache.get(key);if(previous)return previous;
  if(cells===undefined){object(progress);const input=progress.cells;object(input);cells=input;}
  const raw=Object.hasOwn(cells,key)?cells[key]:undefined;
  const cell=raw===undefined?createAuralCell():snapshotCell(raw);
  const cleaned=auralCell(createAuralProgress({cells:{[key]:cell}}),family,skill);
  cache.set(key,cleaned);return cleaned;
 };
}
function evidenced(read:Reader,family:string,skill:string):boolean {
 const cell=read(family,skill),recent=cell.recentIndependent;
 return cell.independentCorrect>=2&&(recent.length===0?0:recent.filter(Boolean).length/recent.length)>=.6;
}
function familyUnlocked(read:Reader,id:string):boolean {
 const family=FAMILIES.find(item=>item.id===id);
 return family!==undefined&&family.prerequisites.every(parent=>evidenced(read,parent,'identify'));
}
function skillUnlocked(read:Reader,family:string,skill:string):boolean {
 if(!familyUnlocked(read,family))return false;
 const index=SKILLS.indexOf(skill as AuralBuiltinSkillId);
 if(index<0)return false;
 if(index===0)return true;
 if(index===1)return read(family,'guided').practiceCorrect>=4;
 return evidenced(read,family,SKILLS[index-1]);
}
export function auralFamilyUnlocked(progress:AuralProgress,familyId:string):boolean {
 return familyUnlocked(reader(progress),familyId);
}
export function auralSkillUnlocked(progress:AuralProgress,familyId:string,skillId:string):boolean {
 return skillUnlocked(reader(progress),familyId,skillId);
}
function normalizedSnapshot(progress:AuralProgress):AuralProgress {
 object(progress);const version=progress.version;
 // Native normalize returns defaults immediately for incompatible versions.
 if(version!==1)return normalizeAuralProgress(createAuralProgress({version}));
 const attempts=progress.attempts,read=reader(progress),cells:Record<string,AuralCell>={};
 for(const family of FAMILIES)for(const skill of SKILLS)cells[family.id+':'+skill]=read(family.id,skill);
 return normalizeAuralProgress(createAuralProgress({version,attempts,cells}));
}
interface Candidate {familyId:AuralBuiltinFamilyId;skillId:AuralBuiltinSkillId;cell:AuralCell}
export function selectAuralBuiltinTarget(progress:AuralProgress,seed:AuralSeed,now:number,microphoneEnabled=true):AuralBuiltinTarget {
 const exactSeed=parseKotlinLongSeed(seed);
 if(!Number.isSafeInteger(now))throw new RangeError('Scheduler now must be finite safe-integer milliseconds');
 if(typeof microphoneEnabled!=='boolean')throw new TypeError('microphoneEnabled must be boolean');
 const p=normalizedSnapshot(progress),read=reader(p);
 const rng=new KotlinRandom(BigInt.asIntN(64,exactSeed^BigInt(p.attempts)).toString());
 const available:Candidate[]=[];
 for(const family of FAMILIES)for(const skill of SKILLS){
  if((microphoneEnabled||skill!=='reproduce')&&skillUnlocked(read,family.id,skill))available.push({familyId:family.id,skillId:skill,cell:read(family.id,skill)});
 }
 const pending=available.filter(t=>!t.cell.mastered&&t.skillId!=='guided');
 const unstarted=available.filter(t=>t.skillId==='guided'&&t.cell.practiceCorrect<4);
 const due=available.filter(t=>t.skillId!=='guided'&&t.cell.independentAttempts>0&&t.cell.dueAt<=now);
 const weak=available.filter(t=>t.skillId!=='guided'&&t.cell.lastCorrect===false);
 let chosen:Candidate,reason:string;
 if(p.attempts%5===0&&due.length){chosen=due.reduce((best,t)=>t.cell.dueAt<best.cell.dueAt?t:best);reason='Revisit an older or uncertain skill.';}
 else if(p.attempts%4===0&&unstarted.length){chosen=unstarted[0];reason='Introduce a related family with guidance.';}
 else if(p.attempts%3===0&&weak.length){chosen=rng.choose(weak);reason='Strengthen a weak prerequisite before building on it.';}
 else if(pending.length){
  const frontiers=pending.filter(t=>!pending.some(other=>other.familyId===t.familyId&&SKILLS.indexOf(other.skillId)>SKILLS.indexOf(t.skillId)));
  chosen=rng.choose(p.attempts%3===1?pending:frontiers);reason='Build the next aural skill with gradually fading help.';
 }else if(unstarted.length){chosen=unstarted[0];reason='Establish the sound of a new relationship.';}
 else {const nonguided=available.filter(t=>t.skillId!=='guided');chosen=rng.choose(nonguided.length?nonguided:available);reason='Maintain fluent hearing with spaced review.';}
 const count=(map:Readonly<Record<string,number>>,kind:string)=>map[kind]??0;
 let microphoneKind:AuralMicrophoneKind|null=null;
 if(chosen.skillId==='reproduce')microphoneKind=MIC.find(kind=>count(chosen.cell.microphonePractice,kind)===0)
  ??rng.shuffled(MIC).reduce((best,kind)=>count(chosen.cell.microphoneIndependent,kind)<count(chosen.cell.microphoneIndependent,best)?kind:best);
 const needsIntroduction=microphoneKind!==null&&count(chosen.cell.microphonePractice,microphoneKind)===0;
 const support=(needsIntroduction?Math.max(1,chosen.cell.support):chosen.cell.support) as 0|1|2;
 const transfer=support===0&&chosen.cell.independentCorrect>=2&&(p.attempts%3===0||chosen.cell.independentCorrect>=4&&chosen.cell.transferCorrect<2);
 if(needsIntroduction)reason='Learn this singing task with support before testing it independently.';
 else if(transfer)reason='Test the relationship in an unfamiliar realization.';
 return createAuralBuiltinTarget(chosen.familyId,chosen.skillId,{support,transfer,reason,microphoneKind});
}
export const auralBuiltinSchedulerApi:AuralBuiltinSchedulerApi=Object.freeze({auralFamilyUnlocked,auralSkillUnlocked,selectAuralBuiltinTarget});
