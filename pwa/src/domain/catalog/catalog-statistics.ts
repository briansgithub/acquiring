import type { AuralCatalogStatistics, AuralCatalogStatisticsApi, AuralCatalogStatisticsRow, AuralStatisticsInput } from './statistics-contracts';

const INT_MAX = 2_147_483_647, ROW_MAX = 10_000, TEXT_MAX = 8 * 1024 * 1024;
function object(value:unknown):Record<string,unknown> {
 if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected object');
 return value as Record<string,unknown>;
}
function finite(value:unknown):number {
 if (typeof value !== 'number') throw new TypeError('Expected number');
 if (!Number.isFinite(value)) throw new RangeError('Expected finite number');
 return value;
}
function integer(value:unknown, low=0, high=INT_MAX):number {
 const n=finite(value);
 if (!Number.isInteger(n) || n<low || n>high) throw new RangeError('Integer out of range');
 return n===0?0:n;
}
function boolean(value:unknown):boolean {
 if (typeof value !== 'boolean') throw new TypeError('Expected boolean');
 return value;
}
function strings() {
 let total=0;
 return (value:unknown):string => {
  if (typeof value !== 'string') throw new TypeError('Expected string');
  total+=value.length;
  if (value.length>4096 || total>TEXT_MAX) throw new RangeError('Text budget exceeded');
  return value;
 };
}
function array<T>(value:unknown, copy:(item:unknown)=>T):T[] {
 if (!Array.isArray(value)) throw new TypeError('Expected array');
 const length=value.length;
 integer(length,0,ROW_MAX);
 const result:T[]=[];
 for(let i=0;i<length;i++) result.push(copy(value[i]));
 return result;
}
function snapshot(input:AuralStatisticsInput) {
 const value=object(input), text=strings();
 const length=integer(value.targetLength,2,ROW_MAX);
 const occurrences=array(value.occurrences,item=>{
  const v=object(item), runId=integer(v.runId), offset=integer(v.offset);
  if(offset+length-1>INT_MAX) throw new RangeError('Occurrence end overflows');
  return {runId,offset};
 });
 const runs=array(value.runs,item=>{
  const v=object(item);return {id:integer(v.id),songId:text(v.songId),sectionId:text(v.sectionId)};
 });
 const valid=array(value.validSongIds,text);
 const popularity=array(value.popularity,item=>{
  const v=object(item),songId=text(v.songId),rawScore=v.score;
  return {songId,score:rawScore===null?null:finite(rawScore),confidence:finite(v.confidence)};
 });
 const rawSettings=object(value.settings);
 const settings={popularity:boolean(rawSettings.popularity),variety:boolean(rawSettings.variety),favorites:boolean(rawSettings.favorites)};
 const recent=array(value.recentSongIds,text),favorites=array(value.favoriteSongIds,text);
 const rawPercent=value.minimumPopularityPercent;
 const percent=rawPercent===null || rawPercent===undefined?null:integer(rawPercent,0,100);
 const runById=new Map<number,typeof runs[number]>(),popBySong=new Map<string,typeof popularity[number]>();
 for(const run of runs) {
  if(runById.has(run.id)) throw new RangeError('Duplicate run ID');
  runById.set(run.id,run);
 }
 for(const pop of popularity) {
  if(popBySong.has(pop.songId)) throw new RangeError('Duplicate popularity ID');
  popBySong.set(pop.songId,pop);
 }
 for(const occurrence of occurrences) if(!runById.has(occurrence.runId)) throw new RangeError('Missing run');
 return {length,occurrences,runById,valid:new Set(valid),popBySong,settings,recent,favorites:new Set(favorites),percent};
}
const clamp=(value:number)=>value<0?0:value>1?1:value;

/** Frozen native Catalog147..185; input selection/SQL are outside this pure kernel. */
export function computeAuralCatalogStatistics(input:AuralStatisticsInput):AuralCatalogStatistics|null {
 const s=snapshot(input),grouped=new Map<string,{runId:number;offset:number}[]>(),globalSongs=new Set<string>();
 let globalOccurrences=0,occurrences=0;
 for(const match of s.occurrences) {
  const run=s.runById.get(match.runId)!;
  if(!s.valid.has(run.songId)) continue;
  globalOccurrences++;globalSongs.add(run.songId);
  const score=s.popBySong.get(run.songId)?.score;
  if(s.percent!==null && (score===null || score===undefined || score<0 || score>1 || score<s.percent/100)) continue;
  let matches=grouped.get(run.songId);
  if(!matches) { matches=[];grouped.set(run.songId,matches); }
  matches.push(match);occurrences++;
 }
 if(!grouped.size) return null;
 let effective=0,sum=0;
 const sections=new Set<string>();
 for(const [song,matches]of grouped) {
  let priorRun=-1,end=-1,count=0;
  matches.sort((a,b)=>a.runId-b.runId || a.offset-b.offset);
  for(const match of matches) {
   sections.add(s.runById.get(match.runId)!.sectionId);
   if(count<4 && (match.runId!==priorRun || match.offset>end)) {
    count++;priorRun=match.runId;end=match.offset+s.length-1;
   }
  }
  effective+=count;
  const p=s.popBySong.get(song),i=s.recent.indexOf(song);
  const pop=s.settings.popularity && p?.score!==null && p?.score!==undefined?1+clamp(p.confidence)*(clamp(p.score)-.5):1;
  const recency=s.settings.variety && i>=0 && i<=9?(i<3?.25:.6):1;
  sum+=pop*recency*(s.settings.favorites && s.favorites.has(song)?1.5:1);
 }
 const songs=grouped.size,base=Math.log2(s.length)*Math.log2(1+songs)*Math.log2(1+effective);
 return Object.freeze({songs,occurrences,sections:sections.size,effective,score:base*sum/songs,globalSongs:globalSongs.size,globalOccurrences});
}
function row(input:AuralCatalogStatisticsRow,text:(v:unknown)=>string):AuralCatalogStatisticsRow {
 const v=object(input);
 return {id:text(v.id),length:integer(v.length,2,ROW_MAX),songs:integer(v.songs),occurrences:integer(v.occurrences),sections:integer(v.sections),effective:integer(v.effective),score:finite(v.score),globalSongs:integer(v.globalSongs),globalOccurrences:integer(v.globalOccurrences)};
}
function compareNumber(a:number,b:number):number {
 if(a===b) return a===0 && !Object.is(a,b)?(Object.is(a,-0)?-1:1):0;
 return a<b?-1:1;
}
/** Kotlin Double ordering distinguishes -0.0; String ordering is raw UTF16. */
export function compareAuralCatalogRows(a:AuralCatalogStatisticsRow,b:AuralCatalogStatisticsRow,sortOrder?:string):number {
 const text=strings(),left=row(a,text),right=row(b,text),order=sortOrder===undefined?'recommended':text(sortOrder);
 const desc=(key:'score'|'songs'|'length'|'globalSongs'|'globalOccurrences')=>compareNumber(right[key],left[key]);
 let result:number;
 if(order==='mostSongs') result=desc('globalSongs') || desc('globalOccurrences') || desc('length');
 else if(order==='longest' || order==='shortest') result=(order==='longest'?desc('length'):compareNumber(left.length,right.length)) || desc('globalSongs') || desc('globalOccurrences');
 else result=desc('score') || desc('songs') || desc('length');
 return result || (left.id===right.id?0:left.id<right.id?-1:1);
}
export const auralCatalogStatisticsApi:Readonly<AuralCatalogStatisticsApi>=Object.freeze({computeAuralCatalogStatistics,compareAuralCatalogRows});
