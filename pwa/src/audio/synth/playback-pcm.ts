import { instrumentMetadata, Waveform } from './instruments';
import { MAX_PLUCK_DELAY_SAMPLES, SynthVoice } from './synth-voice';

export enum PlaybackAudioLayer { MELODY = 'MELODY', CHORD = 'CHORD' }
export enum PlaybackChordMode { FULL = 'FULL', ROOT_ONLY = 'ROOT_ONLY' }
export interface PlaybackTimelineEvent {
  readonly id: number;
  readonly startBeat: number;
  readonly endBeat: number;
  readonly layer: PlaybackAudioLayer;
  readonly fullMidiNotes: readonly number[];
  readonly rootMidiNote?: number | null;
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
}
export interface RenderedPlaybackEvent { readonly id: number; readonly frameOffset: number }
export interface RenderedPlaybackBlock {
  readonly startBeat: number;
  readonly beatsPerFrame: number;
  readonly startedEvents: readonly RenderedPlaybackEvent[];
}

export const STREAM_LIMITS = Object.freeze({
  events: 4096, notesPerEvent: 32, currentVoices: 64, currentDelaySamples: 524_288,
  blockFrames: 65_536, voiceSamplesPerBlock: 16_000_000, startedEventsPerBlock: 65_536,
  activationSamplesPerBlock: 4_000_000, absoluteBeat: 1_000_000, bpm: 1000,
});
const EPSILON = 1e-9;
type TimelineSnapshot = Required<PlaybackTimeline>;
type ConfigSnapshot = Required<PlaybackConfig>;
interface PreparedEvent { readonly frequencies: readonly number[]; readonly delaySamples: number }
interface ActiveEvent {
  readonly event: PlaybackTimelineEvent;
  readonly oscillators: readonly SynthVoice[];
  readonly delaySamples: number;
  ageFrames: number;
  transitionGain: number;
  transitionFramesRemaining: number;
  transitionStep: number;
  fadingOut: boolean;
}

function integer(value: number, name: string): void {
  if (!Number.isInteger(value) || value < -2_147_483_648 || value > 2_147_483_647) {
    throw new RangeError(`${name} must be a native Int`);
  }
}
function finite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
}
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

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
  for (const value of [config.bpm, config.melodyGain, config.chordGain, config.arpeggiateCycles ?? 0]) finite(value, 'Playback config');
  integer(config.transpose, 'Transpose');
  instrumentMetadata(config.waveform);
  if (config.bpm > STREAM_LIMITS.bpm) throw new RangeError('Tempo exceeds streaming limit');
  if (!Object.values(PlaybackChordMode).includes(config.chordMode)) throw new RangeError('Unknown chord mode');
  return Object.freeze({ ...config, bpm: Math.max(0, config.bpm),
    melodyGain: clamp(Math.fround(config.melodyGain), 0, 1),
    chordGain: clamp(Math.fround(config.chordGain), 0, 1),
    arpeggiateCycles: clamp(config.arpeggiateCycles ?? 0, 0, 4) });
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
  const events = input.events.map((event) => {
    if (!Number.isSafeInteger(event.id)) throw new RangeError('Event ID must be a safe integer');
    if (!Object.values(PlaybackAudioLayer).includes(event.layer)) throw new RangeError('Unknown playback layer');
    for (const beat of [event.startBeat, event.endBeat]) {
      if (!Number.isFinite(beat) || Math.abs(beat) > STREAM_LIMITS.absoluteBeat) throw new RangeError('Event beat exceeds limit');
    }
    if (event.endBeat <= event.startBeat || event.startBeat < previous) throw new RangeError('Events must be ordered with positive duration');
    previous = event.startBeat;
    if (event.fullMidiNotes.length > STREAM_LIMITS.notesPerEvent) throw new RangeError('Event note count exceeds limit');
    event.fullMidiNotes.forEach((note) => integer(note, 'MIDI note'));
    if (event.rootMidiNote != null) integer(event.rootMidiNote, 'Root MIDI note');
    return Object.freeze({ ...event, fullMidiNotes: Object.freeze([...event.fullMidiNotes]), rootMidiNote: event.rootMidiNote ?? null });
  });
  return Object.freeze({ startBeat, endBeat, events: Object.freeze(events), completionKey: input.completionKey ?? null });
}

function prepare(timeline: TimelineSnapshot, config: ConfigSnapshot, sampleRate: number): Map<PlaybackTimelineEvent, PreparedEvent> {
  const prepared = new Map<PlaybackTimelineEvent, PreparedEvent>();
  const edges: { beat: number; voices: number; delay: number }[] = [];
  for (const event of timeline.events) {
    const notes = event.layer === PlaybackAudioLayer.CHORD && config.chordMode === PlaybackChordMode.ROOT_ONLY
      ? event.rootMidiNote == null ? [] : [event.rootMidiNote] : event.fullMidiNotes;
    const frequencies: number[] = [];
    let delaySamples = 0;
    for (const midi of notes) {
      if (midi <= 0) continue;
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
    prepared.set(event, { frequencies, delaySamples });
    // Include all intervals: seek(endBeat) may activate an event extending
    // beyond the loop end. EPSILON also covers native early onset activation.
    const start = event.startBeat - EPSILON;
    const end = event.endBeat;
    if (start < end && frequencies.length) {
      edges.push({ beat: start, voices: frequencies.length, delay: delaySamples },
        { beat: end, voices: -frequencies.length, delay: -delaySamples });
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

/** Pure native streaming PCM core. The caller owns the output buffer and device. */
export class PlaybackPcmRenderer {
  private timeline: TimelineSnapshot;
  private config: ConfigSnapshot;
  private prepared: Map<PlaybackTimelineEvent, PreparedEvent>;
  private beat: number;
  private nextEventIndex = 0;
  private activeEvents: ActiveEvent[] = [];
  private currentMelodyGain: number;
  private currentChordGain: number;
  private readonly crossfadeFrames: number;

  constructor(timeline: PlaybackTimeline, initialConfig: PlaybackConfig,
    private readonly sampleRate: number, private readonly random: () => number = Math.random) {
    if (!Number.isInteger(sampleRate) || sampleRate < 1000 || sampleRate > 384_000) throw new RangeError('Streaming output rate must be1000..384000');
    this.timeline = snapshot(timeline);
    this.config = sanitized(initialConfig);
    this.prepared = prepare(this.timeline, this.config, sampleRate);
    this.beat = this.timeline.startBeat;
    this.currentMelodyGain = this.config.melodyGain;
    this.currentChordGain = this.config.chordGain;
    this.crossfadeFrames = Math.max(1, Math.round(sampleRate * 24 / 1000));
  }

  get currentBeat(): number { return this.beat; }
  get finished(): boolean { return this.timeline.completionKey != null && this.beat >= this.timeline.endBeat; }
  get currentBeatsPerFrame(): number { return this.config.bpm / (60 * this.sampleRate); }

  replaceTimeline(newTimeline: PlaybackTimeline, startBeat = newTimeline.startBeat ?? 1): void {
    const timeline = snapshot(newTimeline), prepared = prepare(timeline, this.config, this.sampleRate);
    this.setPosition(timeline, prepared, startBeat);
  }
  seek(requestedBeat: number): void { this.setPosition(this.timeline, this.prepared, requestedBeat); }

  private setPosition(timeline: TimelineSnapshot, prepared: Map<PlaybackTimelineEvent, PreparedEvent>, requestedBeat: number): void {
    finite(requestedBeat, 'Seek beat');
    const beat = clamp(requestedBeat, timeline.startBeat, timeline.endBeat);
    const active = timeline.events.filter((event) => event.startBeat <= beat && beat < event.endBeat)
      .map((event) => this.createActiveEvent(event, false, this.config, prepared)).filter((value) => value !== null);
    this.timeline = timeline; this.prepared = prepared; this.beat = beat; this.activeEvents = active;
    const next = timeline.events.findIndex((event) => event.startBeat > beat);
    this.nextEventIndex = next < 0 ? timeline.events.length : next;
  }

  updateConfig(newConfig: PlaybackConfig): void {
    const config = sanitized(newConfig), prepared = prepare(this.timeline, config, this.sampleRate);
    const pitchChanged = config.waveform !== this.config.waveform || config.transpose !== this.config.transpose;
    const chordChanged = config.chordMode !== this.config.chordMode || config.arpeggiateCycles !== this.config.arpeggiateCycles;
    if (pitchChanged || chordChanged) {
      const affected = (event: PlaybackTimelineEvent) => pitchChanged || event.layer === PlaybackAudioLayer.CHORD;
      const outgoing = this.activeEvents.filter((active) => active.fadingOut || affected(active.event));
      if (outgoing.reduce((n, active) => n + active.oscillators.length, 0) > STREAM_LIMITS.currentVoices
        || outgoing.reduce((n, active) => n + active.delaySamples, 0) > STREAM_LIMITS.currentDelaySamples) {
        throw new RangeError('Pending crossfades exceed fading cohort budget');
      }
      const additions = this.timeline.events.filter((event) => affected(event) && event.startBeat <= this.beat && this.beat < event.endBeat)
        .map((event) => this.createActiveEvent(event, true, config, prepared)).filter((value) => value !== null);
      // Build replacements first so malformed injected RNG cannot partly mutate the renderer.
      for (const active of this.activeEvents) if (!active.fadingOut && affected(active.event)) {
        active.transitionFramesRemaining = this.crossfadeFrames;
        active.transitionStep = -active.transitionGain / this.crossfadeFrames;
        active.fadingOut = true;
      }
      this.activeEvents.push(...additions);
    }
    this.config = config; this.prepared = prepared;
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
      const event = this.timeline.events[i], item = this.prepared.get(event)!;
      const initial = i >= this.nextEventIndex && event.startBeat <= initialEnd && this.beat < event.endBeat ? 1 : 0;
      const repeats = event.startBeat >= this.timeline.startBeat && event.startBeat <= this.timeline.endBeat + EPSILON ? wraps : 0;
      if (item.frequencies.length) starts += initial + repeats;
      activation += (initial + repeats) * (1 + item.frequencies.length + item.delaySamples);
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
    const targetMelody = this.config.melodyGain, targetChord = this.config.chordGain;
    const melodyStep = (targetMelody - this.currentMelodyGain) / Math.max(1, frameCount);
    const chordStep = (targetChord - this.currentChordGain) / Math.max(1, frameCount);
    for (let frame = 0; frame < frameCount; frame++) {
      this.activateDueEvents(frame, startedEvents);
      let mixed = 0, index = 0;
      while (index < this.activeEvents.length) {
        const active = this.activeEvents[index];
        if (this.beat >= active.event.endBeat) { this.activeEvents.splice(index, 1); continue; }
        const remainingBeats = Math.max(0, active.event.endBeat - this.beat);
        const remainingFrames = this.config.bpm > 0 ? remainingBeats * 60 * this.sampleRate / this.config.bpm : Number.MAX_VALUE;
        const envelope = Math.min(clamp(active.ageFrames / 200, 0, 1), clamp(remainingFrames / 1000, 0, 1));
        const elapsedSeconds = active.ageFrames / this.sampleRate;
        const layerGain = active.event.layer === PlaybackAudioLayer.MELODY ? this.currentMelodyGain : this.currentChordGain;
        const arpeggiated = active.event.layer === PlaybackAudioLayer.CHORD && this.config.arpeggiateCycles > 0 && active.oscillators.length > 1;
        let oscillatorSum = 0;
        if (arpeggiated) {
          const elapsedBeats = Math.max(0, this.beat - active.event.startBeat);
          const progress = arpeggioSlotProgress(elapsedBeats, active.oscillators.length, this.config.arpeggiateCycles);
          const slotEnvelope = Math.min(clamp(progress / 0.08, 0, 1), clamp((1 - progress) / 0.12, 0, 1));
          const tone = arpeggioToneIndex(elapsedBeats, active.oscillators.length, this.config.arpeggiateCycles);
          oscillatorSum = active.oscillators[tone].nextSample(envelope * slotEnvelope, elapsedSeconds, true) * 0.15 * slotEnvelope;
        } else {
          for (const voice of active.oscillators) oscillatorSum += voice.nextSample(envelope, elapsedSeconds) * 0.15;
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
      buffer[frame] = clamp(Math.round(mixed * 32767), -32768, 32767);
      this.currentMelodyGain += melodyStep; this.currentChordGain += chordStep;
      this.advanceBeat(beatsPerFrame);
    }
    this.currentMelodyGain = targetMelody; this.currentChordGain = targetChord;
    return beatsPerFrame;
  }

  private advanceBeat(beatsPerFrame: number): void {
    if (beatsPerFrame <= 0) return;
    this.beat += beatsPerFrame;
    if (this.beat + EPSILON >= this.timeline.endBeat) {
      if (this.timeline.completionKey != null) {
        this.beat = this.timeline.endBeat; this.activeEvents = []; this.nextEventIndex = this.timeline.events.length; return;
      }
      const length = this.timeline.endBeat - this.timeline.startBeat;
      this.beat = this.timeline.startBeat + Math.max(0, this.beat - this.timeline.endBeat) % length;
      this.activeEvents = [];
      const next = this.timeline.events.findIndex((event) => event.startBeat >= this.timeline.startBeat);
      this.nextEventIndex = next < 0 ? this.timeline.events.length : next;
    }
  }

  private activateDueEvents(frameOffset: number, startedEvents: RenderedPlaybackEvent[] | null): void {
    while (this.nextEventIndex < this.timeline.events.length) {
      const event = this.timeline.events[this.nextEventIndex];
      if (event.startBeat > this.beat + EPSILON) break;
      this.nextEventIndex++;
      if (this.beat < event.endBeat) {
        const active = this.createActiveEvent(event, false, this.config, this.prepared);
        if (active) { this.activeEvents.push(active); startedEvents?.push({ id: event.id, frameOffset }); }
      }
    }
  }

  private createActiveEvent(event: PlaybackTimelineEvent, fadeIn: boolean, config: ConfigSnapshot,
    prepared: Map<PlaybackTimelineEvent, PreparedEvent>): ActiveEvent | null {
    const item = prepared.get(event)!;
    if (!item.frequencies.length) return null;
    return { event, oscillators: item.frequencies.map((frequency) => new SynthVoice(frequency, config.waveform, this.sampleRate, this.random)),
      delaySamples: item.delaySamples, ageFrames: 0, transitionGain: fadeIn ? 0 : 1,
      transitionFramesRemaining: fadeIn ? this.crossfadeFrames : 0,
      transitionStep: fadeIn ? 1 / this.crossfadeFrames : 0, fadingOut: false };
  }
}
