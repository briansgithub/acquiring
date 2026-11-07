/** Frozen 801cf798 MelodyRunSettleDetector: self-consistency, not target proximity. */
export const MELODY_PITCH_SETTLE_WINDOW_MS = 96;
export const MELODY_PITCH_SETTLE_TOLERANCE_CENTS = 40;
export const MELODY_PITCH_SETTLE_FLOOR_MS = 150;
export const MELODY_PITCH_SETTLE_CAP_MS = 500;

export class MelodyRunSettleDetector {
  private readonly windowCents: number[] = [];
  private readonly windowAtMs: number[] = [];
  private settled = false;

  constructor(
    readonly settleWindowMs = MELODY_PITCH_SETTLE_WINDOW_MS,
    readonly toleranceCents = MELODY_PITCH_SETTLE_TOLERANCE_CENTS,
    readonly floorMs = MELODY_PITCH_SETTLE_FLOOR_MS,
    readonly capMs = MELODY_PITCH_SETTLE_CAP_MS,
  ) {
    if (settleWindowMs <= 0 || toleranceCents <= 0 || floorMs < 0 || capMs < floorMs) {
      throw new RangeError('settle detector bounds');
    }
  }

  observe(elapsedMs: number, centsError: number | null): boolean {
    if (this.settled) return true;
    if (elapsedMs >= this.capMs) { this.settled = true; return true; }
    if (centsError == null || !Number.isFinite(centsError)) {
      this.windowCents.length = 0;
      this.windowAtMs.length = 0;
      return false;
    }
    this.windowCents.push(centsError);
    this.windowAtMs.push(elapsedMs);
    while (this.windowAtMs.length > 1 && elapsedMs - this.windowAtMs[0] > this.settleWindowMs) {
      this.windowCents.shift();
      this.windowAtMs.shift();
    }
    if (elapsedMs < this.floorMs) return false;
    if (elapsedMs - this.windowAtMs[0] < this.settleWindowMs) return false;
    if (this.windowCents.every((value) => value === this.windowCents[0])) return false;
    if (Math.max(...this.windowCents) - Math.min(...this.windowCents) > this.toleranceCents) return false;
    this.settled = true;
    return true;
  }
}

/** Tick the native 16ms sample loop without inventing cents. */
export function firstSettleMs(
  detector: MelodyRunSettleDetector,
  centsAt: (elapsedMs: number) => number | null,
  untilMs = 900,
  sampleIntervalMs = 16,
): number | null {
  for (let elapsedMs = 0; elapsedMs <= untilMs; elapsedMs += sampleIntervalMs) {
    if (detector.observe(elapsedMs, centsAt(elapsedMs))) return elapsedMs;
  }
  return null;
}
