import { describe, expect, it } from 'vitest';
import { parseRoute } from './routes';
describe('stable local routes', () => {
  it('opens bookmarked screens and preserves song identifiers', () => {
    expect(parseRoute('/settings/')).toEqual({ kind: 'settings' });
    expect(parseRoute('/songs/blink-182%2Fall-the-small-things')).toEqual({ kind: 'song', slug: 'blink-182/all-the-small-things' });
    expect(parseRoute('/')).toEqual({ kind: 'library' });
  });
  it('rejects malformed identifiers and unknown screens without crashing', () => {
    expect(parseRoute('/songs/%ZZ')).toEqual({ kind: 'not-found' });
    expect(parseRoute('/missing')).toEqual({ kind: 'not-found' });
  });
});
