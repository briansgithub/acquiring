import type { ExtractedSection, KeyInfo } from '../../contracts';
import { getKeys } from '../data';
import { getMidiNote, getNoteLabel, getRelativeDegreeLabel, resolveScaleDegreePitch } from './theory';
import { floorMod, SpelledPitch } from './spelled-pitch';
import type { NoteNameAccidentalPreference } from './spelled-pitch';

export interface RelativeIonianDegree { degree: number; alteration: number }
export function accidentalPrefix(alteration: number): string {
  return alteration > 0 ? '♯'.repeat(alteration) : '♭'.repeat(-alteration);
}
export function relativeIonianTonicDegree(scale: string): number {
  switch (scale) {
    case 'dorian': return 7;
    case 'phrygian': case 'phrygianDominant': return 6;
    case 'lydian': return 5;
    case 'mixolydian': return 4;
    case 'minor': case 'aeolian': case 'harmonicMinor': return 3;
    case 'locrian': return 2;
    default: return 1;
  }
}
export function canonicalScaleName(scale: string): string {
  return scale === 'ionian' ? 'major' : scale === 'aeolian' ? 'minor' : scale;
}
export function relativeIonianKey(key: KeyInfo): KeyInfo {
  return { tonic: getNoteLabel(relativeIonianTonicDegree(key.scale), key.tonic, canonicalScaleName(key.scale)), scale: 'major' };
}
export function noteNameAccidentalPreference(keyOrSection: KeyInfo | ExtractedSection): NoteNameAccidentalPreference {
  const key = 'tonic' in keyOrSection ? keyOrSection : getKeys(keyOrSection)[0].key;
  const relative = relativeIonianKey(key);
  const notes = Array.from({ length: 7 }, (_, i) => getNoteLabel(i + 1, relative.tonic, 'major'));
  if (notes.some(note => /[b♭]/.test(note))) return 'flats';
  if (notes.some(note => /[#♯x]/.test(note))) return 'sharps';
  return 'flats';
}
export function degreeInKey(pitch: SpelledPitch, key: KeyInfo): RelativeIonianDegree | null {
  const tonic = SpelledPitch.parse(key.tonic, pitch.octave);
  if (!tonic) return null;
  const degree = floorMod(pitch.letter.index - tonic.letter.index, 7) + 1;
  const expected = resolveScaleDegreePitch(String(degree), 0, { tonic: key.tonic, scale: canonicalScaleName(key.scale) }, pitch.octave);
  return expected ? { degree, alteration: pitch.accidental - expected.accidental } : null;
}
export function relativeIonianDegree(pitch: SpelledPitch, sourceKey: KeyInfo): RelativeIonianDegree | null {
  return degreeInKey(pitch, relativeIonianKey(sourceKey));
}
function degreeLabel(value: RelativeIonianDegree | null): string {
  return value ? accidentalPrefix(value.alteration) + value.degree + '\u0302' : '';
}

/** Optional root spelling distinguishes chord tones such as D# from enharmonic Eb. */
export function ionianContextDegreeLabel(pitch: SpelledPitch | number, ionianKey: KeyInfo, rootPitch?: SpelledPitch): string {
  const displayKey = { tonic: ionianKey.tonic, scale: 'major' };
  if (typeof pitch !== 'number') return degreeLabel(degreeInKey(pitch, displayKey));
  if (rootPitch) return ionianContextDegreeLabel(SpelledPitch.spellRelative(rootPitch, pitch), displayKey);
  return getRelativeDegreeLabel(pitch, getMidiNote('1', 0, displayKey));
}
export function relativeIonianDegreeLabel(pitch: SpelledPitch | number, sourceKey: KeyInfo): string {
  return ionianContextDegreeLabel(pitch, relativeIonianKey(sourceKey));
}

/** One fixed register for previews; input pitch octave does not change the result. */
export function ionianContextPreviewAudioNote(
  pitch: SpelledPitch | number, ionianKey: KeyInfo, referenceOctave = 3, rootPitch?: SpelledPitch,
): number | null {
  const displayKey = { tonic: ionianKey.tonic, scale: 'major' };
  if (typeof pitch === 'number' && rootPitch) {
    return ionianContextPreviewAudioNote(SpelledPitch.spellRelative(rootPitch, pitch), displayKey, referenceOctave);
  }
  const sd = typeof pitch === 'number'
    ? ionianContextDegreeLabel(pitch, displayKey).replaceAll('\u0302', '')
    : (() => { const degree = degreeInKey(pitch, displayKey); return degree ? accidentalPrefix(degree.alteration) + degree.degree : null; })();
  return sd === null ? null : resolveScaleDegreePitch(sd, 0, displayKey, referenceOctave)?.toAudioNoteNumber() ?? null;
}
export function ionianContextStaffDegree(sd: string, relativeOctave: number, sourceKey: KeyInfo, ionianKey: KeyInfo): number | null {
  const source = { tonic: sourceKey.tonic, scale: canonicalScaleName(sourceKey.scale) };
  const pitch = resolveScaleDegreePitch(sd, relativeOctave, source);
  const tonic = SpelledPitch.parse(ionianKey.tonic, 4);
  return pitch && tonic ? pitch.staffPosition - tonic.staffPosition + 1 : null;
}
export function relativeIonianStaffDegree(sd: string, relativeOctave: number, sourceKey: KeyInfo): number | null {
  return ionianContextStaffDegree(sd, relativeOctave, sourceKey, relativeIonianKey(sourceKey));
}
