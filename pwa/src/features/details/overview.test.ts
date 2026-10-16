import {expect,it} from 'vitest';
import type {ExtractedSection} from '../../contracts';
import {formatBeat,INFO_LIMITS,songOverview} from './overview';

it('projects native Info overview, mixed melody rests, preserved metadata order and key-at-beat progression without input mutation',()=>{
  const section:ExtractedSection={numericId:'9007199254740993',chords:[{root:5,beat:9},{root:1},{root:4,beat:0}],
    notes:{melody1:[null,3,{isRest:'TRUE'},{rest:true},{isRest:' true '},{}]},
    metadata:{endBeat:10,keys:[{tonic:'D',scale:'harmonicMinor',beat:9},{tonic:'C',scale:'major',beat:1}],
      tempos:[{bpm:90,beat:8},{bpm:'120',beat:1}],meters:[{numBeats:4,beat:1},{numBeats:3,beat:9}],youtube:{id:'a&list=b'}}};
  const original=JSON.stringify(section),info=songOverview(section,3);
  expect(info.rows).toEqual([{label:'Key',value:'C Major'},{label:'Tempo',value:'90 BPM'},{label:'Beats / measure',value:'4'},
    {label:'Length',value:'0:06'},{label:'Beats',value:'9 · 3 bars'},{label:'Chords',value:'3 (3 unique)'},{label:'Melody notes',value:'2 sounded / 4 total'}]);
  expect(info.changes).toEqual([{title:'Key changes',rows:[{label:'Beat 1',value:'C Major'},{label:'Beat 9',value:'D Harmonic Minor'}]},
    {title:'Tempo changes',rows:[{label:'Beat 8',value:'90 BPM'},{label:'Beat 1',value:'120 BPM'}]},
    {title:'Meter changes',rows:[{label:'Beat 1',value:'4 beats / measure'},{label:'Beat 9',value:'3 beats / measure'}]}]);
  expect(info.progression.map(row=>[row.beat,row.key.tonic])).toEqual([[1,'C'],[0,'C'],[9,'D']]);
  expect(info.progression[0].chord).toBe(section.chords[1]);expect(JSON.stringify(section)).toBe(original);
  expect(info.numericId).toBe('9007199254740993');expect(info.youtubeUrl).toBe('https://www.youtube.com/watch?v=a%26list%3Db');
});
it('preserves chord-only/defaults, array notes, fractional beats, native zero-tempo duration saturation and absent source',()=>{
  expect(songOverview({chords:[]},0)).toMatchObject({rows:[{label:'Key',value:'C Major'},{label:'Tempo',value:'120 BPM'},
    {label:'Chords',value:'0 (0 unique)'},{label:'Melody notes',value:'None — chords only'}],changes:[],progression:[],numericId:'',youtubeUrl:null});
  expect(songOverview({chords:[],metadata:{youtube:{id:null}}},0).youtubeUrl).toBeNull();
  const info=songOverview({chords:[],notes:[{},false,{rest:'True'}],metadata:{endBeat:'2.25',tempos:[{bpm:0}],meters:[{numBeats:3}]}},0);
  expect(info.rows).toContainEqual({label:'Length',value:'35791394:07'});
  expect(info.rows).toContainEqual({label:'Beats',value:'1.25 · 1 bars'});
  expect(info.rows).toContainEqual({label:'Melody notes',value:'1 sounded / 2 total'});
});
it('bounds new presentation resources and rejects imprecise numeric source IDs before rendering',()=>{
  const cases:ExtractedSection[]=[{chords:Array(INFO_LIMITS.chords+1).fill({})},
    {chords:[],metadata:{keys:Array(INFO_LIMITS.changes+1).fill({})}},
    {chords:[],metadata:{tempos:Array(INFO_LIMITS.changes+1).fill({})}},
    {chords:[],notes:Array(INFO_LIMITS.notes+1).fill(null)},
    {chords:[],numericId:9007199254740993}];
  for(const section of cases)expect(()=>songOverview(section,0)).toThrow();
});

it('keeps native Formatter half-up decimal beat labels, including negative rounded zero',()=>{
  // Frozen SongInfoChords.formatBeat uses JVM %.2f, not binary JS toFixed rounding.
  // Independently checked with the installed JBR Formatter; immutable guard receipt retained.
  expect([1.005,2.675,-1.005,1.015,-.001].map(formatBeat)).toEqual(['1.01','2.68','-1.01','1.02','-0']);
});

it('shows native optional complexity after chords, preserves zero and rounds to one decimal',()=>{
  const section={chords:[]} as Parameters<typeof songOverview>[0];
  for(const [score,value] of [[0,'0.0 / 100'],[77.05,'77.1 / 100'],[-1,'-1.0 / 100'],[101,'101.0 / 100']] as const){
    const rows=songOverview(section,0,score).rows,index=rows.findIndex(row=>row.label==='Complexity score');
    expect(rows[index].value).toBe(value);expect(rows[index-1].label).toBe('Chords');expect(rows[index+1].label).toBe('Melody notes');
  }
  expect(songOverview(section,0).rows.some(row=>row.label==='Complexity score')).toBe(false);
});
