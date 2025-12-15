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

// State variables
let useRomanNumerals = true; // Track label mode (roman numerals vs letter labels)
let currentKey = null; // Store current key for event recalculation

// Handler function for play/pause
async function handlePlayPause(shouldPlay) {
  if (isLoading) {
    console.warn("Cannot toggle playback while loading...");
    return;
  }
  if (shouldPlay) {
    // If a chord was manually previewed, revert to current chord at playback position
    if (isManualChordPreview) {
      const currentTicks = Tone.Transport.ticks;
      const currentChordInfo = findCurrentChordAtTick(currentTicks);
      if (currentChordInfo) {
        noteIndicator.updateChord(
          currentChordInfo.notes,
          currentChordInfo.root,
          currentChordInfo.degrees,
          currentChordInfo.borrowed,
          currentKey,
          currentChordInfo.chord
        );
        chordRing.update(currentChordInfo.chord);
      } else {
        noteIndicator.reset();
        chordRing.update(null);
      }
      isManualChordPreview = false;
    }
    
    // Check if song has ended and needs to be restarted
    // If parts are empty (song ended and stop() was called) or transport is at/past the end
    // Use Ticks for reliable end-of-song check
    const totalTicks = songLength * 192;
    const wasPaused = Tone.Transport.state === "paused";
    
    if (engine.parts.length === 0 || Tone.Transport.ticks >= totalTicks) {
      console.log("Restarting song from beginning...");
      // Reset transport position and reschedule parts with current tempo
      // Release all notes first to prevent stuck notes
      engine.releaseAllNotes();
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
    } else if (wasPaused && engine.parts.length > 0) {
      // Parts were canceled during pause, reschedule from current position
      const currentTicks = Tone.Transport.ticks;
      engine.rescheduleParts(currentMelodyEvents, currentChordEvents);
      // Restore position after rescheduling
      Tone.Transport.ticks = currentTicks;
    }
    await engine.play();
  } else {
    engine.pause();
  }
}

const controls = renderControls(controlsPane, {
  onPlayPause: handlePlayPause,
  onRestart: async () => {
    // Release all notes first to prevent stuck notes when restarting during playback
    engine.releaseAllNotes();
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
    // Reschedule events to keep arpeggio speed constant in milliseconds
    // The arpeggio speed setting (ms) stays the same, but tick offsets are recalculated
    updatePlaybackSettings();
  },
  onArpeggiateToggle: (enabled) => {
    isArpeggiated = enabled;
    updatePlaybackSettings();
  },
  onArpeggiateSpeedChange: (speedMs) => {
    arpeggiationSpeed = speedMs;
    // Debounce to prevent rapid re-scheduling/audio glitches
    if (arpDebounceTimer) clearTimeout(arpDebounceTimer);
    arpDebounceTimer = setTimeout(() => {
      updatePlaybackSettings();
    }, 150);
  },
});
const chordRing = renderChordRing(ringPane, {
  onChordClick: (chordData) => {
    isManualChordPreview = true;
    engine.previewChord(chordData.notes, "4n");
    noteIndicator.updateChord(chordData.notes, chordData.root, chordData.chordDegrees, chordData.borrowed, currentKey, chordData.chord);
  },
  labelMode: useRomanNumerals,
  onLabelModeChange: (useRoman) => {
    useRomanNumerals = useRoman;
    // Update chord ring with new label mode
    if (currentKey) {
      chordRing.setLabelMode(useRomanNumerals, currentKey);
      // Redraw chord ring
      if (currentRawChords) {
        chordRing.setSongData(currentRawChords, currentKey);
        const currentTicks = Tone.Transport.ticks;
        const currentChordInfo = findCurrentChordAtTick(currentTicks);
        if (currentChordInfo) {
          chordRing.update(currentChordInfo.chord);
        }
      }
    }
  }
});
const noteIndicator = renderNoteIndicator(indicatorPane, {
  onNoteClick: (note) => {
    engine.previewNote(note, "4n");
  },
  key: currentKey
});
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
let isLoading = false;
let isArpeggiated = false;
let arpeggiationSpeed = 100; // ms
let arpDebounceTimer = null;
let isManualChordPreview = false; // Track when chord is manually clicked

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
  // Cancel parts first to prevent any scheduled release events from firing
  // This is critical for arpeggiated chords which have many scheduled release events
  engine.cancelAllParts();
  // Release all notes multiple times with small delays to ensure all arpeggiated notes are caught
  // This prevents stuck notes when switching songs/sections during playback
  engine.releaseAllNotes();
  // Use setTimeout to release notes again after a brief delay to catch notes in attack phase
  setTimeout(() => {
    engine.releaseAllNotes();
  }, 5);
  engine.stop();
  // Release notes again after stop to catch any that might have been triggered
  setTimeout(() => {
    engine.releaseAllNotes();
  }, 10);

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
    // Ensure transport is fully stopped and reset before scheduling new events
    // This prevents events from firing immediately when switching songs during playback
    engine.stop();
    await engine.setupTransport(bpm);
    // Double-check transport is stopped and reset before scheduling
    // This is critical when switching songs during playback
    const Tone = window.Tone;
    // Force stop transport and reset position/ticks to ensure clean state
    if (Tone.Transport.state !== "stopped") {
      Tone.Transport.stop();
    }
    Tone.Transport.position = 0;
    Tone.Transport.ticks = 0;
    // Ensure transport remains stopped (song should be paused until play is pressed)
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
    // Reset progress to 0 for both controls and timeline
    controls.updateProgress(0);
    timeline.updateProgress(0);
    // Ensure play state is reset (paused) - song should be paused until play is pressed
    controls.resetPlayState();
    chordRing.setSongData(currentRawChords, currentKey);
    chordRing.update(null, null, null);
    timeline.setSongData(currentRawChords, currentKey, songLength);
    noteIndicator.reset();

    // Update indicator immediately with the first chord if it starts at beat 0 or 1
    // This fixes the issue where the first chord plays but indicator doesn't show until second chord
    if (currentRawChords && currentRawChords.length > 0) {
      const firstChord = currentRawChords.find(c => !c.isRest);
      if (firstChord && (firstChord.beat === 0 || firstChord.beat === 1)) {
        const chordData = chordInterpreter(firstChord, currentKey);
        noteIndicator.updateChord(
          chordData.notes,
          firstChord.root,
          chordData.chordDegrees,
          firstChord.borrowed,
          currentKey,
          firstChord
        );
        chordRing.update(firstChord);
      }
    }

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
  // Store current playback state
  const wasPlaying = Tone.Transport.state === "started";
  
  // CRITICAL: Release all currently playing notes FIRST, before canceling parts
  // This ensures that any notes currently in their attack/sustain phase are stopped
  // This is especially important for arpeggiated chords which have many individual note events
  engine.releaseAllNotes();
  
  // Cancel all scheduled parts to prevent events from firing at wrong times
  engine.cancelAllParts();
  
  // Seek to new position
  const seconds = songLength * currentSecondsPerBeat * ratio;
  Tone.Transport.seconds = seconds;
  
  // Update note indicator with chord at this position
  const currentTicks = Tone.Transport.ticks;
  const currentChordInfo = findCurrentChordAtTick(currentTicks);
  if (currentChordInfo) {
    noteIndicator.updateChord(
      currentChordInfo.notes,
      currentChordInfo.root,
      currentChordInfo.degrees,
      currentChordInfo.borrowed,
      currentKey,
      currentChordInfo.chord
    );
    chordRing.update(currentChordInfo.chord);
  } else {
    noteIndicator.reset();
    chordRing.update(null);
  }
  
  // Reschedule parts with current events so they're aligned with the new position
  if (currentMelodyEvents.length > 0 || currentChordEvents.length > 0) {
    engine.rescheduleParts(currentMelodyEvents, currentChordEvents);
  }
  
  // If we were playing, make sure transport is still started
  if (wasPlaying && Tone.Transport.state !== "started") {
    engine.play();
  }
  
  // Update both timeline and controls progress bars
  timeline.updateProgress(ratio);
  controls.updateProgress(ratio);
  // Reset manual preview flag when seeking
  isManualChordPreview = false;
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

    // Handle beat 0 by treating it as beat 1 (normalize to 1-based indexing)
    // XML format can have beat 0, but player expects 1-based beats
    const normalizedBeat = note.beat === 0 ? 1 : note.beat;
    const startTick = (normalizedBeat - 1) * 192;
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

    // Handle beat 0 by treating it as beat 1 (normalize to 1-based indexing)
    // XML format can have beat 0, but player expects 1-based beats
    const normalizedBeat = chord.beat === 0 ? 1 : chord.beat;
    const startTick = (normalizedBeat - 1) * 192;
    const endTick = startTick + (chord.duration * 192);

    if (isArpeggiated) {
      // Create individual note events
      // Calculate offset in ticks to keep arpeggio speed constant in real time (milliseconds)
      // regardless of tempo changes. We calculate ticks based on the current tempo so that
      // the arpeggio speed in milliseconds stays constant. When tempo changes, events are
      // rescheduled with new tick offsets calculated at the new tempo, maintaining the same
      // millisecond duration.
      // 1 Beat = 60/BPM seconds. 1 Tick = 1/192 Beat.
      // TicksPerSecond = (BPM * 192) / 60 = BPM * 3.2
      // Convert arpeggio speed (ms) to seconds, then to ticks at current tempo
      const offsetSeconds = arpeggiationSpeed / 1000;
      const ticksPerSecond = currentBpm * 3.2;
      let offsetTicks = Math.round(offsetSeconds * ticksPerSecond);
      
      // Ensure offsetTicks is at least 1 to prevent division by zero and ensure notes play
      // At very low tempos with fast arpeggio speeds, offsetTicks can round to 0
      offsetTicks = Math.max(1, offsetTicks);

      let currentTick = Math.round(startTick);
      let noteIdx = 0;

      // Use a dynamic minimum based on offsetTicks, but ensure it's at least 1
      // For very fast arpeggios at low tempos, we allow shorter notes
      // For normal cases, we use a minimum to avoid glitchy stub notes at chord end
      const MIN_NOTE_DURATION_TICKS = Math.max(1, Math.min(offsetTicks, 10));

      while (currentTick + MIN_NOTE_DURATION_TICKS < endTick) {
        const note = chordNotes[noteIdx % chordNotes.length];
        const noteStart = currentTick;

        let noteEnd = currentTick + offsetTicks;
        // Ensure we don't play past the chord's end
        if (noteEnd > endTick) noteEnd = endTick;

        // Double check duration (redundant with while loop but safe)
        if (noteEnd - noteStart < MIN_NOTE_DURATION_TICKS) {
          break;
        }

        // Capture closure values
        const isFirstNote = (noteIdx === 0);
        const thisNote = note;
        const shouldHighlight = arpeggiationSpeed >= 50;

        const noteEvent = {
          time: Math.round(noteStart) + "i",
          type: "attack",
          notes: [thisNote], // Engine expects array
          name: chord.root,
          onTrigger: () => {
            if (isFirstNote) {
              // On very first note, update the main chord display
              noteIndicator.updateChord(chordNotes, chord.root, chordData.chordDegrees, chord.borrowed, currentKey, chord);
              chordRing.update(chord);
              // Reset manual preview flag when chord changes during playback
              isManualChordPreview = false;
            }
            // Only highlight notes when arpeggio speed is >= 50ms to avoid visual clutter at fast speeds
            if (shouldHighlight) {
              noteIndicator.highlightNote(thisNote);
            }
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
          noteIndicator.updateChord(chordNotes, chord.root, chordData.chordDegrees, chord.borrowed, currentKey, chord);
          chordRing.update(chord);
          // Reset manual preview flag when chord changes during playback
          isManualChordPreview = false;
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

// Helper function to find the current chord at a given tick position
function findCurrentChordAtTick(tickPosition) {
  if (!currentRawChords || !currentRawChords.length || !currentKey) return null;
  
  // Convert tick position to beat (1 tick = 1/192 beat)
  const currentBeat = (tickPosition / 192) + 1;
  
  // Find the chord that should be playing at this beat
  // A chord is active if currentBeat is >= chord.beat and < chord.beat + chord.duration
  // Normalize beat 0 to beat 1 for comparison
  for (const chord of currentRawChords) {
    if (chord.isRest) continue;
    const chordStartBeat = chord.beat === 0 ? 1 : chord.beat;
    const chordEndBeat = chordStartBeat + chord.duration;
    
    if (currentBeat >= chordStartBeat && currentBeat < chordEndBeat) {
      const chordData = chordInterpreter(chord, currentKey);
      return {
        chord,
        chordData,
        notes: chordData.notes,
        root: chord.root,
        degrees: chordData.chordDegrees,
        borrowed: chord.borrowed
      };
    }
  }
  
  return null;
}

async function updatePlaybackSettings() {
  if (isLoading || !currentSong) return;

  const wasPlaying = Tone.Transport.state === "started";
  const currentTicks = Tone.Transport.ticks;

  // Stop engine to clear parts
  engine.stop();
  noteIndicator.reset();

  // Re-create events with new settings (arpeggiation)
  const melodyEvents = createMelodyEvents(currentRawNotes, currentKey);
  const chordEvents = createChordEvents(currentRawChords, currentKey);

  currentMelodyEvents = melodyEvents;
  currentChordEvents = chordEvents;

  await engine.setupTransport(currentBpm);
  engine.scheduleMelody(melodyEvents);
  engine.scheduleChords(chordEvents);

  // Reschedule progress tracking which gets cleared by setupTransport
  setupProgressTracking();

  // Restore position
  Tone.Transport.ticks = currentTicks;

  // Update note indicator immediately with current chord (fixes display issue when tempo changes)
  // This is especially important for arpeggiated chords where the first note might not trigger immediately
  if (isArpeggiated && currentTicks > 0) {
    const currentChordInfo = findCurrentChordAtTick(currentTicks);
    if (currentChordInfo) {
      noteIndicator.updateChord(
        currentChordInfo.notes,
        currentChordInfo.root,
        currentChordInfo.degrees,
        currentChordInfo.borrowed,
        currentKey,
        currentChordInfo.chord
      );
      // Also update chord ring if needed
      chordRing.update(currentChordInfo.chord);
    }
  }

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

