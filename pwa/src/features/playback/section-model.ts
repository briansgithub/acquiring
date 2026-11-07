import type {ExtractedSection,MelodyNote} from '../../contracts';
import {getBpm} from '../../domain/data';
import {doubleOrUndefined,intOrUndefined,isObject,primitiveContent} from '../../domain/data/primitives';
import {nativeBooleanOrNull} from '../../domain/music/native-json';
import {buildPlaybackTimeline} from '../../audio/transport/timeline-builder';
import {STREAM_LIMITS,type PlaybackTimeline} from '../../audio/synth';

export interface PreparedPlaybackSection {
  readonly melody:readonly MelodyNote[];
  readonly baseBpm:number;
  readonly timeline:PlaybackTimeline;
}
const normalize=(beat:number)=>beat===0?1:beat;
function eventEnd(beat:number,duration:number,rest:boolean):number|null {
  const start=normalize(beat),end=start+duration;
  return !rest&&Number.isFinite(start)&&Number.isFinite(duration)&&duration>0&&Number.isFinite(end)&&end>1?end:null;
}
const rest=(note:ExtractedSection['chords'][number])=>nativeBooleanOrNull(note.isRest)===true||nativeBooleanOrNull(note.rest)===true;

/** Frozen native PlaybackView melody/base tempo and PlaybackTiming audible-end projection.
 * completionKey is applied by the caller (queue playOnceKey); the timeline builder never invents it.
 */
export function preparePlaybackSection(section:ExtractedSection,completionKey:string|null=null):PreparedPlaybackSection {
  const raw=Array.isArray(section.notes)?section.notes:isObject(section.notes)&&Array.isArray(section.notes.melody1)?section.notes.melody1:[];
  if(raw.length+section.chords.length>STREAM_LIMITS.events)throw new RangeError('This section exceeds the playback event limit.');
  const melody=raw.filter(isObject).map(note=>Object.freeze({
    sd:note.sd===null?'1':primitiveContent(note.sd)??'1',beat:normalize(doubleOrUndefined(note.beat)??1),
    duration:doubleOrUndefined(note.duration)??1,octave:intOrUndefined(note.octave)??0,isRest:rest(note),
  }));
  let end:number|null=null;
  const consider=(value:number|null)=>{if(value!==null&&(end===null||value>end))end=value;};
  for(const note of melody)consider(eventEnd(note.beat,note.duration,note.isRest));
  for(const chord of section.chords)consider(eventEnd(doubleOrUndefined(chord.beat)??1,doubleOrUndefined(chord.duration)??1,rest(chord)));
  const metadataEnd=doubleOrUndefined(section.metadata?.endBeat);
  const endBeat=end??(metadataEnd!==undefined&&Number.isFinite(metadataEnd)&&metadataEnd>1?metadataEnd:32);
  const baseBpm=Math.fround(Math.min(240,Math.max(40,Math.fround(getBpm(section)))));
  if(!Number.isFinite(baseBpm))throw new RangeError('This section has an invalid playback tempo.');
  const timeline=buildPlaybackTimeline(section,melody,endBeat);
  return Object.freeze({
    melody:Object.freeze(melody),baseBpm,
    timeline:completionKey===null?timeline:Object.freeze({...timeline,completionKey}),
  });
}
