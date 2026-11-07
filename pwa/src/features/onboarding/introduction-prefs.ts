/** Frozen 801cf798 IntroductionPrefs.kt SharedPreferences "onboarding"/hasCompletedIntroduction.
 * localStorage is the PWA equivalent; not T06 user records and not a diagnostics reset.
 */
export const INTRODUCTION_PREFS_KEY = 'acquiring-onboarding';
export const INTRODUCTION_COMPLETED_KEY = 'hasCompletedIntroduction';

export interface IntroductionPreferenceStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const memory = new Map<string, string>();
const memoryStore: IntroductionPreferenceStore = {
  getItem(key) { return memory.get(key) ?? null; },
  setItem(key, value) { memory.set(key, value); },
};

function browserStore(): IntroductionPreferenceStore {
  try {
    if (typeof localStorage === 'undefined') return memoryStore;
    return localStorage;
  } catch {
    return memoryStore;
  }
}

export function parseIntroductionCompleted(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as {[INTRODUCTION_COMPLETED_KEY]?: unknown};
    return parsed[INTRODUCTION_COMPLETED_KEY] === true;
  } catch {
    return false;
  }
}

export function createIntroductionPrefs(store: IntroductionPreferenceStore = browserStore()) {
  return {
    hasCompleted(): boolean {
      return parseIntroductionCompleted(store.getItem(INTRODUCTION_PREFS_KEY));
    },
    markCompleted(): void {
      store.setItem(INTRODUCTION_PREFS_KEY, JSON.stringify({[INTRODUCTION_COMPLETED_KEY]: true}));
    },
  };
}

export const appIntroductionPrefs = createIntroductionPrefs();
export function hasCompletedIntroduction(): boolean { return appIntroductionPrefs.hasCompleted(); }
export function markIntroductionCompleted(): void { appIntroductionPrefs.markCompleted(); }
