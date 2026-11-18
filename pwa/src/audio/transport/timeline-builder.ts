import type { ExtractedSection, MelodyNote } from '../../contracts';
import { getKeyAtBeat } from '../../domain/data';
import { doubleOrUndefined } from '../../domain/data/primitives';
import {
  annotateMelodyVoiceCues, buildChordVoicing, circleOfFifthsDistance, degreeInKey, foldMelodyIntoSingingRange, getMidiNote,
  getRomanSymbol, relativeIonianKey, resolveChordRoot, spokenSuffixForChord, tonicPitchClass,
} from '../../domain/music';
import { PlaybackAudioLayer, STREAM_LIMITS, type PlaybackTimeline, type PlaybackTimelineEvent } from '../synth';

const floorMod = (a: number, n: number) => ((a % n) + n) % n;

/** Native buildPlaybackTimeline at Android 3c887223; the caller supplies decoded melody and loop end.
 * Melody MIDI is folded into the singable C2..B4 span; chord events carry root-degree, suffix, circle-of-fifths
 * and key data for the root-degree cues; melody functions are annotated for spoken melody cues (N06-N08).
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
  for (const note of melody) {
    if (!Number.isInteger(note.octave) || note.octave < -2147483648 || note.octave > 2147483647) {
      throw new RangeError('Melody octave must be a native Int.');
    }
  }
  let nextId=1;
  const relativeMajorKey=relativeIonianKey(getKeyAtBeat(section,1));
  const sungMelodyMidis=foldMelodyIntoSingingRange(melody.map(note=>{
    if (note.isRest || note.duration <= 0) return null;
    const midi=getMidiNote(note.sd,note.octave,getKeyAtBeat(section,note.beat));
    return midi > 0 ? midi : null;
  }));
  const events:PlaybackTimelineEvent[]=[];
  melody.forEach((note,index)=>{
    const noteEnd=note.beat+note.duration,midi=sungMelodyMidis[index];
    if (!note.isRest && note.duration > 0 && noteEnd > 1 && midi != null) events.push(melodyEvent(nextId++,Math.max(note.beat,1),Math.min(noteEnd,endBeat),midi));
  });
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
      const voicing=buildChordVoicing(chord,key);
      const fullMidiNotes=(voicing?.tones ?? []).map(tone=>tone.midi).filter(note=>note>0);
      const resolvedRoot=resolveChordRoot(chord,key);
      const rootMidiNote=resolvedRoot?.simpleModePitch.toAudioNoteNumber() ?? null;
      const rootDegree=resolvedRoot ? degreeInKey(resolvedRoot.pitch,key) : null;
      if (fullMidiNotes.length || rootMidiNote!==null) events.push(Object.freeze({
        id:nextId++,startBeat:Math.max(beat,1),endBeat:Math.min(chordEnd,endBeat),layer:PlaybackAudioLayer.CHORD,
        fullMidiNotes,rootMidiNote,
        rootDegree:rootDegree?.degree ?? null,
        rootDegreeAlteration:rootDegree?.alteration ?? 0,
        fullChordRootMidiNote:voicing?.tones.find(tone=>tone.degree===1)?.midi ?? null,
        spokenChordSuffix:spokenSuffixForChord(chord,getRomanSymbol(chord,key),voicing),
        relativeMajorRootDegree:resolvedRoot ? degreeInKey(resolvedRoot.pitch,relativeMajorKey) : null,
        fifthsFromKeyTonic:rootMidiNote===null ? 0 : circleOfFifthsDistance(tonicPitchClass(key),floorMod(rootMidiNote,12)),
        fifthsFromMajorTonic:rootMidiNote===null ? 0 : circleOfFifthsDistance(tonicPitchClass(relativeMajorKey),floorMod(rootMidiNote,12)),
        keyScale:key.scale,
        spokenMelodyCue:null,melodyCueMidi:null,
        keyTonicMidi:getMidiNote('1',0,key),
      }));
    }
  }
  const sorted=events.filter(event=>event.endBeat>event.startBeat)
    .sort((a,b)=>a.startBeat-b.startBeat || a.id-b.id);
  const annotated=annotateMelodyVoiceCues(section,melody,sorted)
    .map(event=>Object.freeze({...event,fullMidiNotes:Object.freeze([...event.fullMidiNotes]),
      relativeMajorRootDegree:event.relativeMajorRootDegree ? Object.freeze({...event.relativeMajorRootDegree}) : null}));
  return Object.freeze({startBeat:1,endBeat,events:Object.freeze(annotated),completionKey:null});
}

function melodyEvent(id:number,startBeat:number,endBeat:number,midi:number):PlaybackTimelineEvent {
  return {id,startBeat,endBeat,layer:PlaybackAudioLayer.MELODY,fullMidiNotes:[midi],rootMidiNote:null,
    rootDegree:null,rootDegreeAlteration:0,fullChordRootMidiNote:null,spokenChordSuffix:null,relativeMajorRootDegree:null,
    fifthsFromKeyTonic:0,fifthsFromMajorTonic:0,keyScale:null,spokenMelodyCue:null,melodyCueMidi:null,keyTonicMidi:null};
}
