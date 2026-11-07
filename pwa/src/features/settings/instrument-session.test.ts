import {describe,expect,it} from 'vitest';
import {Waveform} from '../../audio/synth';
import {InstrumentSessionOwner,type InstrumentPreferenceStore} from './instrument-session';

class FakeStore implements InstrumentPreferenceStore {
  constructor(public identifier:string|null=null){}
  readDefaultIdentifier():string|null {return this.identifier;}
  writeDefaultIdentifier(identifier:string):void {this.identifier=identifier;}
}

describe('unchanged native InstrumentSessionOwnerTest.kt',()=>{
  it('missingAndInvalidDefaultsUseClarinet',()=>{
    expect(new InstrumentSessionOwner(new FakeStore()).sessionInstrument).toBe(Waveform.CLARINET);
    expect(new InstrumentSessionOwner(new FakeStore('removed-instrument')).sessionInstrument).toBe(Waveform.CLARINET);
  });
  it('playbackSelectionSurvivesScreensWithoutChangingSavedDefault',()=>{
    const store=new FakeStore(Waveform.SAWTOOTH),applied:Waveform[]=[];
    const session=new InstrumentSessionOwner(store,instrument=>applied.push(instrument));
    session.selectForSession(Waveform.WARM_ORGAN);
    expect(session.sessionInstrument).toBe(Waveform.WARM_ORGAN);
    expect(session.defaultInstrument).toBe(Waveform.SAWTOOTH);
    expect(store.identifier).toBe(Waveform.SAWTOOTH);
    expect(applied.at(-1)).toBe(Waveform.WARM_ORGAN);
  });
  it('changingDefaultUpdatesTheSessionAndPersistsForRelaunch',()=>{
    const store=new FakeStore(),session=new InstrumentSessionOwner(store);
    session.selectForSession(Waveform.SINE);
    session.selectAsDefault(Waveform.ELECTRIC_PIANO);
    const relaunched=new InstrumentSessionOwner(store);
    expect(session.defaultInstrument).toBe(Waveform.ELECTRIC_PIANO);
    expect(session.sessionInstrument).toBe(Waveform.ELECTRIC_PIANO);
    expect(relaunched.sessionInstrument).toBe(Waveform.ELECTRIC_PIANO);
  });
});

describe('useSyncExternalStore snapshot cache',()=>{
  it('reuses the same snapshot object until a mutation',()=>{
    const session=new InstrumentSessionOwner(new FakeStore());
    expect(session.getSnapshot()).toBe(session.getSnapshot());
    const first=session.getSnapshot();
    session.selectForSession(Waveform.SINE);
    expect(session.getSnapshot()).not.toBe(first);
    expect(session.getSnapshot()).toBe(session.getSnapshot());
    expect(session.getSnapshot().session).toBe(Waveform.SINE);
  });
});
