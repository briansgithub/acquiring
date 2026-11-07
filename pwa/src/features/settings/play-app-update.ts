/** Frozen 801cf798 PlayAppUpdate.kt. Play Store apply remains T26; SW skipWaiting is not this chrome. */
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

export type ServiceWorkerRegistrationLike = {
  waiting: unknown;
  active: unknown;
  update?: () => Promise<unknown>;
} | null | undefined;

export function playUpdateStatusFromRegistration(registration: ServiceWorkerRegistrationLike): PlayUpdateStatus {
  if (!registration) return PlayUpdateStatus.UNAVAILABLE;
  if (registration.waiting) return PlayUpdateStatus.UPDATE_AVAILABLE;
  if (registration.active) return PlayUpdateStatus.UP_TO_DATE;
  return PlayUpdateStatus.UNAVAILABLE;
}

export function settingsUpdatesHeading(status: PlayUpdateStatus): string {
  return status === PlayUpdateStatus.UPDATE_AVAILABLE ? 'Updates •' : 'Updates';
}

export interface AppUpdateSnapshot {readonly status: PlayUpdateStatus}

type WorkerHost = {
  ready: Promise<ServiceWorkerRegistrationLike>;
  getRegistration(): Promise<ServiceWorkerRegistrationLike>;
};

function workerHost(): WorkerHost | undefined {
  const worker = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
  return worker ? worker : undefined;
}

export async function checkAppUpdateStatus(worker: WorkerHost | undefined = workerHost()): Promise<PlayUpdateStatus> {
  if (!worker) return PlayUpdateStatus.UNAVAILABLE;
  try {
    const ready = await Promise.race([
      worker.ready,
      new Promise<null>(resolve => { globalThis.setTimeout(() => resolve(null), 2000); }),
    ]);
    return playUpdateStatusFromRegistration(ready ?? await worker.getRegistration());
  } catch {
    return PlayUpdateStatus.UNAVAILABLE;
  }
}

let snapshot: AppUpdateSnapshot = Object.freeze({status: PlayUpdateStatus.UNAVAILABLE});
const listeners = new Set<() => void>();

export function subscribeAppUpdate(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function getAppUpdateSnapshot(): AppUpdateSnapshot { return snapshot; }

function publish(status: PlayUpdateStatus): void {
  if (status === snapshot.status) return;
  snapshot = Object.freeze({status});
  for (const listener of listeners) listener();
}

export async function refreshAppUpdateStatus(worker: WorkerHost | undefined = workerHost()): Promise<PlayUpdateStatus> {
  const status = await checkAppUpdateStatus(worker);
  publish(status);
  return status;
}

/** Native Open Play leaves the app for Play Store. PWA rechecks SW; does not skipWaiting (audio-session policy). */
export async function requestAppUpdateCheck(worker: WorkerHost | undefined = workerHost()): Promise<PlayUpdateStatus> {
  try {
    const registration = await worker?.getRegistration();
    await registration?.update?.();
  } catch { /* still recheck */ }
  return refreshAppUpdateStatus(worker);
}

export function resetAppUpdateForTests(): void {
  snapshot = Object.freeze({status: PlayUpdateStatus.UNAVAILABLE});
  listeners.clear();
}
