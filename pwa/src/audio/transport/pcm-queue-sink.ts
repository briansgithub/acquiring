import { getApplicationAudioContextOwner } from './application-audio-context';
import { createPlaybackClock, appendPlaybackClock, readPlaybackClock, prunePlaybackClock, playbackFrameAtTime } from './playback-clock';
import type { PlaybackClockQueue, ApplicationAudioContextOwner } from './contracts';
import type { PlaybackTimeline } from '../synth';
import { PCM_SINK_LIMITS as LIMITS, PcmSinkError } from './sink-contracts';
import type { AudioPcmQueueSink, PcmQueueSinkOptions, PcmSinkClock, PcmSinkPcm, PcmSinkReading, PcmSinkRun } from './sink-contracts';

interface Staged { readonly buffer: AudioBuffer; readonly startBeat: number; readonly beatsPerFrame: number }
interface RunState {
  readonly token: PcmSinkRun;
  readonly context: AudioContext;
  readonly selected: PcmSinkClock;
  clock: PlaybackClockQueue;
  staged: Staged[];
  readonly nodes: Set<AudioBufferSourceNode>;
  scheduled: boolean;
  sealed: boolean;
  busy: boolean;
  lastRequest: number;
  lastTime: number;
}
const error = (code: ConstructorParameters<typeof PcmSinkError>[0], message: string): never => { throw new PcmSinkError(code, message); };
const safe = (value: number) => Number.isSafeInteger(value) && value >= 0;
const finiteBeat = (value: number) => Number.isFinite(value) && Math.abs(value) <= 1000000;

/** Borrowed-context PCM queue only; caller owns transport intent and completion. */
export class PcmQueueSink implements AudioPcmQueueSink {
  private readonly owner: ApplicationAudioContextOwner;
  private readonly unsubscribe: () => void;
  private readonly clockOption: PcmSinkClock | undefined;
  private current: RunState | null = null;
  private released = false;
  private generation = 0;
  private revision = 0;
  private mutation = 0;
  constructor(options: PcmQueueSinkOptions = {}) {
    this.owner = options.contextOwner ?? getApplicationAudioContextOwner();
    this.clockOption = options.clock;
    this.unsubscribe = this.owner.subscribeInvalidation(() => this.flush());
  }

  begin(revision: number, timeline: Pick<PlaybackTimeline, 'startBeat'|'endBeat'|'completionKey'>, anchorBeat?: number): PcmSinkRun {
    if (this.released) return error('RELEASED', 'Sink released');
    if (!safe(revision) || revision < this.revision || !safe(this.generation + 1)) return error('INVALID_INPUT', 'Invalid revision/generation');
    const mutation = this.mutation;
    let window: Pick<PlaybackTimeline, 'startBeat'|'endBeat'|'completionKey'>;
    try {
      const { startBeat, endBeat, completionKey } = timeline;
      window = { startBeat, endBeat, completionKey };
    } catch { return error('INVALID_INPUT', 'Invalid timeline snapshot'); }
    this.candidate(mutation);
    const { canRender, epoch, sampleRate: ownerRate } = this.owner.getSnapshot();
    this.candidate(mutation);
    if (!canRender) return error('BLOCKED', 'A permitted foreground context is required');
    let context: AudioContext;
    try { context = this.owner.getContext(); } catch { this.candidate(mutation); return error('BLOCKED', 'Context unavailable'); }
    const sampleRate = context.sampleRate, contextState = context.state;
    this.candidate(mutation);
    if (contextState !== 'running' || sampleRate !== ownerRate) return error('BLOCKED', 'Context not running at owner rate');
    let clock: PlaybackClockQueue;
    try { clock = createPlaybackClock(window, sampleRate, anchorBeat); }
    catch { return error('INVALID_INPUT', 'Invalid clock window'); }
    const selected = this.clockOption ?? (typeof context.getOutputTimestamp === 'function' ? 'output-timestamp' : 'context-render');
    if (selected !== 'output-timestamp' && selected !== 'context-render') return error('INVALID_INPUT', 'Invalid clock selection');
    const time = this.time(context, selected, sampleRate);
    this.candidate(mutation);
    const state = this.owner.getSnapshot(), running = context.state;
    this.candidate(mutation);
    if (!state.canRender || state.epoch !== epoch || state.sampleRate !== sampleRate || running !== 'running')
      return error('BLOCKED', 'Permission changed during begin');
    // All validation precedes replacement; retirement owns only the detached old state.
    const token = Object.freeze({ generation: ++this.generation, revision, epoch, sampleRate });
    const next: RunState = { token, context, selected, clock, staged: [], nodes: new Set(),
      scheduled: false, sealed: false, busy: false, lastRequest: 0, lastTime: time };
    const old = this.current;
    this.current = next; this.revision = revision; this.mutation++;
    this.retire(old);
    this.permission(next);
    return token;
  }

  enqueue(token: PcmSinkRun, input: PcmSinkPcm, final = false): void {
    if (this.released) return error('RELEASED', 'Sink released');
    const run = this.current;
    if (!run || token !== run.token) return error('STALE_RUN', 'Current exact run identity required');
    if (run.busy) return error('STALE_RUN', 'An enqueue is already active for this run');
    run.busy = true;
    try {
      this.observe(run);
      let packet: { requestId: number; startBeat: number; beatsPerFrame: number; samples: Float32Array };
      try {
        const { version, ok, kind, requestId, revision, startBeat, position, pcm } = input;
        const { sampleRate, beat, beatsPerFrame, finished } = position;
        this.active(run);
        if (run.sealed || version !== 1 || ok !== true || kind !== 'pcm' || revision !== token.revision ||
            sampleRate !== token.sampleRate || !safe(requestId) || requestId < 1 || requestId <= run.lastRequest ||
            !(pcm instanceof Int16Array) || !(pcm.buffer instanceof ArrayBuffer) || typeof final !== 'boolean' ||
            !finiteBeat(startBeat) || !finiteBeat(beat) || typeof finished !== 'boolean' ||
            !Number.isFinite(beatsPerFrame) || beatsPerFrame < 0 || beatsPerFrame > 1000 / (60 * token.sampleRate))
          return error('INVALID_INPUT', 'Invalid PCM metadata or sealed run');
        const count = pcm.length;
        if (!Number.isInteger(count) || count < 1 || count > LIMITS.batchFrames) return error('INVALID_INPUT', 'Invalid PCM length');
        // Copy before invoking host allocation hooks, which may mutate caller samples.
        const samples = new Float32Array(count);
        for (let i = 0; i < count; i++) samples[i] = pcm[i] / 32768;
        packet = { requestId, startBeat, beatsPerFrame, samples };
      } catch (cause) {
        this.active(run);
        if (cause instanceof PcmSinkError) throw cause;
        return error('INVALID_INPUT', 'Invalid PCM snapshot');
      }
      this.active(run);
      let played = this.observe(run);
      let start = this.startFrame(run);
      this.preflight(run, packet.samples.length, packet.startBeat, packet.beatsPerFrame, final, played, start);
      let buffer: AudioBuffer;
      try {
        buffer = run.context.createBuffer(1, packet.samples.length, token.sampleRate);
        this.active(run);
        const channel = buffer.getChannelData(0);
        this.active(run);
        channel.set(packet.samples);
        played = this.observe(run);
        start = this.startFrame(run);
        this.preflight(run, packet.samples.length, packet.startBeat, packet.beatsPerFrame, final, played, start);
        run.staged.push({ buffer, startBeat: packet.startBeat, beatsPerFrame: packet.beatsPerFrame });
        run.lastRequest = packet.requestId; run.sealed = final;
        const frames = run.staged.reduce((sum, entry) => sum + entry.buffer.length, 0);
        if (run.scheduled || final || frames >= Math.ceil(token.sampleRate * LIMITS.primeMs / 1000)) {
          const staged = run.staged;
          run.staged = [];
          for (const entry of staged) {
            this.permission(run);
            const nextClock = appendPlaybackClock(run.clock, { startFrame: start,
              frameCount: entry.buffer.length, startBeat: entry.startBeat, beatsPerFrame: entry.beatsPerFrame });
            const node = run.context.createBufferSource();
            // The returned node belongs to this call even if the factory replaced its run.
            if (this.current !== run || this.released) { this.retireNode(node); this.active(run); }
            run.nodes.add(node);
            node.onended = () => { run.nodes.delete(node); this.disconnect(node); };
            node.buffer = entry.buffer;
            this.active(run);
            node.connect(run.context.destination);
            this.permission(run);
            // A synchronous host hook must not turn the precomputed schedule into a past start.
            const now = run.context.currentTime;
            this.active(run);
            if (!Number.isFinite(now) || now < 0 || now * token.sampleRate > start)
              return error('AUDIO_FAILED', 'Scheduling deadline elapsed');
            node.start(start / token.sampleRate);
            this.permission(run);
            run.clock = nextClock; start += entry.buffer.length;
          }
          run.scheduled = true;
        }
      } catch (cause) {
        this.drop(run);
        if (cause instanceof PcmSinkError) throw cause;
        return error('AUDIO_FAILED', 'Audio allocation/start failed; run flushed');
      }
    } finally { run.busy = false; }
  }

  read(): PcmSinkReading {
    const run = this.current;
    if (!run) return Object.freeze({ run: null, phase: this.released ? 'released' : 'idle',
      clock: null, playedFrame: null, beat: null, queuedFrames: 0, sources: 0, mappings: 0, queueDrained: false });
    const playedFrame = this.observe(run);
    const reading = readPlaybackClock(run.clock, playedFrame);
    const stagedFrames = run.staged.reduce((sum, entry) => sum + entry.buffer.length, 0);
    return Object.freeze({ run: run.token, phase: run.scheduled ? 'scheduled' : 'priming', clock: run.selected,
      playedFrame, beat: reading.beat, queuedFrames: stagedFrames + Math.max(0, (run.clock.lastEndFrame ?? playedFrame) - playedFrame),
      sources: run.nodes.size, mappings: run.clock.segments.length,
      queueDrained: run.scheduled && run.staged.length === 0 && reading.queueDrained });
  }

  flush(): void {
    const run = this.current;
    this.current = null; this.mutation++;
    this.retire(run);
  }
  release(): void {
    if (this.released) return;
    this.released = true;
    try { this.flush(); } finally { this.unsubscribe(); }
  }
  private candidate(mutation: number): void {
    if (this.released) return error('RELEASED', 'Sink released');
    if (this.mutation !== mutation) return error('STALE_RUN', 'Run changed during begin validation');
  }
  private active(run: RunState): void {
    if (this.released) return error('RELEASED', 'Sink released');
    if (this.current !== run) return error('STALE_RUN', 'Run replaced during operation');
  }
  private permission(run: RunState): void {
    this.active(run);
    let canRender: boolean, epoch: number, sampleRate: number | null, running: AudioContextState;
    try {
      ({ canRender, epoch, sampleRate } = this.owner.getSnapshot()); running = run.context.state;
    } catch {
      this.active(run); this.drop(run); return error('BLOCKED', 'Audio permission could not be read');
    }
    this.active(run);
    if (!canRender || epoch !== run.token.epoch || sampleRate !== run.token.sampleRate || running !== 'running') {
      this.drop(run); return error('BLOCKED', 'Audio permission/epoch invalidated');
    }
  }
  private time(context: AudioContext, selected: PcmSinkClock, rate: number): number {
    let time: number | undefined;
    try { time = selected === 'output-timestamp' ? context.getOutputTimestamp().contextTime : context.currentTime; }
    catch { return error('CLOCK_FAILED', 'Selected audio clock unavailable'); }
    if (typeof time !== 'number') return error('CLOCK_FAILED', 'Selected audio clock missing');
    try { playbackFrameAtTime(time, rate); } catch { return error('CLOCK_FAILED', 'Invalid selected audio clock'); }
    return time;
  }
  private observe(run: RunState): number {
    this.permission(run);
    try {
      const time = this.time(run.context, run.selected, run.token.sampleRate);
      this.active(run);
      if (time < run.lastTime) return error('CLOCK_FAILED', 'Selected audio clock regressed');
      const frame = playbackFrameAtTime(time, run.token.sampleRate);
      run.clock = prunePlaybackClock(run.clock, frame); run.lastTime = time;
      this.permission(run);
      return frame;
    } catch (cause) { this.drop(run); throw cause; }
  }
  private startFrame(run: RunState): number {
    let time: number;
    try { time = run.context.currentTime; }
    catch { this.active(run); this.drop(run); return error('CLOCK_FAILED', 'Scheduling clock unavailable'); }
    this.active(run);
    if (!Number.isFinite(time) || time < 0) { this.drop(run); return error('CLOCK_FAILED', 'Invalid scheduling clock'); }
    const start = Math.max(run.clock.lastEndFrame ?? 0, Math.ceil(time * run.token.sampleRate) +
      Math.ceil(run.token.sampleRate * LIMITS.leadMs / 1000));
    if (!safe(start)) { this.drop(run); return error('CLOCK_FAILED', 'Unsafe scheduling clock'); }
    return start;
  }
  private preflight(run: RunState, count: number, startBeat: number, beatsPerFrame: number,
    final: boolean, played: number, start: number): void {
    const stagedFrames = run.staged.reduce((sum, entry) => sum + entry.buffer.length, 0);
    const willSchedule = run.scheduled || final || stagedFrames + count >= Math.ceil(run.token.sampleRate * LIMITS.primeMs / 1000);
    const end = start + stagedFrames + count;
    if (!safe(end)) return error('INVALID_INPUT', 'Unsafe scheduled end');
    const horizon = willSchedule ? Math.max(0, end - played) : stagedFrames + count;
    if (horizon > Math.ceil(run.token.sampleRate * LIMITS.queueMs / 1000) + LIMITS.batchFrames ||
        run.clock.segments.length + run.staged.length + 1 > LIMITS.mappings ||
        run.nodes.size + run.staged.length + 1 > LIMITS.sources)
      return error('QUEUE_FULL', 'PCM queue capacity exceeded');
    try { appendPlaybackClock(run.clock, { startFrame: start, frameCount: count, startBeat, beatsPerFrame }); }
    catch { return error('INVALID_INPUT', 'Invalid PCM beat/slope mapping'); }
  }
  private drop(run: RunState): void {
    if (this.current === run) { this.current = null; this.mutation++; }
    this.retire(run);
  }
  private retire(run: RunState | null): void {
    if (!run) return;
    run.staged = [];
    const nodes = [...run.nodes]; run.nodes.clear();
    for (const node of nodes) this.retireNode(node);
  }
  private disconnect(node: AudioBufferSourceNode): void { try { node.disconnect(); } catch { /* Continue retiring siblings. */ } }
  private retireNode(node: AudioBufferSourceNode): void {
    try { node.onended = null; } catch { /* Continue cleanup even if a host setter fails. */ }
    try { node.stop(); } catch { /* Source may have ended or never started. */ }
    this.disconnect(node);
  }
}
