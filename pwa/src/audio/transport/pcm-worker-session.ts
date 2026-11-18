import { PlaybackPcmRenderer, PlaybackAudioLayer, PlaybackChordMode, PlaybackRootDegreeCue, SPOKEN_CHORD_SUFFIXES, STREAM_LIMITS, SpokenRootDegreeClips, Waveform } from '../synth';
import type { PlaybackConfig, PlaybackTimeline } from '../synth';
import { PLAYBACK_WORKER_LIMITS as LIMITS } from './worker-contracts';
import type { PlaybackWorkerOperation, PlaybackWorkerRequest, PlaybackWorkerResponse, PlaybackWorkerSession, PlaybackWorkerPosition, PlaybackWorkerErrorCode } from './worker-contracts';

const fail = (message: string): never => { throw new RangeError(message); };
const finite = (value: number, name: string) => { if (!Number.isFinite(value)) fail(name + ' must be finite'); };
const nativeInt = (value: number) => { if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) fail('Expected native Int'); };
const beat = (value: number) => { finite(value, 'Beat'); if (Math.abs(value) > STREAM_LIMITS.absoluteBeat) fail('Beat exceeds limit'); };
export const validWorkerRevision = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;

function configSnapshot(input: PlaybackConfig): PlaybackConfig {
  if (!input || typeof input !== 'object') fail('Missing config');
  for (const value of [input.bpm, input.melodyGain, input.chordGain, input.arpeggiateCycles ?? 0, input.voiceVolume ?? 0.5]) finite(value, 'Config');
  nativeInt(input.transpose);
  const rootDegreeCue = input.rootDegreeCue ?? PlaybackRootDegreeCue.OFF;
  if (input.bpm > STREAM_LIMITS.bpm || !Object.values(Waveform).includes(input.waveform) ||
      !Object.values(PlaybackChordMode).includes(input.chordMode) || !Object.values(PlaybackRootDegreeCue).includes(rootDegreeCue)) fail('Invalid config');
  return Object.freeze({ bpm: input.bpm, transpose: input.transpose, waveform: input.waveform,
    chordMode: input.chordMode, melodyGain: input.melodyGain, chordGain: input.chordGain,
    arpeggiateCycles: input.arpeggiateCycles ?? 0, rootDegreeCue,
    useRelativeIonianContext: input.useRelativeIonianContext === true, voiceVolume: input.voiceVolume ?? 0.5 });
}
function timelineSnapshot(input: PlaybackTimeline): PlaybackTimeline {
  if (!input || typeof input !== 'object') fail('Missing timeline');
  const startBeat = input.startBeat ?? 1;
  beat(startBeat); beat(input.endBeat);
  if (input.endBeat - startBeat < 1e-6) fail('Invalid timeline span');
  const callerEvents = input.events;
  if (!Array.isArray(callerEvents)) fail('Event limit');
  const eventCount = callerEvents.length;
  if (!Number.isInteger(eventCount) || eventCount < 0 || eventCount > STREAM_LIMITS.events) fail('Event limit');
  if (input.completionKey != null && (typeof input.completionKey !== 'string' ||
      input.completionKey.length > LIMITS.completionKeyCharacters)) fail('Completion key limit');
  let previous = -Infinity;
  const events: PlaybackTimeline['events'][number][] = [];
  for (let index = 0; index < eventCount; index++) {
    const event = callerEvents[index];
    if (!event || typeof event !== 'object' || !Number.isSafeInteger(event.id) ||
        !Object.values(PlaybackAudioLayer).includes(event.layer)) fail('Invalid event');
    beat(event.startBeat); beat(event.endBeat);
    if (event.endBeat <= event.startBeat || event.startBeat < previous) fail('Invalid event order');
    previous = event.startBeat;
    const callerNotes = event.fullMidiNotes;
    if (!Array.isArray(callerNotes)) fail('Note limit');
    const noteCount = callerNotes.length;
    if (!Number.isInteger(noteCount) || noteCount < 0 || noteCount > STREAM_LIMITS.notesPerEvent) fail('Note limit');
    const fullMidiNotes: number[] = [];
    for (let noteIndex = 0; noteIndex < noteCount; noteIndex++) {
      const note = callerNotes[noteIndex]; nativeInt(note); fullMidiNotes.push(note);
    }
    Object.freeze(fullMidiNotes);
    const optionalInt = (value: number | null | undefined): number | null => { if (value == null) return null; nativeInt(value); return value; };
    const text = (value: string | null | undefined, limit: number): string | null => {
      if (value == null) return null;
      if (typeof value !== 'string' || value.length > limit) fail('Invalid event text');
      return value;
    };
    const suffix = event.spokenChordSuffix ?? null;
    if (suffix !== null && !(suffix in SPOKEN_CHORD_SUFFIXES)) fail('Invalid chord suffix');
    const relative = event.relativeMajorRootDegree ?? null;
    if (relative !== null) { nativeInt(relative.degree); nativeInt(relative.alteration); }
    events.push(Object.freeze({ id: event.id, startBeat: event.startBeat, endBeat: event.endBeat,
      layer: event.layer, fullMidiNotes, rootMidiNote: optionalInt(event.rootMidiNote),
      rootDegree: optionalInt(event.rootDegree), rootDegreeAlteration: optionalInt(event.rootDegreeAlteration) ?? 0,
      fullChordRootMidiNote: optionalInt(event.fullChordRootMidiNote), spokenChordSuffix: suffix,
      relativeMajorRootDegree: relative ? Object.freeze({ degree: relative.degree, alteration: relative.alteration }) : null,
      fifthsFromKeyTonic: optionalInt(event.fifthsFromKeyTonic) ?? 0, fifthsFromMajorTonic: optionalInt(event.fifthsFromMajorTonic) ?? 0,
      keyScale: text(event.keyScale, LIMITS.keyScaleCharacters), spokenMelodyCue: text(event.spokenMelodyCue, LIMITS.melodyCueCharacters),
      melodyCueMidi: optionalInt(event.melodyCueMidi), keyTonicMidi: optionalInt(event.keyTonicMidi) }));
  }
  return Object.freeze({ startBeat, endBeat: input.endBeat, events: Object.freeze(events), completionKey: input.completionKey ?? null });
}

/** Known fields only; bounds are checked before traversing caller arrays. */
export function snapshotWorkerOperation(input: PlaybackWorkerOperation): PlaybackWorkerOperation {
  if (!input || typeof input !== 'object') fail('Missing operation');
  switch (input.kind) {
    case 'load':
      if (!Number.isInteger(input.sampleRate) || input.sampleRate < 1000 || input.sampleRate > 384000) fail('Invalid sample rate');
      return Object.freeze({ kind: 'load', sampleRate: input.sampleRate,
        timeline: timelineSnapshot(input.timeline), config: configSnapshot(input.config) });
    case 'seek': beat(input.beat); return Object.freeze({ kind: 'seek', beat: input.beat });
    case 'configure': return Object.freeze({ kind: 'configure', config: configSnapshot(input.config) });
    case 'render':
      if (!Number.isInteger(input.frameCount) || input.frameCount < 1 || input.frameCount > LIMITS.batchFrames) fail('Invalid frame count');
      return Object.freeze({ kind: 'render', frameCount: input.frameCount });
    case 'voices': {
      const callerResources = input.resources;
      if (!Array.isArray(callerResources) || callerResources.length > LIMITS.voiceResources) fail('Voice resource limit');
      let total = 0;
      const resources: (readonly [string, Int16Array])[] = [];
      for (const entry of callerResources) {
        const [stem, samples] = Array.isArray(entry) ? entry : [];
        if (typeof stem !== 'string' || !/^[a-z_]+$/.test(stem) || stem.length > LIMITS.voiceStemCharacters || !(samples instanceof Int16Array)) fail('Invalid voice resource');
        total += samples!.length;
        if (total > LIMITS.voiceSamplesTotal) fail('Voice sample limit');
        resources.push(Object.freeze([stem!, samples!.slice()] as const));
      }
      return Object.freeze({ kind: 'voices', resources: Object.freeze(resources) });
    }
    default: return fail('Unknown operation');
  }
}

export class PcmWorkerSession implements PlaybackWorkerSession {
  private renderer: PlaybackPcmRenderer | null = null;
  private clips = new SpokenRootDegreeClips();
  private sampleRate = 0;
  private revision = 0;
  private lastId = 0;
  private released = false;
  release(): void { this.released = true; this.renderer = null; }

  handle(request: PlaybackWorkerRequest): PlaybackWorkerResponse {
    // Zero identity is reserved for malformed envelopes which cannot be acknowledged.
    const id = Number.isSafeInteger(request?.requestId) && request.requestId > 0 ? request.requestId : 0;
    const revision = validWorkerRevision(request?.revision) ? request.revision : 0;
    const failure = (code: PlaybackWorkerErrorCode, message: string, fatal = false): PlaybackWorkerResponse => {
      if (fatal) this.release();
      return Object.freeze({ version: 1, requestId: id, revision, ok: false,
        error: Object.freeze({ code, message, fatal }) });
    };
    if (this.released) return failure('RELEASED', 'Session released', true);
    if (!request || request.version !== 1 || !id || !validWorkerRevision(request.revision) || id <= this.lastId || (this.lastId === 0 && id !== 1))
      return failure('PROTOCOL', 'Invalid or repeated request identity', true);
    this.lastId = id;
    let operation: PlaybackWorkerOperation;
    try { operation = snapshotWorkerOperation(request.operation); }
    catch { return failure('INVALID_INPUT', 'Invalid bounded operation'); }
    if (operation.kind === 'voices') {
      try {
        const clips = SpokenRootDegreeClips.fromResources(new Map(operation.resources));
        this.clips = clips; this.renderer?.setSpokenClips(clips);
        if (revision > this.revision) this.revision = revision;
      } catch { return failure('INVALID_INPUT', 'Invalid voice pack'); }
      return Object.freeze({ version: 1, requestId: id, revision, ok: true, kind: 'ack',
        position: this.renderer ? this.position() : Object.freeze({ sampleRate: 0, beat: 1, beatsPerFrame: 0, finished: false }) });
    }
    if (operation.kind !== 'load' && !this.renderer) return failure('NOT_LOADED', 'Load required');
    if (operation.kind === 'render' ? revision !== this.revision : revision < this.revision)
      return failure('STALE_REVISION', 'Revision does not match applied state');
    if (operation.kind === 'load') {
      // Constructor validation is transactional: the previous renderer remains untouched.
      try {
        const renderer = new PlaybackPcmRenderer(operation.timeline, operation.config, operation.sampleRate, Math.random, this.clips);
        this.renderer = renderer; this.sampleRate = operation.sampleRate; this.revision = revision;
      } catch (error) {
        return error instanceof RangeError ? failure('INVALID_INPUT', 'Renderer domain or resource limit')
          : failure('WORKER_FAILED', 'Renderer construction failed', true);
      }
    } else {
      const renderer = this.renderer!;
      try {
        if (operation.kind === 'seek') renderer.seek(operation.beat);
        else if (operation.kind === 'configure') renderer.updateConfig(operation.config);
        else {
          const startBeat = renderer.currentBeat;
          const pcm = new Int16Array(operation.frameCount);
          for (let offset = 0; offset < pcm.length; offset += LIMITS.nativeBlockFrames)
            renderer.renderAudioInto(pcm.subarray(offset, Math.min(offset + LIMITS.nativeBlockFrames, pcm.length)));
          return Object.freeze({ version: 1, requestId: id, revision, ok: true, kind: 'pcm',
            startBeat, position: this.position(), pcm });
        }
        this.revision = revision;
      } catch { return failure('WORKER_FAILED', 'Renderer operation failed; state discarded', true); }
    }
    return Object.freeze({ version: 1, requestId: id, revision, ok: true, kind: 'ack', position: this.position() });
  }
  private position(): PlaybackWorkerPosition {
    return Object.freeze({ sampleRate: this.sampleRate, beat: this.renderer!.currentBeat,
      beatsPerFrame: this.renderer!.currentBeatsPerFrame, finished: this.renderer!.finished });
  }
}

/** The entry uses precisely the returned buffer as the transfer list. */
export function createPcmWorkerHandler(session: PlaybackWorkerSession,
  post: (response: PlaybackWorkerResponse, transfer: Transferable[]) => void): (event: MessageEvent<unknown>) => void {
  return event => {
    const response = session.handle(event.data as PlaybackWorkerRequest);
    try { post(response, response.ok && response.kind === 'pcm' ? [response.pcm.buffer as ArrayBuffer] : []); }
    catch { session.release(); throw new Error('PCM response transfer failed; session released'); }
  };
}
