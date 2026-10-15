import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import native from './fixtures/native-stream.json';
import {
  arpeggioSlotProgress, arpeggioToneIndex, INSTRUMENTS, PlaybackAudioLayer as Layer,
  PlaybackChordMode as Mode, PlaybackPcmRenderer, STREAM_LIMITS, Waveform,
} from './index';
import type { PlaybackConfig, PlaybackTimeline, PlaybackTimelineEvent } from './index';

function rng(): () => number {
  let seed = 0x12345678;
  return () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
}
function config(overrides: Partial<PlaybackConfig> = {}): PlaybackConfig {
  return { bpm: 60, transpose: 0, waveform: Waveform.SAWTOOTH, chordMode: Mode.FULL,
    melodyGain: 1, chordGain: 1, arpeggiateCycles: 0, ...overrides };
}
function event(id: number, startBeat: number, endBeat: number, layer: Layer,
  fullMidiNotes: readonly number[], rootMidiNote: number | null = null): PlaybackTimelineEvent {
  return { id, startBeat, endBeat, layer, fullMidiNotes, rootMidiNote };
}
function timeline(): PlaybackTimeline {
  return { endBeat: 5, events: [event(1, 1, 5, Layer.CHORD, [48, 52, 55], 36), event(2, 1, 5, Layer.MELODY, [60])] };
}
function renderer(t: PlaybackTimeline = timeline(), c = config(), rate = 1000): PlaybackPcmRenderer {
  return new PlaybackPcmRenderer(t, c, rate, rng());
}
function audio(r: PlaybackPcmRenderer, frames: number, blockSize = 256): Int16Array {
  const out = new Int16Array(frames);
  for (let offset = 0; offset < frames; offset += blockSize) {
    const count = Math.min(blockSize, frames - offset);
    r.renderAudioInto(out.subarray(offset, offset + count));
  }
  return out;
}

describe('independent frozen native streaming scenarios', () => {
  it('matches26scripted scenarios/234blocks: PCM, onset offsets, beat clock and completion', () => {
    expect(native.authority).toBe('801cf7984171d772afc4406ddb5c79c0cb7fd20a');
    expect(native.cases).toHaveLength(26);
    for (const fixture of native.cases) {
      const waveform = fixture.waveform as Waveform;
      let c = config({ bpm: 600, waveform, melodyGain: 0.37, chordGain: 0.61, arpeggiateCycles: 0.5 });
      const t = { endBeat: 1.25, events: [event(1, 1, 1.24, Layer.CHORD, [48, 52, 55], 36),
        event(2, 1.03, 1.125, Layer.MELODY, [60]), event(3, 1.15, 1.22, Layer.MELODY, [0, -1, 64])] };
      const r = renderer(t, c, fixture.sampleRate);
      for (const block of fixture.blocks) {
        if (block.action === 'gain_tempo_zero') {
          c = { ...c, bpm: 300, melodyGain: 0.25, chordGain: 0.125 }; r.updateConfig(c);
        } else if (block.action === 'seek') r.seek(1.10);
        else if (block.action === 'pitch_mode_wave') {
          c = { ...c, waveform: waveform === Waveform.SINE ? Waveform.SAWTOOTH : Waveform.SINE,
            transpose: 12, chordMode: Mode.ROOT_ONLY, arpeggiateCycles: 2 }; r.updateConfig(c);
        } else if (block.action === 'freeze_mute') {
          c = { ...c, bpm: 0, melodyGain: 0, chordGain: 0, arpeggiateCycles: 4 }; r.updateConfig(c);
        } else if (block.action === 'replace_once') {
          c = { ...c, bpm: 600, waveform, transpose: 0, chordMode: Mode.FULL, melodyGain: 1, chordGain: 0.5, arpeggiateCycles: 0 };
          r.updateConfig(c);
          r.replaceTimeline({ startBeat: 0, endBeat: 0.05, completionKey: 'once', events: [
            event(8, 0, 0.05, Layer.CHORD, [60, 64, 67], 48), event(9, 0.01, 0.04, Layer.MELODY, [55])] });
        }
        const expected = Buffer.from(block.pcm16le, 'base64');
        expect(createHash('sha256').update(expected).digest('hex')).toBe(block.sha256);
        const samples = new Int16Array(block.frames);
        const actual = r.renderInto(samples);
        const label = `${fixture.waveform}/${fixture.sampleRate}/${block.action}`;
        expect(actual.startBeat, label).toBe(block.startBeat);
        expect(actual.beatsPerFrame, label).toBe(block.beatsPerFrame);
        expect(actual.startedEvents.map(({ id, frameOffset }) => [id, frameOffset]), label).toEqual(block.startedEvents);
        expect(r.currentBeat, label).toBe(block.currentBeat);
        expect(r.finished, label).toBe(block.finished);
        let maximumDifference = 0;
        samples.forEach((sample, i) => { maximumDifference = Math.max(maximumDifference, Math.abs(sample - expected.readInt16LE(i * 2))); });
        expect(maximumDifference, label).toBe(0);
      }
    }
  });
});

describe('native renderer timing and lifetime regressions', () => {
  it('keeps fractional arpeggio cycles and every tone before a beat restart', () => {
    for (const [elapsed, cycles, expected] of [[4 / 3, 0.25, 1], [4 - 1e-9, 0.25, 2], [4, 0.25, 0],
      [3 - 1e-9, 1 / 3, 2], [3, 1 / 3, 0], [2 - 1e-9, 0.5, 2], [2, 0.5, 0]]) {
      expect(arpeggioToneIndex(elapsed, 3, cycles)).toBe(expected);
    }
    expect(Array.from({ length: 6 }, (_, slot) => arpeggioToneIndex(slot / 6, 3, 2))).toEqual([0, 1, 2, 0, 1, 2]);
    expect(Array.from({ length: 16 }, (_, slot) => arpeggioToneIndex(slot / 16, 4, 4))).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3]);
    expect(arpeggioToneIndex(1 - 1e-9, 4, 4)).toBe(3);
    expect(arpeggioToneIndex(1, 4, 4)).toBe(0);
    expect(arpeggioToneIndex(0.75, 4, 0)).toBe(0);
    expect(arpeggioToneIndex(-1, 3, 1)).toBe(0);
    expect(arpeggioSlotProgress(0.125, 3, 1)).toBe(0.375);
  });

  it('emits dense simultaneous onsets at native output frame offsets', () => {
    const r = renderer({ endBeat: 2, events: [event(1, 1.1, 1.2, Layer.MELODY, [60]),
      event(2, 1.1, 1.5, Layer.CHORD, [48, 52, 55]), event(3, 1.25, 1.3, Layer.MELODY, [62])] });
    const block = r.renderInto(new Int16Array(400));
    expect(block.startedEvents.map((e) => e.id)).toEqual([1, 2, 3]);
    expect(block.startedEvents[0].frameOffset).toBeGreaterThanOrEqual(99);
    expect(block.startedEvents[0].frameOffset).toBeLessThanOrEqual(101);
    expect(block.startedEvents[1].frameOffset).toBe(block.startedEvents[0].frameOffset);
    expect(block.startedEvents[2].frameOffset).toBeGreaterThanOrEqual(249);
    expect(block.startedEvents[2].frameOffset).toBeLessThanOrEqual(251);
  });

  it('wraps loop heads once each and play-once completion drains to silence at the end beat', () => {
    const t = { endBeat: 1.5, events: [event(7, 1, 1.1, Layer.MELODY, [60])] };
    const loop = renderer(t), once = renderer({ ...t, completionKey: 'entry-1' });
    expect(loop.renderInto(new Int16Array(1100)).startedEvents.map((e) => e.frameOffset)).toEqual([0, 500, 1000]);
    expect(loop.currentBeat).toBeCloseTo(1.1, 9);
    expect(loop.finished).toBe(false);
    expect(once.renderInto(new Int16Array(1100)).startedEvents.map((e) => e.frameOffset)).toEqual([0]);
    expect(once.currentBeat).toBe(1.5);
    expect(once.finished).toBe(true);
    expect(audio(once, 512).every((sample) => sample === 0)).toBe(true);
    expect(once.currentBeat).toBe(1.5);
  });

  it('seek clamps and resets voice phase/age while replacement activates intersecting events without new onset receipts', () => {
    const r = renderer(), fresh = renderer();
    audio(r, 333); r.seek(-100); fresh.seek(1);
    expect(audio(r, 512)).toEqual(audio(fresh, 512));
    r.seek(100); expect(r.currentBeat).toBe(5);
    r.replaceTimeline({ startBeat: 2, endBeat: 4, events: [event(9, 2, 4, Layer.CHORD, [48, 55])] }, 3);
    expect(r.currentBeat).toBe(3);
    const block = r.renderInto(new Int16Array(256));
    expect(block.startedEvents).toEqual([]);
    expect(r.currentBeat).toBeCloseTo(3.256, 9);
  });

  it('tempo and arpeggio/root/pitch updates preserve beat and crossfade without a silent block', () => {
    const r = renderer(); audio(r, 500);
    expect(r.currentBeat).toBeCloseTo(1.5, 9);
    r.updateConfig(config({ bpm: 120 })); audio(r, 250);
    expect(r.currentBeat).toBeCloseTo(2, 9);
    for (const change of [config({ bpm: 120, chordMode: Mode.ROOT_ONLY, transpose: 12 }),
      config({ bpm: 120, arpeggiateCycles: 2 }), config({ bpm: 120, waveform: Waveform.FLUTE })]) {
      const before = r.currentBeat;
      r.updateConfig(change);
      expect(r.currentBeat).toBe(before);
      expect(audio(r, 125).some((sample) => sample !== 0)).toBe(true);
      expect(r.currentBeat).toBeCloseTo(before + 0.25, 9);
    }
  });

  it('keeps long events in bounded caller blocks and zero BPM freezes beat while voices continue', () => {
    const r = renderer({ endBeat: 302, events: [event(1, 1, 301, Layer.CHORD, [48, 52, 55])] });
    for (let i = 0; i < 40; i++) expect(audio(r, 256).some((sample) => sample !== 0)).toBe(true);
    expect(r.currentBeat).toBeCloseTo(11.24, 8);
    r.updateConfig(config({ bpm: -10 })); const beat = r.currentBeat;
    expect(audio(r, 256).some((sample) => sample !== 0)).toBe(true);
    expect(r.currentBeat).toBe(beat);
  });

  it('every preset preserves PCM and onset continuity across irregular blocks and the audio/diagnostic paths', () => {
    for (const { waveform } of INSTRUMENTS) {
      const t = { endBeat: 1.5, events: [event(1, 1, 1.4, Layer.CHORD, [48, 52, 55]), event(2, 1.1, 1.3, Layer.MELODY, [60])] };
      const whole = renderer(t, config({ waveform })), chunks = renderer(t, config({ waveform })), realtime = renderer(t, config({ waveform }));
      const expected = new Int16Array(1100), actual = new Int16Array(1100);
      const metadata = whole.renderInto(expected), starts: { id: number; frameOffset: number }[] = [];
      let offset = 0;
      for (const frames of [0, 1, 37, 223, 256, 583]) {
        const block = chunks.renderInto(actual.subarray(offset, offset + frames));
        starts.push(...block.startedEvents.map((e) => ({ id: e.id, frameOffset: e.frameOffset + offset })));
        offset += frames;
      }
      expect(actual, waveform).toEqual(expected);
      expect(starts).toEqual(metadata.startedEvents);
      expect(audio(realtime, 1100, 127), waveform).toEqual(expected);
      expect(chunks.currentBeat).toBe(whole.currentBeat);
      expect(realtime.currentBeat).toBe(whole.currentBeat);
    }
  });

  it('root-only uses harmonic root, filters native nonpositive sentinels and leaves melody unmodified', () => {
    const root = renderer({ endBeat: 5, events: [event(1, 1, 5, Layer.CHORD, [60, 64, 67], 36)] }, config({ chordMode: Mode.ROOT_ONLY }));
    const explicit = renderer({ endBeat: 5, events: [event(1, 1, 5, Layer.CHORD, [36])] });
    expect(audio(root, 1024)).toEqual(audio(explicit, 1024));
    const filtered = renderer({ endBeat: 5, events: [event(1, 1, 5, Layer.MELODY, [0, -1, 60])] }, config({ chordMode: Mode.ROOT_ONLY }));
    const melody = renderer({ endBeat: 5, events: [event(1, 1, 5, Layer.MELODY, [60])] });
    expect(audio(filtered, 512)).toEqual(audio(melody, 512));
    const absent = renderer({ endBeat: 5, events: [event(1, 1, 5, Layer.CHORD, [60])] }, config({ chordMode: Mode.ROOT_ONLY }));
    expect(absent.renderInto(new Int16Array(512)).startedEvents).toEqual([]);
    expect(audio(absent, 512).every((sample) => sample === 0)).toBe(true);
  });

  it('gain updates ramp across the caller block and zero-length native blocks settle gains immediately', () => {
    const r = renderer(), immediate = renderer(); audio(r, 333); audio(immediate, 333);
    r.updateConfig(config({ melodyGain: 0, chordGain: 0 }));
    immediate.updateConfig(config({ melodyGain: 0, chordGain: 0 }));
    const before = immediate.currentBeat;
    immediate.renderAudioInto(new Int16Array(0));
    expect(immediate.currentBeat).toBe(before);
    expect(audio(immediate, 256).every((sample) => sample === 0)).toBe(true);
    expect(audio(r, 256).some((sample) => sample !== 0)).toBe(true);
    expect(audio(r, 256).every((sample) => sample === 0)).toBe(true);
  });
});

describe('native streaming gain, headroom and envelope channels', () => {
  function stream(waveform: Waveform, balance: number, chordGain = 1 - balance, arpeggiated = false, transpose = 0): Int16Array {
    const t = { endBeat: 5, events: [event(1, 1, 5, Layer.CHORD, [48, 52, 55, 58, 62, 65, 69].map((n) => n + transpose), 48 + transpose),
      event(2, 1, 5, Layer.MELODY, [72])] };
    return audio(renderer(t, config({ bpm: 120, waveform, melodyGain: balance, chordGain,
      arpeggiateCycles: arpeggiated ? 1 : 0 }), 44_100), 88_200);
  }

  it('all13presets retain native234dense chord/arpeggio/register/balance headroom cases', () => {
    for (const { waveform } of INSTRUMENTS) for (const transpose of [-12, 0, 12]) {
      for (const arp of [false, true]) for (const balance of [0, 0.5, 1]) {
        const samples = stream(waveform, balance, 1 - balance, arp, transpose);
        expect(samples.some((sample) => sample !== 0), `${waveform} silent`).toBe(true);
        expect(samples.every((sample) => sample !== 32767 && sample !== -32768), `${waveform} clips`).toBe(true);
      }
    }
  }, 30_000);

  it('every preset preserves native stream mute and quarter gain within one PCM quantum', () => {
    for (const { waveform } of INSTRUMENTS) {
      const full = stream(waveform, 0.5, 0.5), quarter = stream(waveform, 0.125, 0.125);
      let error = 0;
      full.forEach((sample, i) => { error = Math.max(error, Math.abs(quarter[i] - sample * 0.25)); });
      expect(error, waveform).toBeLessThanOrEqual(1);
      expect(stream(waveform, 0, 0).every((sample) => sample === 0), waveform).toBe(true);
    }
  }, 30_000);

  it('sine loop seams and arpeggio slot boundaries keep native continuity and envelope dips', () => {
    const t = { endBeat: 3, events: [event(1, 1, 3, Layer.CHORD, [48, 52, 55], 48)] };
    const loop = audio(renderer(t, config({ bpm: 120, waveform: Waveform.SINE }), 44_100), 66_150);
    let slew = 0;
    for (let i = 44_100 - 512; i < 44_100 + 512; i++) slew = Math.max(slew, Math.abs(loop[i] - loop[i - 1]));
    expect(slew / 32767).toBeLessThan(0.15);
    function dip(cycles: number): number {
      const samples = audio(renderer(t, config({ bpm: 120, waveform: Waveform.SINE, melodyGain: 0,
        chordGain: 1, arpeggiateCycles: cycles }), 44_100), 66_150);
      const slotFrames = 22_050 / 12;
      function peak(centre: number, half: number): number {
        let value = 0;
        for (let i = Math.max(0, centre - half); i <= Math.min(samples.length - 1, centre + half); i++) value = Math.max(value, Math.abs(samples[i]));
        return value;
      }
      let sum = 0;
      for (let slot = 12; slot < 24; slot++) sum += peak(Math.trunc(slot * slotFrames), 12) / peak(Math.trunc(slot * slotFrames + slotFrames / 2), 300);
      return sum / 12;
    }
    const arpeggio = dip(4);
    expect(arpeggio).toBeLessThan(0.15);
    expect(dip(0)).toBeGreaterThan(arpeggio * 3);
  });
});

describe('bounded streaming inputs and transition resources', () => {
  it('snapshots caller arrays/config so later mutation cannot change active or future voices', () => {
    const notes = [60], events = [{ ...event(1, 1, 4, Layer.MELODY, notes) }], t = { endBeat: 5, events }, c = config();
    const r = renderer(t, c), reference = renderer(t, c);
    notes[0] = 72; events[0].startBeat = 4; events.length = 0;
    (c as { bpm: number }).bpm = 600;
    expect(audio(r, 1024)).toEqual(audio(reference, 1024));
  });

  it('rejects invalid timelines/configs/frequencies before RNG or active-state changes', () => {
    let calls = 0;
    const make = (t: PlaybackTimeline, c = config(), rate = 1000) => new PlaybackPcmRenderer(t, c, rate, () => { calls++; return 0.5; });
    for (const rate of [NaN, Infinity, 0, 999, 1000.5, 384001]) expect(() => make(timeline(), config(), rate)).toThrow(RangeError);
    for (const bpm of [NaN, Infinity, 1001]) expect(() => make(timeline(), config({ bpm }))).toThrow(RangeError);
    for (const gain of [NaN, Infinity]) expect(() => make(timeline(), config({ chordGain: gain }))).toThrow(RangeError);
    for (const transpose of [NaN, 0.5, 2147483647]) expect(() => make(timeline(), config({ transpose }))).toThrow(RangeError);
    for (const invalid of [
      { ...timeline(), endBeat: NaN }, { ...timeline(), startBeat: 5 }, { ...timeline(), endBeat: 1e7 },
      { ...timeline(), events: Array(STREAM_LIMITS.events + 1).fill(event(1, 1, 2, Layer.MELODY, [60])) },
      { ...timeline(), events: [event(1, 2, 3, Layer.MELODY, [60]), event(2, 1, 2, Layer.MELODY, [60])] },
      { ...timeline(), events: [event(1, 1, 1, Layer.MELODY, [60])] },
      { ...timeline(), events: [event(Number.MAX_SAFE_INTEGER + 1, 1, 2, Layer.MELODY, [60])] },
      { ...timeline(), events: [event(1, 1, 2, Layer.MELODY, [NaN])] },
      { ...timeline(), events: [event(1, 1, 2, Layer.MELODY, Array(33).fill(60))] },
      { ...timeline(), events: [event(1, 1, 2, Layer.MELODY, [2147483647])] },
      { ...timeline(), events: [event(1, 1, 2, 'invalid' as Layer, [60])] },
    ]) expect(() => make(invalid)).toThrow(RangeError);
    expect(() => make(timeline(), config({ chordMode: 'invalid' as Mode }))).toThrow(RangeError);
    expect(calls).toBe(0);
  });

  it('rejects overlapping voices, aggregate delay and rapid crossfade cohorts without corrupting a valid render', () => {
    const dense = { endBeat: 5, events: [event(1, 1, 5, Layer.CHORD, Array(32).fill(48)), event(2, 1, 5, Layer.MELODY, Array(32).fill(60))] };
    expect(() => renderer({ ...dense, events: [...dense.events, event(3, 1, 5, Layer.MELODY, [60])] })).toThrow(RangeError);
    expect(() => renderer({ endBeat: 5, events: [event(1, 1, 5, Layer.CHORD, Array(32).fill(1))] }, config({ waveform: Waveform.STRINGS }), 384_000)).toThrow(RangeError);
    const r = renderer(dense, config({ waveform: Waveform.SINE })), reference = renderer(dense, config({ waveform: Waveform.SINE }));
    audio(r, 32); audio(reference, 32);
    r.updateConfig(config()); reference.updateConfig(config());
    expect(() => r.updateConfig(config({ waveform: Waveform.TRIANGLE }))).toThrow(RangeError);
    expect(audio(r, 128)).toEqual(audio(reference, 128));
    expect(() => r.updateConfig(config({ waveform: Waveform.TRIANGLE }))).not.toThrow();
  });

  it('budgets events at and beyond the timeline end before native seek(end) can allocate voices', () => {
    const events = [event(1, 5, 6, Layer.CHORD, Array(32).fill(48)), event(2, 5, 6, Layer.MELODY, Array(32).fill(60))];
    const r = renderer({ endBeat: 5, events });
    expect(() => r.seek(5)).not.toThrow();
    expect(r.currentBeat).toBe(5);
    let calls = 0;
    expect(() => new PlaybackPcmRenderer({ endBeat: 5, events: [...events, event(3, 5, 6, Layer.MELODY, [60])] },
      config(), 1000, () => { calls++; return 0.5; })).toThrow(RangeError);
    expect(calls).toBe(0);
    // Adjacent64voice cohorts overlap by native early-onset EPSILON and are bounded too.
    const adjacent = [event(1, 1, 2, Layer.CHORD, Array(32).fill(48)), event(2, 1, 2, Layer.MELODY, Array(32).fill(60)),
      event(3, 2, 3, Layer.MELODY, [60])];
    expect(() => renderer({ endBeat: 5, events: adjacent })).toThrow(RangeError);
  });

  it('invalid updates/seeks/replacements/block requests leave current state and output untouched', () => {
    const r = renderer(), reference = renderer(); audio(r, 211); audio(reference, 211);
    const before = r.currentBeat, out = new Int16Array(32).fill(123);
    expect(() => r.updateConfig(config({ bpm: Infinity }))).toThrow(RangeError);
    expect(() => r.updateConfig(config({ transpose: 1000 }))).toThrow(RangeError);
    expect(() => r.seek(NaN)).toThrow(RangeError);
    expect(() => r.replaceTimeline({ endBeat: 1, events: [] })).toThrow(RangeError);
    for (const count of [-1, 33, NaN, 0.5]) expect(() => r.renderAudioInto(out, count)).toThrow(RangeError);
    expect(() => r.renderInto(new Int16Array(STREAM_LIMITS.blockFrames + 1))).toThrow(RangeError);
    expect(out.every((sample) => sample === 123)).toBe(true);
    expect(r.currentBeat).toBe(before);
    expect(audio(r, 512)).toEqual(audio(reference, 512));
  });

  it('rejects tiny-loop onset/excitation amplification before block writes, including ignored-note timelines', () => {
    const t = { endBeat: 1.00001, events: Array.from({ length: 32 }, (_, i) => event(i, 1, 1.00001, Layer.MELODY, [48])) };
    const r = renderer(t, config({ bpm: 1000 })); const out = new Int16Array(65536).fill(321);
    expect(() => r.renderInto(out)).toThrow(RangeError);
    expect(r.currentBeat).toBe(1);
    expect(out.every((sample) => sample === 321)).toBe(true);
    const ignored = renderer({ ...t, events: Array.from({ length: 4096 }, (_, i) => event(i, 1, 1.00001, Layer.MELODY, [0])) }, config({ bpm: 1000 }));
    expect(() => ignored.renderAudioInto(out)).toThrow(RangeError);
    const pluck = renderer({ endBeat: 1.001, events: [event(1, 1, 1.001, Layer.CHORD, Array(32).fill(1))] }, config({ waveform: Waveform.STRINGS, bpm: 1000 }), 48000);
    expect(() => pluck.renderAudioInto(out)).toThrow(RangeError);
    for (const args of [[NaN, 3, 1], [1, 33, 1], [Number.MAX_VALUE, 3, 4]]) {
      expect(() => arpeggioToneIndex(...args as [number, number, number])).toThrow(RangeError);
    }
  });
});
