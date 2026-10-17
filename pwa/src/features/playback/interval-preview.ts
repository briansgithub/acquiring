export interface RootIntervalPreviewStep {
  readonly audioNotes:readonly number[];
  readonly durationMs:number;
  readonly delayAfterMs:number;
}

/** Frozen RootIntervalPreview.kt: written pitches, then both; no clock or audio ownership.
 * Native Int addition wraps before distinct-note comparison. Browser inputs must be Ints.
 * Duration/delay remain native values here; the eventual audio boundary owns resource caps.
 */
export function rootIntervalPreviewSteps(previousAudioNote:number,currentAudioNote:number,
  octaveShiftSemitones:number,durationMs:number):readonly RootIntervalPreviewStep[] {
  for(const value of [previousAudioNote,currentAudioNote,octaveShiftSemitones,durationMs]) {
    if(!Number.isInteger(value)||value< -2147483648||value>2147483647)throw new RangeError('Interval preview values must be native Ints.');
  }
  const previous=(previousAudioNote+octaveShiftSemitones)|0,current=(currentAudioNote+octaveShiftSemitones)|0;
  return Object.freeze([
    Object.freeze({audioNotes:Object.freeze([previous]),durationMs,delayAfterMs:durationMs}),
    Object.freeze({audioNotes:Object.freeze([current]),durationMs,delayAfterMs:durationMs}),
    Object.freeze({audioNotes:Object.freeze(previous===current?[previous]:[previous,current]),durationMs,delayAfterMs:0}),
  ]);
}
