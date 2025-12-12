export class AudioEngine {
  constructor() {
    const Tone = window.Tone;
    // Smoother envelope settings to prevent clicks/pops and jagged sound
    this.melodySynth = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.05, decay: 0.2, sustain: 0.7, release: 0.5 },
    }).toDestination();

    // Use single persistent PolySynth instance (matches reference implementation)
    // Triangle oscillator for chords (smoother than sine for chordal textures)
    // Volume set to -10dB to prevent clipping (matches reference default)
    this.chordSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      volume: -10,
    }).toDestination();

    this.parts = [];
    this.isSetup = false;
    this.tickId = null;
    this.currentChordNotes = null;
  }

  async setupTransport(bpm) {
    const Tone = window.Tone;
    Tone.Transport.bpm.value = bpm;
    Tone.Transport.position = 0;
    if (this.isSetup) {
      Tone.Transport.cancel(0);
    } else {
      this.isSetup = true;
    }
  }

  async startAudio() {
    const Tone = window.Tone;
    if (Tone.context.state !== "running") {
      await Tone.start();
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
      
      // Use single PolySynth instance with triggerAttackRelease (matches reference)
      // This plays all notes simultaneously with proper timing
      // PolySynth handles voice management automatically
      this.chordSynth.triggerAttackRelease(chord.notes, chord.duration, time);
      
      this.currentChordNotes = chord.notes;
      chord.onTrigger?.();
    }, chords).start(0);
    this.parts.push(part);
  }

  async play() {
    const Tone = window.Tone;
    await this.startAudio();
    Tone.Transport.start();
  }

  pause() {
    const Tone = window.Tone;
    Tone.Transport.pause();
  }

  stop() {
    const Tone = window.Tone;
    Tone.Transport.stop();
    Tone.Transport.position = 0;
    // Cancel all scheduled parts first
    for (const part of this.parts) {
      part.cancel();
      part.dispose();
    }
    this.parts = [];
    // Release all notes (don't dispose synths - keep them for next playback)
    try {
      if (this.melodySynth && typeof this.melodySynth.triggerRelease === "function") {
        this.melodySynth.triggerRelease();
      }
      if (this.chordSynth && typeof this.chordSynth.releaseAll === "function") {
        // Release all currently playing chord notes
        this.chordSynth.releaseAll();
      }
    } catch (e) {
      // Ignore errors if synths are already disposed
    }
    this.currentChordNotes = null;
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

  setMelodyVolume(volume) {
    // Volume in dB, range typically -60 to 0
    if (this.melodySynth) {
      this.melodySynth.volume.value = volume;
    }
  }

  setChordVolume(volume) {
    // Volume in dB, range typically -60 to 0
    if (this.chordSynth) {
      this.chordSynth.volume.value = volume;
    }
  }

  setTempo(bpm) {
    const Tone = window.Tone;
    Tone.Transport.bpm.value = bpm;
  }
}

