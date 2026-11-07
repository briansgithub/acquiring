import {describe,expect,it} from 'vitest';
import {
  clampSingingOctaveOffset,
  effectiveTargetMidi,
  idealIntervalPlaybackMidis,
  resolveSingingTargetRequest,
  singingOctaveApi,
  singingOctaveOffsetLabel,
  singingOctaveSemitones,
  singingTargetNote,
  singingTargetRequest,
  targetPlaybackMidiInput,
} from './singing-octave';

const c4 = () => singingTargetNote(60, '1\u0302');
const g4 = () => singingTargetNote(67, '5\u0302');
const c5 = () => singingTargetNote(72, '1\u0302');

describe('unchanged native SingingTargets.kt, Kotlin2.2.10', () => {
  it('octaveOffsetLabelIsSigned', () => {
    expect(singingOctaveOffsetLabel(-1)).toBe('-1');
    expect(singingOctaveOffsetLabel(0)).toBe('0');
    expect(singingOctaveOffsetLabel(1)).toBe('+1');
    expect(singingOctaveOffsetLabel(9)).toBe('+3');
    expect(singingOctaveOffsetLabel(-8)).toBe('-2');
  });

  it('microphoneAndPlaybackApplyManualTransposeExactlyOnce', () => {
    const target = c4();
    expect(effectiveTargetMidi(target, 1, 1)).toBe(73);
    expect(targetPlaybackMidiInput(target, 1, 1)).toBe(72);
  });

  it('writtenOctaveLeavesTheSourceRegisterUntouched', () => {
    const target = singingTargetNote(84, '1\u0302');
    expect(effectiveTargetMidi(target, 2, 0)).toBe(86);
    expect(targetPlaybackMidiInput(target, 2, 0)).toBe(84);
  });

  it('requestShiftsBothSlotsByTheSameOctave', () => {
    const request = singingTargetRequest(g4(), c5(), 1);
    expect(resolveSingingTargetRequest(request, 0, -1)).toEqual([55, 60]);
  });

  it('requestWithoutAnOffsetOnlyAppliesManualTranspose', () => {
    const request = singingTargetRequest(c4(), g4(), 1);
    expect(resolveSingingTargetRequest(request, 3, 0)).toEqual([63, 70]);
    expect(resolveSingingTargetRequest(singingTargetRequest(c4(), null, 1), 0, 1)[1]).toBeNull();
  });
});

describe('unchanged native idealIntervalPlaybackMidis', () => {
  it('intervalCardPlaybackUsesAssignedIdealTargets', () => {
    const target = singingTargetRequest(c4(), g4(), 1);
    expect(idealIntervalPlaybackMidis(target, 0, 1)).toEqual([72, 79]);
    expect(idealIntervalPlaybackMidis(singingTargetRequest(c4(), null, 1), 0, 1)).toBeNull();
  });

  it('intervalCardPlaybackLeavesTheTransposeForAudioEngineToApply', () => {
    expect(idealIntervalPlaybackMidis(singingTargetRequest(c4(), g4(), 1), 2, 1)).toEqual([72, 79]);
  });

  it('intervalCardPlaybackWithoutATessituraUsesTheSourceRegister', () => {
    expect(idealIntervalPlaybackMidis(singingTargetRequest(c4(), g4(), 1), 4, 0)).toEqual([60, 67]);
  });
});

describe('browser integrity: Int bounds, freeze, source playback isolation', () => {
  it('rejects non-Int offsets/midi/transpose and clamps only after Int validation', () => {
    for (const value of [NaN, Infinity, 1.5, 2147483648, -2147483649, '0', null]) {
      expect(() => clampSingingOctaveOffset(value as number)).toThrow(RangeError);
      expect(() => singingOctaveSemitones(value as number)).toThrow(RangeError);
      expect(() => singingTargetNote(value as number, '1')).toThrow(RangeError);
      expect(() => effectiveTargetMidi(c4(), value as number, 0)).toThrow(RangeError);
    }
    expect(clampSingingOctaveOffset(3)).toBe(3);
    expect(clampSingingOctaveOffset(-2)).toBe(-2);
  });

  it('freezes notes/requests/resolved pairs and does not mutate inputs', () => {
    const note = c4();
    const request = singingTargetRequest(note, g4(), 7);
    expect(Object.isFrozen(note)).toBe(true);
    expect(Object.isFrozen(request)).toBe(true);
    const resolved = resolveSingingTargetRequest(request, 0, 1);
    const again = resolveSingingTargetRequest(request, 0, 1);
    expect(resolved).not.toBe(again);
    expect(resolved).toEqual(again);
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(request.first).toBe(note);
  });

  it('never applies singing octave or unused transpose to a distinct source register path', () => {
    const source = 60;
    expect(targetPlaybackMidiInput(singingTargetNote(source, '1'), 12, 0)).toBe(source);
    expect(targetPlaybackMidiInput(singingTargetNote(source, '1'), -12, 2)).toBe(source + 24);
    expect(Object.keys(singingOctaveApi)).toEqual([
      'clampSingingOctaveOffset',
      'singingOctaveOffsetLabel',
      'singingOctaveSemitones',
      'singingTargetNote',
      'singingTargetRequest',
      'effectiveTargetMidi',
      'targetPlaybackMidiInput',
      'resolveSingingTargetRequest',
      'idealIntervalPlaybackMidis',
    ]);
  });
});
