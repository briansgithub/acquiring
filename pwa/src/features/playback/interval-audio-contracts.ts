import type {Waveform,StaticRenderOptions} from '../../audio/synth';
import type {PreviewRequest} from '../../audio/transport';

/** Feature-local interval protocol, used ONLY with renderRootIntervalPreview injection.
 * It is not an ordinary two-note static preview. No UI/owner/DSP API changes here.
 */
export interface RootIntervalAudioInput {
  readonly previousAudioNote:number;
  readonly currentAudioNote:number;
  readonly transpose:number;
  readonly waveform:Waveform;
}
export type RootIntervalRequest=Readonly<PreviewRequest & {
  readonly freqs:readonly [number,number];
  readonly durationMs:450;
  readonly arpeggiate:false;
  readonly waveform:Waveform;
}>;
export interface RootIntervalAudioApi {
  rootIntervalPreviewRequest(input:RootIntervalAudioInput):RootIntervalRequest;
  renderRootIntervalPreview(options:StaticRenderOptions):Int16Array|null;
}
/** Next pure module interval-preview-audio.ts exports those two named functions.
 * Request: snapshot four known fields once; native Int written pitches, transpose Int
 * -12..12, valid preset. Reuse rootIntervalPreviewSteps(...,450) unchanged; convert
 * shifted notes with the existing 440*2**((note-69)/12) convention exactly once.
 * Reject nonfinite/nonpositive results; freeze request and pair, retain unison pair.
 * Render: snapshot known options and copy pair before work; exactly two finite positive
 * frequencies, duration450, arpeggiate explicitly false, actual integer output rate
 * within accepted static bounds, optional stepMs absent/80 only. Preserve gain/random
 * and accepted frequency/string-delay resource limits; never reinterpret as arpeggio.
 * Unchanged static renderer builds450ms previous/current/distinct-both segments in that
 * order, identical rate/preset/gain, shared random stream. Concatenate exact signed16
 * outputs into ONE buffer:59535frames@44100,64800@48000. No extra interstage silence.
 * Check shouldAbort between segments/before allocation/before return; any null/abort
 * returns null and never partial audio. No shared mutable request/last-plan closure.
 * Focused evidence: immutable/getter snapshots, native wrap/transpose/unison/octave,
 * exact segment PCM+offsets at both rates (seeded strings), invalid bounds and aborts.
 * No new native recapture, App import, owner arbitration or actual sound claim until
 * separately reviewed integration and real Chrome clock/cancellation acceptance.
 */
