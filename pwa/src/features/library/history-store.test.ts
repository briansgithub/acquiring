import {describe,expect,it} from 'vitest';
import {addRecentArtist,addRecentSlug,canonicalArtistName,MAX_HISTORY} from './history-store';
import {songsForPlaylist} from './playlists';

describe('native HistoryManager.kt recents',()=>{
  it('moves a repeated slug to the front and keeps ten',()=>{
    let slugs:string[]=[];
    slugs=addRecentSlug(slugs,'first');
    slugs=addRecentSlug(slugs,'second');
    slugs=addRecentSlug(slugs,'first');
    expect(slugs).toEqual(['first','second']);
    for(let i=1;i<=12;i++)slugs=addRecentSlug(slugs,`s-${i}`);
    expect(slugs).toHaveLength(MAX_HISTORY);
    expect(slugs[0]).toBe('s-12');
    expect(slugs).not.toContain('first');
  });
  it('canonicalizes artists, de-dupes case-insensitively, and keeps ten',()=>{
    expect(canonicalArtistName('The-Artists')).toBe('The Artists');
    expect(addRecentArtist(addRecentArtist(addRecentArtist([],'The-Artists'),'Other, Artist'),'The Artists'))
      .toEqual(['The Artists','Other, Artist']);
    let names:string[]=[];
    for(let i=1;i<=12;i++)names=addRecentArtist(names,`Artist-${i}`);
    expect(names).toEqual(Array.from({length:10},(_,i)=>`Artist ${12-i}`));
  });
  it('ignores blank artists and hydrates recents in stored slug order',()=>{
    expect(addRecentArtist(['Kept'],null)).toEqual(['Kept']);
    expect(addRecentArtist(['Kept'],'   ')).toEqual(['Kept']);
    expect(songsForPlaylist(['newest','gone','oldest'],[
      {slug:'oldest',artist:'A',title:'Old',complexityRating:null},
      {slug:'newest',artist:'B',title:'New',complexityRating:null},
    ]).map(row=>row.slug)).toEqual(['newest','oldest']);
  });
});
