import { AudioEngine } from "./audio/engine.js";
import { createLoadingSplash } from "./components/loadingSplash.js";
import { renderControls, CONTROL_DEFAULTS } from "./components/controls.js";
import { makeCollapsible } from "./components/collapsiblePane.js";
import { renderChordRing } from "./components/chordRing.js";
import { renderNoteIndicator } from "./components/noteIndicator.js";
import { renderTimeline } from "./components/timeline.js";
import { renderSongSelector } from "./components/songSelector.js";
import { renderQuizPanel } from "./components/quizPanel.js";
import { chordInterpreter, getSongLength, parseKey, sdToToneJSNoteName } from "./lib/music.js";
import { normalizeToneNotes } from "./lib/chordVoicing.js";
import { getChordSymbol } from "./lib/jsonToSymbol.js";
import {
  arpOffsetTicks,
  arpStepMs,
  ARP_HIGHLIGHT_MAX_CYCLES,
  isArpeggiationActive as arpActive,
  sliderIndexToCyclesPerBeat,
  TICKS_PER_BEAT,
} from "./lib/timing.js";

const Tone = window.Tone;

const ringPane = document.getElementById("ring-pane");
const indicatorPane = document.getElementById("indicator-pane");
const timelinePane = document.getElementById("timeline-pane");
const selectorPane = document.getElementById("selector-pane");

const engine = new AudioEngine();
const loadingSplash = createLoadingSplash();

// State variables
let useRomanNumerals = true; // Track label mode (roman numerals vs letter labels)
let currentKey = null; // Store current key for event recalculation
let forceRootPosition = false;
let isArpeggiated = CONTROL_DEFAULTS.arpeggiated;
let arpeggiationSlider = CONTROL_DEFAULTS.arpeggiationSlider;
let arpFixedSpeed = CONTROL_DEFAULTS.arpFixedSpeed;
let arpUnlockFromTempo = CONTROL_DEFAULTS.arpUnlockFromTempo;

function getArpeggioBpm() {
  return arpUnlockFromTempo ? originalBpm : currentBpm;
}

function getArpeggioOffsetTicks(noteCount) {
  let offsetTicks = arpOffsetTicks(getCyclesPerBeat(), noteCount, arpFixedSpeed);
  if (arpUnlockFromTempo && originalBpm > 0 && currentBpm !== originalBpm) {
    offsetTicks = Math.max(1, Math.round(offsetTicks * currentBpm / originalBpm));
  }
  return offsetTicks;
}

function getCyclesPerBeat() {
  return sliderIndexToCyclesPerBeat(arpeggiationSlider);
}

function isArpeggiationActive() {
  return arpActive(isArpeggiated);
}

function getArpeggioStepMs(noteCount) {
  return arpStepMs(getCyclesPerBeat(), noteCount, getArpeggioBpm(), arpFixedSpeed);
}

function shouldHighlightArpeggioNote() {
  return isArpeggiationActive() && getCyclesPerBeat() <= ARP_HIGHLIGHT_MAX_CYCLES;
}

function highlightArpeggioNote(note, noteCount) {
  if (!shouldHighlightArpeggioNote()) return;
  noteIndicator.highlightNote(note, getArpeggioStepMs(noteCount));
}

function previewChordWithSettings(notes, arpeggiate = false) {
  const playbackNotes = normalizeToneNotes(notes || []);
  const useArp = arpeggiate && isArpeggiationActive() && playbackNotes.length > 1;
  const noteCount = playbackNotes.length;
  engine.previewChord(
    playbackNotes,
    "4n",
    useArp,
    useArp ? getArpeggioStepMs(noteCount) : 100,
    useArp ? (note) => highlightArpeggioNote(note, noteCount) : null
  );
}

function interpretChord(chord, key) {
  return chordInterpreter(chord, key, { forceRootPosition });
}

function activeSectionKeyAtBeat(keys, beat, fallbackKey = currentKey) {
  if (!Array.isArray(keys) || !keys.length) return fallbackKey;
  let chosen = keys[0];
  for (const k of keys) {
    if ((k?.beat ?? 1) <= beat) chosen = k;
    else break;
  }
  if (!chosen) return fallbackKey;
  const tonic = String(chosen.tonic || fallbackKey?.tonic || "C")
    .replace(/♭/g, "b")
    .replace(/♯/g, "#")
    .replace(/♮/g, "");
  return { tonic, scale: chosen.scale || fallbackKey?.scale || "major" };
}

function syncDisplayedKeyAtBeat(beat) {
  const activeKey = activeSectionKeyAtBeat(currentSectionKeys, beat, currentKey);
  if (!activeKey) return currentKey;
  noteIndicator.setKey(activeKey);
  chordRing.setKey(activeKey);
  return activeKey;
}

async function handleRootPositionChange(enabled) {
  forceRootPosition = enabled;
  await updatePlaybackSettings();
}

// Handler function for play/pause
async function handlePlayPause(shouldPlay) {
  if (isLoading) {
    console.warn("Cannot toggle playback while loading...");
    return;
  }
  if (!currentSong || songLength <= 0) {
    if (shouldPlay) console.warn("No song loaded — use Load in Song Selector");
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
          currentChordInfo.key || currentKey,
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
    const totalTicks = lastReleaseTick > 0 ? lastReleaseTick : songLength * 192;
    const wasPaused = Tone.Transport.state === "paused";
    
    if (engine.parts.length === 0 || Tone.Transport.ticks >= totalTicks) {
      console.log("Restarting song from beginning...");
      // Reset transport position and reschedule parts with current tempo
      // Release all notes first to prevent stuck notes
      engine.releaseAllNotes();
      engine.stop();
      currentSecondsPerBeat = 60 / currentBpm;
      const melodyEvents = createMelodyEvents(currentRawNotes, currentKey, currentSectionKeys);
      const chordEvents = createChordEvents(currentRawChords, currentKey, currentSectionKeys);
      currentMelodyEvents = melodyEvents;
      currentChordEvents = chordEvents;
      lastReleaseTick = getLastReleaseTick(melodyEvents, chordEvents);
      await engine.setupTransport(currentBpm);
      engine.scheduleMelody(melodyEvents);
      engine.scheduleChords(chordEvents);
      controls.updateProgress(0);
      syncDisplayedKeyAtBeat(1);
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
    // Ensure tick tracking is registered even if the section was loaded through a path
    // that skipped setupProgressTracking (cache/state restore edge cases).
    setupProgressTracking();
    await engine.play();
  } else {
    engine.pause();
  }
  controls.setPlayState(shouldPlay);
}

const chordRing = renderChordRing(ringPane, {
  getForceRootPosition: () => forceRootPosition,
  getArpeggiated: () => isArpeggiationActive(),
  onChordClick: (chordData, arpeggiate = false) => {
    isManualChordPreview = true;
    previewChordWithSettings(chordData.notes, arpeggiate);
    noteIndicator.updateChord(chordData.notes, chordData.root, chordData.chordDegrees, chordData.borrowed, currentKey, chordData.chord);
  },
  labelMode: useRomanNumerals,
  onPhraseClick: ({ firstBeat }) => {
    if (!Number.isFinite(firstBeat)) return;
    jumpToPhraseMeasure(firstBeat);
  },
  onLabelModeChange: (useRoman) => {
    useRomanNumerals = useRoman;
    noteIndicator.setLabelMode(useRomanNumerals);
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
  },
  onColorSchemeChange: (scheme) => {
    timeline.setColorScheme(scheme);
  }
});
const noteIndicator = renderNoteIndicator(indicatorPane, {
  labelMode: useRomanNumerals,
  onNoteClick: (note, { isChord = false } = {}) => {
    if (isChord) {
      const durationMs = engine.previewNote(note, "4n");
      noteIndicator.highlightNote(note, durationMs);
      return;
    }
    engine.previewMelodyNote(note, "4n");
  },
  onRootPositionChange: handleRootPositionChange,
  onArpeggiateToggle: (enabled) => {
    isArpeggiated = enabled;
    updatePlaybackSettings();
  },
  onArpeggiateSliderChange: (sliderIndex) => {
    arpeggiationSlider = sliderIndex;
    if (arpDebounceTimer) clearTimeout(arpDebounceTimer);
    arpDebounceTimer = setTimeout(() => {
      updatePlaybackSettings();
    }, 150);
  },
  onArpFixedSpeedChange: (enabled) => {
    arpFixedSpeed = enabled;
    updatePlaybackSettings();
  },
  onArpUnlockFromTempoChange: (enabled) => {
    arpUnlockFromTempo = enabled;
    updatePlaybackSettings();
  },
  onMelodyVolumeChange: (volume) => engine.setMelodyVolume(volume),
  onChordVolumeChange: (volume) => engine.setChordVolume(volume),
  key: currentKey
});

const controls = renderControls({
  topContainer: indicatorPane.querySelector("#now-playing-controls"),
  tempoContainer: indicatorPane.querySelector("#now-playing-tempo"),
  footerContainer: indicatorPane.querySelector("#now-playing-footer"),
  playbackContainer: ringPane.querySelector("#ring-playback-controls"),
}, {
  onPlayPause: handlePlayPause,
  onRestart: async () => {
    await restartSectionFromBeginning({ autoPlay: false });
  },
  onSectionChange: handleSectionChange,
  onTempoChange: (tempo) => {
    currentBpm = tempo;
    currentSecondsPerBeat = 60 / tempo;
    engine.setTempo(tempo);
    if (isArpeggiationActive() && arpUnlockFromTempo) {
      if (tempoDebounceTimer) clearTimeout(tempoDebounceTimer);
      tempoDebounceTimer = setTimeout(() => {
        updatePlaybackSettings();
      }, 250);
    }
  },
  onResetDefaults: () => {
    isArpeggiated = CONTROL_DEFAULTS.arpeggiated;
    arpeggiationSlider = CONTROL_DEFAULTS.arpeggiationSlider;
    arpFixedSpeed = CONTROL_DEFAULTS.arpFixedSpeed;
    arpUnlockFromTempo = CONTROL_DEFAULTS.arpUnlockFromTempo;
    forceRootPosition = false;
    noteIndicator.setRootPositionChecked(false);
    noteIndicator.resetArpToDefaults();
    noteIndicator.resetVolumesToDefaults();
    controls.resetSlidersToDefaults();
    engine.setMelodyVolume(CONTROL_DEFAULTS.melodyVolume);
    engine.setChordVolume(CONTROL_DEFAULTS.chordVolume);
    currentBpm = originalBpm;
    currentSecondsPerBeat = 60 / originalBpm;
    engine.setTempo(currentBpm);
    updatePlaybackSettings();
  },
});

const melodyVolumeSlider = document.getElementById("melody-volume");
const chordVolumeSlider = document.getElementById("chord-volume");
if (melodyVolumeSlider) {
  engine.setMelodyVolume(Number(melodyVolumeSlider.value));
}
if (chordVolumeSlider) {
  engine.setChordVolume(Number(chordVolumeSlider.value));
}

const timeline = renderTimeline(timelinePane, {
  getArpeggiated: () => isArpeggiationActive(),
  onSeek: handleSeek,
  onChordClick: (chord, arpeggiate = false) => {
    if (!currentKey) return;
    isManualChordPreview = true;
    const chordBeat = chord.beat === 0 ? 1 : chord.beat;
    const activeKey = activeSectionKeyAtBeat(currentSectionKeys, chordBeat, currentKey);
    const chordData = interpretChord(chord, activeKey);
    if (chordData && chordData.notes && chordData.notes.length > 0) {
      previewChordWithSettings(chordData.notes, arpeggiate);
      noteIndicator.updateChord(chordData.notes, chord.root, chordData.chordDegrees, chord.borrowed, activeKey, chord);
    }
  }
});

const songSelector = renderSongSelector(selectorPane, {
  isSongLoaded: (cacheKey) => !!cacheKey && cacheKey === loadedCacheKey,
  onSongPageOpen: () => {
    clearPlayerState();
    loadedCacheKey = null;
  },
  onLoadStart: () => {
    clearPlayerState();
    loadedCacheKey = null;
    loadingSplash.show();
  },
  onLoad: async ({ cacheKey }) => {
    try {
      let idx = library.findIndex((s) => s.artist === cacheKey);
      if (idx < 0) {
        const res = await fetch(`/api/songs/entry?key=${encodeURIComponent(cacheKey)}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        const entry = await res.json();
        library.push(entry);
        idx = library.length - 1;
      }
      loadedCacheKey = cacheKey;
      handleSongChange(String(idx));
    } catch (err) {
      console.error("Selector load failed:", err);
      loadingSplash.hide();
    }
  },
});

makeCollapsible(selectorPane, { collapseClass: "selector", label: "Songs", expandedWidth: 310 });

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
let lastReleaseTick = 0;
let currentSecondsPerBeat = 0;
let currentMelodyEvents = [];
let currentChordEvents = [];
let currentBpm = 120;
let originalBpm = 120; // Store the original tempo from the loaded section
let currentRawNotes = []; // Store raw note data for tempo recalculation
let currentRawChords = []; // Store raw chord data for tempo recalculation
let currentSectionKeys = [];
let isLoading = false;
let arpDebounceTimer = null;
let tempoDebounceTimer = null;
let isManualChordPreview = false; // Track when chord is manually clicked
let sectionLoopInProgress = false;

let loadedCacheKey = null;
let quizPanel = null;

function buildQuizContext() {
  if (!currentRawChords?.length || !currentKey) {
    return { pool: [], stats: { counts: new Map(), transitions: new Map(), total: 1 } };
  }

  const valid = currentRawChords.filter((chord) => !chord.isRest);
  const pool = valid
    .map((chord) => {
      const beat = chord.beat === 0 ? 1 : chord.beat;
      const activeKey = activeSectionKeyAtBeat(currentSectionKeys, beat, currentKey);
      const data = interpretChord(chord, activeKey);
      const symbol = getChordSymbol(chord, activeKey);
      const notes = normalizeToneNotes(data.notes || []);
      const chordDegrees = data.chordDegrees || [];
      const degreeIdx = chordDegrees.findIndex((d) => /^(b|#)?3$/.test(String(d)));
      const targetIndex = degreeIdx >= 0 ? degreeIdx : 0;
      return {
        chord,
        symbol,
        notes,
        chordDegrees,
        targetNote: notes[targetIndex],
        targetDegree: chordDegrees[targetIndex] || "1",
      };
    })
    .filter((entry) => entry.notes?.length);

  const counts = new Map();
  const transitions = new Map();
  for (let i = 0; i < pool.length; i++) {
    counts.set(pool[i].symbol, (counts.get(pool[i].symbol) || 0) + 1);
    if (i > 0) {
      const key = `${pool[i - 1].symbol}=>${pool[i].symbol}`;
      transitions.set(key, (transitions.get(key) || 0) + 1);
    }
  }
  return { pool, stats: { counts, transitions, total: pool.length || 1 } };
}

function clearPlayerState() {
  engine.releaseAllNotes();
  engine.cancelAllParts();
  engine.stop();
  currentSong = null;
  songLength = 0;
  lastReleaseTick = 0;
  currentRawNotes = [];
  currentRawChords = [];
  currentSectionKeys = [];
  currentMelodyEvents = [];
  currentChordEvents = [];
  currentKey = null;
  isManualChordPreview = false;
  controls.setPlaybackVisible(false);
  controls.resetPlayState();
  controls.setSections([]);
  noteIndicator.reset();
  noteIndicator.setKey(null);
  chordRing.setSongData([], null);
  chordRing.update(null, null, null);
  chordRing.updateTransitions([], []);
  timeline.setSongData([], null, 0);
  timeline.setSongInfo(null, null);
  timeline.updateProgress(0);
  quizPanel?.refresh();
}

function resetIdleState() {
  currentSongIdx = 0;
  loadedCacheKey = null;
  currentSectionIdx = 0;
  clearPlayerState();
}

async function init() {
  try {
    library = await fetch("/api/songs").then(async (r) => {
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`HTTP ${r.status} ${text}`);
      }
      return r.json();
    });
    console.info("Loaded library", library.length, "songs");
  } catch (err) {
    console.warn("Playback library not ready:", err.message);
    library = [];
  }
  // Library fetch can take 15–20s with a large cache. Do not wipe an in-progress
  // session if the user already loaded a section while we were waiting.
  const hadSong = !!currentSong;
  if (!hadSong) {
    resetIdleState();
  }
}

init();
const quizMount = document.createElement("div");
quizMount.id = "quiz-panel-mount";
indicatorPane.querySelector(".indicator-stack")?.appendChild(quizMount);
quizPanel = renderQuizPanel(quizMount, {
  getQuizContext: buildQuizContext,
  playQuizTarget: (notes) => previewChordWithSettings(notes, false),
  playQuizReference: (tonicNote, targetNote) => {
    engine.previewNote(tonicNote, "8n");
    setTimeout(() => engine.previewNote(targetNote, "8n"), 420);
  },
});

async function loadSection(songIndex, sectionIndex) {
  if (isLoading) return;
  isLoading = true;
  loadingSplash.show();

  try {
    engine.cancelAllParts();
    engine.releaseAllNotes();
    setTimeout(() => {
      engine.releaseAllNotes();
    }, 5);
    engine.stop();
    setTimeout(() => {
      engine.releaseAllNotes();
    }, 10);

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
    loadedCacheKey = song.artist;

    currentSectionKeys = Array.isArray(data.metadata?.keys)
      ? [...data.metadata.keys].sort((a, b) => (a?.beat ?? 1) - (b?.beat ?? 1))
      : [];
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

    const melodyEvents = createMelodyEvents(notesArray, key, currentSectionKeys);
    const chordEvents = createChordEvents(currentRawChords, key, currentSectionKeys);

    // Calculate actual section length in BEATS from raw data
    // (metadata length is often just an estimate or in bars)
    const allEventEnds = [
      ...notesArray.map((n) => (n.beat === 0 ? 1 : n.beat) + n.duration),
      ...currentRawChords.map((c) => (c.beat === 0 ? 1 : c.beat) + c.duration),
    ];
    if (allEventEnds.length > 0) {
      const actualSectionLength = Math.max(...allEventEnds);
      songLength = actualSectionLength;
    }
    // If no events, keep songLength from metadata (ensure it's treated as beats)

    // Store events for potential restart
    currentMelodyEvents = melodyEvents;
    currentChordEvents = chordEvents;
    lastReleaseTick = getLastReleaseTick(melodyEvents, chordEvents);

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

    controls.setSections(song.sections);
    const sectionSelect = document.getElementById("section-select");
    if (sectionSelect) sectionSelect.value = sectionIndex;

    noteIndicator.setKey(key);
    chordRing.setKey(key);
    // Update tempo slider to match loaded section's tempo (100% = original tempo)
    controls.setTempo(bpm, originalBpm);
    // Reset progress to 0 for both controls and timeline
    controls.updateProgress(0);
    timeline.updateProgress(0);
    // Ensure play state is reset (paused) - song should be paused until play is pressed
    controls.resetPlayState();
    chordRing.setSongData(currentRawChords, currentKey);
    chordRing.update(null, null, null);
    timeline.setSongData(currentRawChords, currentKey, songLength, data.metadata);
    timeline.setSongInfo(song.title, song.artist, song.url || data.metadata?.url);
    timeline.forceRelayout();
    requestAnimationFrame(() => timeline.forceRelayout());
    noteIndicator.reset();
    
    // Compute all chord transitions for the entire section
    const transitionData = computeChordTransitions(currentRawChords, currentKey);
    chordRing.updateTransitions(
      transitionData.full,
      transitionData.rootOnly,
      transitionData.fullLongestPhrases,
      transitionData.rootLongestPhrases,
      transitionData.fullPhraseFirstBeats,
      transitionData.rootPhraseFirstBeats,
      transitionData.fullTransitionFirstBeats,
      transitionData.rootTransitionFirstBeats,
      transitionData.fullAllSubstringCounts,
      transitionData.rootAllSubstringCounts,
      transitionData.fullAllSubstringFirstBeats,
      transitionData.rootAllSubstringFirstBeats
    );

    // Update indicator immediately with the first chord if it starts at beat 0 or 1
    // This fixes the issue where the first chord plays but indicator doesn't show until second chord
    if (currentRawChords && currentRawChords.length > 0) {
      const firstChord = currentRawChords.find(c => !c.isRest);
      if (firstChord && (firstChord.beat === 0 || firstChord.beat === 1)) {
        const firstChordBeat = firstChord.beat === 0 ? 1 : firstChord.beat;
        const activeKey = activeSectionKeyAtBeat(currentSectionKeys, firstChordBeat, currentKey);
        const chordData = interpretChord(firstChord, activeKey);
        noteIndicator.updateChord(
          chordData.notes,
          firstChord.root,
          chordData.chordDegrees,
          firstChord.borrowed,
          activeKey,
          firstChord
        );
        chordRing.update(firstChord);
      }
    }

    setupProgressTracking();
    controls.setPlaybackVisible(true);
    quizPanel?.refresh();
    console.log("Section loaded successfully.");
  } catch (err) {
    console.error("Error during playback setup in loadSection:", err);
  } finally {
    isLoading = false;
    loadingSplash.hide();
  }
}

async function restartSectionFromBeginning({ autoPlay = false } = {}) {
  if (!currentSong || songLength <= 0) return;
  engine.releaseAllNotes();
  engine.stop();
  currentSecondsPerBeat = 60 / currentBpm;
  const melodyEvents = createMelodyEvents(currentRawNotes, currentKey, currentSectionKeys);
  const chordEvents = createChordEvents(currentRawChords, currentKey, currentSectionKeys);
  currentMelodyEvents = melodyEvents;
  currentChordEvents = chordEvents;
  lastReleaseTick = getLastReleaseTick(melodyEvents, chordEvents);
  await engine.setupTransport(currentBpm);
  engine.scheduleMelody(melodyEvents);
  engine.scheduleChords(chordEvents);
  controls.updateProgress(0);
  timeline.updateProgress(0);
  syncDisplayedKeyAtBeat(1);
  chordRing.update(null, null, null);
  noteIndicator.reset();
  setupProgressTracking();
  if (autoPlay) {
    await engine.play();
    controls.setPlayState(true);
  } else {
    controls.resetPlayState();
  }
}

function setupProgressTracking() {
  let lastChordId = null; // Track last chord to avoid redundant updates
  let lastMelodyId = null; // Track last melody to avoid redundant updates
  
  engine.onTick(() => {
    // songLength is in Beats.
    // Progress calculation based on TICKS (192 PPQ) to ensure stability during tempo changes.
    // Tone.Transport.seconds is unstable/approximated during aggressive tempo ramps.
    const totalTicks = songLength * 192;
    const currentTicks = Tone.Transport.ticks;
    const progressTicks = lastReleaseTick > 0 ? lastReleaseTick : totalTicks;

    const ratio = progressTicks > 0 ? Math.min(1, currentTicks / progressTicks) : 0;
    const currentBeat = (currentTicks / 192) + 1;
    syncDisplayedKeyAtBeat(currentBeat);

    controls.updateProgress(ratio);
    timeline.updateProgress(ratio);
    
    // Update melody display (including rests) based on current position
    const currentMelodyInfo = findCurrentMelodyAtTick(currentTicks);
    const currentMelodyId = currentMelodyInfo ? 
      `${currentMelodyInfo.note?.beat || 'none'}-${currentMelodyInfo.note?.duration || 'none'}-${currentMelodyInfo.isRest || false}` : 
      'none';
    
    if (currentMelodyId !== lastMelodyId) {
      lastMelodyId = currentMelodyId;
      if (currentMelodyInfo) {
        if (currentMelodyInfo.isRest) {
          noteIndicator.updateMelody(null, null);
        } else {
          noteIndicator.updateMelody(currentMelodyInfo.absoluteLabel, currentMelodyInfo.relativeLabel);
        }
      } else {
        // No melody at this position
        noteIndicator.updateMelody(null, null);
      }
    }
    
    // Update chord display (including rests) based on current position
    const currentChordInfo = findCurrentChordAtTick(currentTicks);
    const currentChordId = currentChordInfo ? 
      `${currentChordInfo.chord?.beat || 'none'}-${currentChordInfo.chord?.duration || 'none'}-${currentChordInfo.chord?.isRest || false}` : 
      'none';
    
    if (currentChordId !== lastChordId) {
      lastChordId = currentChordId;
      if (currentChordInfo) {
        noteIndicator.updateChord(
          currentChordInfo.notes,
          currentChordInfo.root,
          currentChordInfo.degrees,
          currentChordInfo.borrowed,
          currentChordInfo.key || currentKey,
          currentChordInfo.chord
        );
        chordRing.update(currentChordInfo.chord);
      } else {
        // No chord at this position (shouldn't happen if chords cover the whole song, but handle it)
        noteIndicator.reset();
        chordRing.update(null);
      }
    }
    
    // Loop to beginning when section ends
    if (
      lastReleaseTick > 0 &&
      currentTicks > lastReleaseTick &&
      Tone.Transport.state === "started" &&
      !sectionLoopInProgress
    ) {
      sectionLoopInProgress = true;
      restartSectionFromBeginning({ autoPlay: true }).finally(() => {
        sectionLoopInProgress = false;
      });
    }
  });
}

function handleSeek(ratio) {
  if (!currentSong || songLength <= 0) return;
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
  
  // Update note indicator with melody and chord at this position
  const currentTicks = Tone.Transport.ticks;
  const currentBeat = (currentTicks / 192) + 1;
  syncDisplayedKeyAtBeat(currentBeat);
  
  // Update melody display
  const currentMelodyInfo = findCurrentMelodyAtTick(currentTicks);
  if (currentMelodyInfo) {
    if (currentMelodyInfo.isRest) {
      noteIndicator.updateMelody(null, null);
    } else {
      noteIndicator.updateMelody(currentMelodyInfo.absoluteLabel, currentMelodyInfo.relativeLabel);
    }
  } else {
    noteIndicator.updateMelody(null, null);
  }
  
    // Update chord display
    const currentChordInfo = findCurrentChordAtTick(currentTicks);
    if (currentChordInfo) {
      noteIndicator.updateChord(
        currentChordInfo.notes,
        currentChordInfo.root,
        currentChordInfo.degrees,
        currentChordInfo.borrowed,
        currentChordInfo.key || currentKey,
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
      loadingSplash.hide();
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

function getLastReleaseTick(melodyEvents, chordEvents) {
  let max = 0;
  for (const ev of [...melodyEvents, ...chordEvents]) {
    if (ev.type === "release") {
      max = Math.max(max, parseInt(ev.time, 10));
    }
  }
  return max;
}

function createMelodyEvents(notesArray, key, sectionKeys = currentSectionKeys) {
  const events = [];
  notesArray.forEach((note) => {
    if (note.isRest) return;
    const noteBeat = note.beat === 0 ? 1 : note.beat;
    const activeKey = activeSectionKeyAtBeat(sectionKeys, noteBeat, key);
    const absoluteLabel = sdToToneJSNoteName(note.sd, note.octave, activeKey, 4);
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

function createChordEvents(chordsArray, key, sectionKeys = currentSectionKeys) {
  const events = [];
  chordsArray.forEach((chord) => {
    if (chord.isRest) return;
    const chordBeat = chord.beat === 0 ? 1 : chord.beat;
    const activeKey = activeSectionKeyAtBeat(sectionKeys, chordBeat, key);
    const chordData = interpretChord(chord, activeKey);
    const displayChordNotes = chordData.notes || [];
    const chordNotes = normalizeToneNotes(displayChordNotes);
    if (!chordNotes.length) return;

    // Handle beat 0 by treating it as beat 1 (normalize to 1-based indexing)
    // XML format can have beat 0, but player expects 1-based beats
    const normalizedBeat = chord.beat === 0 ? 1 : chord.beat;
    const startTick = (normalizedBeat - 1) * 192;
    const endTick = startTick + (chord.duration * 192);

    if (isArpeggiationActive() && chordNotes.length > 1) {
      const noteCount = chordNotes.length;
      const offsetTicks = getArpeggioOffsetTicks(noteCount);
      const ticksPerSecond = currentBpm * (TICKS_PER_BEAT / 60);

      let currentTick = Math.round(startTick);
      let noteIdx = 0;

      const MIN_NOTE_DURATION_TICKS = Math.max(1, Math.min(offsetTicks, 10));
      const stepMs = getArpeggioStepMs(noteCount);

      while (currentTick + MIN_NOTE_DURATION_TICKS < endTick) {
        const note = chordNotes[noteIdx % noteCount];
        const noteStart = currentTick;

        let noteEnd = currentTick + offsetTicks;
        if (noteEnd > endTick) noteEnd = endTick;

        if (noteEnd - noteStart < MIN_NOTE_DURATION_TICKS) {
          break;
        }

        const isFirstNote = (noteIdx === 0);
        const thisNote = note;

        const durationSeconds = (noteEnd - noteStart) / ticksPerSecond;

        const noteEvent = {
          time: Math.round(noteStart) + "i",
          type: "arpeggio",
          note: thisNote,
          duration: durationSeconds,
          name: chord.root,
          onTrigger: () => {
            if (isFirstNote) {
              noteIndicator.updateChord(displayChordNotes, chord.root, chordData.chordDegrees, chord.borrowed, activeKey, chord);
              chordRing.update(chord);
              isManualChordPreview = false;
            }
            if (shouldHighlightArpeggioNote()) {
              noteIndicator.highlightNote(thisNote, stepMs);
            }
          }
        };
        events.push(noteEvent);

        currentTick += offsetTicks;
        noteIdx++;
      }

    } else {
      events.push({
        time: Math.round(startTick) + "i",
        type: "attack",
        notes: chordNotes,
        name: chord.root,
        onTrigger: () => {
          noteIndicator.updateChord(displayChordNotes, chord.root, chordData.chordDegrees, chord.borrowed, activeKey, chord);
          chordRing.update(chord);
          isManualChordPreview = false;
        },
      });

      events.push({
        time: Math.round(endTick) + "i",
        type: "release",
        notes: chordNotes,
      });
    }
  });

  events.sort((a, b) => {
    const tickDiff = parseInt(a.time) - parseInt(b.time);
    if (tickDiff !== 0) return tickDiff;
    const typeOrder = { release: 0, arpeggio: 1, attack: 2 };
    return (typeOrder[a.type] ?? 1) - (typeOrder[b.type] ?? 1);
  });

  const releaseTicks = new Set(
    events.filter((e) => e.type === "release").map((e) => parseInt(e.time, 10))
  );
  for (const ev of events) {
    if (ev.type !== "attack") continue;
    const tick = parseInt(ev.time, 10);
    if (releaseTicks.has(tick)) {
      ev.time = `${tick + 1}i`;
    }
  }
  events.sort((a, b) => parseInt(a.time, 10) - parseInt(b.time, 10));

  return events;
}

// Helper function to find the current melody note at a given tick position
function findCurrentMelodyAtTick(tickPosition) {
  if (!currentRawNotes || !currentRawNotes.length || !currentKey) return null;
  
  // Convert tick position to beat (1 tick = 1/192 beat)
  const currentBeat = (tickPosition / 192) + 1;
  
  // Find the note that should be playing at this beat
  // A note is active if currentBeat is >= note.beat and < note.beat + note.duration
  // Normalize beat 0 to beat 1 for comparison
  for (const note of currentRawNotes) {
    const noteStartBeat = note.beat === 0 ? 1 : note.beat;
    const noteEndBeat = noteStartBeat + note.duration;
    
    if (currentBeat >= noteStartBeat && currentBeat < noteEndBeat) {
      // If it's a rest, return rest information
      if (note.isRest) {
        return {
          note,
          isRest: true,
          absoluteLabel: null,
          relativeLabel: null
        };
      }
      
      const activeKey = activeSectionKeyAtBeat(currentSectionKeys, currentBeat, currentKey);
      const absoluteLabel = sdToToneJSNoteName(note.sd, note.octave, activeKey, 4);
      const relativeLabel = note.sd;
      return {
        note,
        isRest: false,
        absoluteLabel,
        relativeLabel
      };
    }
  }
  
  return null;
}

// Compute all chord transitions from the chord array
function computeChordTransitions(chordsArray, key) {
  const transitions = new Map();
  const rootTransitions = new Map();
  const fullTransitionFirstBeats = new Map();
  const rootTransitionFirstBeats = new Map();
  const fullSequence = [];
  const rootSequence = [];
  
  if (!chordsArray || !Array.isArray(chordsArray) || chordsArray.length === 0) {
    return {
      full: transitions,
      rootOnly: rootTransitions,
      fullSequence,
      rootSequence,
      fullLongestPhrases: new Map(),
      rootLongestPhrases: new Map(),
      fullPhraseFirstBeats: new Map(),
      rootPhraseFirstBeats: new Map(),
      fullTransitionFirstBeats,
      rootTransitionFirstBeats,
      fullAllSubstringCounts: new Map(),
      rootAllSubstringCounts: new Map(),
      fullAllSubstringFirstBeats: new Map(),
      rootAllSubstringFirstBeats: new Map(),
    };
  }
  
  // Filter out rests and sort by beat
  const validChords = chordsArray
    .filter(c => !c.isRest)
    .sort((a, b) => a.beat - b.beat);
  
  if (validChords.length < 2) {
    for (const chord of validChords) {
      fullSequence.push(getChordSymbol(chord, key));
      rootSequence.push(String(chord.root));
    }
    return {
      full: transitions,
      rootOnly: rootTransitions,
      fullSequence,
      rootSequence,
      fullLongestPhrases: new Map(),
      rootLongestPhrases: new Map(),
      fullPhraseFirstBeats: new Map(),
      rootPhraseFirstBeats: new Map(),
      fullTransitionFirstBeats,
      rootTransitionFirstBeats,
      ...findAllSubstringsWithStarts(fullSequence, validChords, "full"),
      ...findAllSubstringsWithStarts(rootSequence, validChords, "root"),
    }; // Need at least 2 chords for a transition
  }
  
  let lastChordSymbol = null;
  let lastRoot = null;
  
  for (const chord of validChords) {
    const currentChordSymbol = getChordSymbol(chord, key);
    const currentRoot = String(chord.root);
    fullSequence.push(currentChordSymbol);
    rootSequence.push(currentRoot);
    
    // Only count transitions between different chords
    if (lastChordSymbol !== null && lastChordSymbol !== currentChordSymbol) {
      const transitionKey = `${lastChordSymbol} → ${currentChordSymbol}`;
      transitions.set(transitionKey, (transitions.get(transitionKey) || 0) + 1);
      if (!fullTransitionFirstBeats.has(transitionKey)) {
        const beat = chord.beat === 0 ? 1 : chord.beat;
        fullTransitionFirstBeats.set(transitionKey, beat);
      }
    }
    
    // Count root-only transitions (only between different roots)
    if (lastRoot !== null && lastRoot !== currentRoot) {
      const rootTransitionKey = `${lastRoot} → ${currentRoot}`;
      rootTransitions.set(rootTransitionKey, (rootTransitions.get(rootTransitionKey) || 0) + 1);
      if (!rootTransitionFirstBeats.has(rootTransitionKey)) {
        const beat = chord.beat === 0 ? 1 : chord.beat;
        rootTransitionFirstBeats.set(rootTransitionKey, beat);
      }
    }
    
    lastChordSymbol = currentChordSymbol;
    lastRoot = currentRoot;
  }
  
  return {
    full: transitions,
    rootOnly: rootTransitions,
    fullSequence,
    rootSequence,
    ...findLongestRepeatedPhrasesWithStarts(fullSequence, validChords, "full"),
    ...findLongestRepeatedPhrasesWithStarts(rootSequence, validChords, "root"),
    fullTransitionFirstBeats,
    rootTransitionFirstBeats,
    ...findAllSubstringsWithStarts(fullSequence, validChords, "full"),
    ...findAllSubstringsWithStarts(rootSequence, validChords, "root"),
  };
}

function findLongestRepeatedPhrasesWithStarts(sequence, validChords, mode) {
  const emptyCounts = new Map();
  const emptyStarts = new Map();
  if (!Array.isArray(sequence) || sequence.length < 2 || !Array.isArray(validChords)) {
    return mode === "root"
      ? { rootLongestPhrases: emptyCounts, rootPhraseFirstBeats: emptyStarts }
      : { fullLongestPhrases: emptyCounts, fullPhraseFirstBeats: emptyStarts };
  }

  let selectedLength = 0;
  for (let phraseLength = sequence.length - 1; phraseLength >= 2; phraseLength--) {
    if (hasAnyRepeatedPhrase(sequence, phraseLength)) {
      selectedLength = phraseLength;
      break;
    }
  }
  if (selectedLength === 0) {
    selectedLength = sequence.length;
  }

  const bestCounts = new Map();
  const bestStarts = new Map();
  let start = 0;
  while (start < sequence.length) {
    const remaining = sequence.length - start;
    const phraseLength = Math.min(selectedLength, remaining);
    const phrase = sequence.slice(start, start + phraseLength).join(" → ");
    bestCounts.set(phrase, (bestCounts.get(phrase) || 0) + 1);
    if (!bestStarts.has(phrase)) {
      const phraseStartBeat = validChords[start]?.beat === 0 ? 1 : (validChords[start]?.beat ?? 1);
      bestStarts.set(phrase, phraseStartBeat);
    }
    start += phraseLength;
  }

  if (mode === "root") {
    return { rootLongestPhrases: bestCounts, rootPhraseFirstBeats: bestStarts };
  }
  return { fullLongestPhrases: bestCounts, fullPhraseFirstBeats: bestStarts };
}

function hasAnyRepeatedPhrase(sequence, phraseLength) {
  if (!Array.isArray(sequence) || phraseLength < 2 || phraseLength > sequence.length) return false;
  const phraseCounts = new Map();
  const nonOverlappingCounts = new Map();
  const end = sequence.length - phraseLength;

  for (let start = 0; start <= end; start++) {
    const phrase = sequence.slice(start, start + phraseLength).join(" → ");
    if (!phraseCounts.has(phrase)) phraseCounts.set(phrase, []);
    phraseCounts.get(phrase).push(start);
  }

  for (const [phrase, starts] of phraseCounts.entries()) {
    let count = 0;
    let lastEnd = -1;
    for (const phraseStart of starts) {
      if (phraseStart >= lastEnd) {
        count += 1;
        lastEnd = phraseStart + phraseLength;
      }
    }
    nonOverlappingCounts.set(phrase, count);
    if (count >= 2) return true;
  }

  return false;
}

function findAllSubstringsWithStarts(sequence, validChords, mode) {
  const counts = new Map();
  const starts = new Map();
  if (!Array.isArray(sequence) || sequence.length < 1 || !Array.isArray(validChords)) {
    return mode === "root"
      ? { rootAllSubstringCounts: counts, rootAllSubstringFirstBeats: starts }
      : { fullAllSubstringCounts: counts, fullAllSubstringFirstBeats: starts };
  }

  for (let phraseLength = sequence.length; phraseLength >= 1; phraseLength--) {
    const end = sequence.length - phraseLength;
    for (let start = 0; start <= end; start++) {
      const phrase = sequence.slice(start, start + phraseLength).join(" → ");
      counts.set(phrase, (counts.get(phrase) || 0) + 1);
      if (!starts.has(phrase)) {
        const phraseStartBeat = validChords[start]?.beat === 0 ? 1 : (validChords[start]?.beat ?? 1);
        starts.set(phrase, phraseStartBeat);
      }
    }
  }

  if (mode === "root") {
    return { rootAllSubstringCounts: counts, rootAllSubstringFirstBeats: starts };
  }
  return { fullAllSubstringCounts: counts, fullAllSubstringFirstBeats: starts };
}

function getMeasureStartBeatForBeat(targetBeat, metadata) {
  const beat = Math.max(1, Math.floor(targetBeat));
  const meters = Array.isArray(metadata?.meters) ? metadata.meters
    .filter((m) => Number.isFinite(m?.beat) && Number.isFinite(m?.numBeats) && m.numBeats > 0)
    .sort((a, b) => a.beat - b.beat) : [];
  if (meters.length === 0) {
    return Math.floor((beat - 1) / 4) * 4 + 1;
  }

  let activeMeter = meters[0];
  for (const meter of meters) {
    if (meter.beat <= beat) {
      activeMeter = meter;
    } else {
      break;
    }
  }

  const meterStartBeat = activeMeter.beat || 1;
  const beatsPerMeasure = activeMeter.numBeats || 4;
  const offset = Math.max(0, beat - meterStartBeat);
  return meterStartBeat + Math.floor(offset / beatsPerMeasure) * beatsPerMeasure;
}

function jumpToPhraseMeasure(firstPhraseBeat) {
  if (!currentSong || songLength <= 0) return;
  const measureStartBeat = getMeasureStartBeatForBeat(firstPhraseBeat, currentSong?.metadata);
  const ratio = Math.max(0, Math.min(1, (measureStartBeat - 1) / songLength));
  handleSeek(ratio);
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
    const chordStartBeat = chord.beat === 0 ? 1 : chord.beat;
    const chordEndBeat = chordStartBeat + chord.duration;
    
    if (currentBeat >= chordStartBeat && currentBeat < chordEndBeat) {
      // If it's a rest, return rest information
      if (chord.isRest) {
        return {
          chord,
          chordData: null,
          notes: null,
          root: null,
          degrees: null,
          borrowed: null,
          key: activeSectionKeyAtBeat(currentSectionKeys, currentBeat, currentKey),
        };
      }
      
      const activeKey = activeSectionKeyAtBeat(currentSectionKeys, currentBeat, currentKey);
      const chordData = interpretChord(chord, activeKey);
      const notes = chordData.notes || [];
      return {
        chord,
        chordData,
        notes,
        root: chord.root,
        degrees: chordData.chordDegrees,
        borrowed: chord.borrowed,
        key: activeKey,
      };
    }
  }
  
  return null;
}

function resumeMidChordPlayback(tickPosition, chordEvents) {
  const chordInfo = findCurrentChordAtTick(tickPosition);
  if (!chordInfo?.notes?.length) return;

  const chord = chordInfo.chord;
  const chordNotes = normalizeToneNotes(chordInfo.notes);
  const normalizedBeat = chord.beat === 0 ? 1 : chord.beat;
  const endTick = (normalizedBeat - 1) * 192 + chord.duration * 192;

  if (isArpeggiationActive() && chordNotes.length > 1) {
    const hasUpcomingArp = chordEvents.some(
      (e) =>
        e.type === "arpeggio" &&
        parseInt(e.time, 10) > tickPosition &&
        parseInt(e.time, 10) < endTick
    );
    if (hasUpcomingArp) return;
  }

  engine.resumeChordAttack(chordNotes);
}

async function updatePlaybackSettings() {
  if (isLoading || !currentSong) return;

  const wasPlaying = Tone.Transport.state === "started";
  const currentTicks = Tone.Transport.ticks;

  // Stop engine to clear parts
  engine.stop();
  noteIndicator.reset();

  // Re-create events with new settings (arpeggiation)
  const melodyEvents = createMelodyEvents(currentRawNotes, currentKey, currentSectionKeys);
  const chordEvents = createChordEvents(currentRawChords, currentKey, currentSectionKeys);

  currentMelodyEvents = melodyEvents;
  currentChordEvents = chordEvents;
  lastReleaseTick = getLastReleaseTick(melodyEvents, chordEvents);

  await engine.setupTransport(currentBpm);
  engine.scheduleMelody(melodyEvents);
  engine.scheduleChords(chordEvents);

  // Reschedule progress tracking which gets cleared by setupTransport
  setupProgressTracking();

  // Restore position
  Tone.Transport.ticks = currentTicks;

  // Update note indicator immediately with current melody and chord (fixes display issue when tempo changes)
  // This is especially important for arpeggiated chords where the first note might not trigger immediately
  if (currentTicks > 0) {
    // Update melody display
    const currentMelodyInfo = findCurrentMelodyAtTick(currentTicks);
    if (currentMelodyInfo) {
      if (currentMelodyInfo.isRest) {
        noteIndicator.updateMelody(null, null);
      } else {
        noteIndicator.updateMelody(currentMelodyInfo.absoluteLabel, currentMelodyInfo.relativeLabel);
      }
    } else {
      noteIndicator.updateMelody(null, null);
    }
    
    // Update chord display
    const currentChordInfo = findCurrentChordAtTick(currentTicks);
    if (currentChordInfo) {
      noteIndicator.updateChord(
        currentChordInfo.notes,
        currentChordInfo.root,
        currentChordInfo.degrees,
        currentChordInfo.borrowed,
        currentChordInfo.key || currentKey,
        currentChordInfo.chord
      );
      // Also update chord ring if needed
      chordRing.update(currentChordInfo.chord);
    }
  }

  if (wasPlaying) {
    await engine.play();
    resumeMidChordPlayback(currentTicks, chordEvents);
    controls.setPlayState(true);
  } else {
    controls.resetPlayState();
  }
}

