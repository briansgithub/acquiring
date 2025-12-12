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
  onPlayPause: (shouldPlay) => (shouldPlay ? engine.play() : engine.pause()),
  onSeek: handleSeek,
  onSongChange: handleSongChange,
  onSectionChange: handleSectionChange,
});
const chordRing = renderChordRing(ringPane);
const noteIndicator = renderNoteIndicator(indicatorPane);

let library = [];
let currentSongIdx = 0;
let currentSong = null;
let currentSectionIdx = 0;
let songLength = 0;
let currentSecondsPerBeat = 0;

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
  currentSecondsPerBeat = 60 / bpm;
  songLength = getSongLength(data.metadata) || 1;

  const notesArray = Array.isArray(data.notes)
    ? data.notes
    : Array.isArray(data.notes?.melody1)
      ? data.notes.melody1
      : [];

  const melodyEvents = notesArray.map((note) => ({
    time: (note.beat - 1) * currentSecondsPerBeat,
    duration: note.duration * currentSecondsPerBeat,
    name: sdToNoteName(note.sd, note.octave, key),
    isRest: note.isRest,
    onTrigger: () => noteIndicator.updateMelody(sdToNoteName(note.sd, note.octave, key)),
  }));

  const chordEvents = (data.chords || []).map((chord) => ({
    time: (chord.beat - 1) * currentSecondsPerBeat,
    duration: chord.duration * currentSecondsPerBeat,
    notes: chordRootToNotes(chord.root, key),
    name: chord.root,
    onTrigger: () => {
      const notes = chordRootToNotes(chord.root, key);
      noteIndicator.updateChord(notes);
      chordRing.update(notes.join("-"));
    },
  }));

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

  engine.onTick(() => {
    const ratio = Math.min(1, Tone.Transport.seconds / (songLength * currentSecondsPerBeat));
    controls.updateProgress(ratio);
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

