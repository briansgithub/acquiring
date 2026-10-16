import { getApplicationAudioContextOwner } from './application-audio-context';
import { createPlaybackClock, appendPlaybackClock, readPlaybackClock, prunePlaybackClock, playbackFrameAtTime } from './playback-clock';
import type { PlaybackClockQueue, ApplicationAudioContextOwner } from './contracts';
import type { PlaybackTimeline } from '../synth';
import { PCM_SINK_LIMITS as LIMITS, PcmSinkError } from './sink-contracts';
import type { AudioPcmQueueSink, PcmQueueSinkOptions, PcmSinkClock, PcmSinkPcm, PcmSinkReading, PcmSinkRun } from './sink-contracts';

interface Staged { readonly buffer: AudioBuffer; readonly startBeat: number; readonly beatsPerFrame: number }
const error = (code: ConstructorParameters<typeof PcmSinkError>[0], message: string): never => { throw new PcmSinkError(code, message); };
const safe = (value: number) => Number.isSafeInteger(value) && value >= 0;

/** Borrowed-context PCM queue only; caller owns transport intent and renderer completion. */
export class PcmQueueSink implements AudioPcmQueueSink {
  private readonly owner: ApplicationAudioContextOwner;
  private readonly unsubscribe: () => void;
  private run: PcmSinkRun | null = null;
  private context: AudioContext | null = null;
  private clock: PlaybackClockQueue | null = null;
  private selected: PcmSinkClock | null = null;
  private staged: Staged[] = [];
  private nodes = new Set<AudioBufferSourceNode>();
  private scheduled = false;
  private sealed = false;
  private released = false;
  private generation = 0;
  private revision = 0;
  private lastRequest = 0;
  private lastTime = 0;
  constructor(private readonly options: PcmQueueSinkOptions = {}) {
    this.owner = options.contextOwner ?? getApplicationAudioContextOwner();
    this.unsubscribe = this.owner.subscribeInvalidation(() => this.flush());
  }

  begin(revision: number, timeline: Pick<PlaybackTimeline, 'startBeat'|'endBeat'|'completionKey'>, anchorBeat?: number): PcmSinkRun {
    if (this.released) return error('RELEASED', 'Sink released');
    if (!safe(revision) || revision < this.revision || !safe(this.generation + 1)) return error('INVALID_INPUT', 'Invalid revision/generation');
    const state = this.owner.getSnapshot();
    if (!state.canRender) return error('BLOCKED', 'A permitted foreground context is required');
    let context: AudioContext;
    try { context = this.owner.getContext(); } catch { return error('BLOCKED', 'Context unavailable'); }
    if (context.state !== 'running' || state.sampleRate !== context.sampleRate) return error('BLOCKED', 'Context not running at owner rate');
    let clock: PlaybackClockQueue;
    try { clock = createPlaybackClock(timeline, context.sampleRate, anchorBeat); }
    catch { return error('INVALID_INPUT', 'Invalid clock window'); }
    const selected = this.options.clock ?? (typeof context.getOutputTimestamp === 'function' ? 'output-timestamp' : 'context-render');
    if (selected !== 'output-timestamp' && selected !== 'context-render') return error('INVALID_INPUT', 'Invalid clock selection');
    const time = this.time(context, selected);
    const current = this.owner.getSnapshot();
    if (this.released) return error('RELEASED', 'Sink released');
    if (!current.canRender || current.epoch !== state.epoch || context.state !== 'running') return error('BLOCKED', 'Permission changed during begin');
    // All candidate input/clock checks precede replacement of a current run.
    this.flush();
    const run = Object.freeze({ generation: ++this.generation, revision, epoch: state.epoch, sampleRate: context.sampleRate });
    this.run = run; this.context = context; this.clock = clock; this.selected = selected;
    this.lastTime = time; this.revision = revision;
    return run;
  }

  enqueue(run: PcmSinkRun, input: PcmSinkPcm, final = false): void {
    if (this.released) return error('RELEASED', 'Sink released');
    if (!this.run || run !== this.run) return error('STALE_RUN', 'Current exact run identity required');
    const played = this.observe();
    const { version, ok, kind, requestId, revision, startBeat, position, pcm } = input;
    const sampleRate = position?.sampleRate, beatsPerFrame = position?.beatsPerFrame;
    if (this.run !== run) return error('STALE_RUN', 'Run changed during input snapshot');
    if (this.sealed || version !== 1 || ok !== true || kind !== 'pcm' || revision !== run.revision ||
        sampleRate !== run.sampleRate || !safe(requestId) || requestId < 1 || requestId <= this.lastRequest ||
        !(pcm instanceof Int16Array) || !(pcm.buffer instanceof ArrayBuffer) ||
        pcm.length < 1 || pcm.length > LIMITS.batchFrames || typeof final !== 'boolean')
      return error('INVALID_INPUT', 'Invalid PCM identity, rate, length or sealed run');
    const count = pcm.length;
    const stagedFrames = this.staged.reduce((total, entry) => total + entry.buffer.length, 0);
    const willSchedule = this.scheduled || final || stagedFrames + count >= Math.ceil(run.sampleRate * LIMITS.primeMs / 1000);
    const start = this.startFrame();
    const prospectiveEnd = willSchedule ? start + stagedFrames + count : null;
    if (prospectiveEnd !== null && !safe(prospectiveEnd)) return error('INVALID_INPUT', 'Unsafe scheduled end');
    const horizon = prospectiveEnd === null ? stagedFrames + count : Math.max(0, prospectiveEnd - played);
    if (horizon > Math.ceil(run.sampleRate * LIMITS.queueMs / 1000) + LIMITS.batchFrames ||
        this.clock!.segments.length + this.staged.length + 1 > LIMITS.mappings ||
        this.nodes.size + this.staged.length + 1 > LIMITS.sources)
      return error('QUEUE_FULL', 'PCM queue capacity exceeded');
    try { appendPlaybackClock(this.clock!, { startFrame: start, frameCount: count, startBeat, beatsPerFrame }); }
    catch { return error('INVALID_INPUT', 'Invalid PCM beat/slope mapping'); }
    this.ensurePermission();
    if (this.run !== run) return error('STALE_RUN', 'Run changed before allocation');
    try {
      const buffer = this.context!.createBuffer(1, count, run.sampleRate);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < count; i++) channel[i] = pcm[i] / 32768;
      this.ensurePermission();
      if (this.run !== run) return error('STALE_RUN', 'Run changed during allocation');
      this.staged.push({ buffer, startBeat, beatsPerFrame });
      this.lastRequest = requestId; this.sealed = final;
      if (willSchedule) {
        let nextFrame = start;
        const staged = this.staged;
        this.staged = [];
        for (const entry of staged) {
          this.ensurePermission();
          if (this.run !== run) return error('STALE_RUN', 'Run changed during scheduling');
          const nextClock = appendPlaybackClock(this.clock!, { startFrame: nextFrame,
            frameCount: entry.buffer.length, startBeat: entry.startBeat, beatsPerFrame: entry.beatsPerFrame });
          const node = this.context!.createBufferSource();
          this.nodes.add(node);
          node.onended = () => {
            try { node.disconnect(); } catch { /* Already disconnected. */ }
            if (this.run === run) this.nodes.delete(node);
          };
          node.buffer = entry.buffer; node.connect(this.context!.destination);
          node.start(nextFrame / run.sampleRate);
          this.clock = nextClock; nextFrame += entry.buffer.length;
        }
        this.scheduled = true;
      }
    } catch (cause) {
      this.flush();
      if (cause instanceof PcmSinkError) throw cause;
      return error('AUDIO_FAILED', 'Audio allocation/start failed; run flushed');
    }
  }

  read(): PcmSinkReading {
    if (!this.run) return Object.freeze({ run: null, phase: this.released ? 'released' : 'idle',
      clock: null, playedFrame: null, beat: null, queuedFrames: 0, sources: 0, mappings: 0, queueDrained: false });
    const playedFrame = this.observe();
    const reading = readPlaybackClock(this.clock!, playedFrame);
    const stagedFrames = this.staged.reduce((sum, entry) => sum + entry.buffer.length, 0);
    return Object.freeze({ run: this.run, phase: this.scheduled ? 'scheduled' : 'priming', clock: this.selected,
      playedFrame, beat: reading.beat, queuedFrames: stagedFrames + Math.max(0, (this.clock!.lastEndFrame ?? playedFrame) - playedFrame),
      sources: this.nodes.size, mappings: this.clock!.segments.length,
      queueDrained: this.scheduled && this.staged.length === 0 && reading.queueDrained });
  }

  flush(): void {
    this.run = null; this.clock = null; this.context = null; this.selected = null;
    this.staged = []; this.scheduled = false; this.sealed = false; this.lastRequest = 0;
    const nodes = this.nodes; this.nodes = new Set();
    for (const node of nodes) {
      node.onended = null;
      try { node.stop(); } catch { /* A source may already have ended. */ }
      try { node.disconnect(); } catch { /* Continue retiring all sources. */ }
    }
  }
  release(): void {
    if (this.released) return;
    this.released = true; this.flush(); this.unsubscribe();
  }
  private ensurePermission(): void {
    const state = this.owner.getSnapshot();
    if (!this.run || !state.canRender || state.epoch !== this.run.epoch ||
        state.sampleRate !== this.run.sampleRate || this.context?.state !== 'running') {
      this.flush(); return error('BLOCKED', 'Audio permission/epoch invalidated');
    }
  }
  private time(context: AudioContext, selected: PcmSinkClock): number {
    let time: number | undefined;
    try { time = selected === 'output-timestamp' ? context.getOutputTimestamp().contextTime : context.currentTime; }
    catch { return error('CLOCK_FAILED', 'Selected audio clock unavailable'); }
    if (typeof time !== 'number') return error('CLOCK_FAILED', 'Selected audio clock missing');
    try { playbackFrameAtTime(time, context.sampleRate); }
    catch { return error('CLOCK_FAILED', 'Invalid selected audio clock'); }
    return time;
  }
  private observe(): number {
    this.ensurePermission();
    try {
      const time = this.time(this.context!, this.selected!);
      if (time < this.lastTime) return error('CLOCK_FAILED', 'Selected audio clock regressed');
      this.lastTime = time;
      const frame = playbackFrameAtTime(time, this.run!.sampleRate);
      this.clock = prunePlaybackClock(this.clock!, frame);
      return frame;
    } catch (cause) { this.flush(); throw cause; }
  }
  private startFrame(): number {
    const context = this.context!;
    const current = Math.ceil(context.currentTime * context.sampleRate);
    const start = Math.max(this.clock!.lastEndFrame ?? 0, current + Math.ceil(context.sampleRate * LIMITS.leadMs / 1000));
    if (!safe(start)) { this.flush(); return error('CLOCK_FAILED', 'Unsafe scheduling clock'); }
    return start;
  }
}
