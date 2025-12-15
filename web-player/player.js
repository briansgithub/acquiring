import { AudioEngine } from "./audio/engine.js";
import { renderControls } from "./components/controls.js";
import { renderChordRing } from "./components/chordRing.js";
import { renderNoteIndicator } from "./components/noteIndicator.js";
import { renderTimeline } from "./components/timeline.js";
import { chordInterpreter, getSongLength, parseKey, sdToToneJSNoteName } from "./lib/music.js";

const Tone = window.Tone;

const controlsPane = document.getElementById("controls-pane");
const ringPane = document.getElementById("ring-pane");
const indicatorPane = document.getElementById("indicator-pane");
const timelinePane = document.getElementById("timeline-pane");

const engine = new AudioEngine();

// Handler function for play/pause
async function handlePlayPause(shouldPlay) {
  if (isLoading) {
    console.warn("Cannot toggle playback while loading...");
    return;
  }
  if (shouldPlay) {
    // Check if song has ended and needs to be restarted
    // If parts are empty (song ended and stop() was called) or transport is at/past the end
    // If parts are empty (song ended and stop() was called) or transport is at/past the end
    // Use Ticks for reliable end-of-song check
    const totalTicks = songLength * 192;
    if (engine.parts.length === 0 || Tone.Transport.ticks >= totalTicks) {
      console.log("Restarting song from beginning...");
      // Reset transport position and reschedule parts with current tempo
      engine.stop();
      currentSecondsPerBeat = 60 / currentBpm;
      const melodyEvents = createMelodyEvents(currentRawNotes, currentKey);
      const chordEvents = createChordEvents(currentRawChords, currentKey);
      currentMelodyEvents = melodyEvents;
      currentChordEvents = chordEvents;
      await engine.setupTransport(currentBpm);
      engine.scheduleMelody(melodyEvents);
      engine.scheduleChords(chordEvents);
      controls.updateProgress(0);
      chordRing.update(null, null, null);
      noteIndicator.reset();
      timeline.updateProgress(0);
      setupProgressTracking();
    }
    await engine.play();
  } else {
    engine.pause();
  }
}

const controls = renderControls(controlsPane, {
  onPlayPause: handlePlayPause,
  onRestart: async () => {
    engine.stop();
    // Recalculate events with current tempo
    currentSecondsPerBeat = 60 / currentBpm;
    // Events are now Tick-based, so no need to recreate them on restart unless data changed?
    // Actually, createMelodyEvents is cheap, so keeping it is fine, but we remove the secondsPerBeat arg.
    const melodyEvents = createMelodyEvents(currentRawNotes, currentKey);
    const chordEvents = createChordEvents(currentRawChords, currentKey);
    currentMelodyEvents = melodyEvents;
    currentChordEvents = chordEvents;
    await engine.setupTransport(currentBpm);
    engine.scheduleMelody(melodyEvents);
    engine.scheduleChords(chordEvents);
    controls.updateProgress(0);
    controls.resetPlayState();
    chordRing.update(null, null, null);
    noteIndicator.reset();
    timeline.updateProgress(0);
    setupProgressTracking();
  },
  onSeek: handleSeek,
  onSongChange: handleSongChange,
  onSectionChange: handleSectionChange,
  onMelodyVolumeChange: (volume) => {
    engine.setMelodyVolume(volume);
  },
  onChordVolumeChange: (volume) => {
    engine.setChordVolume(volume);
  },
  onTempoChange: (tempo) => {
    currentBpm = tempo;
    currentSecondsPerBeat = 60 / tempo;
    engine.setTempo(tempo);
  },
  onArpeggiateToggle: (enabled) => {
    isArpeggiated = enabled;
    updatePlaybackSettings();
  },
  onArpeggiateSpeedChange: (speedMs) => {
    arpeggiationSpeed = speedMs;
    updatePlaybackSettings();
  },
});
const chordRing = renderChordRing(ringPane, {
  onChordClick: (notes) => {
    engine.previewChord(notes, "4n");
  }
});
const noteIndicator = renderNoteIndicator(indicatorPane);
const timeline = renderTimeline(timelinePane, {
  onSeek: handleSeek
});

// Add keyboard support for spacebar to toggle play/pause
document.addEventListener("keydown", (event) => {
  // Only handle spacebar, and ignore if user is typing in an input field
  if (event.code === "Space" && event.target.tagName !== "INPUT" && event.target.tagName !== "TEXTAREA") {
    event.preventDefault();
    const isPlaying = Tone.Transport.state === "started";
    handlePlayPause(!isPlaying);
  }
});

let library = [];
let currentSongIdx = 0;
let currentSong = null;
let currentSectionIdx = 0;
let songLength = 0;
let currentSecondsPerBeat = 0;
let currentMelodyEvents = [];
let currentChordEvents = [];
let currentBpm = 120;
let originalBpm = 120; // Store the original tempo from the loaded section
let currentRawNotes = []; // Store raw note data for tempo recalculation
let currentRawChords = []; // Store raw chord data for tempo recalculation
let currentKey = null; // Store current key for event recalculation
let isLoading = false;
let isArpeggiated = true;
let arpeggiationSpeed = 100; // ms

init();

async function init() {
  try {
    library = await fetch("/api/songs").then(async (r) => {
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`HTTP ${r.status} ${text}`);
      }
      return r.json();
    });
    console.info("Loaded library", library);
    if (!Array.isArray(library) || !library.length) {
      throw new Error("No songs found in cache");
    }
    if (!library[0].sections?.length) {
      throw new Error("Library has no sections for first song");
    }
    // Populate dropdowns immediately
    controls.setSongs(library);
    controls.setSections(library[0].sections);
    loadSection(0, 0);
  } catch (err) {
    console.error("Failed to load library", err);
    alert(`Unable to load songs/sections: ${err.message}`);
    controls.setSections([]);
  }
}

async function loadSection(songIndex, sectionIndex) {
  if (isLoading) return;
  isLoading = true;
  engine.stop();

  const song = library[songIndex];
  if (!song) {
    console.warn("No song at index", songIndex);
    isLoading = false;
    return;
  }
  const section = song?.sections?.[sectionIndex];
  if (!section) {
    console.warn("No section at index", sectionIndex, "for song", song);
    controls.setSections([]);
    isLoading = false;
    return;
  }

  try {
    const data = await fetch(`/api/song?file=${encodeURIComponent(section.relPath)}`).then(async (r) => {
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`HTTP ${r.status} ${text}`);
      }
      return r.json();
    });
    currentSong = data;
    currentSongIdx = songIndex;
    currentSectionIdx = sectionIndex;

    const key = parseKey(data.metadata);
    currentKey = key;
    const bpm = data.metadata?.tempos?.[0]?.bpm ?? 120;
    originalBpm = bpm;
    currentBpm = bpm;
    currentSecondsPerBeat = 60 / bpm;
    songLength = getSongLength(data.metadata) || 1;

    const notesArray = Array.isArray(data.notes)
      ? data.notes
      : Array.isArray(data.notes?.melody1)
        ? data.notes.melody1
        : [];

    // Store raw data for tempo recalculation
    currentRawNotes = notesArray;
    currentRawChords = data.chords || [];

    const melodyEvents = createMelodyEvents(notesArray, key);
    const chordEvents = createChordEvents(currentRawChords, key);

    // Calculate actual section length in BEATS from raw data
    // (metadata length is often just an estimate or in bars)
    const allEventEnds = [
      ...notesArray.map((n) => (n.beat - 1) + n.duration),
      ...currentRawChords.map((c) => (c.beat - 1) + c.duration),
    ];
    if (allEventEnds.length > 0) {
      const actualSectionLength = Math.max(...allEventEnds);
      songLength = actualSectionLength;
    }
    // If no events, keep songLength from metadata (ensure it's treated as beats)

    // Store events for potential restart
    currentMelodyEvents = melodyEvents;
    currentChordEvents = chordEvents;

    console.log("Scheduling events for new section...");
    engine.stop();
    await engine.setupTransport(bpm);
    engine.scheduleMelody(melodyEvents);
    engine.scheduleChords(chordEvents);

    // Ensure dropdowns are set
    controls.setSections(song.sections);
    // Set the selected values
    const songSelect = document.getElementById("song-select");
    const sectionSelect = document.getElementById("section-select");
    if (songSelect) songSelect.value = songIndex;
    if (sectionSelect) sectionSelect.value = sectionIndex;

    // Update song title and key display
    controls.setSongTitle(song.title || song.artist || "Unknown Song");
    controls.setSongKey(key);
    // Update tempo slider to match loaded section's tempo (100% = original tempo)
    controls.setTempo(bpm, originalBpm);
    controls.updateProgress(0);
    controls.resetPlayState();
    chordRing.setSongData(currentRawChords, currentKey);
    chordRing.update(null, null, null);
    timeline.setSongData(currentRawChords, currentKey, songLength);
    noteIndicator.reset();

    setupProgressTracking();
    console.log("Section loaded successfully.");
  } catch (err) {
    console.error("Error during playback setup in loadSection:", err);
  } finally {
    isLoading = false;
  }
}

function setupProgressTracking() {
  engine.onTick(() => {
    // songLength is in Beats.
    // Progress calculation based on TICKS (192 PPQ) to ensure stability during tempo changes.
    // Tone.Transport.seconds is unstable/approximated during aggressive tempo ramps.
    const totalTicks = songLength * 192;
    const currentTicks = Tone.Transport.ticks;

    // Use currentTicks directly for a smooth, locked-to-music progress bar
    const ratio = totalTicks > 0 ? Math.min(1, currentTicks / totalTicks) : 0;

    controls.updateProgress(ratio);
    timeline.updateProgress(ratio);
    // Stop playback when section ends
    if (ratio >= 1 && Tone.Transport.state === "started") {
      engine.stop();
      controls.resetPlayState();
    }
  });
}

function handleSeek(ratio) {
  const seconds = songLength * currentSecondsPerBeat * ratio;
  Tone.Transport.seconds = seconds;
  timeline.updateProgress(ratio);
}

function handleSongChange(songIdx) {
  try {
    const idx = Number(songIdx);
    const song = library[idx];
    if (!song?.sections?.length) {
      console.warn("Song has no sections:", song);
      controls.setSections([]);
      return;
    }
    controls.setSections(song.sections);
    loadSection(idx, 0).catch(err => console.error("LoadSection failed inside song change:", err));
  } catch (e) {
    console.error("HandleSongChange failed:", e);
  }
}

function handleSectionChange(idx) {
  loadSection(currentSongIdx, Number(idx)).catch(err => console.error("LoadSection failed inside section change:", err));
}

function createMelodyEvents(notesArray, key) {
  const events = [];
  notesArray.forEach((note) => {
    if (note.isRest) return;
    const absoluteLabel = sdToToneJSNoteName(note.sd, note.octave, key, 4);
    const relativeLabel = note.sd;

    const startTick = (note.beat - 1) * 192;
    const endTick = startTick + (note.duration * 192);

    // Note On
    events.push({
      time: startTick + "i",
      type: "attack",
      name: absoluteLabel,
      onTrigger: () => noteIndicator.updateMelody(absoluteLabel, relativeLabel),
    });

    // Note Off
    events.push({
      time: endTick + "i",
      type: "release",
      name: absoluteLabel,
    });
  });
  return events;
}

function createChordEvents(chordsArray, key) {
  const events = [];
  chordsArray.forEach((chord) => {
    if (chord.isRest) return;
    const chordData = chordInterpreter(chord, key);
    const chordNotes = chordData.notes;
    if (!chordNotes.length) return;

    const startTick = (chord.beat - 1) * 192;
    const endTick = startTick + (chord.duration * 192);

    if (isArpeggiated) {
      // Create individual note events
      // Calculate offset in ticks. Tone.Transport.bpm.value matches currentBpm.
      // 1 Beat = 60/BPM seconds. 1 Tick = 1/192 Beat.
      // TicksPerSecond = (BPM * 192) / 60 = BPM * 3.2
      const ticksPerSecond = currentBpm * 3.2;
      const offsetTicks = (arpeggiationSpeed / 1000) * ticksPerSecond;

      let currentTick = startTick;
      let noteIdx = 0;

      // Loop until we run out of time in the chord (with a small buffer to avoid zero-length notes at the end)
      while (currentTick + 2 < endTick) {
        const note = chordNotes[noteIdx % chordNotes.length];
        const noteStart = currentTick;

        let noteEnd = currentTick + offsetTicks;
        // Ensure we don't play past the chord's end
        if (noteEnd > endTick) noteEnd = endTick;

        // Capture closure values
        const isFirstNote = (noteIdx === 0);
        const thisNote = note;

        const noteEvent = {
          time: Math.round(noteStart) + "i",
          type: "attack",
          notes: [thisNote], // Engine expects array
          name: chord.root,
          onTrigger: () => {
            if (isFirstNote) {
              // On very first note, update the main chord display
              noteIndicator.updateChord(chordNotes, chord.root, chordData.chordDegrees, chord.borrowed);
              chordRing.update(chord);
            }
            // Highlight this specific note
            noteIndicator.highlightNote(thisNote);
          }
        };
        events.push(noteEvent);

        events.push({
          time: Math.round(noteEnd) + "i",
          type: "release",
          notes: [thisNote],
        });

        currentTick += offsetTicks;
        noteIdx++;
      }

    } else {
      // Block Chord (Original Logic)
      // Note On
      events.push({
        time: Math.round(startTick) + "i",
        type: "attack",
        notes: chordNotes,
        name: chord.root, // Original prop kept for ref
        onTrigger: () => {
          noteIndicator.updateChord(chordNotes, chord.root, chordData.chordDegrees, chord.borrowed);
          chordRing.update(chord);
        },
      });

      // Note Off
      events.push({
        time: Math.round(endTick) + "i",
        type: "release",
        notes: chordNotes,
      });
    }
  });

  // Events must be sorted by time for Tone.Part
  events.sort((a, b) => parseInt(a.time) - parseInt(b.time));

  return events;
}

async function updatePlaybackSettings() {
  if (isLoading || !currentSong) return;

  const wasPlaying = Tone.Transport.state === "started";
  const currentTicks = Tone.Transport.ticks;

  // Stop engine to clear parts
  engine.stop();

  // Re-create events with new settings (arpeggiation)
  const melodyEvents = createMelodyEvents(currentRawNotes, currentKey);
  const chordEvents = createChordEvents(currentRawChords, currentKey);

  currentMelodyEvents = melodyEvents;
  currentChordEvents = chordEvents;

  await engine.setupTransport(currentBpm);
  engine.scheduleMelody(melodyEvents);
  engine.scheduleChords(chordEvents);

  // Restore position
  Tone.Transport.ticks = currentTicks;

  if (wasPlaying) {
    engine.play();
  } else {
    // If we were paused/stopped, ensure UI is still correct for current position?
    // Actually engine.stop() resets things.
    // If not playing, we probably just want to be ready.
    // engine.stop() was called, so Transport is at 0 if we don't restore ticks.
    // restoring ticks is good.
    // But we are in "paused" state now.
    controls.resetPlayState(); // "Play" button should show Play
    // Wait, if it *was* playing, we called engine.play() which sets button to playing?
    // engine.play() starts transport. We need to sync button state.
    if (wasPlaying) {
      // controls.resetPlayState sets to "Play", we want "Pause" (playing state)
      const playBtn = document.getElementById("play-toggle");
      if (playBtn) {
        playBtn.dataset.state = "playing";
        playBtn.textContent = "Pause";
      }
    }
  }
}

