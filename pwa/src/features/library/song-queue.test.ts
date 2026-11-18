import { describe, expect, it } from 'vitest';
import {
  SongQueueSession, auralMeetsMinimumPopularity, orderedQueue, queuedSong, resolveQueuedSection, shuffledExampleQueue,
  type QueueCandidate,
} from './song-queue';

function candidate(slug: string, section: string, score: number | null): QueueCandidate {
  return { song: queuedSong(slug, slug, 'Artist', section, section), score };
}

function songs(count: number) {
  return Array.from({ length: count }, (_, i) => queuedSong(`song-${i}`, `Song ${i}`, 'Artist', 'section', 'Section'));
}

describe('orderedQueue', () => {
  it('popularity-orders all songs and deduplicates repeated sections', () => {
    const candidates: QueueCandidate[] = [];
    for (let i = 0; i < 31; i++) candidates.push(candidate(`song-${i}`, 'section-a', i / 100));
    candidates.push(candidate('song-30', 'section-a', 0.30));
    candidates.push(candidate('song-30', 'section-b', 0.30));
    candidates.push(candidate('below', 'section-a', 0.01));
    const queue = orderedQueue(candidates, 10, () => 0);
    expect(queue).toHaveLength(21);
    expect(queue[0].slug).toBe('song-30');
    expect(queue[queue.length - 1].slug).toBe('song-10');
    expect(queue.filter((song) => song.slug === 'song-30')).toHaveLength(1);
    expect(['section-a', 'section-b']).toContain(queue[0].sectionId);
  });

  it('rejects out-of-range popularity percents rather than inventing eligibility', () => {
    expect(auralMeetsMinimumPopularity(null, null)).toBe(true);
    expect(auralMeetsMinimumPopularity(0.5, 50)).toBe(true);
    expect(auralMeetsMinimumPopularity(0.49, 50)).toBe(false);
    expect(() => auralMeetsMinimumPopularity(1, 101)).toThrow(RangeError);
  });
});

describe('resolveQueuedSection', () => {
  const sections = [
    { key: 'intro', name: 'Intro' },
    { key: 'verse', name: 'Verse' },
    { key: 'chorus', name: 'Chorus' },
  ];
  it('uses the first song-order section when the saved id is empty', () => {
    expect(resolveQueuedSection(queuedSong('s', 'S', 'A', '', 'First section'), sections)).toBe('intro');
    expect(resolveQueuedSection(queuedSong('s', 'S', 'A', '', 'First section'), [])).toBeNull();
  });
  it('matches an exact section key before falling back to a unique name', () => {
    expect(resolveQueuedSection(queuedSong('s', 'S', 'A', 'chorus', 'Chorus'), sections)).toBe('chorus');
    expect(resolveQueuedSection(queuedSong('s', 'S', 'A', 'gone', 'Verse'), sections)).toBe('verse');
  });
  it('refuses ambiguous names and unknown ids rather than picking another passage', () => {
    const doubled = sections.concat({ key: 'verse-2', name: 'Verse' });
    expect(resolveQueuedSection(queuedSong('s', 'S', 'A', 'gone', 'Verse'), doubled)).toBeNull();
    expect(resolveQueuedSection(queuedSong('s', 'S', 'A', 'gone', 'Bridge'), sections)).toBeNull();
  });
});

describe('SongQueueSession', () => {
  it('previews popularity order and shuffle can be turned off', () => {
    let n = 0;
    const state = new SongQueueSession({ uuid: () => `t${++n}`, random: () => 0.75 });
    const generation = state.begin(true, 'I–V');
    const catalog = songs(10);
    state.finishPreparation(generation, catalog);
    expect(state.started).toBe(false);
    expect(state.shuffleEnabled).toBe(false);
    expect(state.entries).toEqual(catalog);
    state.toggleShuffle();
    expect(state.shuffleEnabled).toBe(true);
    expect(new Set(state.entries)).toEqual(new Set(catalog));
    expect(state.entries).not.toEqual(catalog);
    state.toggleShuffle();
    expect(state.shuffleEnabled).toBe(false);
    expect(state.entries).toEqual(catalog);
    state.start();
    expect(state.started).toBe(true);
    const token = state.loadToken;
    const current = state.entries[state.index];
    state.toggleShuffle();
    expect(state.entries[state.index]).toBe(current);
    expect(state.loadToken).toBe(token);
    state.toggleShuffle();
    expect(state.entries).toEqual(catalog);
    expect(state.entries[state.index]).toBe(current);
    expect(state.completed(token)).toBe(false);
    state.select(state.index + 1, true);
    expect(state.index).toBe(1);
    state.dismiss();
    expect(state.completed(state.loadToken)).toBe(false);
  });

  it('restores saved order when shuffle is turned off', () => {
    const state = new SongQueueSession({ uuid: () => 'u', random: () => 0.25 });
    const catalog = songs(6);
    state.finishPreparation(state.begin(false, 'Playlist'), catalog, null, true);
    expect(state.shuffleEnabled).toBe(true);
    state.toggleShuffle();
    expect(state.shuffleEnabled).toBe(false);
    expect(state.entries).toEqual(catalog);
    expect(state.started).toBe(false);
  });

  it('advances a saved playlist and preserves pause intent on manual select', () => {
    let n = 0;
    const state = new SongQueueSession({ uuid: () => `k${++n}` });
    state.finishPreparation(state.begin(false, 'Playlist'), songs(3));
    state.start();
    expect(state.playbackCompletionKey).toBe(state.loadToken);
    expect(state.completed(state.loadToken)).toBe(true);
    expect(state.index).toBe(1);
    expect(state.autoStart).toBe(true);
    state.select(0, false);
    expect(state.autoStart).toBe(false);
    const token = state.loadToken;
    state.select(-1, true);
    expect(state.loadToken).toBe(token);
    state.select(2, true);
    expect(state.autoStart).toBe(true);
    expect(state.completed(state.loadToken)).toBe(false);
    expect(state.index).toBe(2);
  });

  it('overrides the queued section and remounts with native resume intent', () => {
    let n = 0;
    const state = new SongQueueSession({ uuid: () => `sec${++n}` });
    state.finishPreparation(state.begin(false, 'Playlist'), songs(2));
    state.start();
    const token = state.loadToken;
    expect(state.sectionOverride).toBeNull();
    state.changeSection('verse', true);
    expect(state.sectionOverride).toBe('verse');
    expect(state.autoStart).toBe(true);
    expect(state.loadToken).not.toBe(token);
    expect(state.index).toBe(0);
    state.changeSection('chorus', false);
    expect(state.sectionOverride).toBe('chorus');
    expect(state.autoStart).toBe(false);
  });

  it('skips Aural example completion so the selected section does not auto-advance', () => {
    const state = new SongQueueSession({ uuid: () => 'aural' });
    state.finishPreparation(state.begin(true, 'Examples'), songs(3));
    state.start();
    expect(state.playbackCompletionKey).toBeNull();
    expect(state.completed(state.loadToken)).toBe(false);
    expect(state.index).toBe(0);
  });
});

describe('native SongQueueTest example shuffle (Android 1b86ef6c)', () => {
  const candidate = (slug: string, sectionId: string, score: number | null) => ({ song: queuedSong(slug, slug, 'Artist', sectionId, 'Chorus'), score });
  const seeded = (seed: number) => { let state = seed; return () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; }; };
  it('shuffledExampleQueueHonorsThePopularityCutoff', () => {
    const songs = [candidate('keep', 'a', 0.80), candidate('low', 'a', 0.79), candidate('zero', 'a', 0.0), candidate('perfect', 'a', 1.0),
      candidate('unscored', 'a', null), candidate('almost', 'a', 0.999)];
    const slugs = (percent: number | null) => new Set(shuffledExampleQueue(songs, percent, seeded(1)).map((song) => song.slug));
    expect(slugs(null)).toEqual(new Set(['keep', 'low', 'zero', 'perfect', 'unscored', 'almost']));
    expect(slugs(80)).toEqual(new Set(['keep', 'perfect', 'almost']));
    expect(slugs(0).has('zero')).toBe(true);
    expect(slugs(0).has('unscored')).toBe(false);
    expect(slugs(100)).toEqual(new Set(['perfect']));
  });
  it('shuffledExampleQueueRandomizesOneEntryPerSong', () => {
    const songs = [...Array.from({ length: 6 }, (_, i) => candidate(`song-${i}`, 'a', 1.0)), candidate('song-0', 'b', 1.0)];
    const queue = shuffledExampleQueue(songs, null, seeded(4));
    expect(new Set(queue.map((song) => song.slug)).size).toBe(6);
    expect(queue.find((song) => song.slug === 'song-0')?.sectionId).toBe('a');
  });
  it('examplePlaylistHoldsTheSongUntilTheListenerAdvances and remembers the chosen section', () => {
    const state = new SongQueueSession({ uuid: (() => { let n = 0; return () => `t${++n}`; })() });
    const songs = [0, 1, 2].map((i) => queuedSong(`song-${i}`, `Song ${i}`, 'Artist', '', 'Chorus'));
    state.finishPreparation(state.begin(false, 'Example songs', true, true), songs);
    state.start();
    const index = state.index;
    expect(state.playbackCompletionKey).toBeNull();
    expect(state.preferChorus).toBe(true);
    expect(state.completed(state.loadToken)).toBe(false);
    expect(state.index).toBe(index);
    state.rememberSection(state.loadToken, 'verse-id', 'Verse');
    expect(state.entries[index]).toMatchObject({ sectionId: 'verse-id', sectionName: 'Verse' });
    state.select(index + 1, true);
    expect(state.index).toBe(index + 1);
    state.toggleShuffle();
    expect(state.notice).toBe('Playlist shuffled');
  });
});
