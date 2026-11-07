import {
  BrowserMicrophoneCapture, MicrophonePitchCoordinator, MicrophonePitchOwner,
  type ExclusivePitchSource, type PitchResultEstimate,
} from '../../audio/capture';
import { calculateMeasuredInterval, type MeasuredInterval, SpelledPitch } from '../../domain/music';

export const LISTEN_TIMEOUT_MS = 3000;
export const FLIPFLOP_SLOT_MS = 3000;
/** Native HummingIntervalPopup after slot 2: pitchTracker.stop() then delay(2000). */
export const FLIPFLOP_REST_MS = 2000;
/** Native EXPAND_ANIMATION_MS(300) + AUTO_LISTEN_DELAY_MS(500). */
export const AUTO_LISTEN_MS = 800;

export type SingingMicAction =
  | { readonly kind: 'idle' }
  | { readonly kind: 'listening'; readonly slot: 1 | 2; readonly targetMidi: number }
  | { readonly kind: 'flipflop'; readonly slot: 1 | 2 }
  | { readonly kind: 'flipflop-rest'; readonly until: number };

export interface SingingSlotPitch {
  readonly midi: number;
  readonly cents: number;
  readonly label: string;
}

/** Accepted T03 contract on captured raw MIDI. Null unless both slots have a live write. */
export function sungInterval(
  slot1: SingingSlotPitch | null,
  slot2: SingingSlotPitch | null,
): MeasuredInterval | null {
  if (!slot1 || !slot2) return null;
  return calculateMeasuredInterval(slot1.midi, slot2.midi);
}

export function formatSungIntervalCents(cents: number): string {
  const rounded = Math.round(cents);
  return `${rounded >= 0 ? '+' : ''}${rounded}¢`;
}

export class SingingMicrophoneSession {
  readonly capture: BrowserMicrophoneCapture;
  private readonly ownedCoordinator: MicrophonePitchCoordinator | null;
  private readonly lease: ExclusivePitchSource;
  private readonly now: () => number;
  private startedAt = 0;
  action: SingingMicAction = { kind: 'idle' };
  slot1: SingingSlotPitch | null = null;
  slot2: SingingSlotPitch | null = null;
  error: string | null = null;
  /** Explicit listen/Flip-Flop this session. Collapse/stop keeps it; release clears. */
  optedIn = false;
  version = 0;
  private readonly listeners = new Set<() => void>();

  constructor(options: {
    capture?: BrowserMicrophoneCapture;
    source?: ExclusivePitchSource;
    now?: () => number;
  } = {}) {
    this.now = options.now ?? (() => Date.now());
    this.capture = options.capture ?? new BrowserMicrophoneCapture();
    this.ownedCoordinator = options.source ? null : new MicrophonePitchCoordinator(this.capture);
    this.lease = options.source ?? this.ownedCoordinator!.sourceFor(MicrophonePitchOwner.SINGING_TOOL);
  }

  get ownsMicrophone(): boolean { return this.lease.ownsMicrophone; }

  subscribe = (listener: () => void): () => void => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  listen(slot: 1 | 2, targetMidi: number): void {
    this.optedIn = true;
    this.error = null;
    this.lease.stop();
    this.lease.claim();
    this.action = { kind: 'listening', slot, targetMidi };
    this.startedAt = this.now();
    this.lease.start(targetMidi);
    this.emit();
  }

  /** Native HummingIntervalPopup: 800ms after target load, idle only. First getUserMedia prompt is allowed. */
  maybeAutoListen(slot: 1 | 2, targetMidi: number): boolean {
    if (this.action.kind !== 'idle') return false;
    this.listen(slot, targetMidi);
    return true;
  }

  setFlipFlop(enabled: boolean): void {
    this.lease.stop();
    if (!enabled) {
      this.action = { kind: 'idle' };
      this.emit();
      return;
    }
    this.optedIn = true;
    this.error = null;
    this.lease.claim();
    this.action = { kind: 'flipflop', slot: 1 };
    this.startedAt = this.now();
    this.lease.start(60);
    this.emit();
  }

  retarget(targetMidi: number): void {
    if (this.action.kind === 'listening') {
      this.action = { kind: 'listening', slot: this.action.slot, targetMidi };
    }
    this.lease.retarget(targetMidi);
  }

  /** Native listenTimeRemaining / recordingTimeRemaining. Rest shows none. */
  remainingMs(now = this.now()): number {
    if (this.action.kind === 'listening') return Math.max(0, LISTEN_TIMEOUT_MS - (now - this.startedAt));
    if (this.action.kind === 'flipflop') return Math.max(0, FLIPFLOP_SLOT_MS - (now - this.startedAt));
    return 0;
  }

  stop(): void {
    this.lease.stop();
    this.action = { kind: 'idle' };
    this.emit();
  }

  release(): void {
    this.stop();
    this.optedIn = false;
    this.ownedCoordinator?.release();
  }

  tick(now = this.now()): void {
    // Native HummingIntervalPopup: ownership loss idles without stopping the new owner.
    // Flip-Flop rest is our own stop (owner=null), not a steal — keep the rest timer.
    if (this.action.kind !== 'idle' && this.action.kind !== 'flipflop-rest' && !this.lease.ownsMicrophone) {
      this.action = { kind: 'idle' };
      this.emit();
      return;
    }
    const result = this.capture.current;
    if (result.kind === 'error' && (this.lease.ownsMicrophone || this.action.kind !== 'idle')) {
      if (this.lease.ownsMicrophone) this.lease.stop();
      this.error = result.message;
      this.action = { kind: 'idle' };
      this.emit();
      return;
    }
    const live = result.kind === 'estimate' && !result.isHeld ? result : null;
    if (this.action.kind === 'listening') {
      if (live) this.writeSlot(this.action.slot, live, (live.midi - this.action.targetMidi) * 100);
      if (now - this.startedAt >= LISTEN_TIMEOUT_MS) this.stop();
      else this.emit();
      return;
    }
    if (this.action.kind === 'flipflop-rest') {
      if (now >= this.action.until) this.startFlipFlopSlot(1, now);
      this.emit();
      return;
    }
    if (this.action.kind === 'flipflop') {
      if (live) this.writeSlot(this.action.slot, live, centsFromNearest(live.midi));
      if (now - this.startedAt >= FLIPFLOP_SLOT_MS) {
        if (this.action.slot === 2) {
          this.lease.stop();
          this.action = { kind: 'flipflop-rest', until: now + FLIPFLOP_REST_MS };
          this.startedAt = now;
        } else {
          this.startFlipFlopSlot(2, now);
        }
      }
      this.emit();
    }
  }

  private startFlipFlopSlot(slot: 1 | 2, now: number): void {
    this.lease.stop();
    this.lease.claim();
    this.action = { kind: 'flipflop', slot };
    this.startedAt = now;
    this.lease.start(60);
  }

  private writeSlot(slot: 1 | 2, live: PitchResultEstimate, cents: number): void {
    if (!this.lease.ownsMicrophone) return;
    const midi = Math.round(live.midi);
    const pitch = slot === 2 && this.slot1
      ? SpelledPitch.spellRelative(SpelledPitch.fromMidi(Math.round(this.slot1.midi)), midi)
      : SpelledPitch.fromMidi(midi);
    const data: SingingSlotPitch = Object.freeze({ midi: live.midi, cents, label: pitch.displayName });
    if (slot === 1) this.slot1 = data; else this.slot2 = data;
  }

  private emit(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }
}

function centsFromNearest(midi: number): number {
  const nearest = Math.round(midi);
  return (midi - nearest) * 100;
}
