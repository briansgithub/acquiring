import type { ExtractedSection, MelodyNote } from '../../contracts';
import { getKeyAtBeat } from '../../domain/data';
import { doubleOrUndefined } from '../../domain/data/primitives';
import { getChordNotes, getMidiNote, resolveChordRoot } from '../../domain/music';
import { PlaybackAudioLayer, STREAM_LIMITS, type PlaybackTimeline, type PlaybackTimelineEvent } from '../synth';

/** Frozen Android buildPlaybackTimeline; the caller supplies decoded melody and loop end.
 * No transpose, tempo, root-only conversion, or completion intent is applied here.
 */
export function buildPlaybackTimeline(section:ExtractedSection, melody:readonly MelodyNote[], endBeat:number):PlaybackTimeline {
  if (!Number.isFinite(endBeat) || endBeat <= 1 || endBeat > STREAM_LIMITS.absoluteBeat) {
    throw new RangeError('Playback end must be finite, greater than1 and within the timeline limit.');
  }
  if (section.chords.length + melody.length > STREAM_LIMITS.events ||
    Array.isArray(section.metadata?.keys) && section.metadata.keys.length > STREAM_LIMITS.events) {
    throw new RangeError('Playback section exceeds the bounded event/key budget.');
  }
  let nextId=1;
  const events:PlaybackTimelineEvent[]=[];
  for (const note of melody) {
    if (!Number.isInteger(note.octave) || note.octave < -2147483648 || note.octave > 2147483647) {
      throw new RangeError('Melody octave must be a native Int.');
    }
    const noteEnd=note.beat+note.duration;
    if (!note.isRest && note.duration > 0 && noteEnd > 1) {
      const midi=getMidiNote(note.sd,note.octave,getKeyAtBeat(section,note.beat));
      if (midi > 0) events.push({id:nextId++,startBeat:Math.max(note.beat,1),endBeat:Math.min(noteEnd,endBeat),
        layer:PlaybackAudioLayer.MELODY,fullMidiNotes:[midi],rootMidiNote:null});
    }
  }
  for (const chord of section.chords) {
    const rawBeat=doubleOrUndefined(chord.beat) ?? 1;
    const beat=rawBeat===0 ? 1 : rawBeat;
    const duration=doubleOrUndefined(chord.duration) ?? 1;
    const chordEnd=beat+duration;
    // Kotlin JsonPrimitive.booleanOrNull accepts case-insensitive string booleans.
    const flag=(value:unknown)=>value===true || typeof value==='string' && value.toLowerCase()==='true';
    const rest=flag(chord.isRest) || flag(chord.rest);
    if (!rest && duration > 0 && chordEnd > 1) {
      const key=getKeyAtBeat(section,beat);
      const fullMidiNotes=getChordNotes(chord,key).filter(note=>note>0);
      const rootMidiNote=resolveChordRoot(chord,key)?.simpleModePitch.toAudioNoteNumber() ?? null;
      if (fullMidiNotes.length || rootMidiNote!==null) events.push({id:nextId++,startBeat:Math.max(beat,1),
        endBeat:Math.min(chordEnd,endBeat),layer:PlaybackAudioLayer.CHORD,fullMidiNotes,rootMidiNote});
    }
  }
  const sorted=events.filter(event=>event.endBeat>event.startBeat)
    .sort((a,b)=>a.startBeat-b.startBeat || a.id-b.id)
    .map(event=>Object.freeze({...event,fullMidiNotes:Object.freeze([...event.fullMidiNotes])}));
  return Object.freeze({startBeat:1,endBeat,events:Object.freeze(sorted),completionKey:null});
}
