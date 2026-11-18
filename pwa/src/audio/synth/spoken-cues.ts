/** Native SpokenRootDegrees.kt + the cue helpers at the top of PlaybackEngine.kt (Android 3c887223, N06/N07).
 * Bundled Kokoro clips (24 kHz mono int16) are split per MIDI pitch 36..59; phrases are stretched and pitched
 * with the bit-exact Sonic port. Asset loading lives elsewhere: this module only takes decoded clip arrays.
 */
import { sonicStretch, Sonic } from './sonic';

export const SPOKEN_ROOT_DEGREE_SAMPLE_RATE = 24_000;
export const SPOKEN_ROOT_DEGREE_PITCH_LOW = 36;
export const SPOKEN_ROOT_DEGREE_PITCH_HIGH = 59;
export const SPOKEN_ROOT_DEGREE_PITCH_COUNT = SPOKEN_ROOT_DEGREE_PITCH_HIGH - SPOKEN_ROOT_DEGREE_PITCH_LOW + 1;
export const SPOKEN_KEY_LOW_MIDI = 48;
export const SPOKEN_KEY_HIGH_MIDI = 59;
export const DEFAULT_PLAYBACK_VOICE_VOLUME = 0.5;
/** Speech gain at a 100% voice slider (native PLAYBACK_VOICE_MAX_GAIN). */
export const PLAYBACK_VOICE_MAX_GAIN = 1.4;
const OUTPUT_SOFT_KNEE = 0.85;

export enum PlaybackRootDegreeCue {
  OFF = 'OFF', ROOT_PULSES = 'ROOT_PULSES', HARMONIC_DISTANCE = 'HARMONIC_DISTANCE', SPOKEN_NUMBER = 'SPOKEN_NUMBER',
  SUNG_NUMBER_WITH_DETAILS = 'SUNG_NUMBER_WITH_DETAILS', MELODY_FUNCTION = 'MELODY_FUNCTION', MELODY_CHORD_TONE = 'MELODY_CHORD_TONE',
}
export const pulsesRoots = (cue: PlaybackRootDegreeCue) => cue === PlaybackRootDegreeCue.ROOT_PULSES || cue === PlaybackRootDegreeCue.HARMONIC_DISTANCE;
export const speaksRootDegree = (cue: PlaybackRootDegreeCue) => cue === PlaybackRootDegreeCue.SPOKEN_NUMBER || cue === PlaybackRootDegreeCue.SUNG_NUMBER_WITH_DETAILS;
export const speaksMelodyFunction = (cue: PlaybackRootDegreeCue) => cue === PlaybackRootDegreeCue.MELODY_FUNCTION || cue === PlaybackRootDegreeCue.MELODY_CHORD_TONE;
/** Mode names belong to the root-degree readings, not the melody-function option. */
export const announcesMode = speaksRootDegree;
export const usesVoice = (cue: PlaybackRootDegreeCue) => speaksRootDegree(cue) || speaksMelodyFunction(cue);

/** Native SpokenChordSuffix entry order, with the resource stem and spoken name. */
export const SPOKEN_CHORD_SUFFIXES = Object.freeze({
  MIN: ['root_suffix_min', 'minor'], SEVEN: ['root_suffix_seven', 'dominant seventh'], SEV_MAJ: ['root_suffix_sev_maj', 'major seventh'],
  SEV_MIN: ['root_suffix_sev_min', 'minor seventh'], MIN_SEV_MAJ: ['root_suffix_min_sev_maj', 'minor major seventh'],
  DIM: ['root_suffix_dim', 'diminished'], DIM_SEV: ['root_suffix_dim_sev', 'diminished seventh'],
  HALF_DIM: ['root_suffix_half_dim', 'half diminished seventh'], AUG: ['root_suffix_aug', 'augmented'],
  SUS_TWO: ['root_suffix_sus_two', 'suspended second'], SUS_FOUR: ['root_suffix_sus_four', 'suspended fourth'],
  SUS_TWO_FOUR: ['root_suffix_sus_two_four', 'suspended second and fourth'],
  SEVENTH_SUS_TWO: ['root_suffix_seventh_sus_two', 'dominant seventh suspended second'],
  SEVENTH_SUS_FOUR: ['root_suffix_seventh_sus_four', 'dominant seventh suspended fourth'],
  SEVENTH_SUS_TWO_FOUR: ['root_suffix_seventh_sus_two_four', 'dominant seventh suspended second and fourth'],
} as const);
export type SpokenChordSuffix = keyof typeof SPOKEN_CHORD_SUFFIXES;
export const SPOKEN_DEGREE_STEMS = Object.freeze(['one', 'two', 'three', 'four', 'five', 'six', 'seven'].map((name) => `root_degree_${name}`));
export const SPOKEN_ACCIDENTAL_STEMS = Object.freeze(['root_accidental_flat', 'root_accidental_sharp']);
/** Native SPOKEN_MELODY_FUNCTIONS: cue words -> resource stem. */
export const SPOKEN_MELODY_FUNCTIONS: readonly (readonly [string, string])[] = Object.freeze([
  'root', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'ninth', 'eleventh', 'thirteenth', 'passing',
  'chromatic passing', 'upper neighbor', 'lower neighbor', 'anticipation', 'suspension', 'retardation', 'held over',
  'appoggiatura', 'escape', 'leading', 'pedal', 'color', 'chromatic color', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
].map((cue) => Object.freeze([cue, `melody_fn_${cue.replaceAll(' ', '_')}`] as const)));
/** Native SPOKEN_MODE_NAMES: mode words -> resource stem (unpitched clips). */
export const SPOKEN_MODE_NAMES: readonly (readonly [string, string])[] = Object.freeze([
  'major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian', 'ionian', 'aeolian', 'harmonic minor', 'phrygian dominant',
].map((name) => Object.freeze([name, `mode_${name.replaceAll(' ', '_')}`] as const)));

const CHORD_TONE_CUES = new Set(['root', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'ninth', 'eleventh', 'thirteenth']);
export const isSpokenMelodyChordTone = (cue: string) => CHORD_TONE_CUES.has(cue);

/** Identity below the knee; smoothly saturates toward full scale above it. */
export function softLimitPlaybackSample(sample: number): number {
  const magnitude = Math.abs(sample);
  if (magnitude <= OUTPUT_SOFT_KNEE) return sample;
  const headroom = 1 - OUTPUT_SOFT_KNEE;
  const limited = OUTPUT_SOFT_KNEE + headroom * Math.tanh((magnitude - OUTPUT_SOFT_KNEE) / headroom);
  return sample < 0 ? -limited : limited;
}

export const spokenModeName = (scale: string) => scale.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

export function modeAnnouncement(previousScale: string | null | undefined, currentScale: string | null | undefined,
  cue: PlaybackRootDegreeCue, majorLocked: boolean): string | null {
  if (majorLocked || !currentScale || !announcesMode(cue)) return null;
  if (previousScale == null || previousScale === currentScale) return null;
  return spokenModeName(currentScale);
}

interface ModeEvent { readonly id: number; readonly keyScale?: string | null }
/** The chord that introduces a new mode after `host`, when `host` should speak that mode at its end. */
export function followingModeChord<T extends ModeEvent>(chords: readonly T[], host: T, loops: boolean,
  cue: PlaybackRootDegreeCue, majorLocked: boolean): T | null {
  if (!announcesMode(cue) || majorLocked) return null;
  const index = chords.findIndex((event) => event.id === host.id);
  if (index < 0) return null;
  const next = index + 1 < chords.length ? chords[index + 1]! : loops && chords.length > 1 ? chords[0]! : null;
  if (!next || next.id === host.id) return null;
  return modeAnnouncement(host.keyScale, next.keyScale, cue, false) == null ? null : next;
}

/** Right-align a mode phrase with the end of the chord that precedes the new mode. */
export function modeAnnouncementWindow(hostStart: number, hostEnd: number, nextStart: number, sampleCount: number,
  samplesPerBeat: number): readonly [number, number] | null {
  if (sampleCount <= 0 || samplesPerBeat <= 0) return null;
  const end = Math.min(hostEnd, nextStart);
  if (end <= hostStart) return null;
  return [Math.max(end - sampleCount / samplesPerBeat, hostStart), end];
}

/** Same pitch class as the tonic, moved by octaves into C3..B3. */
export function spokenKeyTonicMidi(tonicMidi: number): number {
  let midi = tonicMidi;
  while (midi < SPOKEN_KEY_LOW_MIDI) midi += 12;
  while (midi > SPOKEN_KEY_HIGH_MIDI) midi -= 12;
  return midi;
}

/** Fundamental frequency of a short spoken clip, in hertz (native autocorrelation estimate). */
export function estimateSpeechPitchHz(samples: Int16Array, sampleRate = SPOKEN_ROOT_DEGREE_SAMPLE_RATE): number | null {
  const minLag = Math.max(Math.trunc(sampleRate / 500), 1);
  const maxLag = Math.trunc(sampleRate / 70);
  if (samples.length <= maxLag * 2) return null;
  const start = Math.trunc(samples.length / 4), length = Math.trunc(samples.length / 2);
  const window = new Float64Array(length);
  for (let i = 0; i < length; i++) window[i] = samples[start + i]! / 32_768;
  let energy = 0;
  for (const sample of window) energy += sample * sample;
  if (energy < 1e-4) return null;
  const scores = new Float64Array(maxLag + 1);
  let bestLag = -1, best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let correlation = 0;
    const compared = window.length - lag;
    for (let index = 0; index < compared; index++) correlation += window[index]! * window[index + lag]!;
    const normalized = correlation / energy;
    scores[lag] = normalized;
    if (normalized > best) { best = normalized; bestLag = lag; }
  }
  if (bestLag < 0 || best < 0.25) return null;
  let lag = bestLag;
  while (Math.trunc(lag / 2) >= minLag && scores[Math.trunc(lag / 2)]! > best * 0.8) lag = Math.trunc(lag / 2);
  return sampleRate / lag;
}

/** Moves a spoken clip so its pitch center is `targetMidi`, keeping the contour. */
export function pitchShiftSpokenClip(samples: Int16Array, targetMidi: number, sampleRate = SPOKEN_ROOT_DEGREE_SAMPLE_RATE): Int16Array {
  if (!samples.length) return samples;
  const sourceHz = estimateSpeechPitchHz(samples, sampleRate);
  if (sourceHz == null) return samples;
  const targetHz = 440 * 2 ** ((targetMidi - 69) / 12);
  const ratio = Math.fround(targetHz / sourceHz);
  if (ratio >= Math.fround(0.97) && ratio <= Math.fround(1.03)) return samples;
  const sonic = new Sonic(sampleRate, 1);
  sonic.speed = 1;
  sonic.pitch = ratio;
  sonic.writeShortToStream(samples, samples.length);
  sonic.flushStream();
  const count = sonic.samplesAvailable();
  if (count <= 0) return samples;
  const output = new Int16Array(count);
  sonic.readShortFromStream(output, count);
  return output;
}

export interface RelativeIonianDegree { readonly degree: number; readonly alteration: number }
export interface SpokenPhrase { readonly degree: RelativeIonianDegree; readonly midi: number; readonly suffix: SpokenChordSuffix | null }

/** Split a bundled resource (equal-length clips in ascending MIDI order 36..59) into per-pitch clips. */
export function splitPitchedClips(clip: Int16Array): Int16Array[] {
  if (clip.length % SPOKEN_ROOT_DEGREE_PITCH_COUNT !== 0) throw new RangeError('Pitched clip length must divide by 24');
  const frames = clip.length / SPOKEN_ROOT_DEGREE_PITCH_COUNT;
  return Array.from({ length: SPOKEN_ROOT_DEGREE_PITCH_COUNT }, (_, index) => clip.slice(index * frames, (index + 1) * frames));
}

export class SpokenRootDegreeClips {
  constructor(
    private readonly numbers: readonly (readonly Int16Array[])[] = [],
    private readonly suffixes: ReadonlyMap<SpokenChordSuffix, readonly Int16Array[]> = new Map(),
    private readonly accidentals: readonly (readonly Int16Array[])[] = [],
    private readonly functions: ReadonlyMap<string, readonly Int16Array[]> = new Map(),
    private readonly modes: ReadonlyMap<string, Int16Array> = new Map(),
  ) {}

  /** Build from decoded resources keyed by stem (e.g. `root_degree_one`). Missing stems simply disable those words. */
  static fromResources(resources: ReadonlyMap<string, Int16Array>): SpokenRootDegreeClips {
    const pitched = (stem: string) => { const clip = resources.get(stem); return clip ? splitPitchedClips(clip) : []; };
    const suffixes = new Map<SpokenChordSuffix, Int16Array[]>();
    for (const [name, [stem]] of Object.entries(SPOKEN_CHORD_SUFFIXES)) if (resources.has(stem)) suffixes.set(name as SpokenChordSuffix, pitched(stem));
    const functions = new Map<string, Int16Array[]>();
    for (const [cue, stem] of SPOKEN_MELODY_FUNCTIONS) if (resources.has(stem)) functions.set(cue, pitched(stem));
    const modes = new Map<string, Int16Array>();
    for (const [name, stem] of SPOKEN_MODE_NAMES) { const clip = resources.get(stem); if (clip) modes.set(name, clip); }
    return new SpokenRootDegreeClips(SPOKEN_DEGREE_STEMS.map(pitched), suffixes, SPOKEN_ACCIDENTAL_STEMS.map(pitched), functions, modes);
  }

  parts(phrase: SpokenPhrase): Int16Array[] | null {
    const pitch = this.samplePitch(phrase.midi) - SPOKEN_ROOT_DEGREE_PITCH_LOW;
    const number = this.numbers[phrase.degree.degree - 1]?.[pitch];
    if (!number) return null;
    const alteration = phrase.degree.alteration;
    const accidental = this.accidentals[alteration < 0 ? 0 : 1]?.[pitch];
    const suffix = phrase.suffix ? this.suffixes.get(phrase.suffix)?.[pitch] : undefined;
    const parts: Int16Array[] = [];
    if (accidental) for (let i = 0; i < Math.abs(alteration); i++) parts.push(accidental);
    parts.push(number);
    if (suffix) parts.push(suffix);
    return parts;
  }

  functionClip(cue: string, midi: number): Int16Array | null {
    return this.functions.get(cue)?.[this.samplePitch(midi) - SPOKEN_ROOT_DEGREE_PITCH_LOW] ?? null;
  }

  modeClip(name: string): Int16Array | null { return this.modes.get(name) ?? null; }

  samplePitch(midi: number): number {
    const low = SPOKEN_ROOT_DEGREE_PITCH_LOW, high = SPOKEN_ROOT_DEGREE_PITCH_HIGH;
    const floorMod = (a: number, n: number) => ((a % n) + n) % n;
    if (midi < low) return low + floorMod(midi - low, 12);
    if (midi > high) return high - floorMod(high - midi, 12);
    return midi;
  }
}

const CACHE_BUDGET_FRAMES = 48 * SPOKEN_ROOT_DEGREE_SAMPLE_RATE;

/** Native SpokenPhraseCache: stretch to a third of the chord (bounded 1..4x natural) and shift by octaves. */
export class SpokenPhraseCache {
  private readonly samples = new Map<string, Int16Array>();
  private readonly functionSamples = new Map<string, Int16Array>();
  private cachedFrames = 0;

  constructor(private readonly clips: SpokenRootDegreeClips) {}

  private static target(chordFrames: number, natural: number): number {
    return Math.min(Math.min(Math.max(Math.trunc(chordFrames / 3), natural), natural * 4), chordFrames);
  }

  private static chordFrames(durationBeats: number, bpm: number): number {
    return Math.round(durationBeats * 60 * SPOKEN_ROOT_DEGREE_SAMPLE_RATE / bpm);
  }

  private stretch(source: Int16Array, midi: number, target: number): Int16Array {
    const semitoneShift = midi - this.clips.samplePitch(midi);
    if (target === source.length && semitoneShift === 0) return source;
    return sonicStretch(source, SPOKEN_ROOT_DEGREE_SAMPLE_RATE, Math.fround(source.length / target), Math.fround(2 ** (semitoneShift / 12)), target);
  }

  prepare(phrase: SpokenPhrase, durationBeats: number, bpm: number): Int16Array | null {
    if (bpm <= 0) return null;
    const parts = this.clips.parts(phrase);
    if (!parts) return null;
    const naturalFrames = parts.reduce((sum, part) => sum + part.length, 0);
    const chordFrames = SpokenPhraseCache.chordFrames(durationBeats, bpm);
    if (chordFrames <= 0 || naturalFrames === 0) return null;
    const target = SpokenPhraseCache.target(chordFrames, naturalFrames);
    const key = `${phrase.degree.degree}:${phrase.degree.alteration}:${phrase.midi}:${phrase.suffix ?? ''}:${target}`;
    const cached = this.samples.get(key);
    if (cached) { this.samples.delete(key); this.samples.set(key, cached); return cached; }
    const source = new Int16Array(naturalFrames);
    let offset = 0;
    for (const part of parts) { source.set(part, offset); offset += part.length; }
    const output = this.stretch(source, phrase.midi, target);
    if (output.length <= CACHE_BUDGET_FRAMES) {
      while (this.cachedFrames + output.length > CACHE_BUDGET_FRAMES) {
        const [oldestKey, oldest] = this.samples.entries().next().value!;
        this.cachedFrames -= oldest.length;
        this.samples.delete(oldestKey);
      }
      this.samples.set(key, output);
      this.cachedFrames += output.length;
    }
    return output;
  }

  prepareFunction(cue: string, midi: number, durationBeats: number, bpm: number): Int16Array | null {
    const clip = this.clips.functionClip(cue, midi);
    if (!clip || bpm <= 0 || !clip.length) return null;
    const chordFrames = SpokenPhraseCache.chordFrames(durationBeats, bpm);
    if (chordFrames <= 0) return null;
    const target = SpokenPhraseCache.target(chordFrames, clip.length);
    const key = `${cue}:${midi}:${target}`;
    const cached = this.functionSamples.get(key);
    if (cached) { this.functionSamples.delete(key); this.functionSamples.set(key, cached); return cached; }
    const output = this.stretch(clip, midi, target);
    if (output.length <= CACHE_BUDGET_FRAMES) {
      let total = 0;
      for (const value of this.functionSamples.values()) total += value.length;
      while (total + output.length > CACHE_BUDGET_FRAMES && this.functionSamples.size) {
        const [oldestKey, oldest] = this.functionSamples.entries().next().value!;
        total -= oldest.length;
        this.functionSamples.delete(oldestKey);
      }
      this.functionSamples.set(key, output);
    }
    return output;
  }
}
