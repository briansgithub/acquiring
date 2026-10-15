/** Frozen native assessAuralPitch, Android801cf798. Capture ownership is separate. */
export interface AuralPitchFrame {
  readonly timeMs:number;
  readonly midi:number|null;
  readonly confidence?:number;
  readonly isHeld?:boolean;
  readonly error?:string|null;
}
export enum AuralPitchStatus { CORRECT='CORRECT',INCORRECT='INCORRECT',UNCERTAIN='UNCERTAIN' }
export interface AuralPitchAssessment {
  readonly status:AuralPitchStatus;
  readonly reason:string;
  readonly cents:readonly number[];
}
export interface AuralPitchAssessmentOptions {
  readonly toleranceCents?:number;
  readonly minConfidence?:number;
  readonly minStableMs?:number;
  readonly minCoverage?:number;
  readonly octaveEquivalent?:boolean;
}
export const ASSESSMENT_LIMITS=Object.freeze({frames:25_000,targets:256});
const EMPTY_CENTS:readonly number[]=Object.freeze([]);
const uncertain=(reason:string):AuralPitchAssessment=>Object.freeze({status:AuralPitchStatus.UNCERTAIN,reason,cents:EMPTY_CENTS});
function median(values:readonly number[]):number {
  const sorted=[...values].sort((a,b)=>a-b),center=Math.trunc(sorted.length/2);
  return sorted.length%2===1?sorted[center]!:(sorted[center-1]!+sorted[center]!)/2;
}
const octaveDifference=(midi:number,target:number)=>((100*(midi-target)+600)%1200+1200)%1200-600;
function bounded(value:number,min:number,max:number,name:string):void {
  if(!Number.isFinite(value)||value<min||value>max)throw new RangeError('Invalid assessment '+name);
}
/** Held/no signal/unclear boundaries are technical uncertainty, never musical errors.
 * No microphone, clock, event persistence, assistance or learning eligibility is owned here.
 */
export function assessAuralPitch(frames:readonly AuralPitchFrame[],targetMidis:readonly number[],
  options:AuralPitchAssessmentOptions={}):AuralPitchAssessment {
  if(!Array.isArray(frames)||!Array.isArray(targetMidis)||frames.length>ASSESSMENT_LIMITS.frames||targetMidis.length>ASSESSMENT_LIMITS.targets){
    throw new RangeError('Assessment input limit exceeded');
  }
  const {toleranceCents=45,minConfidence=0.85,minStableMs=250,minCoverage=0.25,octaveEquivalent=true}=options;
  bounded(toleranceCents,0,12_800,'tolerance');bounded(minConfidence,0,1,'confidence');
  bounded(minStableMs,1,30_000,'duration');bounded(minCoverage,0,1,'coverage');
  if(!Number.isInteger(minStableMs)||typeof octaveEquivalent!=='boolean')throw new RangeError('Invalid assessment settings');
  if(targetMidis.length===0||targetMidis.some(midi=>!Number.isInteger(midi)||midi<1||midi>127))return uncertain('The exercise pitch target is unavailable.');
  for(const frame of frames){
    if(!frame||typeof frame!=='object')throw new RangeError('Invalid assessment frame');
    if(frame.error!=null){
      if(typeof frame.error!=='string')throw new RangeError('Invalid capture error');
      return uncertain(frame.error);
    }
  }
  for(const frame of frames){
    if(!Number.isSafeInteger(frame.timeMs)||(frame.midi!==null&&typeof frame.midi!=='number')||
      (frame.confidence!==undefined&&typeof frame.confidence!=='number')||
      (frame.isHeld!==undefined&&typeof frame.isHeld!=='boolean'))throw new RangeError('Invalid assessment frame');
  }
  const ordered=frames.filter(frame=>frame.timeMs>=0).sort((a,b)=>a.timeMs-b.timeMs);
  if(ordered.length<4)return uncertain('Too little microphone data was captured. Try again.');
  const intervals:number[]=[];
  for(let i=1;i<ordered.length;i++){
    const interval=ordered[i]!.timeMs-ordered[i-1]!.timeMs;
    if(interval>=1&&interval<=100)intervals.push(interval);
  }
  const frameMs=intervals.length===0?40:median(intervals);
  const voiced=ordered.filter(frame=>frame.midi!==null&&Number.isFinite(frame.midi)&&frame.midi>=35&&frame.midi<=96&&
    Number.isFinite(frame.confidence??0)&&(frame.confidence??0)>=minConfidence&&!frame.isHeld);
  if(voiced.length/ordered.length<minCoverage)return uncertain('The voice signal was too faint or unclear. Try a quieter space.');
  const distance=(midi:number,target:number)=>octaveEquivalent?octaveDifference(midi,target):(midi-target)*100;
  interface Group {start:number;end:number;anchor:number;notes:number[]}
  const groups:Group[]=[];
  for(const frame of voiced){
    const midi=frame.midi!,last=groups.at(-1);
    let group=last;
    if(!last||frame.timeMs-last.end>Math.max(100,2.1*frameMs)||Math.abs(distance(midi,last.anchor))>85){
      group={start:frame.timeMs,end:frame.timeMs,anchor:midi,notes:[]};groups.push(group);
    }
    group!.end=frame.timeMs;
    group!.notes.push(octaveEquivalent?group!.anchor+octaveDifference(midi,group!.anchor)/100:midi);
  }
  const stable=groups.filter(group=>{
    const center=median(group.notes),inliers=group.notes.filter(note=>Math.abs((note-center)*100)<=45).length;
    return group.end-group.start+frameMs>=minStableMs&&group.notes.length>=4&&inliers/group.notes.length>=0.8;
  });
  if(stable.length!==targetMidis.length)return uncertain(targetMidis.length>1?
    'Could not separate every sustained note. Leave a breath between repeated notes or capture one at a time.':
    'Hold one steady note for a little longer, then try again.');
  if(stable.reduce((sum,group)=>sum+group.notes.length,0)/Math.max(1,voiced.length)<0.75)return uncertain('Pitch was not steady enough to grade reliably.');
  const cents=Object.freeze(stable.map((group,index)=>Math.abs(distance(median(group.notes),targetMidis[index]!))));
  const correct=cents.every(value=>value<=toleranceCents);
  return Object.freeze({status:correct?AuralPitchStatus.CORRECT:AuralPitchStatus.INCORRECT,
    reason:correct?'Stable pitches matched the target.':'A clear sustained pitch differed from the target.',cents});
}
