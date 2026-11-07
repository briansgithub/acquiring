/** Frozen 801cf798 SongQueueViewModel.kt kernel. No Library Play/Shuffle chrome, no
 * PlaylistDao save, no PlaybackController.pause. Aural originQuiz completion-skip is
 * preserved; Aural quiz UI stays last. */

export interface QueuedSong {
  readonly slug: string;
  readonly title: string;
  readonly artist: string;
  readonly sectionId: string;
  readonly sectionName: string;
}

export interface QueueCandidate {
  readonly song: QueuedSong;
  readonly score: number | null;
}

/** Frozen AuralCatalog.kt auralMeetsMinimumPopularity. */
export function auralMeetsMinimumPopularity(score: number | null, percent: number | null): boolean {
  if (percent === null) return true;
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new RangeError('minimumPopularityPercent must be a native 0..100 Int or null.');
  }
  return score !== null && Number.isFinite(score) && score >= 0 && score <= 1 && score >= percent / 100;
}

export function queuedSong(slug: string, title: string, artist: string, sectionId: string, sectionName: string): QueuedSong {
  return Object.freeze({ slug, title, artist, sectionId, sectionName });
}

function pickIndex(length: number, random: () => number): number {
  if (length <= 0) throw new RangeError('Cannot pick from an empty group.');
  return Math.min(length - 1, Math.max(0, Math.floor(random() * length)));
}

export function orderedQueue(
  candidates: readonly QueueCandidate[],
  minimumPopularityPercent: number | null,
  random: () => number = Math.random,
): QueuedSong[] {
  const eligible = candidates.filter((candidate) => auralMeetsMinimumPopularity(candidate.score, minimumPopularityPercent));
  const grouped = new Map<string, QueueCandidate[]>();
  for (const candidate of eligible) {
    const group = grouped.get(candidate.song.slug);
    if (group) group.push(candidate);
    else grouped.set(candidate.song.slug, [candidate]);
  }
  const selected: Array<{ song: QueuedSong; score: number | null }> = [];
  for (const matches of grouped.values()) {
    const unique: QueuedSong[] = [];
    const seen = new Set<string>();
    for (const match of matches) {
      if (seen.has(match.song.sectionId)) continue;
      seen.add(match.song.sectionId);
      unique.push(match.song);
    }
    selected.push({ song: unique[pickIndex(unique.length, random)], score: matches[0].score });
  }
  selected.sort((a, b) => {
    const scoreDelta = (b.score ?? -1) - (a.score ?? -1);
    if (scoreDelta !== 0) return scoreDelta;
    const aTitle = a.song.title.toLowerCase(), bTitle = b.song.title.toLowerCase();
    if (aTitle !== bTitle) return aTitle < bTitle ? -1 : 1;
    return a.song.slug < b.song.slug ? -1 : a.song.slug > b.song.slug ? 1 : 0;
  });
  return selected.map((entry) => entry.song);
}

function fisherYates<T>(items: readonly T[], random: () => number): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = pickIndex(i + 1, random);
    const swap = copy[i];
    copy[i] = copy[j];
    copy[j] = swap;
  }
  return copy;
}

function sameSongs(a: readonly QueuedSong[], b: readonly QueuedSong[]): boolean {
  return a.length === b.length && a.every((song, index) => song === b[index]);
}

export class SongQueueSession {
  active = false;
  loading = false;
  entries: readonly QueuedSong[] = [];
  private originalEntries: readonly QueuedSong[] = [];
  index = 0;
  started = false;
  shuffleEnabled = false;
  originQuiz = false;
  suggestedName = '';
  savedPlaylistId: string | null = null;
  notice: string | null = null;
  exhausted = false;
  loadToken = '';
  autoStart = false;
  sectionOverride: string | null = null;
  private consumedCompletion: string | null = null;
  private unavailableCount = 0;
  private generation = 0;
  private readonly uuid: () => string;
  private readonly random: () => number;

  constructor(options: { uuid?: () => string; random?: () => number } = {}) {
    this.uuid = options.uuid ?? (() => crypto.randomUUID());
    this.random = options.random ?? Math.random;
  }

  get playbackCompletionKey(): string | null {
    return this.originQuiz ? null : this.loadToken;
  }

  begin(originQuiz: boolean, name: string): number {
    this.generation += 1;
    this.active = true;
    this.loading = true;
    this.entries = [];
    this.originalEntries = [];
    this.index = 0;
    this.started = false;
    this.shuffleEnabled = false;
    this.originQuiz = originQuiz;
    this.suggestedName = name;
    this.savedPlaylistId = null;
    this.notice = null;
    this.exhausted = false;
    this.loadToken = this.uuid();
    this.autoStart = true;
    this.sectionOverride = null;
    this.consumedCompletion = null;
    this.unavailableCount = 0;
    return this.generation;
  }

  finishPreparation(
    expected: number,
    songs: readonly QueuedSong[],
    playlistId: string | null = null,
    shuffled = false,
  ): void {
    if (!this.active || expected !== this.generation) return;
    this.originalEntries = songs.slice();
    this.shuffleEnabled = shuffled;
    this.entries = shuffled ? fisherYates(songs, this.random) : songs.slice();
    this.savedPlaylistId = playlistId;
    this.loading = false;
    if (songs.length === 0) this.notice = 'No matching songs are available.';
    this.loadToken = this.uuid();
  }

  error(expected: number, message: string): void {
    if (this.active && expected === this.generation) {
      this.loading = false;
      this.notice = message;
    }
  }

  showNotice(message: string): void { this.notice = message; }
  markSaved(id: string): void { this.savedPlaylistId = id; this.notice = 'Playlist saved'; }

  toggleShuffle(): void {
    if (this.entries.length < 2) return;
    const current = this.entries[this.index] ?? null;
    this.shuffleEnabled = !this.shuffleEnabled;
    const shuffled = fisherYates(this.originalEntries, this.random);
    this.entries = this.shuffleEnabled
      ? (sameSongs(shuffled, this.originalEntries) ? shuffled.slice(1).concat(shuffled[0]) : shuffled)
      : this.originalEntries.slice();
    this.index = this.started && current
      ? Math.max(0, this.entries.indexOf(current))
      : 0;
    this.savedPlaylistId = null;
    this.notice = this.shuffleEnabled ? 'Queue shuffled' : 'Original order restored';
  }

  start(): void {
    if (this.entries.length === 0) return;
    this.started = true;
    this.autoStart = true;
    this.loadToken = this.uuid();
  }

  select(position: number, resume: boolean): void {
    if (position < 0 || position >= this.entries.length) return;
    this.started = true;
    this.index = position;
    this.unavailableCount = 0;
    this.exhausted = false;
    this.sectionOverride = null;
    this.autoStart = resume;
    this.consumedCompletion = null;
    this.loadToken = this.uuid();
  }

  changeSection(sectionId: string, resume: boolean): void {
    this.sectionOverride = sectionId;
    this.autoStart = resume;
    this.consumedCompletion = null;
    this.loadToken = this.uuid();
  }

  completed(token: string): boolean {
    if (!this.active || this.originQuiz || token !== this.loadToken
      || this.consumedCompletion === token || this.entries.length === 0) return false;
    this.consumedCompletion = token;
    if (this.index === this.entries.length - 1) {
      this.autoStart = false;
      this.notice = 'Queue finished';
      return false;
    }
    this.select(this.index + 1, true);
    return true;
  }

  unavailable(token: string, message: string): void {
    if (!this.active || token !== this.loadToken) return;
    this.unavailableCount += 1;
    this.notice = message;
    if (this.index < this.entries.length - 1) {
      const count = this.unavailableCount;
      this.select(this.index + 1, this.autoStart);
      this.unavailableCount = count;
    } else {
      this.autoStart = false;
      this.exhausted = true;
      this.notice = `No playable songs remain in this queue. ${message}`;
    }
  }

  dismiss(): void {
    this.generation += 1;
    this.active = false;
    this.loading = false;
    this.entries = [];
    this.originalEntries = [];
    this.started = false;
  }
}
