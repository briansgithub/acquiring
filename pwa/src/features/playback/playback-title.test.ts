import {it,expect} from 'vitest';
import {playbackFullTitle} from './playback-title';

it('composes native displayed title and nonblank artist, omitting absent artist',()=>{
 expect(playbackFullTitle({title:'a_song',artist:'an_artist'})).toBe('A Song by An Artist');
 for(const artist of [null,'',' \t\n '])expect(playbackFullTitle({title:'a_song',artist})).toBe('A Song');
 expect(playbackFullTitle({title:null,artist:null})).toBe('Unknown Title');
});
it('preserves full long title and Unicode/meaningful artist spelling without truncating sheet text',()=>{
 const title='A long title — with café, 🎵 and a final ending. '.repeat(12).trim();
 expect(playbackFullTitle({title,artist:'blink-182'})).toBe(title+' by blink-182');
 expect(playbackFullTitle({title:'Rock &amp; Roll',artist:'Beyonce\u0301 &amp; Jay-Z'})).toBe('Rock & Roll by Beyoncé & Jay-Z');
});
