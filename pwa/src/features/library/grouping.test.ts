import {describe,expect,it} from 'vitest';
import {alphabeticalGroup,alphabeticalGroups,browseEntry,canonicalMode,canonicalModes,complexityBucket,complexityGroups,complexityOnesDigit,fuzzySongMatches,groupsFor,libraryChromeVisible,modeGroups,modesInSections,toggledExpandedGroup} from './grouping';

describe('native AllSongsGroupingTest at801cf798',()=>{
  it('starts collapsed, switches one heading, and toggles the same heading closed',()=>{
    let selected:string|null=null;
    selected=toggledExpandedGroup(selected,'A');expect(selected).toBe('A');
    selected=toggledExpandedGroup(selected,'B');expect(selected).toBe('B');
    expect(toggledExpandedGroup(selected,'B')).toBeNull();
  });
  it('hides library chrome while search is focused',()=>{
    expect(libraryChromeVisible(false)).toBe(true);
    expect(libraryChromeVisible(true)).toBe(false);
  });
  it('orders A-Z then0-9 then symbols and classifies the native title cases',()=>{
    expect(alphabeticalGroups.map(g=>g.label).join('')).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#');
    for(const [title,expected] of [['  autumn leaves','A'],['007 Theme','0'],['7 Nation Army','7'],['99 Luftballons','9'],['!Song','#'],['  ','#'],[null,'#'],['ßong','#']])expect(alphabeticalGroup(title)).toBe(expected);
    expect(groupsFor('alphabetical')).toBe(alphabeticalGroups);
  });
  it('matches title or artist ignoring only case/spaces/hyphens/underscores',()=>{
    const song={title:'Beta Song',artist:'The White-Stripes'};
    for(const query of ['ETA_so','white stripes','WHITE_STRIPES','',' _- '])expect(fuzzySongMatches(song,query)).toBe(true);
    for(const query of ['bravo','beta\tsong','beta.song'])expect(fuzzySongMatches(song,query)).toBe(false);
    expect(fuzzySongMatches({title:null,artist:null},'x')).toBe(false);
    expect(fuzzySongMatches({title:null,artist:null},'')).toBe(true);
  });
  it('uses ten-point buckets, caps exact100 to9, and rejects absent/invalid ratings',()=>{
    for(const [rating,bucket] of [[0,0],[9.999,0],[10,1],[19.999,1],[90,9],[100,9]])expect(complexityBucket(rating!)).toBe(bucket);
    for(const rating of [null,-.1,100.1,NaN,Infinity,-Infinity])expect(complexityBucket(rating)).toBeNull();
    expect(complexityGroups.map(g=>g.label)).toEqual(['0-10','10-20','20-30','30-40','40-50','50-60','60-70','70-80','80-90','90-100','Unrated']);
    expect(groupsFor('complexity')).toBe(complexityGroups);
  });
  it('uses integer ones digits with exact100 in final9subgroup',()=>{
    for(const [rating,digit] of [[0,0],[10.9,0],[11,1],[9.999,9],[19.999,9],[100,9]])expect(complexityOnesDigit(rating!)).toBe(digit);
    for(const rating of [null,-.1,100.1,NaN,Infinity])expect(complexityOnesDigit(rating)).toBeNull();
  });
  it('preserves seven labels and current major/natural-minor aliases only',()=>{
    expect(modeGroups.map(g=>g.label)).toEqual(['Ionian (Major)','Dorian','Phrygian','Lydian','Mixolydian','Aeolian (minor)','Locrian']);
    for(const input of ['major','Ionian',' ION_IAN '])expect(canonicalMode(input)).toBe('ionian');
    for(const input of ['minor','natural_minor','natural-minor',' aeolian '])expect(canonicalMode(input)).toBe('aeolian');
    for(const input of ['harmonicMinor','phrygianDominant','__proto__',null,''])expect(canonicalMode(input)).toBeNull();
    expect(groupsFor('mode')).toBe(modeGroups);
    expect([...canonicalModes(modeGroups.map(g=>g.key))]).toEqual(modeGroups.map(g=>g.key));
  });
  it('reads all section key events without duplicate mode credit and ignores malformed keys',()=>{
    const sections=[{chords:[],metadata:{keys:[{scale:'major'},{scale:'dorian'},{scale:'dorian'}]}},{chords:[],metadata:{keys:[null,3,'major',[],{scale:17},{scale:'minor'},{scale:'major'}]}},{chords:[],metadata:{keys:'major'}},{chords:[]}];
    expect([...modesInSections(sections)]).toEqual(['ionian','dorian','aeolian']);
  });
  it('builds lightweight metadata without a payload and preserves raw names',()=>{
    expect(browseEntry({slug:'artist/song',artist:'Raw-Artist',title:'  7 Song'},100)).toEqual({slug:'artist/song',artist:'Raw-Artist',title:'  7 Song',alphaGroup:'7',complexityRating:100,complexityBucket:9});
    expect(browseEntry({slug:'x',artist:null,title:null})).toEqual({slug:'x',artist:null,title:null,alphaGroup:'#',complexityRating:null,complexityBucket:null});
    const fullSong={slug:'x',artist:null,title:null,dataBlob:new Uint8Array([1,2]),url:'source',status:'ready'};
    expect(browseEntry(fullSong)).toEqual({slug:'x',artist:null,title:null,alphaGroup:'#',complexityRating:null,complexityBucket:null});
  });
});
