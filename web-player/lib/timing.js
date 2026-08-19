export const TICKS_PER_BEAT = 192;

/** Slider 0 = 1/8 cycle/beat (slowest) … 6 = 1/2 … 7 = 1 … 14 = 8 (fastest). */
export const ARP_SLIDER_MIN = 0;
export const ARP_SLIDER_MAX = 14;
export const ARP_SLIDER_DEFAULT = 12;
/** Highlight arp pills when cycles/beat is at or below this value (through integer 6). */
export const ARP_HIGHLIGHT_MAX_CYCLES = 6;

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

/** Keep an explicit section boundary while extending it for later events. */
export function sectionLengthBeats(metadataEndBeat, ...eventGroups) {
  const suppliedEnd = Number(metadataEndBeat);
  let endBeat = Number.isFinite(suppliedEnd) && suppliedEnd > 0 ? suppliedEnd : 1;

  for (const events of eventGroups) {
    if (!Array.isArray(events)) continue;
    for (const event of events) {
      const rawBeat = Number(event?.beat);
      const duration = Number(event?.duration);
      if (!Number.isFinite(rawBeat) || !Number.isFinite(duration) || duration < 0) continue;
      const beat = rawBeat === 0 ? 1 : rawBeat;
      endBeat = Math.max(endBeat, beat + duration);
    }
  }
  return endBeat;
}
