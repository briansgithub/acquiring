import {describe,expect,it} from 'vitest';
import {OCTAVE_OFFSET_MAX,OCTAVE_OFFSET_MIN} from './singing-octave';
import {parseSongOctaveOffsetValue,SongOctaveOffsetSession,type SongOctaveOffsetStore} from './song-octave-session';

class MemoryStore implements SongOctaveOffsetStore {
  readonly map=new Map<string,number>();
  async getOffset(slug:string):Promise<number|null> {return this.map.has(slug)?this.map.get(slug)!:null;}
  async upsert(slug:string,offset:number):Promise<void> {this.map.set(slug,offset);}
}

describe('unchanged native SongOctaveOffsetViewModel.kt',()=>{
  it('reenteringSameSessionKeepsTheOffset',async()=>{
    const state=new SongOctaveOffsetSession();
    await state.enterSession('song-a','song-a:verse');
    state.updateOctaveOffset(-1);
    await state.enterSession('song-a','song-a:verse');
    expect(state.octaveOffset).toBe(-1);
    expect(state.sessionKey).toBe('song-a:verse');
  });

  it('offsetIsClampedToTheAgreedRange',async()=>{
    const state=new SongOctaveOffsetSession();
    await state.enterSession('song-a','song-a:verse');
    state.updateOctaveOffset(-8);
    expect(state.octaveOffset).toBe(OCTAVE_OFFSET_MIN);
    state.updateOctaveOffset(9);
    expect(state.octaveOffset).toBe(OCTAVE_OFFSET_MAX);
    state.updateOctaveOffset(0);
    expect(state.octaveOffset).toBe(0);
  });

  it('changingSectionKeepsTheOffset',async()=>{
    const state=new SongOctaveOffsetSession();
    await state.enterSession('song-a','song-a:verse');
    state.updateOctaveOffset(-1);
    await state.enterSession('song-a','song-a:chorus');
    expect(state.octaveOffset).toBe(-1);
    expect(state.sessionKey).toBe('song-a:chorus');
  });

  it('enteringANewSongZerosTheInMemoryOffset',async()=>{
    const state=new SongOctaveOffsetSession();
    await state.enterSession('song-a','song-a:verse');
    state.updateOctaveOffset(2);
    await state.enterSession('song-b','song-b:verse');
    expect(state.octaveOffset).toBe(0);
    expect(state.songSlug).toBe('song-b');
  });

  it('leavingTheSongClearsTheSession',async()=>{
    const state=new SongOctaveOffsetSession();
    await state.enterSession('song-a','song-a:verse');
    state.updateOctaveOffset(2);
    state.clearSession();
    expect(state.sessionKey).toBeNull();
    expect(state.songSlug).toBeNull();
    expect(state.octaveOffset).toBe(0);
  });
});

describe('T06 songOctaveOffsets restore',()=>{
  it('restores a saved slug after a new song zeros memory',async()=>{
    const store=new MemoryStore();
    const first=new SongOctaveOffsetSession();
    first.attachStore(store);
    await first.enterSession('song-a','song-a:verse');
    first.updateOctaveOffset(2);
    await first.enterSession('song-b','song-b:verse');
    expect(first.octaveOffset).toBe(0);
    const second=new SongOctaveOffsetSession();
    second.attachStore(store);
    await second.enterSession('song-a','song-a:chorus');
    expect(second.octaveOffset).toBe(2);
    expect(second.songSlug).toBe('song-a');
  });

  it('clamps restored store values and parses {offset}',()=>{
    expect(parseSongOctaveOffsetValue({offset:2})).toBe(2);
    expect(parseSongOctaveOffsetValue(1)).toBe(1);
    expect(parseSongOctaveOffsetValue({offset:1.5})).toBeNull();
    expect(parseSongOctaveOffsetValue(null)).toBeNull();
  });
});
