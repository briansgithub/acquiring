/** Frozen 801cf798 pitch-feedback colour / live percentage from AudiationPitchPractice + PersistentPlaybackPitchPractice. */
export const PITCH_FEEDBACK_GREEN = '#4CAF50';
export const PITCH_FEEDBACK_YELLOW = '#FFEB3B';
export const PITCH_FEEDBACK_RED = '#F44336';

export function pitchFeedbackColor(centsError: number): string {
  const absolute = Math.abs(centsError);
  if (absolute < 15) return PITCH_FEEDBACK_GREEN;
  if (absolute < 50) return PITCH_FEEDBACK_YELLOW;
  return PITCH_FEEDBACK_RED;
}

export function pitchErrorToTimelineStaffSteps(centsError: number): number {
  return centsError * 7 / 1200;
}

export function pitchErrorPercentage(centsError: number): number {
  return Math.min(100, Math.max(0, Math.round(Math.abs(centsError))));
}

export function showsLivePitchErrorPercentage(centsError: number): boolean {
  return pitchErrorPercentage(centsError) < 100;
}

export function formatPitchCentsError(centsError: number): string {
  const rounded = Math.round(centsError);
  return `${rounded > 0 ? '+' : ''}${rounded}¢`;
}
