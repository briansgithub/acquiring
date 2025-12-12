export class AudioEngine {
  constructor() {
    const Tone = window.Tone;
    // Smoother envelope settings to prevent clicks/pops and jagged sound
    this.melodySynth = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.05, decay: 0.2, sustain: 0.7, release: 0.5 },
    }).toDestination();

    // Create a gain node to control chord volume and prevent clipping
    this.chordGain = new Tone.Gain(0.5).toDestination(); // 50% volume to prevent clipping
    
    // Use individual synths for chords instead of PolySynth (better control, prevents clipping)
    // We'll create synths on-demand for each chord
    this.chordSynths = []; // Pool of synths for chords
    
    // Keep PolySynth for backwards compatibility but we won't use it
    this.chordSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sine" },
      envelope: { attack: 0.08, decay: 0.25, sustain: 0.6, release: 0.6 },
      maxPolyphony: 6,
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
      
      // Use individual synths with reduced volume to prevent clipping
      // Create synths on-demand and connect to gain node
      chord.notes.forEach((note, idx) => {
        const synth = new Tone.Synth({
          oscillator: { type: "sine" },
          envelope: { attack: 0.08, decay: 0.25, sustain: 0.6, release: 0.6 },
          volume: -12, // Reduce volume by 12dB to prevent clipping
        }).connect(this.chordGain);
        
        synth.triggerAttackRelease(note, chord.duration, time);
        
        // Clean up synth after note finishes
        Tone.Transport.scheduleOnce(() => {
          synth.dispose();
        }, `+${chord.duration}`);
      });
      
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
    // Release all notes before disposing
    try {
      if (this.melodySynth && typeof this.melodySynth.triggerRelease === "function") {
        this.melodySynth.triggerRelease();
      }
      if (this.chordSynth && typeof this.chordSynth.triggerRelease === "function") {
        // Release all currently playing chord notes
        if (this.currentChordNotes) {
          this.chordSynth.triggerRelease(this.currentChordNotes);
        }
        this.chordSynth.triggerRelease(); // Release all voices
      }
    } catch (e) {
      // Ignore errors if synths are already disposed
    }
    this.currentChordNotes = null;
    // Dispose and recreate synths to ensure clean state
    try {
      this.melodySynth.dispose();
      this.chordSynth.dispose();
    } catch (e) {
      // Ignore disposal errors
    }
    const Tone2 = window.Tone;
    // Recreate with same smooth envelope settings
    this.melodySynth = new Tone2.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.05, decay: 0.2, sustain: 0.7, release: 0.5 },
    }).toDestination();
    this.chordSynth = new Tone2.PolySynth(Tone2.Synth, {
      oscillator: { type: "sine" },
      envelope: { attack: 0.08, decay: 0.25, sustain: 0.6, release: 0.6 },
    }).toDestination();
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

