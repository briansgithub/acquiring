import {describe,it,expect} from 'vitest';
import type {ExtractedSection} from '../../contracts';
import {PitchTrackingMode,type ExclusivePitchSource,type PitchResult} from '../../audio/capture';
import {PersistentRootTargets,rootGaugeBarTop} from './persistent-root-target';
import {PersistentPlaybackPitchController,effectiveTargetMidi,retargetPitchResult} from './persistent-pitch';

const section:ExtractedSection={chords:[{root:1,type:5,beat:1,duration:1},{root:1,type:5,beat:2,duration:1},{isRest:true,beat:3,duration:1},{root:5,type:5,beat:4,duration:1}],metadata:{keys:[{tonic:'D',scale:'major',beat:1},{tonic:'C',scale:'minor',beat:2}]}};
class Source implements ExclusivePitchSource{
 current:PitchResult={kind:'no-signal'};ownsMicrophone=false;modes:PitchTrackingMode[]=[];starts:number[]=[];targets:number[]=[];
 claim(mode=PitchTrackingMode.STANDARD){this.modes.push(mode);this.ownsMicrophone=true;}
 start(midi:number){this.starts.push(midi);}retarget(midi:number){this.targets.push(midi);}stop(){this.ownsMicrophone=false;}release(){this.stop();}
}
describe('pinned SimpleRoot product target contracts',()=>{
 it('uses normalized source root register and first-section Ionian context through modulation',()=>{
  const roots=new PersistentRootTargets(section);
  expect(roots.atBeat(1,false)).toMatchObject({sourceMidi:50,label:'1̂',position:{kind:'simple-root'}});
  expect(roots.atBeat(2,false)).toMatchObject({sourceMidi:48,label:'1̂'});
  expect(roots.atBeat(2,true)).toMatchObject({sourceMidi:60,label:'♭7̂'});
  expect(roots.atBeat(3,false)).toBeNull();expect(roots.atBeat(3,true)).toBeNull();
  expect(roots.atBeat(4,false)?.sourceMidi).toBe(55);
 });
 it('claims STANDARD once and retargets root/context/manual-transpose/octave without shifting measured pitch',()=>{
  const roots=new PersistentRootTargets(section),source=new Source(),controller=new PersistentPlaybackPitchController(source);
  const first=roots.atBeat(1,false)!;controller.activate({kind:'simple-root'},effectiveTargetMidi(first,7,1),true);
  expect(source.modes).toEqual([PitchTrackingMode.STANDARD]);expect(source.starts).toEqual([69]);
  const next=effectiveTargetMidi(roots.atBeat(2,true)!,7,1);expect(next).toBe(79);controller.updateTarget(next);
  expect(source.targets).toEqual([79]);expect(source.starts).toEqual([69]);expect(source.modes).toHaveLength(1);
  const captured={kind:'estimate' as const,midi:69.1,centsError:10,isHeld:true,confidence:.9};
  expect(retargetPitchResult(captured,next)).toEqual({...captured,centsError:(69.1-79)*100});
  expect(captured.midi).toBe(69.1);
 });
 it('latches unresolved roots at untransposed MIDI60; cancelled permission cannot restart',()=>{
  const roots=new PersistentRootTargets(section),source=new Source(),controller=new PersistentPlaybackPitchController(source);
  expect(roots.atBeat(3,false)).toBeNull();controller.activate({kind:'simple-root'},null,false);controller.cancel();controller.onPermissionResult(true);expect(source.starts).toEqual([]);
  controller.activate({kind:'simple-root'},null,true);expect(source.starts).toEqual([60]);expect(source.modes.every(m=>m===PitchTrackingMode.STANDARD)).toBe(true);
 });
 it('positions an8px bar with native ±200-cent edges and ±1.2 pin clamp',()=>{
  expect(rootGaugeBarTop(0)).toBe('calc(50% + -4px)');expect(rootGaugeBarTop(200)).toBe('calc(0% + 0px)');expect(rootGaugeBarTop(-200)).toBe('calc(100% + -8px)');
  expect(rootGaugeBarTop(999)).toBe(rootGaugeBarTop(240));expect(rootGaugeBarTop(-999)).toBe(rootGaugeBarTop(-240));
 });
});
