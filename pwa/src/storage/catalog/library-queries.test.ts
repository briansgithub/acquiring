import {expect,it} from 'vitest';
import {MAX_BROWSE_SLUGS,songBrowseBySlugsQuery,songPageQuery,type SongPageRequest} from './library-queries';
it('bounds every untrusted page before query execution',()=>{
  for(const request of [null,{},[],{mode:'sql',text:'x'},{mode:'search',text:3},{mode:'search',text:'x'.repeat(513)},{mode:'search',text:'a\0b'},
    ...[0,-1,101,1.5,NaN,Infinity,null].map(limit=>({mode:'search',text:'x',limit})),
    ...[-1,1.5,NaN,Infinity,1000001,null].map(offset=>({mode:'search',text:'x',offset}))]) {
    expect(()=>songPageQuery(request as SongPageRequest)).toThrow(/Invalid song/);
  }
});
it('keeps user text bound,including native wildcard/separator semantics,with one extra paging row',()=>{
  const text=" ' OR 1=1 --_% ";
  const query=songPageQuery({mode:'search',text,limit:100,offset:20});
  expect(query.sql).not.toContain(text);
  expect(query.bind).toEqual([text,text,101,20]);
  expect(query.limit).toBe(100);
  expect(songPageQuery({mode:'artist',text:'Artist-A'}).bind).toEqual(['Artist-A',21,0]);
});
it('binds slug IN lists and refuses oversized or untrusted values',()=>{
  expect(songBrowseBySlugsQuery([]).sql).toContain('WHERE 0');
  expect(songBrowseBySlugsQuery([]).bind).toEqual([]);
  const query=songBrowseBySlugsQuery(['a-alpha',"O'Brien"]);
  expect(query.sql).not.toContain('a-alpha');
  expect(query.sql).toContain('IN (?,?)');
  expect(query.bind).toEqual(['a-alpha',"O'Brien"]);
  expect(()=>songBrowseBySlugsQuery(['x'.repeat(513)])).toThrow(/Invalid song slug/);
  expect(()=>songBrowseBySlugsQuery(['ok','a\0b'])).toThrow(/Invalid song slug/);
  expect(()=>songBrowseBySlugsQuery(Array.from({length:MAX_BROWSE_SLUGS+1},(_,i)=>`s-${i}`))).toThrow(/Invalid song slug/);
});
