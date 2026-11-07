/** Frozen 801cf798 PlayAppUpdate.kt mapper/labels only. PWA has no Play Store; SW apply is T26. */
export const PlayUpdateStatus = Object.freeze({
  UPDATE_AVAILABLE: 'UPDATE_AVAILABLE',
  UP_TO_DATE: 'UP_TO_DATE',
  UNAVAILABLE: 'UNAVAILABLE',
});
export type PlayUpdateStatus = typeof PlayUpdateStatus[keyof typeof PlayUpdateStatus];

export const PLAY_UPDATE_LABEL = Object.freeze({
  [PlayUpdateStatus.UPDATE_AVAILABLE]: 'Update available',
  [PlayUpdateStatus.UP_TO_DATE]: 'Up to date',
  [PlayUpdateStatus.UNAVAILABLE]: 'Update status unavailable',
});

/** Play Core UpdateAvailability ints used by PlayAppUpdateTest.kt. */
export const UPDATE_AVAILABILITY = Object.freeze({
  UNKNOWN: 0,
  UPDATE_NOT_AVAILABLE: 1,
  UPDATE_AVAILABLE: 2,
});

export function playUpdateStatusFromAvailability(availability: number): PlayUpdateStatus {
  if (availability === UPDATE_AVAILABILITY.UPDATE_AVAILABLE) return PlayUpdateStatus.UPDATE_AVAILABLE;
  if (availability === UPDATE_AVAILABILITY.UPDATE_NOT_AVAILABLE) return PlayUpdateStatus.UP_TO_DATE;
  return PlayUpdateStatus.UNAVAILABLE;
}

export function settingsUpdatesHeading(status: PlayUpdateStatus): string {
  return status === PlayUpdateStatus.UPDATE_AVAILABLE ? 'Updates •' : 'Updates';
}

/** This PWA is not on Play; Play Core cannot run. Do not map service workers to these labels. */
export const PWA_PLAY_UPDATE_STATUS = PlayUpdateStatus.UNAVAILABLE;
