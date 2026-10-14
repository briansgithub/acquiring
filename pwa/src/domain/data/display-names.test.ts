import { describe, expect, it } from 'vitest';
import { cleanDisplayName, displayArtist, displayTitle, formatDisplayName } from './index';

describe('Android CatalogDisplayName fixtures', () => {
  it('makes legacy slugs readable and preserves modern spellings', () => {
    for (const [input, expected] of [
      ['500-miles', '500 Miles'], ['the__long-and-winding_road', 'The Long And Winding Road'],
      ['dont-stop', 'Dont Stop'], ['the-proclaimers', 'The Proclaimers'],
    ]) expect(displayTitle(input)).toBe(expected);
    for (const name of ["AC/DC", "P!nk", "tUnE-yArDs", "blink-182's Greatest Hits",
      "Björk", "Don't Stop Me Now", "Jay-Z", "will.i.am", "boygenius", "girl in red"]) {
      expect(formatDisplayName(name)).toBe(name);
    }
    expect(displayArtist('blink-182')).toBe('blink-182');
    expect(displayArtist('queen')).toBe('queen');
  });
  it('cleans the native entity and Unicode fixtures', () => {
    expect(displayTitle('  Don&#39;t\n  Stop&nbsp;Me   Now  ')).toBe("Don't Stop Me Now");
    expect(displayArtist('Beyonce\u0301 &amp; Jay-Z')).toBe('Beyoncé & Jay-Z');
    expect(displayTitle('Rock &amp;#x2019;n&#x2019; Roll &mdash; Live')).toBe('Rock ’n’ Roll — Live');
    expect(displayTitle('Pok&eacute;mon &#127925;')).toBe('Pokémon 🎵');
    expect(displayTitle('One&#10;Two\u0000')).toBe('One Two');
    expect(displayTitle('&unknown; &#xD800;')).toBe('&unknown; &#xD800;');
    expect(displayTitle(null)).toBe('Unknown Title');
    expect(displayArtist(' \n&nbsp;\t')).toBe('Unknown Artist');
    expect(formatDisplayName('\u00a0')).toBeNull();
  });
  it('limits entities to two passes, rejects invalid scalars, and uses Java spaces', () => {
    expect(cleanDisplayName('&amp;amp;amp; &toString; &#x110000; &#2147483648;')).toBe('&amp; &toString; &#x110000; &#2147483648;');
    expect(cleanDisplayName('A\u0085B\u2003C\u001cD\ufeffE')).toBe('AB C D\ufeffE');
    for (const name of ['the-proclaimers', '500-miles', 'Rock &amp; Roll', 'Beyonce\u0301', 'AC/DC', 'tUnE-yArDs']) {
      const formatted = formatDisplayName(name);
      expect(formatDisplayName(formatted)).toBe(formatted);
    }
  });
});
