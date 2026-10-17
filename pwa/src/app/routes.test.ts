import { describe, expect, it } from 'vitest';
import { parseRoute } from './routes';
describe('stable local routes', () => {
  it('opens bookmarked screens and preserves song identifiers', () => {
    expect(parseRoute('/settings/')).toEqual({ kind: 'settings' });
    expect(parseRoute('/songs/blink-182%2Fall-the-small-things')).toEqual({ kind: 'song', slug: 'blink-182/all-the-small-things' });
    expect(parseRoute('/')).toEqual({ kind: 'library' });
    expect(parseRoute('/playback/blink-182%2Fall%20the%20small%20things')).toEqual({kind:'playback',slug:'blink-182/all the small things'});
    expect(parseRoute('/playback/%E2%99%AD%252F/')).toEqual({kind:'playback',slug:'♭%2F'});
  });
  it('rejects malformed identifiers and unknown screens without crashing', () => {
    expect(parseRoute('/songs/%ZZ')).toEqual({ kind: 'not-found' });
    expect(parseRoute('/missing')).toEqual({ kind: 'not-found' });
    for(const path of ['/playback/%ZZ','/playback','/playback/a/b'])expect(parseRoute(path)).toEqual({kind:'not-found'});
  });
});
