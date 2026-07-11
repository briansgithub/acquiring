import { percentToDb } from "../lib/volume.js";

export class AudioEngine {
  constructor() {
    const Tone = window.Tone;
    this.melodySynth = new Tone.Synth({
      oscillator: { type: "square" },
      envelope: { attack: 0.05, decay: 0.2, sustain: 0.7, release: 0.5 },
      volume: -5,
    }).toDestination();

    this.chordSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sawtooth" },
      volume: -5,
      envelope: { attack: 0.02, decay: 0.1, sustain: 0.4, release: 0.2 },
    }).toDestination();

    // Arpeggio is strictly one note at a time — monophonic avoids PolySynth voice leaks
    this.arpeggioSynth = new Tone.Synth({
      oscillator: { type: "sawtooth" },
      volume: -5,
      envelope: { attack: 0.01, decay: 0.05, sustain: 0.1, release: 0.04 },
    }).toDestination();

    // Drone synth is used exclusively for Tonic/Ionian drone buttons
    this.droneSynth = new Tone.Synth({
      oscillator: { type: "sawtooth" },
      volume: -5,
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.3 },
    }).toDestination();

    this.previewSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sawtooth" },
      volume: -5,
    }).toDestination();

    this.parts = [];
    this.isSetup = false;
    this.tickId = null;
    this.currentChordNotes = null;
    this.activeChordNotes = new Set();
    this.previewTimeout = null;
    this.previewNotes = new Set();
  }

  async setupTransport(bpm) {
    const Tone = window.Tone;
    if (Tone.Transport.state !== "stopped") {
      Tone.Transport.stop();
    }
    Tone.Transport.bpm.value = bpm;
    Tone.Transport.position = 0;
    Tone.Transport.ticks = 0;
    if (this.isSetup) {
      Tone.Transport.cancel(0);
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
    const partEvents = events.map((ev) => [ev.time, ev]);
    const part = new Tone.Part((time, event) => {
      if (event.type === "attack") {
        this.melodySynth.triggerAttack(event.name, time);
        if (event.onTrigger) {
          if (Tone.Draw) Tone.Draw.schedule(event.onTrigger, time);
          else event.onTrigger();
        }
      } else if (event.type === "release") {
        this.melodySynth.triggerRelease(time);
      }
    }, partEvents).start(0);
    this.parts.push(part);
  }

  scheduleChords(events) {
    const Tone = window.Tone;
    const partEvents = events.map((ev) => [ev.time, ev]);
    const part = new Tone.Part((time, event) => {
      if (event.type === "arpeggio") {
        if (!event.note) return;
        this.arpeggioSynth.triggerAttackRelease(event.note, event.duration, time);
        if (event.onTrigger) {
          if (Tone.Draw) Tone.Draw.schedule(event.onTrigger, time);
          else event.onTrigger();
        }
        return;
      }

      if (!event.notes?.length) return;

      if (event.type === "attack") {
        this.chordSynth.triggerAttack(event.notes, time);
        this.currentChordNotes = event.notes;
        event.notes.forEach((note) => this.activeChordNotes.add(note));
        if (event.onTrigger) {
          if (Tone.Draw) Tone.Draw.schedule(event.onTrigger, time);
          else event.onTrigger();
        }
      } else if (event.type === "release") {
        if (typeof this.chordSynth.releaseAll === "function") {
          this.chordSynth.releaseAll(time);
        } else {
          this.chordSynth.triggerRelease(event.notes, time);
        }
        this.activeChordNotes.clear();
      }
    }, partEvents).start(0);
    this.parts.push(part);
  }

  async play() {
    const Tone = window.Tone;
    await this.startAudio();
    Tone.Transport.start();
  }

  pause() {
    const Tone = window.Tone;
    this.cancelAllParts();
    this.releaseAllNotes();
    this.releaseAllNotes();
    Tone.Transport.pause();
  }

  stop() {
    const Tone = window.Tone;
    this.releaseAllNotes();
    for (const part of this.parts) {
      part.cancel();
      part.dispose();
    }
    this.parts = [];
    Tone.Transport.stop();
    Tone.Transport.position = 0;
    this.releaseAllNotes();
    this.currentChordNotes = null;
    this.activeChordNotes.clear();
    if (Tone && Tone.Draw) {
      Tone.Draw.cancel();
    }
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

  setMelodyVolume(percent) {
    if (this.melodySynth) {
      this.melodySynth.volume.value = percentToDb(percent);
    }
  }

  setChordVolume(percent) {
    const volumeValue = percentToDb(percent);
    if (this.chordSynth) {
      this.chordSynth.volume.value = volumeValue;
    }
    if (this.arpeggioSynth) {
      this.arpeggioSynth.volume.value = volumeValue;
    }
    if (this.previewSynth) {
      this.previewSynth.volume.value = volumeValue;
    }
  }

  setDroneVolume(percent) {
    if (this.droneSynth) {
      this.droneSynth.volume.value = percentToDb(percent);
    }
  }

  setTempo(bpm) {
    const Tone = window.Tone;
    Tone.Transport.bpm.value = bpm;
  }

  previewChord(notes, duration = "8n", arpeggiate = false, arpeggiationSpeedMs = 100, onNoteTrigger) {
    const Tone = window.Tone;
    if (Tone.context.state !== "running") {
      Tone.start();
    }
    if (this.previewTimeout) {
      clearTimeout(this.previewTimeout);
      this.previewTimeout = null;
    }
    if (this.arpeggioSynth?.triggerRelease) {
      this.arpeggioSynth.triggerRelease();
    }
    if (this.previewSynth && typeof this.previewSynth.releaseAll === "function") {
      this.previewSynth.releaseAll();
    }

    const now = Tone.now();

    if (arpeggiate && notes.length > 1) {
      const stepSeconds = arpeggiationSpeedMs / 1000;
      const noteDurationSeconds = Math.max(stepSeconds * 0.9, 0.02);

      notes.forEach((note, index) => {
        const noteStartTime = now + index * stepSeconds;
        this.arpeggioSynth.triggerAttackRelease(note, noteDurationSeconds, noteStartTime);
        if (onNoteTrigger) {
          Tone.Draw.schedule(() => onNoteTrigger(note, index), noteStartTime);
        }
      });
    } else {
      this.previewSynth.triggerAttackRelease(notes, duration, now);
    }
  }

  previewNote(note, duration = "8n") {
    const Tone = window.Tone;
    if (Tone.context.state !== "running") {
      Tone.start();
    }
    if (this.arpeggioSynth?.triggerRelease) {
      this.arpeggioSynth.triggerRelease();
    }
    const now = Tone.now();
    const durationSeconds = Tone.Time(duration).toSeconds();
    this.arpeggioSynth.triggerAttackRelease(note, duration, now);
    return durationSeconds * 1000;
  }

  startPreviewNote(note) {
    const Tone = window.Tone;
    if (Tone.context.state !== "running") {
      Tone.start();
    }
    if (this.droneSynth) {
      if (this.droneSynth.triggerRelease) {
        this.droneSynth.triggerRelease();
      }
      this.droneSynth.triggerAttack(note);
    }
  }

  stopPreviewNote() {
    if (this.droneSynth) {
      if (this.droneSynth.triggerRelease) {
        this.droneSynth.triggerRelease();
      }
    }
  }

  previewMelodyNote(note, duration = "8n") {
    const Tone = window.Tone;
    if (Tone.context.state !== "running") {
      Tone.start();
    }
    this.melodySynth.triggerAttackRelease(note, duration);
  }

  releaseAllNotes(time) {
    const Tone = window.Tone;
    try {
      if (this.melodySynth?.triggerRelease) {
        this.melodySynth.triggerRelease(time);
      }
      if (this.arpeggioSynth?.triggerRelease) {
        this.arpeggioSynth.triggerRelease(time);
      }
      if (this.droneSynth?.triggerRelease) {
        this.droneSynth.triggerRelease(time);
      }
      if (this.chordSynth) {
        const trackedNotes =
          this.activeChordNotes.size > 0 ? Array.from(this.activeChordNotes) : null;
        if (typeof this.chordSynth.releaseAll === "function") {
          this.chordSynth.releaseAll(time);
        }
        if (trackedNotes?.length) {
          try {
            this.chordSynth.triggerRelease(trackedNotes, time);
          } catch {
            // ignore
          }
        }
        if (typeof this.chordSynth.releaseAll === "function") {
          this.chordSynth.releaseAll(time);
        }
        this.activeChordNotes.clear();
      }
    } catch (e) {
      console.warn("Error releasing notes:", e);
      this.activeChordNotes.clear();
    }
  }

  cancelAllParts() {
    const Tone = window.Tone;
    for (const part of this.parts) {
      part.cancel();
    }
    if (Tone && Tone.Draw) {
      Tone.Draw.cancel();
    }
  }

  rescheduleParts(melodyEvents, chordEvents) {
    this.cancelAllParts();
    for (const part of this.parts) {
      part.dispose();
    }
    this.parts = [];
    this.activeChordNotes.clear();

    if (melodyEvents?.length > 0) {
      this.scheduleMelody(melodyEvents);
    }
    if (chordEvents?.length > 0) {
      this.scheduleChords(chordEvents);
    }
  }

  resumeChordAttack(notes) {
    const Tone = window.Tone;
    if (!notes?.length) return;
    const now = Tone.now();
    this.chordSynth.triggerAttack(notes, now);
    this.currentChordNotes = notes;
    notes.forEach((note) => this.activeChordNotes.add(note));
  }
}
