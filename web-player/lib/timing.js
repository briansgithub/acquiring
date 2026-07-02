export const TICKS_PER_BEAT = 192;

/** Slider 0 = 1/8 cycle/beat (slowest) … 6 = 1/2 … 7 = 1 … 14 = 8 (fastest). */
export const ARP_SLIDER_MIN = 0;
export const ARP_SLIDER_MAX = 14;
export const ARP_SLIDER_DEFAULT = 6;
/** Highlight arp pills for slider positions at or below this index (1/2 cycle/beat). */
export const ARP_HIGHLIGHT_MAX_SLIDER = 6;

const ARP_FRACTIONAL_COUNT = 7;

export function sliderIndexToCyclesPerBeat(index) {
  const i = Math.max(ARP_SLIDER_MIN, Math.min(ARP_SLIDER_MAX, index));
  if (i < ARP_FRACTIONAL_COUNT) return 1 / (8 - i);
  return i - (ARP_FRACTIONAL_COUNT - 1);
}

/** Ticks between arpeggio notes. Fixed speed ignores note count (same step for every chord). */
export function arpOffsetTicks(cyclesPerBeat, noteCount, fixedSpeed = false) {
  if (fixedSpeed) {
    return Math.max(1, Math.round(TICKS_PER_BEAT / cyclesPerBeat));
  }
  const notes = Math.max(1, noteCount);
  return Math.max(1, Math.round(TICKS_PER_BEAT / (cyclesPerBeat * notes)));
}

export function arpStepMs(cyclesPerBeat, noteCount, bpm, fixedSpeed = false) {
  const divisor = fixedSpeed
    ? cyclesPerBeat
    : cyclesPerBeat * Math.max(1, noteCount);
  return (60 / bpm / divisor) * 1000;
}

export function formatArpCyclesLabel(sliderIndex) {
  const cycles = sliderIndexToCyclesPerBeat(sliderIndex);
  if (cycles >= 1 && Number.isInteger(cycles)) return String(cycles);
  return `1/${Math.round(1 / cycles)}`;
}

export function isArpeggiationActive(checked) {
  return checked;
}
