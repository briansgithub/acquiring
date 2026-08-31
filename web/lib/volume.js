/** UI percent (0 = mute, 100 = unity gain) → Tone.js decibels. */
export function percentToDb(percent) {
  if (percent <= 0) return -Infinity;
  return 20 * Math.log10(percent / 100);
}

/** Tone.js decibels → UI percent, rounded for slider display. */
export function dbToPercent(db) {
  if (!Number.isFinite(db) || db <= -60) return 0;
  return Math.round(100 * 10 ** (db / 20));
}

export function formatVolumePercent(percent) {
  return `${Math.round(percent)}%`;
}
