import {
  BrowserMicrophoneCapture, MicrophonePitchCoordinator, MicrophonePitchOwner, type PitchResultEstimate,
} from '../../audio/capture';
import { SpelledPitch } from '../../domain/music';

export const LISTEN_TIMEOUT_MS = 3000;
export const FLIPFLOP_SLOT_MS = 3000;

export type SingingMicAction =
  | { readonly kind: 'idle' }
  | { readonly kind: 'listening'; readonly slot: 1 | 2; readonly targetMidi: number }
  | { readonly kind: 'flipflop'; readonly slot: 1 | 2 };

export interface SingingSlotPitch {
  readonly midi: number;
  readonly cents: number;
  readonly label: string;
}

export class SingingMicrophoneSession {
  readonly capture: BrowserMicrophoneCapture;
  private readonly coordinator: MicrophonePitchCoordinator;
  private readonly lease;
  private readonly now: () => number;
  private startedAt = 0;
  action: SingingMicAction = { kind: 'idle' };
  slot1: SingingSlotPitch | null = null;
  slot2: SingingSlotPitch | null = null;
  error: string | null = null;
  version = 0;
  private readonly listeners = new Set<() => void>();

  constructor(options: { capture?: BrowserMicrophoneCapture; now?: () => number } = {}) {
    this.now = options.now ?? (() => Date.now());
    this.capture = options.capture ?? new BrowserMicrophoneCapture();
    this.coordinator = new MicrophonePitchCoordinator(this.capture);
    this.lease = this.coordinator.sourceFor(MicrophonePitchOwner.SINGING_TOOL);
  }

  subscribe = (listener: () => void): () => void => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  listen(slot: 1 | 2, targetMidi: number): void {
    this.error = null;
    this.lease.stop();
    this.lease.claim();
    this.action = { kind: 'listening', slot, targetMidi };
    this.startedAt = this.now();
    this.lease.start(targetMidi);
    this.emit();
  }

  setFlipFlop(enabled: boolean): void {
    this.lease.stop();
    if (!enabled) {
      this.action = { kind: 'idle' };
      this.emit();
      return;
    }
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

  stop(): void {
    this.lease.stop();
    this.action = { kind: 'idle' };
    this.emit();
  }

  release(): void {
    this.stop();
    this.coordinator.release();
  }

  tick(now = this.now()): void {
    const result = this.capture.current;
    if (result.kind === 'error') {
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
    if (this.action.kind === 'flipflop') {
      if (live) this.writeSlot(this.action.slot, live, centsFromNearest(live.midi));
      if (now - this.startedAt >= FLIPFLOP_SLOT_MS) {
        const next: 1 | 2 = this.action.slot === 1 ? 2 : 1;
        this.lease.stop();
        this.lease.claim();
        this.action = { kind: 'flipflop', slot: next };
        this.startedAt = now;
        this.lease.start(60);
      }
      this.emit();
    }
  }

  private writeSlot(slot: 1 | 2, live: PitchResultEstimate, cents: number): void {
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
