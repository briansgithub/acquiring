export class AudioEngine {
  constructor() {
    const Tone = window.Tone;
    // Smoother envelope settings to prevent clicks/pops and jagged sound
    // Square oscillator for melody (clear and distinct)
    this.melodySynth = new Tone.Synth({
      oscillator: { type: "square" },
      envelope: { attack: 0.05, decay: 0.2, sustain: 0.7, release: 0.5 },
      volume: -5,
    }).toDestination();

    // Use single persistent PolySynth instance (matches reference implementation)
    // Square oscillator for chords (matches melody for consistent timbre)
    // Volume set to -5dB to match melody volume
    this.chordSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "square" },
      volume: -5,
    }).toDestination();

    this.parts = [];
    this.isSetup = false;
    this.tickId = null;
    this.currentChordNotes = null;
    // Track all currently playing chord notes (important for arpeggiated chords)
    this.activeChordNotes = new Set();
  }

  async setupTransport(bpm) {
    const Tone = window.Tone;
    // Ensure transport is stopped before setting up
    if (Tone.Transport.state !== "stopped") {
      Tone.Transport.stop();
    }
    Tone.Transport.bpm.value = bpm;
    Tone.Transport.position = 0;
    Tone.Transport.ticks = 0;
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
        // Track all notes that are currently playing (for arpeggiated chords)
        event.notes.forEach(note => this.activeChordNotes.add(note));
        event.onTrigger?.();
      } else if (event.type === "release") {
        this.chordSynth.triggerRelease(event.notes, time);
        // Remove notes from tracking when they're released
        event.notes.forEach(note => this.activeChordNotes.delete(note));
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
    // Cancel parts first to prevent any scheduled release events from firing
    // This is critical for arpeggiated chords which have many scheduled release events
    this.cancelAllParts();
    // Release all currently playing notes immediately
    // This prevents arpeggiated chord notes from getting stuck
    // Call multiple times to ensure all notes are released (some may be in attack phase)
    this.releaseAllNotes();
    this.releaseAllNotes(); // Second call to catch any notes that were mid-attack
    // Pause the transport
    Tone.Transport.pause();
  }

  stop() {
    const Tone = window.Tone;
    // Release all notes FIRST while transport is still active (if it was playing)
    // This prevents notes from getting stuck when stopping during playback
    this.releaseAllNotes();
    // Cancel all scheduled parts to prevent any release events from firing
    for (const part of this.parts) {
      part.cancel();
      part.dispose();
    }
    this.parts = [];
    // Stop transport and reset position
    Tone.Transport.stop();
    Tone.Transport.position = 0;
    // Release notes again to catch any that might have been triggered between first release and stop
    this.releaseAllNotes();
    this.currentChordNotes = null;
    this.activeChordNotes.clear();
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

  releaseAllNotes() {
    // Release all currently playing notes (both melody and chords)
    // This is useful when seeking to prevent notes from getting stuck
    // Especially important for arpeggiated chords which have many individual notes
    const Tone = window.Tone;
    try {
      // Release melody note immediately
      if (this.melodySynth && typeof this.melodySynth.triggerRelease === "function") {
        this.melodySynth.triggerRelease();
      }
      // Release all chord notes - use multiple strategies to ensure all notes are released
      if (this.chordSynth) {
        // Strategy 1: Capture tracked notes before clearing
        const trackedNotes = this.activeChordNotes.size > 0 ? Array.from(this.activeChordNotes) : null;
        
        // Strategy 2: Use releaseAll() as the primary method
        if (typeof this.chordSynth.releaseAll === "function") {
          this.chordSynth.releaseAll();
        }
        
        // Strategy 3: Explicitly release all tracked notes (critical for arpeggiated chords)
        if (trackedNotes && trackedNotes.length > 0) {
          try {
            this.chordSynth.triggerRelease(trackedNotes);
          } catch (e) {
            // Ignore if release fails
          }
        }
        
        // Strategy 4: Call releaseAll() again to catch any notes that might have been missed
        // Sometimes notes are in a transitional state and need a second call
        if (typeof this.chordSynth.releaseAll === "function") {
          this.chordSynth.releaseAll();
        }
        
        // Strategy 5: Temporarily mute to force silence, then restore
        // This is a last resort to ensure no notes are playing
        const originalVolume = this.chordSynth.volume.value;
        try {
          this.chordSynth.volume.value = -Infinity;
          // Immediately restore volume
          this.chordSynth.volume.value = originalVolume;
        } catch (e) {
          // If volume manipulation fails, try to restore
          try {
            this.chordSynth.volume.value = originalVolume;
          } catch (e2) {
            // Ignore
          }
        }
        
        // Clear tracking set after releasing
        this.activeChordNotes.clear();
      }
    } catch (e) {
      // Ignore errors if synths are already disposed or in invalid state
      console.warn("Error releasing notes:", e);
      // Still clear tracking even if there was an error
      this.activeChordNotes.clear();
    }
  }

  cancelAllParts() {
    // Cancel all scheduled parts without disposing them
    // This prevents scheduled events from firing after seeking
    for (const part of this.parts) {
      part.cancel();
    }
  }

  rescheduleParts(melodyEvents, chordEvents) {
    const Tone = window.Tone;
    // Clear existing parts
    this.cancelAllParts();
    for (const part of this.parts) {
      part.dispose();
    }
    this.parts = [];
    // Clear note tracking when rescheduling
    this.activeChordNotes.clear();
    
    // Reschedule melody and chords
    if (melodyEvents && melodyEvents.length > 0) {
      this.scheduleMelody(melodyEvents);
    }
    if (chordEvents && chordEvents.length > 0) {
      this.scheduleChords(chordEvents);
    }
  }
}


