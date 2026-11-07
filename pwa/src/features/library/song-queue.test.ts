import { describe, expect, it } from 'vitest';
import {
  SongQueueSession, auralMeetsMinimumPopularity, orderedQueue, queuedSong, resolveQueuedSection,
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
