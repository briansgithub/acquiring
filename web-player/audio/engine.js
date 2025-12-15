export class AudioEngine {
  constructor() {
    const Tone = window.Tone;
    // Smoother envelope settings to prevent clicks/pops and jagged sound
    // Square oscillator for melody (clear and distinct)
    this.melodySynth = new Tone.Synth({
      oscillator: { type: "square" },
      envelope: { attack: 0.05, decay: 0.2, sustain: 0.7, release: 0.5 },
    }).toDestination();

    // Use single persistent PolySynth instance (matches reference implementation)
    // Square oscillator for chords (matches melody for consistent timbre)
    // Volume set to 0dB to match melody volume
    this.chordSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "square" },
      volume: 0,
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
      // Reset tickId since the scheduled event is now gone
      this.tickId = null;
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

  scheduleMelody(events) {
    const Tone = window.Tone;
    // Events now contain both Attack and Release types
    const part = new Tone.Part((time, event) => {
      if (event.type === "attack") {
        this.melodySynth.triggerAttack(event.name, time);
        event.onTrigger?.();
      } else if (event.type === "release") {
        this.melodySynth.triggerRelease(time);
      }
    }, events).start(0);
    this.parts.push(part);
  }

  scheduleChords(events) {
    const Tone = window.Tone;
    const part = new Tone.Part((time, event) => {
      // Logic for explicit Attack/Release
      if (!event.notes?.length) return;

      if (event.type === "attack") {
        this.chordSynth.triggerAttack(event.notes, time);
        this.currentChordNotes = event.notes;
        event.onTrigger?.();
      } else if (event.type === "release") {
        this.chordSynth.triggerRelease(event.notes, time);
        // Optional: clear currentChordNotes if needed, but not critical
      }
    }, events).start(0);
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
    // Silence all currently playing notes to prevent hanging sounds
    if (this.melodySynth) this.melodySynth.releaseAll();
    if (this.chordSynth) this.chordSynth.releaseAll();
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

  previewChord(notes, duration = "8n") {
    const Tone = window.Tone;
    if (Tone.context.state !== "running") {
      Tone.start();
    }
    this.chordSynth.triggerAttackRelease(notes, duration);
  }
}


