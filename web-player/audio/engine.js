export class AudioEngine {
  constructor() {
    const Tone = window.Tone;
    this.melodySynth = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.3 },
    }).toDestination();

    this.chordSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.02, decay: 0.15, sustain: 0.5, release: 0.4 },
    }).toDestination();

    this.parts = [];
    this.isSetup = false;
    this.tickId = null;
  }

  async setupTransport(bpm) {
    const Tone = window.Tone;
    if (!this.isSetup) {
      await Tone.start();
      Tone.Transport.bpm.value = bpm;
      Tone.Transport.position = 0;
      this.isSetup = true;
    } else {
      Tone.Transport.bpm.value = bpm;
      Tone.Transport.position = 0;
      Tone.Transport.cancel(0);
    }
  }

  scheduleMelody(notes) {
    const Tone = window.Tone;
    const part = new Tone.Part((time, note) => {
      if (note.isRest) return;
      this.melodySynth.triggerAttackRelease(note.name, note.duration, time);
      note.onTrigger?.();
    }, notes).start(0);
    this.parts.push(part);
  }

  scheduleChords(chords) {
    const Tone = window.Tone;
    const part = new Tone.Part((time, chord) => {
      if (!chord.notes?.length) return;
      this.chordSynth.triggerAttackRelease(chord.notes, chord.duration, time);
      chord.onTrigger?.();
    }, chords).start(0);
    this.parts.push(part);
  }

  play() {
    Tone.Transport.start();
  }

  pause() {
    Tone.Transport.pause();
  }

  stop() {
    const Tone = window.Tone;
    Tone.Transport.stop();
    Tone.Transport.position = 0;
    for (const part of this.parts) {
      part.cancel();
      part.dispose();
    }
    this.parts = [];
  }

  onTick(callback) {
    const Tone = window.Tone;
    if (this.tickId !== null) {
      Tone.Transport.clear(this.tickId);
    }
    this.tickId = Tone.Transport.scheduleRepeat((time) => {
      callback(Tone.Transport.ticks, time);
    }, "16n");
  }
}

