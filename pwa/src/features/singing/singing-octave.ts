/** Frozen 801cf798 SingingTargets.kt / idealIntervalPlaybackMidis.
 * Singing octave never transposes source song playback. AudioEngine still applies
 * manual transpose itself, so preview MIDI omits globalTranspose and the mic scorer includes it.
 * Tessitura is song-scoped later; this module is pure Int math only. No mic/dock/Aural/timeline.
 */

export const OCTAVE_OFFSET_MIN = -2;
export const OCTAVE_OFFSET_MAX = 3;

export interface SingingTargetNote {
  readonly sourceMidi: number;
  readonly scaleDegreeLabel: string;
}

export interface SingingTargetRequest {
  readonly first: SingingTargetNote | null;
  readonly second: SingingTargetNote | null;
  readonly requestId: number;
}

function nativeInt(value: number, label: string): number {
  if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) {
    throw new RangeError(`${label} must be a native Int.`);
  }
  return value;
}

export function clampSingingOctaveOffset(offset: number): number {
  const value = nativeInt(offset, 'octaveOffset');
  return Math.min(OCTAVE_OFFSET_MAX, Math.max(OCTAVE_OFFSET_MIN, value));
}

export function singingOctaveOffsetLabel(offset: number): string {
  const clamped = clampSingingOctaveOffset(offset);
  return clamped > 0 ? `+${clamped}` : `${clamped}`;
}

export function singingOctaveSemitones(octaveOffset: number): number {
  return (clampSingingOctaveOffset(octaveOffset) * 12) | 0;
}

export function singingTargetNote(sourceMidi: number, scaleDegreeLabel: string): SingingTargetNote {
  if (typeof scaleDegreeLabel !== 'string') throw new TypeError('scaleDegreeLabel must be a string.');
  return Object.freeze({sourceMidi: nativeInt(sourceMidi, 'sourceMidi'), scaleDegreeLabel});
}

export function singingTargetRequest(
  first: SingingTargetNote | null,
  second: SingingTargetNote | null,
  requestId: number,
): SingingTargetRequest {
  return Object.freeze({first, second, requestId: nativeInt(requestId, 'requestId')});
}

/** Final MIDI used by the microphone scorer. */
export function effectiveTargetMidi(
  note: SingingTargetNote,
  globalTranspose: number,
  octaveOffset: number,
): number {
  return (note.sourceMidi + nativeInt(globalTranspose, 'globalTranspose') + singingOctaveSemitones(octaveOffset)) | 0;
}

/** MIDI supplied to AudioEngine for target preview. Song playback is never shifted. */
export function targetPlaybackMidiInput(
  note: SingingTargetNote,
  globalTranspose: number,
  octaveOffset: number,
): number {
  nativeInt(globalTranspose, 'globalTranspose');
  return (note.sourceMidi + singingOctaveSemitones(octaveOffset)) | 0;
}

export function resolveSingingTargetRequest(
  request: SingingTargetRequest,
  globalTranspose: number,
  octaveOffset: number,
): readonly [number | null, number | null] {
  const transpose = nativeInt(globalTranspose, 'globalTranspose');
  const shift = singingOctaveSemitones(octaveOffset);
  const midi = (note: SingingTargetNote | null): number | null =>
    note === null ? null : (note.sourceMidi + transpose + shift) | 0;
  return Object.freeze([midi(request.first), midi(request.second)]);
}

/** Pair previewed as taught, then de-transposed because AudioEngine applies transpose. */
export function idealIntervalPlaybackMidis(
  target: SingingTargetRequest | null,
  globalTranspose: number,
  octaveOffset: number,
): readonly [number, number] | null {
  if (target === null || target.first === null || target.second === null) return null;
  const resolved = resolveSingingTargetRequest(target, globalTranspose, octaveOffset);
  const first = resolved[0], second = resolved[1];
  if (first === null || second === null) return null;
  const transpose = nativeInt(globalTranspose, 'globalTranspose');
  return Object.freeze([first - transpose, second - transpose]);
}

export const singingOctaveApi = Object.freeze({
  clampSingingOctaveOffset,
  singingOctaveOffsetLabel,
  singingOctaveSemitones,
  singingTargetNote,
  singingTargetRequest,
  effectiveTargetMidi,
  targetPlaybackMidiInput,
  resolveSingingTargetRequest,
  idealIntervalPlaybackMidis,
});
