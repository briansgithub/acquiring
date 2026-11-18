import { instrumentMetadata, Waveform } from './instruments';
import { MAX_PLUCK_DELAY_SAMPLES, SynthVoice } from './synth-voice';
import {
  DEFAULT_PLAYBACK_VOICE_VOLUME, PLAYBACK_VOICE_MAX_GAIN, PlaybackRootDegreeCue, SPOKEN_CHORD_SUFFIXES, SPOKEN_ROOT_DEGREE_SAMPLE_RATE,
  SpokenPhraseCache, SpokenRootDegreeClips, followingModeChord, isSpokenMelodyChordTone, modeAnnouncement, modeAnnouncementWindow,
  pitchShiftSpokenClip, pulsesRoots, softLimitPlaybackSample, speaksMelodyFunction, speaksRootDegree, spokenKeyTonicMidi, usesVoice,
  type RelativeIonianDegree, type SpokenChordSuffix,
} from './spoken-cues';

/* Native PlaybackEngine.kt PlaybackPcmRenderer. Android 3c887223 adds root pulses / Harmonic Distance (N06),
   spoken root degrees, chord suffixes, melody functions and key-change mode speech with an independent voice
   gain and a tanh output limiter (N07), and Song-mode section splices inside the audio block (N11). */

export enum PlaybackAudioLayer { MELODY = 'MELODY', CHORD = 'CHORD' }
export enum PlaybackChordMode { FULL = 'FULL', ROOT_ONLY = 'ROOT_ONLY' }
export interface PlaybackTimelineEvent {
  readonly id: number;
  readonly startBeat: number;
  readonly endBeat: number;
  readonly layer: PlaybackAudioLayer;
  readonly fullMidiNotes: readonly number[];
  readonly rootMidiNote?: number | null;
  readonly rootDegree?: number | null;
  readonly rootDegreeAlteration?: number;
  readonly fullChordRootMidiNote?: number | null;
  readonly spokenChordSuffix?: SpokenChordSuffix | null;
  readonly relativeMajorRootDegree?: RelativeIonianDegree | null;
  readonly fifthsFromKeyTonic?: number;
  readonly fifthsFromMajorTonic?: number;
  readonly keyScale?: string | null;
  readonly spokenMelodyCue?: string | null;
  readonly melodyCueMidi?: number | null;
  readonly keyTonicMidi?: number | null;
}
export interface PlaybackTimeline {
  readonly startBeat?: number;
  readonly endBeat: number;
  readonly events: readonly PlaybackTimelineEvent[];
  readonly completionKey?: string | null;
}
export interface PlaybackConfig {
  readonly bpm: number;
  readonly transpose: number;
  readonly waveform: Waveform;
  readonly chordMode: PlaybackChordMode;
  readonly melodyGain: number;
  readonly chordGain: number;
  readonly arpeggiateCycles?: number;
  readonly rootDegreeCue?: PlaybackRootDegreeCue;
  readonly useRelativeIonianContext?: boolean;
  readonly voiceVolume?: number;
}
export interface RenderedPlaybackEvent { readonly id: number; readonly frameOffset: number }
export interface RenderedPlaybackBlock {
  readonly startBeat: number;
  readonly beatsPerFrame: number;
  readonly startedEvents: readonly RenderedPlaybackEvent[];
}
/** Next song section, rendered into the same PCM stream at the boundary (native QueuedSection). */
export interface QueuedSection { readonly timeline: PlaybackTimeline; readonly bpm: number; readonly performanceId: string }
export interface PlaybackSplice {
  readonly frame: number; readonly beat: number; readonly beatsPerFrame: number;
  readonly loopStart: number; readonly loopEnd: number; readonly performanceId: string; readonly timeline: PlaybackTimeline;
}

export const STREAM_LIMITS = Object.freeze({
  events: 4096, notesPerEvent: 32, currentVoices: 64, currentDelaySamples: 524_288,
  blockFrames: 65_536, voiceSamplesPerBlock: 16_000_000, startedEventsPerBlock: 65_536,
  activationSamplesPerBlock: 4_000_000, absoluteBeat: 1_000_000, bpm: 1000, queuedSections: 64,
});
const EPSILON = 1e-9;
const NOTE_GAIN = 0.15;
type TimelineEventSnapshot = Required<PlaybackTimelineEvent>;
interface TimelineSnapshot { readonly startBeat: number; readonly endBeat: number; readonly events: readonly TimelineEventSnapshot[]; readonly completionKey: string | null }
type ConfigSnapshot = Required<PlaybackConfig>;
interface PreparedEvent { readonly frequencies: readonly number[]; readonly delaySamples: number; readonly pulseCount: number }
type Prepared = Map<TimelineEventSnapshot, PreparedEvent>;
interface ActiveEvent {
  readonly event: TimelineEventSnapshot;
  readonly oscillators: readonly SynthVoice[];
  readonly rootPulses: readonly (readonly SynthVoice[])[];
  readonly arpeggiateCycles: number;
  readonly delaySamples: number;
  ageFrames: number;
  transitionGain: number;
  transitionFramesRemaining: number;
  transitionStep: number;
  fadingOut: boolean;
}
interface SpokenNumber {
  readonly event: TimelineEventSnapshot; readonly samples: Int16Array; readonly anchorBeat: number;
  readonly anchorPosition: number; readonly samplesPerBeat: number; renderedFrames: number;
}
interface SpokenMode { readonly samples: Int16Array; readonly startBeat: number; readonly endBeat: number; renderedFrames: number }
interface PreparedSection { readonly timeline: TimelineSnapshot; readonly bpm: number; readonly performanceId: string }

function integer(value: number, name: string): void {
  if (!Number.isInteger(value) || value < -2_147_483_648 || value > 2_147_483_647) {
    throw new RangeError(`${name} must be a native Int`);
  }
}
function finite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
}
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
/** Math.nextDown for a positive finite double. */
function nextDown(value: number): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  view.setBigUint64(0, view.getBigUint64(0) - 1n);
  return view.getFloat64(0);
}

function exactSlot(elapsedBeats: number, noteCount: number, cyclesPerBeat: number): number {
  finite(elapsedBeats, 'Elapsed beats'); finite(cyclesPerBeat, 'Arpeggio cycles');
  if (!Number.isInteger(noteCount) || noteCount < 0 || noteCount > STREAM_LIMITS.notesPerEvent) {
    throw new RangeError('Arpeggio note count exceeds limit');
  }
  if (noteCount <= 1 || cyclesPerBeat <= 0) return 0;
  const value = Math.max(0, elapsedBeats) * noteCount * cyclesPerBeat;
  if (!Number.isFinite(value) || value > Number.MAX_SAFE_INTEGER) throw new RangeError('Arpeggio position exceeds safe precision');
  return value;
}
export function arpeggioToneIndex(elapsedBeats: number, noteCount: number, cyclesPerBeat: number): number {
  const slot = exactSlot(elapsedBeats, noteCount, cyclesPerBeat);
  return noteCount <= 1 ? 0 : Math.floor(slot) % noteCount;
}
export function arpeggioSlotProgress(elapsedBeats: number, noteCount: number, cyclesPerBeat: number): number {
  const slot = exactSlot(elapsedBeats, noteCount, cyclesPerBeat);
  return slot - Math.floor(slot);
}

function sanitized(config: PlaybackConfig): ConfigSnapshot {
  for (const value of [config.bpm, config.melodyGain, config.chordGain, config.arpeggiateCycles ?? 0, config.voiceVolume ?? 0]) finite(value, 'Playback config');
  integer(config.transpose, 'Transpose');
  instrumentMetadata(config.waveform);
  if (config.bpm > STREAM_LIMITS.bpm) throw new RangeError('Tempo exceeds streaming limit');
  if (!Object.values(PlaybackChordMode).includes(config.chordMode)) throw new RangeError('Unknown chord mode');
  const rootDegreeCue = config.rootDegreeCue ?? PlaybackRootDegreeCue.OFF;
  if (!Object.values(PlaybackRootDegreeCue).includes(rootDegreeCue)) throw new RangeError('Unknown root-degree cue');
  return Object.freeze({ ...config, bpm: Math.max(0, config.bpm),
    melodyGain: clamp(Math.fround(config.melodyGain), 0, 1),
    chordGain: clamp(Math.fround(config.chordGain), 0, 1),
    arpeggiateCycles: pulsesRoots(rootDegreeCue) ? 0 : clamp(config.arpeggiateCycles ?? 0, 0, 4),
    rootDegreeCue, useRelativeIonianContext: config.useRelativeIonianContext === true,
    voiceVolume: clamp(Math.fround(config.voiceVolume ?? DEFAULT_PLAYBACK_VOICE_VOLUME), 0, 1) });
}

function optionalInteger(value: number | null | undefined, name: string): number | null {
  if (value == null) return null;
  integer(value, name);
  return value;
}

function snapshot(input: PlaybackTimeline): TimelineSnapshot {
  const startBeat = input.startBeat ?? 1, endBeat = input.endBeat;
  for (const beat of [startBeat, endBeat]) {
    if (!Number.isFinite(beat) || Math.abs(beat) > STREAM_LIMITS.absoluteBeat) throw new RangeError('Timeline beat exceeds limit');
  }
  if (endBeat - startBeat < 1e-6) throw new RangeError('Timeline must have positive bounded length');
  if (input.events.length > STREAM_LIMITS.events) throw new RangeError('Timeline event count exceeds limit');
  if (input.completionKey != null && typeof input.completionKey !== 'string') throw new RangeError('Invalid completion key');
  let previous = -Infinity;
  const events = input.events.map((event): TimelineEventSnapshot => {
    if (!Number.isSafeInteger(event.id)) throw new RangeError('Event ID must be a safe integer');
    if (!Object.values(PlaybackAudioLayer).includes(event.layer)) throw new RangeError('Unknown playback layer');
    for (const beat of [event.startBeat, event.endBeat]) {
      if (!Number.isFinite(beat) || Math.abs(beat) > STREAM_LIMITS.absoluteBeat) throw new RangeError('Event beat exceeds limit');
    }
    if (event.endBeat <= event.startBeat || event.startBeat < previous) throw new RangeError('Events must be ordered with positive duration');
    previous = event.startBeat;
    if (event.fullMidiNotes.length > STREAM_LIMITS.notesPerEvent) throw new RangeError('Event note count exceeds limit');
    event.fullMidiNotes.forEach((note) => integer(note, 'MIDI note'));
    const suffix = event.spokenChordSuffix ?? null;
    if (suffix !== null && !(suffix in SPOKEN_CHORD_SUFFIXES)) throw new RangeError('Unknown spoken chord suffix');
    const relative = event.relativeMajorRootDegree ?? null;
    if (relative) { integer(relative.degree, 'Relative degree'); integer(relative.alteration, 'Relative alteration'); }
    return Object.freeze({
      id: event.id, startBeat: event.startBeat, endBeat: event.endBeat, layer: event.layer,
      fullMidiNotes: Object.freeze([...event.fullMidiNotes]),
      rootMidiNote: optionalInteger(event.rootMidiNote, 'Root MIDI note'),
      rootDegree: optionalInteger(event.rootDegree, 'Root degree'),
      rootDegreeAlteration: optionalInteger(event.rootDegreeAlteration, 'Root alteration') ?? 0,
      fullChordRootMidiNote: optionalInteger(event.fullChordRootMidiNote, 'Full chord root'),
      spokenChordSuffix: suffix,
      relativeMajorRootDegree: relative ? Object.freeze({ degree: relative.degree, alteration: relative.alteration }) : null,
      fifthsFromKeyTonic: optionalInteger(event.fifthsFromKeyTonic, 'Fifths from key tonic') ?? 0,
      fifthsFromMajorTonic: optionalInteger(event.fifthsFromMajorTonic, 'Fifths from major tonic') ?? 0,
      keyScale: typeof event.keyScale === 'string' ? event.keyScale : null,
      spokenMelodyCue: typeof event.spokenMelodyCue === 'string' ? event.spokenMelodyCue : null,
      melodyCueMidi: optionalInteger(event.melodyCueMidi, 'Melody cue MIDI'),
      keyTonicMidi: optionalInteger(event.keyTonicMidi, 'Key tonic MIDI'),
    });
  });
  return Object.freeze({ startBeat, endBeat, events: Object.freeze(events), completionKey: input.completionKey ?? null });
}

const harmonicPulseCount = (event: TimelineEventSnapshot, majorLocked: boolean) =>
  majorLocked ? event.fifthsFromMajorTonic : event.fifthsFromKeyTonic;

/** Native createActiveEvent note/pulse selection. pulseCount > 0 means separate retriggered root voices. */
function eventPlan(event: TimelineEventSnapshot, config: ConfigSnapshot): { notes: number[]; pulseCount: number } {
  const isChord = event.layer === PlaybackAudioLayer.CHORD;
  const root = event.rootMidiNote != null && event.rootMidiNote > 0 ? event.rootMidiNote : null;
  const pulseRoot = isChord && pulsesRoots(config.rootDegreeCue);
  const notes = isChord && (pulseRoot || config.chordMode === PlaybackChordMode.ROOT_ONLY)
    ? (root == null ? [] : [root]) : event.fullMidiNotes.filter((note) => note > 0);
  let pulseCount = 0;
  if (config.rootDegreeCue === PlaybackRootDegreeCue.ROOT_PULSES) {
    pulseCount = event.rootDegree != null && event.rootDegree >= 1 && event.rootDegree <= 7 ? event.rootDegree : 0;
  } else if (config.rootDegreeCue === PlaybackRootDegreeCue.HARMONIC_DISTANCE) {
    const distance = harmonicPulseCount(event, config.useRelativeIonianContext);
    pulseCount = distance <= 0 ? 0 : distance + 1;
  }
  const pulsing = config.rootDegreeCue === PlaybackRootDegreeCue.ROOT_PULSES ? pulseCount > 1
    : config.rootDegreeCue === PlaybackRootDegreeCue.HARMONIC_DISTANCE ? pulseCount >= 1 : false;
  return { notes, pulseCount: pulseRoot && pulsing ? pulseCount : 0 };
}

function prepare(timeline: TimelineSnapshot, config: ConfigSnapshot, sampleRate: number): Prepared {
  const prepared: Prepared = new Map();
  const edges: { beat: number; voices: number; delay: number }[] = [];
  for (const event of timeline.events) {
    const { notes, pulseCount } = eventPlan(event, config);
    const frequencies: number[] = [];
    let delaySamples = 0;
    for (const midi of notes) {
      const transposed = midi + config.transpose;
      integer(transposed, 'Transposed MIDI note');
      const frequency = 440 * 2 ** ((transposed - 69) / 12);
      if (!Number.isFinite(frequency) || frequency <= 0 || frequency > sampleRate) throw new RangeError('Transposed frequency exceeds oscillator domain');
      if (config.waveform === Waveform.STRINGS) {
        const delay = Math.max(2, Math.trunc(sampleRate / frequency));
        if (delay > MAX_PLUCK_DELAY_SAMPLES) throw new RangeError('Plucked-string delay exceeds limit');
        delaySamples += delay;
      }
      frequencies.push(frequency);
    }
    const copies = Math.max(1, pulseCount);
    prepared.set(event, { frequencies, delaySamples: delaySamples * copies, pulseCount });
    // Include all intervals: seek(endBeat) may activate an event extending
    // beyond the loop end. EPSILON also covers native early onset activation.
    const start = event.startBeat - EPSILON;
    const end = event.endBeat;
    if (start < end && frequencies.length) {
      edges.push({ beat: start, voices: frequencies.length * copies, delay: delaySamples * copies },
        { beat: end, voices: -frequencies.length * copies, delay: -delaySamples * copies });
    }
  }
  edges.sort((a, b) => a.beat - b.beat || a.voices - b.voices);
  let voices = 0, delay = 0;
  for (const edge of edges) {
    voices += edge.voices; delay += edge.delay;
    if (voices > STREAM_LIMITS.currentVoices || delay > STREAM_LIMITS.currentDelaySamples) {
      throw new RangeError('Timeline overlap exceeds voice or delay budget');
    }
  }
  return prepared;
}

function eventKey(event: TimelineEventSnapshot): string {
  return JSON.stringify([event.id, event.startBeat, event.endBeat, event.layer, event.fullMidiNotes, event.rootMidiNote]);
}
/** Same notes and bounds: a Loop/Song toggle copies the timeline and changes only completionKey. */
function samePerformance(a: TimelineSnapshot, b: TimelineSnapshot): boolean {
  return a.startBeat === b.startBeat && a.endBeat === b.endBeat && a.events.length === b.events.length
    && a.events.every((event, index) => event === b.events[index] || eventKey(event) === eventKey(b.events[index]!));
}

/** Pure native streaming PCM core. The caller owns the output buffer and device. */
export class PlaybackPcmRenderer {
  private timeline: TimelineSnapshot;
  private config: ConfigSnapshot;
  private prepared: Prepared;
  private beat: number;
  private nextEventIndex = 0;
  private activeEvents: ActiveEvent[] = [];
  private currentMelodyGain: number;
  private currentChordGain: number;
  private currentVoiceGain: number;
  private readonly crossfadeFrames: number;
  private phraseCache: SpokenPhraseCache;
  private readonly preparedVoices = new Map<number, Int16Array>();
  private spokenNumber: SpokenNumber | null = null;
  private spokenMode: SpokenMode | null = null;
  private continuation: PreparedSection[] | null = null;
  private splices: PlaybackSplice[] = [];

  constructor(timeline: PlaybackTimeline, initialConfig: PlaybackConfig,
    private readonly sampleRate: number, private readonly random: () => number = Math.random,
    private spokenRootDegrees: SpokenRootDegreeClips = new SpokenRootDegreeClips()) {
    if (!Number.isInteger(sampleRate) || sampleRate < 1000 || sampleRate > 384_000) throw new RangeError('Streaming output rate must be1000..384000');
    this.timeline = snapshot(timeline);
    this.config = sanitized(initialConfig);
    this.prepared = prepare(this.timeline, this.config, sampleRate);
    this.beat = this.timeline.startBeat;
    this.currentMelodyGain = this.config.melodyGain;
    this.currentChordGain = this.config.chordGain;
    this.currentVoiceGain = this.config.voiceVolume * PLAYBACK_VOICE_MAX_GAIN;
    this.crossfadeFrames = Math.max(1, Math.round(sampleRate * 24 / 1000));
    this.phraseCache = new SpokenPhraseCache(spokenRootDegrees);
  }

  get currentBeat(): number { return this.beat; }
  get finished(): boolean { return this.timeline.completionKey != null && this.beat >= this.timeline.endBeat; }
  get currentBeatsPerFrame(): number { return this.config.bpm / (60 * this.sampleRate); }

  /** Install (or replace) the decoded speech clips without disturbing transport state. Speech already
   * scheduled keeps its samples; later phrases use the new clips (PWA lazy-asset extension). */
  setSpokenClips(clips: SpokenRootDegreeClips): void {
    this.spokenRootDegrees = clips;
    this.phraseCache = new SpokenPhraseCache(clips);
    this.preparedVoices.clear();
  }

  /** Native `continuation`: sections spliced in order (and rotated) when a once-timeline ends. */
  setContinuation(sections: readonly QueuedSection[] | null): void {
    if (sections && sections.length > STREAM_LIMITS.queuedSections) throw new RangeError('Too many queued sections');
    this.continuation = sections?.map((section) => {
      finite(section.bpm, 'Queued tempo');
      if (section.bpm > STREAM_LIMITS.bpm) throw new RangeError('Queued tempo exceeds streaming limit');
      const timeline = snapshot(section.timeline);
      prepare(timeline, this.config, this.sampleRate);
      return { timeline, bpm: section.bpm, performanceId: String(section.performanceId) };
    }) ?? null;
  }

  consumeSplices(): PlaybackSplice[] {
    const copy = this.splices;
    this.splices = [];
    return copy;
  }

  replaceTimeline(newTimeline: PlaybackTimeline, startBeat = newTimeline.startBeat ?? 1): void {
    const timeline = snapshot(newTimeline), prepared = prepare(timeline, this.config, this.sampleRate);
    const same = samePerformance(this.timeline, timeline);
    this.timeline = timeline; this.prepared = prepared;
    if (!same) this.seek(startBeat);
  }

  seek(requestedBeat: number, preserveVoiceProgress = false): void {
    finite(requestedBeat, 'Seek beat');
    const previousVoice = preserveVoiceProgress ? this.spokenNumber : null;
    this.beat = clamp(requestedBeat, this.timeline.startBeat, this.timeline.endBeat);
    this.activeEvents = [];
    this.spokenNumber = null;
    this.spokenMode = null;
    for (const event of this.timeline.events) {
      if (!(event.startBeat <= this.beat && this.beat < event.endBeat)) continue;
      this.startSpokenNumber(event, this.prepareVoice(event));
      const active = this.createActiveEvent(event, false, this.config, this.prepared);
      if (active) this.activeEvents.push(active);
    }
    const restarted = this.spokenNumber as SpokenNumber | null;
    if (previousVoice && restarted?.event.id === previousVoice.event.id) {
      this.spokenNumber = { ...previousVoice, renderedFrames: 0 };
    }
    const next = this.timeline.events.findIndex((event) => event.startBeat > this.beat);
    this.nextEventIndex = next < 0 ? this.timeline.events.length : next;
  }

  updateConfig(newConfig: PlaybackConfig): void {
    const config = sanitized(newConfig), prepared = prepare(this.timeline, config, this.sampleRate);
    const previous = this.config;
    const pitchChanged = config.transpose !== previous.transpose;
    const waveformOrPitchChanged = config.waveform !== previous.waveform || pitchChanged;
    const chordModeChanged = config.chordMode !== previous.chordMode;
    const arpeggioChanged = config.arpeggiateCycles !== previous.arpeggiateCycles;
    const cueChanged = config.rootDegreeCue !== previous.rootDegreeCue;
    const lockChanged = config.useRelativeIonianContext !== previous.useRelativeIonianContext;
    const rootPulsesChanged = pulsesRoots(config.rootDegreeCue) !== pulsesRoots(previous.rootDegreeCue)
      || (pulsesRoots(config.rootDegreeCue) && cueChanged)
      || (config.rootDegreeCue === PlaybackRootDegreeCue.HARMONIC_DISTANCE && lockChanged);
    const voiceChanged = cueChanged || pitchChanged || chordModeChanged || lockChanged;
    const tempoChanged = config.bpm !== previous.bpm;
    const crossfade = waveformOrPitchChanged || chordModeChanged || arpeggioChanged || rootPulsesChanged;
    let additions: ActiveEvent[] = [];
    const affected = (event: TimelineEventSnapshot) => waveformOrPitchChanged || event.layer === PlaybackAudioLayer.CHORD;
    if (crossfade) {
      const outgoing = this.activeEvents.filter((active) => active.fadingOut || affected(active.event));
      if (outgoing.reduce((n, active) => n + voiceCount(active), 0) > STREAM_LIMITS.currentVoices
        || outgoing.reduce((n, active) => n + active.delaySamples, 0) > STREAM_LIMITS.currentDelaySamples) {
        throw new RangeError('Pending crossfades exceed fading cohort budget');
      }
    }
    const previousVoice = this.spokenNumber;
    this.config = config; this.prepared = prepared;
    if (voiceChanged || tempoChanged) {
      this.preparedVoices.clear();
      if (!usesVoice(config.rootDegreeCue)) {
        this.spokenNumber = null;
        this.spokenMode = null;
      } else if (config.bpm > 0) {
        let speaking: TimelineEventSnapshot | null = null;
        for (const event of this.timeline.events) {
          if (this.beat >= event.startBeat && this.beat < event.endBeat && this.speaksFor(event)) speaking = event;
        }
        this.spokenNumber = null;
        if (speaking) {
          const samples = this.prepareVoice(speaking);
          const prior = previousVoice?.event.id === speaking.id ? previousVoice : null;
          const phase = prior ? positionAt(prior, this.beat) / prior.samples.length : null;
          this.startSpokenNumber(speaking, samples, phase);
        }
      }
    }
    if (crossfade) {
      // Build replacements first so malformed injected RNG cannot partly mutate the renderer.
      additions = this.timeline.events.filter((event) => affected(event) && event.startBeat <= this.beat && this.beat < event.endBeat)
        .map((event) => this.createActiveEvent(event, true, config, prepared)).filter((value) => value !== null);
      for (const active of this.activeEvents) if (!active.fadingOut && affected(active.event)) {
        active.transitionFramesRemaining = this.crossfadeFrames;
        active.transitionStep = -active.transitionGain / this.crossfadeFrames;
        active.fadingOut = true;
      }
      this.activeEvents.push(...additions);
    }
  }

  renderInto(buffer: Int16Array, frameCount = buffer.length): RenderedPlaybackBlock {
    const startBeat = this.beat, startedEvents: RenderedPlaybackEvent[] = [];
    const beatsPerFrame = this.renderSamples(buffer, frameCount, startedEvents);
    return { startBeat, beatsPerFrame, startedEvents };
  }
  renderAudioInto(buffer: Int16Array, frameCount = buffer.length): void { this.renderSamples(buffer, frameCount, null); }

  private validateBlock(buffer: Int16Array, frameCount: number, diagnostic: boolean): void {
    if (!(buffer instanceof Int16Array) || !Number.isInteger(frameCount) || frameCount < 0
      || frameCount > buffer.length || frameCount > STREAM_LIMITS.blockFrames) throw new RangeError('Invalid or oversized PCM block');
    if (frameCount === 0) return;
    for (const active of this.activeEvents) if (active.ageFrames + frameCount > Number.MAX_SAFE_INTEGER) throw new RangeError('Voice age exceeds safe precision');
    const span = frameCount * this.currentBeatsPerFrame;
    const loopLength = this.timeline.endBeat - this.timeline.startBeat;
    const wraps = this.timeline.completionKey != null || this.currentBeatsPerFrame <= 0
      || span + EPSILON < this.timeline.endBeat - this.beat ? 0
      : Math.min(frameCount, 1 + Math.floor(Math.max(0, span - Math.max(0, this.timeline.endBeat - this.beat - EPSILON))
        / (loopLength - EPSILON)));
    const initialEnd = Math.min(this.timeline.endBeat, this.beat + span + EPSILON);
    let starts = 0, activation = 0;
    for (let i = 0; i < this.timeline.events.length; i++) {
      const event = this.timeline.events[i]!, item = this.prepared.get(event)!;
      const voices = item.frequencies.length * Math.max(1, item.pulseCount);
      const initial = i >= this.nextEventIndex && event.startBeat <= initialEnd && this.beat < event.endBeat ? 1 : 0;
      const repeats = event.startBeat >= this.timeline.startBeat && event.startBeat <= this.timeline.endBeat + EPSILON ? wraps : 0;
      if (voices) starts += initial + repeats;
      activation += (initial + repeats) * (1 + voices + item.delaySamples);
    }
    if ((diagnostic && starts > STREAM_LIMITS.startedEventsPerBlock)
      || activation > STREAM_LIMITS.activationSamplesPerBlock
      || frameCount * STREAM_LIMITS.currentVoices * 2 > STREAM_LIMITS.voiceSamplesPerBlock) {
      throw new RangeError('Streaming block exceeds onset, activation or voice-work budget');
    }
  }

  private renderSamples(buffer: Int16Array, frameCount: number, startedEvents: RenderedPlaybackEvent[] | null): number {
    this.validateBlock(buffer, frameCount, startedEvents !== null);
    const beatsPerFrame = this.currentBeatsPerFrame;
    this.prepareVoicesForBlock(frameCount * beatsPerFrame);
    const targetMelody = this.config.melodyGain, targetChord = this.config.chordGain;
    const targetVoice = this.config.voiceVolume * PLAYBACK_VOICE_MAX_GAIN;
    const melodyStep = (targetMelody - this.currentMelodyGain) / Math.max(1, frameCount);
    const chordStep = (targetChord - this.currentChordGain) / Math.max(1, frameCount);
    const voiceStep = (targetVoice - this.currentVoiceGain) / Math.max(1, frameCount);
    for (let frame = 0; frame < frameCount; frame++) {
      const frameBeats = this.currentBeatsPerFrame;
      this.activateDueEvents(frame, startedEvents);
      let mixed = (this.renderSpokenNumber(frameBeats) + this.renderSpokenMode(frameBeats)) * this.currentVoiceGain;
      let index = 0;
      while (index < this.activeEvents.length) {
        const active = this.activeEvents[index]!;
        if (this.beat >= active.event.endBeat) { this.activeEvents.splice(index, 1); continue; }
        const remainingBeats = Math.max(0, active.event.endBeat - this.beat);
        const remainingFrames = this.config.bpm > 0 ? remainingBeats * 60 * this.sampleRate / this.config.bpm : Number.MAX_VALUE;
        const envelope = Math.min(clamp(active.ageFrames / 200, 0, 1), clamp(remainingFrames / 1000, 0, 1));
        const elapsedSeconds = active.ageFrames / this.sampleRate;
        const layerGain = active.event.layer === PlaybackAudioLayer.MELODY ? this.currentMelodyGain : this.currentChordGain;
        let oscillatorSum = 0;
        if (active.arpeggiateCycles > 0) {
          const elapsedBeats = Math.max(0, this.beat - active.event.startBeat);
          const progress = arpeggioSlotProgress(elapsedBeats, active.oscillators.length, active.arpeggiateCycles);
          const slotEnvelope = Math.min(clamp(progress / 0.08, 0, 1), clamp((1 - progress) / 0.12, 0, 1));
          const tone = arpeggioToneIndex(elapsedBeats, active.oscillators.length, active.arpeggiateCycles);
          oscillatorSum = active.oscillators[tone]!.nextSample(envelope * slotEnvelope, elapsedSeconds, true) * NOTE_GAIN * slotEnvelope;
        } else {
          for (const voice of active.oscillators) oscillatorSum += voice.nextSample(envelope, elapsedSeconds) * NOTE_GAIN;
          if (active.rootPulses.length) oscillatorSum += this.renderRootPulse(active, envelope);
        }
        mixed += oscillatorSum * envelope * active.transitionGain * layerGain;
        active.ageFrames++;
        if (active.transitionFramesRemaining > 0) {
          active.transitionFramesRemaining--;
          active.transitionGain = clamp(active.transitionGain + active.transitionStep, 0, 1);
          if (active.fadingOut && active.transitionFramesRemaining === 0) { this.activeEvents.splice(index, 1); continue; }
        }
        index++;
      }
      buffer[frame] = clamp(Math.round(softLimitPlaybackSample(mixed) * 32767), -32768, 32767);
      this.currentMelodyGain += melodyStep; this.currentChordGain += chordStep; this.currentVoiceGain += voiceStep;
      this.advanceBeat(frameBeats, frame);
    }
    this.currentMelodyGain = targetMelody; this.currentChordGain = targetChord; this.currentVoiceGain = targetVoice;
    return beatsPerFrame;
  }

  private renderRootPulse(active: ActiveEvent, envelope: number): number {
    const event = active.event, duration = event.endBeat - event.startBeat, pulseCount = active.rootPulses.length;
    // Roundoff near the exclusive end must never wrap back to pulse one.
    const slot = clamp((this.beat - event.startBeat) / duration * pulseCount, 0, nextDown(pulseCount));
    const index = Math.trunc(slot);
    const progress = slot - index;
    if (progress >= 0.8) return 0;
    const pulseEnvelope = Math.min(progress / 0.08, (0.8 - progress) / 0.12, 1);
    const elapsedSeconds = this.config.bpm > 0 ? progress * duration * 60 / (pulseCount * this.config.bpm) : 0;
    let sum = 0;
    for (const voice of active.rootPulses[index]!) sum += voice.nextSample(envelope * pulseEnvelope, elapsedSeconds) * NOTE_GAIN * pulseEnvelope;
    return sum;
  }

  private prepareVoice(event: TimelineEventSnapshot): Int16Array | null {
    const config = this.config, duration = event.endBeat - event.startBeat;
    if (speaksMelodyFunction(config.rootDegreeCue)) {
      const cue = event.spokenMelodyCue;
      if (cue == null) return null;
      const midi = event.melodyCueMidi ?? event.fullMidiNotes[0];
      if (midi == null) return null;
      return this.phraseCache.prepareFunction(cue, midi + config.transpose, duration, config.bpm);
    }
    if (event.layer !== PlaybackAudioLayer.CHORD || !speaksRootDegree(config.rootDegreeCue)) return null;
    const degree = config.useRelativeIonianContext ? event.relativeMajorRootDegree
      : event.rootDegree != null ? { degree: event.rootDegree, alteration: event.rootDegreeAlteration } : null;
    if (!degree) return null;
    const root = config.chordMode === PlaybackChordMode.FULL ? event.fullChordRootMidiNote ?? event.rootMidiNote : event.rootMidiNote;
    if (root == null) return null;
    const suffix = config.rootDegreeCue === PlaybackRootDegreeCue.SUNG_NUMBER_WITH_DETAILS ? event.spokenChordSuffix : null;
    return this.phraseCache.prepare({ degree, midi: root + config.transpose - 12, suffix }, duration, config.bpm);
  }

  /** Prepare PCM before the sample loop, including events after a wrap when a block crosses the loop boundary. */
  private prepareVoicesForBlock(span: number): void {
    this.preparedVoices.clear();
    if (!usesVoice(this.config.rootDegreeCue) || span <= 0) return;
    const prepareFrom = (startIndex: number, throughBeat: number) => {
      for (let index = startIndex; index < this.timeline.events.length; index++) {
        const event = this.timeline.events[index]!;
        if (event.startBeat > throughBeat + EPSILON) break;
        if (!this.preparedVoices.has(event.id)) {
          const samples = this.prepareVoice(event);
          if (samples) this.preparedVoices.set(event.id, samples);
        }
      }
    };
    const end = this.beat + span;
    prepareFrom(this.nextEventIndex, end);
    if (end >= this.timeline.endBeat && this.timeline.completionKey == null) {
      prepareFrom(0, this.timeline.startBeat + end - this.timeline.endBeat);
    }
  }

  private speaksFor(event: TimelineEventSnapshot): boolean {
    const cue = this.config.rootDegreeCue;
    if (speaksMelodyFunction(cue)) {
      const words = event.spokenMelodyCue;
      return words != null && (cue !== PlaybackRootDegreeCue.MELODY_CHORD_TONE || isSpokenMelodyChordTone(words));
    }
    if (speaksRootDegree(cue)) return event.layer === PlaybackAudioLayer.CHORD;
    return false;
  }

  private startSpokenNumber(event: TimelineEventSnapshot, samples: Int16Array | null | undefined, phase: number | null = null): void {
    if (!this.speaksFor(event)) return;
    this.scheduleModeAnnouncement(event);
    this.spokenNumber = null;
    if (!samples || !samples.length || this.config.bpm <= 0) return;
    const samplesPerBeat = SPOKEN_ROOT_DEGREE_SAMPLE_RATE * 60 / this.config.bpm;
    const position = phase != null ? phase * samples.length : Math.max(0, this.beat - event.startBeat) * samplesPerBeat;
    this.spokenNumber = { event, samples, anchorBeat: this.beat, anchorPosition: position, samplesPerBeat, renderedFrames: 0 };
  }

  private scheduleModeAnnouncement(event: TimelineEventSnapshot): void {
    this.spokenMode = null;
    const config = this.config;
    if (event.layer !== PlaybackAudioLayer.CHORD || config.bpm <= 0) return;
    const chords = this.timeline.events.filter((candidate) => candidate.layer === PlaybackAudioLayer.CHORD);
    const next = followingModeChord(chords, event, this.timeline.completionKey == null, config.rootDegreeCue, config.useRelativeIonianContext);
    if (!next) return;
    const name = modeAnnouncement(event.keyScale, next.keyScale, config.rootDegreeCue, false);
    if (name == null) return;
    const clip = this.spokenRootDegrees.modeClip(name);
    if (!clip) return;
    const tonicMidi = next.keyTonicMidi != null ? spokenKeyTonicMidi(next.keyTonicMidi + config.transpose) : null;
    const pitched = tonicMidi != null ? pitchShiftSpokenClip(clip, tonicMidi) : clip;
    const samplesPerBeat = SPOKEN_ROOT_DEGREE_SAMPLE_RATE * 60 / config.bpm;
    const nextStart = next.startBeat <= event.startBeat ? event.endBeat : next.startBeat;
    const window = modeAnnouncementWindow(event.startBeat, event.endBeat, nextStart, pitched.length, samplesPerBeat);
    if (!window) return;
    this.spokenMode = { samples: pitched, startBeat: window[0], endBeat: window[1], renderedFrames: 0 };
  }

  private renderSpokenNumber(beatsPerFrame: number): number {
    const voice = this.spokenNumber;
    if (!voice || beatsPerFrame <= 0) return 0;
    const framesLeft = (voice.event.endBeat - this.beat) / beatsPerFrame;
    const position = positionAt(voice, this.beat);
    const index = Math.trunc(position);
    if (framesLeft <= 0 || index >= voice.samples.length) return 0;
    return this.speechSample(voice, voice.samples, position, index, framesLeft);
  }

  private renderSpokenMode(beatsPerFrame: number): number {
    const voice = this.spokenMode;
    if (!voice || beatsPerFrame <= 0 || this.config.bpm <= 0 || this.beat < voice.startBeat || this.beat >= voice.endBeat) return 0;
    const samplesPerBeat = SPOKEN_ROOT_DEGREE_SAMPLE_RATE * 60 / this.config.bpm;
    if (samplesPerBeat <= 0) return 0;
    const position = (this.beat - voice.startBeat) * samplesPerBeat;
    const index = Math.trunc(position);
    if (index < 0 || index >= voice.samples.length) return 0;
    return this.speechSample(voice, voice.samples, position, index, (voice.endBeat - this.beat) / beatsPerFrame);
  }

  private speechSample(voice: { renderedFrames: number }, samples: Int16Array, position: number, index: number, framesLeft: number): number {
    const first = samples[index]!;
    const sample = first + ((samples[index + 1] ?? 0) - first) * (position - index);
    const fadeFrames = this.sampleRate * 0.005;
    const phraseFramesLeft = (samples.length - position) * this.sampleRate / SPOKEN_ROOT_DEGREE_SAMPLE_RATE;
    const envelope = Math.min(voice.renderedFrames / fadeFrames, framesLeft / fadeFrames, phraseFramesLeft / fadeFrames, 1);
    voice.renderedFrames++;
    return sample / 32767 * envelope;
  }

  private advanceBeat(beatsPerFrame: number, frame: number): void {
    if (beatsPerFrame <= 0) return;
    this.beat += beatsPerFrame;
    if (this.beat + EPSILON < this.timeline.endBeat) return;
    this.spokenNumber = null;
    this.spokenMode = null;
    if (this.timeline.completionKey == null) {
      const length = this.timeline.endBeat - this.timeline.startBeat;
      this.beat = this.timeline.startBeat + (length > 0 ? Math.max(0, this.beat - this.timeline.endBeat) % length : 0);
      this.activeEvents = [];
      const next = this.timeline.events.findIndex((event) => event.startBeat >= this.timeline.startBeat);
      this.nextEventIndex = next < 0 ? this.timeline.events.length : next;
      return;
    }
    const queue = this.continuation;
    const nextSection = queue && queue.length ? queue.shift()! : null;
    if (nextSection) {
      queue!.push(nextSection);
      this.spliceTo(nextSection, Math.max(0, this.beat - this.timeline.endBeat), frame);
      return;
    }
    this.beat = this.timeline.endBeat;
    this.activeEvents = [];
    this.nextEventIndex = this.timeline.events.length;
  }

  private spliceTo(next: PreparedSection, overshoot: number, frame: number): void {
    this.timeline = next.timeline;
    const length = this.timeline.endBeat - this.timeline.startBeat;
    const landed = this.timeline.startBeat + (length > 0 ? overshoot % length : 0);
    this.beat = clamp(landed, this.timeline.startBeat, this.timeline.endBeat);
    if (next.bpm > 0 && next.bpm !== this.config.bpm) this.config = sanitized({ ...this.config, bpm: next.bpm });
    this.prepared = prepare(this.timeline, this.config, this.sampleRate);
    this.activeEvents = [];
    this.spokenNumber = null;
    this.spokenMode = null;
    const index = this.timeline.events.findIndex((event) => event.startBeat >= this.timeline.startBeat);
    this.nextEventIndex = index < 0 ? this.timeline.events.length : index;
    this.prepareVoicesForBlock(this.currentBeatsPerFrame * 64);
    this.splices.push(Object.freeze({ frame: frame + 1, beat: this.beat, beatsPerFrame: this.currentBeatsPerFrame,
      loopStart: this.timeline.startBeat, loopEnd: this.timeline.endBeat, performanceId: next.performanceId, timeline: this.timeline }));
  }

  private activateDueEvents(frameOffset: number, startedEvents: RenderedPlaybackEvent[] | null): void {
    while (this.nextEventIndex < this.timeline.events.length) {
      const event = this.timeline.events[this.nextEventIndex]!;
      if (event.startBeat > this.beat + EPSILON) break;
      this.nextEventIndex++;
      if (this.beat < event.endBeat) {
        this.startSpokenNumber(event, this.preparedVoices.get(event.id));
        const active = this.createActiveEvent(event, false, this.config, this.prepared);
        if (active) { this.activeEvents.push(active); startedEvents?.push({ id: event.id, frameOffset }); }
      }
    }
  }

  private createActiveEvent(event: TimelineEventSnapshot, fadeIn: boolean, config: ConfigSnapshot, prepared: Prepared): ActiveEvent | null {
    const item = prepared.get(event)!;
    if (!item.frequencies.length) return null;
    const voices = () => item.frequencies.map((frequency) => new SynthVoice(frequency, config.waveform, this.sampleRate, this.random));
    const pulsing = item.pulseCount > 0;
    // Separate voices retrigger decaying instruments on every pulse.
    const rootPulses = pulsing ? Array.from({ length: item.pulseCount }, voices) : [];
    const oscillators = pulsing ? [] : voices();
    return { event, oscillators, rootPulses,
      arpeggiateCycles: event.layer === PlaybackAudioLayer.CHORD && oscillators.length > 1 ? config.arpeggiateCycles : 0,
      delaySamples: item.delaySamples, ageFrames: 0, transitionGain: fadeIn ? 0 : 1,
      transitionFramesRemaining: fadeIn ? this.crossfadeFrames : 0,
      transitionStep: fadeIn ? 1 / this.crossfadeFrames : 0, fadingOut: false };
  }
}

function positionAt(voice: SpokenNumber, beat: number): number {
  return Math.max(0, voice.anchorPosition + (beat - voice.anchorBeat) * voice.samplesPerBeat);
}
const voiceCount = (active: ActiveEvent) => active.oscillators.length + active.rootPulses.reduce((n, pulse) => n + pulse.length, 0);
