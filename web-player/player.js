import { AudioEngine } from "./audio/engine.js";
import { renderControls } from "./components/controls.js";
import { renderChordRing } from "./components/chordRing.js";
import { renderNoteIndicator } from "./components/noteIndicator.js";
import { chordRootToNotes, getSongLength, parseKey, sdToNoteName } from "./lib/music.js";

const Tone = window.Tone;

const controlsPane = document.getElementById("controls-pane");
const ringPane = document.getElementById("ring-pane");
const indicatorPane = document.getElementById("indicator-pane");

const engine = new AudioEngine();
const controls = renderControls(controlsPane, {
  onPlayPause: async (shouldPlay) => {
    if (shouldPlay) {
      // Check if song has ended and needs to be restarted
      // If parts are empty (song ended and stop() was called) or transport is at/past the end
      const totalSeconds = songLength * currentSecondsPerBeat;
      if (engine.parts.length === 0 || Tone.Transport.seconds >= totalSeconds) {
        // Reset transport position and reschedule parts
        engine.stop();
        await engine.setupTransport(currentBpm);
        engine.scheduleMelody(currentMelodyEvents);
        engine.scheduleChords(currentChordEvents);
        controls.updateProgress(0);
        chordRing.update("Ready");
        noteIndicator.reset();
        // Re-establish progress tracking to ensure progress bar updates
        setupProgressTracking();
      }
      await engine.play();
    } else {
      engine.pause();
    }
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
});
const chordRing = renderChordRing(ringPane);
const noteIndicator = renderNoteIndicator(indicatorPane);

let library = [];
let currentSongIdx = 0;
let currentSong = null;
let currentSectionIdx = 0;
let songLength = 0;
let currentSecondsPerBeat = 0;
let currentMelodyEvents = [];
let currentChordEvents = [];
let currentBpm = 120;

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
  const song = library[songIndex];
  if (!song) {
    console.warn("No song at index", songIndex);
    return;
  }
  const section = song?.sections?.[sectionIndex];
  if (!section) {
    console.warn("No section at index", sectionIndex, "for song", song);
    controls.setSections([]);
    return;
  }

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
  const bpm = data.metadata?.tempos?.[0]?.bpm ?? 120;
  currentBpm = bpm;
  currentSecondsPerBeat = 60 / bpm;
  songLength = getSongLength(data.metadata) || 1;

  const notesArray = Array.isArray(data.notes)
    ? data.notes
    : Array.isArray(data.notes?.melody1)
      ? data.notes.melody1
      : [];

  const melodyEvents = notesArray
    .filter((note) => !note.isRest)
    .map((note) => ({
      time: (note.beat - 1) * currentSecondsPerBeat,
      duration: note.duration * currentSecondsPerBeat,
      name: sdToNoteName(note.sd, note.octave, key),
      isRest: false,
      onTrigger: () => noteIndicator.updateMelody(sdToNoteName(note.sd, note.octave, key)),
    }));

  const chordEvents = (data.chords || [])
    .filter((chord) => !chord.isRest)
    .map((chord) => ({
      time: (chord.beat - 1) * currentSecondsPerBeat,
      duration: chord.duration * currentSecondsPerBeat,
      notes: chordRootToNotes(chord.root, key, 4, chord.type),
      name: chord.root,
      onTrigger: () => {
        const notes = chordRootToNotes(chord.root, key, 4, chord.type);
        noteIndicator.updateChord(notes);
        chordRing.update(notes.join("-"));
      },
    }));

  // Calculate actual section length from events
  const allEventEnds = [
    ...melodyEvents.map((e) => e.time + e.duration),
    ...chordEvents.map((e) => e.time + e.duration),
  ];
  if (allEventEnds.length > 0) {
    const actualSectionLength = Math.max(...allEventEnds) / currentSecondsPerBeat;
    songLength = actualSectionLength;
  }
  // If no events, keep songLength from metadata

  // Store events for potential restart
  currentMelodyEvents = melodyEvents;
  currentChordEvents = chordEvents;

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
  controls.updateProgress(0);
  controls.resetPlayState();
  chordRing.update("Ready");
  noteIndicator.reset();

  setupProgressTracking();
}

function setupProgressTracking() {
  engine.onTick(() => {
    const totalSeconds = songLength * currentSecondsPerBeat;
    const ratio = Math.min(1, Tone.Transport.seconds / totalSeconds);
    controls.updateProgress(ratio);
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
}

function handleSongChange(songIdx) {
  const idx = Number(songIdx);
  const song = library[idx];
  if (!song?.sections?.length) {
    console.warn("Song has no sections:", song);
    controls.setSections([]);
    return;
  }
  controls.setSections(song.sections);
  loadSection(idx, 0);
}

function handleSectionChange(idx) {
  loadSection(currentSongIdx, Number(idx));
}

